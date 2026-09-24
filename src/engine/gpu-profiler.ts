// Optional per-pass GPU timing with timestamp queries (developer tool: renderer.prof.enabled = true,
// then read renderer.prof.report()). Costs nothing while disabled.
const MAX_PASSES = 48;

export class GpuProfiler {
  enabled = false;
  /** Smoothed milliseconds per pass name. */
  readonly ms = new Map<string, number>();
  private qs: GPUQuerySet | null = null;
  private resolveBuf: GPUBuffer | null = null;
  private readBuf: GPUBuffer | null = null;
  private names: string[] = [];
  private busy = false;
  private pending: string[] | null = null;

  constructor(d: GPUDevice, supported: boolean) {
    if (!supported) return;
    this.qs = d.createQuerySet({ type: 'timestamp', count: MAX_PASSES * 2 });
    this.resolveBuf = d.createBuffer({ size: MAX_PASSES * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    this.readBuf = d.createBuffer({ size: MAX_PASSES * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  }

  get supported() { return !!this.qs; }

  begin() { this.names = []; }

  /** Timestamp writes for the next pass, or undefined when not profiling. */
  pass(name: string): GPURenderPassTimestampWrites | undefined {
    if (!this.enabled || !this.qs || this.busy || this.names.length >= MAX_PASSES) return undefined;
    const i = this.names.length;
    this.names.push(name);
    return { querySet: this.qs, beginningOfPassWriteIndex: i * 2, endOfPassWriteIndex: i * 2 + 1 };
  }

  end(enc: GPUCommandEncoder) {
    const n = this.names.length;
    if (!n || !this.qs || this.busy) return;
    enc.resolveQuerySet(this.qs, 0, n * 2, this.resolveBuf!, 0);
    enc.copyBufferToBuffer(this.resolveBuf!, 0, this.readBuf!, 0, n * 16);
    this.pending = [...this.names];
  }

  afterSubmit() {
    const names = this.pending;
    if (!names || !this.readBuf) return;
    this.pending = null;
    this.busy = true;
    this.readBuf.mapAsync(GPUMapMode.READ).then(() => {
      const t = new BigUint64Array(this.readBuf!.getMappedRange().slice(0, names.length * 16));
      const sum = new Map<string, number>();
      names.forEach((nm, i) => sum.set(nm, (sum.get(nm) ?? 0) + Number(t[i * 2 + 1] - t[i * 2]) / 1e6));
      for (const [nm, v] of sum) this.ms.set(nm, (this.ms.get(nm) ?? v) * 0.9 + v * 0.1);
      this.readBuf!.unmap();
      this.busy = false;
    }).catch(() => { this.busy = false; });
  }

  report() {
    const rows = [...this.ms].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.padEnd(12)} ${v.toFixed(2)}ms`);
    return rows.join('\n') + `\ntotal        ${[...this.ms.values()].reduce((a, b) => a + b, 0).toFixed(2)}ms`;
  }
}

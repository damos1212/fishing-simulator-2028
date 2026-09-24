// Runs the GPU FFT ocean every frame and reads back water heights at a few points (boat hull,
// camera) so objects float on the same waves the ocean shader draws.
import { FFT_ASSEMBLE, FFT_EVOLVE, FFT_IFFT, FFT_MIP, FFT_N, FFT_QUERY, FFT_SPECTRUM } from './wgsl/fft';

const N = FFT_N;
const LAYERS = 4;
const MIPS = Math.log2(N) + 1;
const MAX_QUERIES = 16;

export interface OceanWind { dirX: number; dirZ: number; speed: number; choppy: number; amp: number }

export class OceanFFT {
  /** Tile size (m) of each cascade, coarse to fine. */
  readonly lengths = [256, 73, 21, 6];
  readonly params: GPUBuffer;
  /** Trilinear, anisotropic and repeating: for sampling the mipmapped cascades on screen. */
  readonly sampler: GPUSampler;
  disp: GPUTexture;
  deriv: GPUTexture;
  /** Heights from the last completed readback, in query order (NaN until available). */
  heights = new Float32Array(MAX_QUERIES).fill(NaN);
  private data = new Float32Array(16);
  private h0: GPUTexture;
  private a: GPUTexture[];
  private b: GPUTexture[];
  private foam: GPUTexture;
  private pipes: Record<'spectrum' | 'evolve' | 'ifft' | 'assemble' | 'query', GPUComputePipeline>;
  private groups: Record<'spectrum' | 'evolve' | 'ifftH' | 'ifftV' | 'assemble' | 'query', GPUBindGroup>;
  private mipPipe: GPUComputePipeline;
  private mipGroups: GPUBindGroup[];
  private passBufs: GPUBuffer[];
  private pointBuf: GPUBuffer;
  private heightBuf: GPUBuffer;
  private staging: GPUBuffer;
  private reading = false;
  private queries = new Float32Array(MAX_QUERIES * 4);
  private queryCount = 0;
  private wind: OceanWind = { dirX: 0.8, dirZ: 0.6, speed: 8, choppy: 1.1, amp: 1 };
  private dirty = true;

  constructor(private d: GPUDevice, sampler: GPUSampler) {
    const arr = (format: GPUTextureFormat, mipLevelCount = 1) => d.createTexture({
      size: [N, N, LAYERS], format, mipLevelCount, usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.h0 = arr('rgba32float');
    this.a = [arr('rgba32float'), arr('rgba32float')];
    this.b = [arr('rgba32float'), arr('rgba32float')];
    this.disp = arr('rgba16float', MIPS);
    this.deriv = arr('rgba16float', MIPS);
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 8,
      addressModeU: 'repeat', addressModeV: 'repeat' });
    this.foam = arr('r32float');
    this.params = d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.passBufs = [0, 1].map((v) => {
      const b = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(b, 0, new Uint32Array([v, 0, 0, 0]));
      return b;
    });
    this.pointBuf = d.createBuffer({ size: MAX_QUERIES * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.heightBuf = d.createBuffer({ size: MAX_QUERIES * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.staging = d.createBuffer({ size: MAX_QUERIES * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    const view = (t: GPUTexture, level = 0) => t.createView({ dimension: '2d-array', baseMipLevel: level, mipLevelCount: 1 });
    const C = GPUShaderStage.COMPUTE;
    type E = GPUBindGroupLayoutEntry;
    const uni = (binding: number): E => ({ binding, visibility: C, buffer: { type: 'uniform' } });
    const tex = (binding: number, sampleType: GPUTextureSampleType): E => ({ binding, visibility: C, texture: { sampleType, viewDimension: '2d-array' } });
    const sto = (binding: number, format: GPUTextureFormat, access: GPUStorageTextureAccess = 'write-only'): E =>
      ({ binding, visibility: C, storageTexture: { access, format, viewDimension: '2d-array' } });
    const layouts = {
      spectrum: [uni(0), sto(1, 'rgba32float')],
      evolve: [uni(0), tex(1, 'unfilterable-float'), sto(2, 'rgba32float'), sto(3, 'rgba32float')],
      ifft: [uni(0), tex(1, 'unfilterable-float'), tex(2, 'unfilterable-float'), sto(3, 'rgba32float'), sto(4, 'rgba32float')],
      assemble: [uni(0), tex(1, 'unfilterable-float'), tex(2, 'unfilterable-float'), sto(3, 'rgba16float'), sto(4, 'rgba16float'), sto(5, 'r32float', 'read-write')],
      mip: [tex(0, 'float'), tex(1, 'float'), sto(2, 'rgba16float'), sto(3, 'rgba16float')],
      query: [uni(0), tex(1, 'float'), { binding: 2, visibility: C, sampler: { type: 'filtering' } } as E,
        { binding: 3, visibility: C, buffer: { type: 'read-only-storage' } } as E, { binding: 4, visibility: C, buffer: { type: 'storage' } } as E],
    };
    const bgls = Object.fromEntries(Object.entries(layouts).map(([k, entries]) => [k, d.createBindGroupLayout({ label: 'fft-' + k, entries })])) as Record<keyof typeof layouts, GPUBindGroupLayout>;
    const mk = (code: string, label: string, bgl: GPUBindGroupLayout) => {
      const module = d.createShaderModule({ label, code });
      module.getCompilationInfo().then((info) => { for (const m of info.messages) if (m.type === 'error') console.error(`[${label}] ${m.lineNum}:${m.linePos} ${m.message}`); });
      return d.createComputePipeline({ label, layout: d.createPipelineLayout({ bindGroupLayouts: [bgl] }), compute: { module, entryPoint: 'main' } });
    };
    this.pipes = {
      spectrum: mk(FFT_SPECTRUM, 'fft-spectrum', bgls.spectrum), evolve: mk(FFT_EVOLVE, 'fft-evolve', bgls.evolve), ifft: mk(FFT_IFFT, 'fft-ifft', bgls.ifft),
      assemble: mk(FFT_ASSEMBLE, 'fft-assemble', bgls.assemble), query: mk(FFT_QUERY, 'fft-query', bgls.query),
    };
    this.mipPipe = mk(FFT_MIP, 'fft-mip', bgls.mip);
    const bg = (layout: GPUBindGroupLayout, entries: GPUBindingResource[]) => d.createBindGroup({ layout, entries: entries.map((resource, binding) => ({ binding, resource })) });
    this.groups = {
      spectrum: bg(bgls.spectrum, [{ buffer: this.params }, view(this.h0)]),
      evolve: bg(bgls.evolve, [{ buffer: this.params }, view(this.h0), view(this.a[0]), view(this.b[0])]),
      ifftH: bg(bgls.ifft, [{ buffer: this.passBufs[0] }, view(this.a[0]), view(this.b[0]), view(this.a[1]), view(this.b[1])]),
      ifftV: bg(bgls.ifft, [{ buffer: this.passBufs[1] }, view(this.a[1]), view(this.b[1]), view(this.a[0]), view(this.b[0])]),
      assemble: bg(bgls.assemble, [{ buffer: this.params }, view(this.a[0]), view(this.b[0]), view(this.disp), view(this.deriv), view(this.foam)]),
      query: bg(bgls.query, [{ buffer: this.params }, view(this.disp), sampler, { buffer: this.pointBuf }, { buffer: this.heightBuf }]),
    };
    this.mipGroups = [];
    for (let l = 1; l < MIPS; l++) {
      this.mipGroups.push(bg(bgls.mip, [view(this.disp, l - 1), view(this.deriv, l - 1), view(this.disp, l), view(this.deriv, l)]));
    }
  }

  /** Wind drives the spectrum; it is rebuilt when the sea state changes noticeably. */
  setWind(w: OceanWind) {
    const o = this.wind;
    if (Math.abs(o.speed - w.speed) > 0.4 || Math.abs(o.amp - w.amp) > 0.05 || Math.abs(o.choppy - w.choppy) > 0.05
      || Math.abs(o.dirX - w.dirX) + Math.abs(o.dirZ - w.dirZ) > 0.05) {
      this.wind = { ...w };
      this.dirty = true;
    }
  }

  /** World points (x, z) whose water height should be read back. */
  setQueries(pts: { x: number; z: number }[]) {
    this.queryCount = Math.min(MAX_QUERIES, pts.length);
    for (let i = 0; i < this.queryCount; i++) { this.queries[i * 4] = pts[i].x; this.queries[i * 4 + 2] = pts[i].z; }
  }

  update(enc: GPUCommandEncoder, time: number) {
    const w = this.wind;
    const p = this.data;
    p.set(this.lengths, 0);
    const l = Math.hypot(w.dirX, w.dirZ) || 1;
    p[4] = w.dirX / l; p[5] = w.dirZ / l; p[6] = w.speed; p[7] = w.choppy;
    p[8] = 0.0009 * w.amp; p[9] = 0; p[10] = time; p[11] = 0.965;
    this.d.queue.writeBuffer(this.params, 0, p);
    if (this.queryCount) this.d.queue.writeBuffer(this.pointBuf, 0, this.queries, 0, this.queryCount * 4);
    const pass = enc.beginComputePass({ label: 'ocean-fft' });
    const g = Math.ceil(N / 8);
    if (this.dirty) {
      pass.setPipeline(this.pipes.spectrum);
      pass.setBindGroup(0, this.groups.spectrum);
      pass.dispatchWorkgroups(g, g, LAYERS);
      this.dirty = false;
    }
    pass.setPipeline(this.pipes.evolve);
    pass.setBindGroup(0, this.groups.evolve);
    pass.dispatchWorkgroups(g, g, LAYERS);
    pass.setPipeline(this.pipes.ifft);
    pass.setBindGroup(0, this.groups.ifftH);
    pass.dispatchWorkgroups(N, LAYERS);
    pass.setBindGroup(0, this.groups.ifftV);
    pass.dispatchWorkgroups(N, LAYERS);
    pass.setPipeline(this.pipes.assemble);
    pass.setBindGroup(0, this.groups.assemble);
    pass.dispatchWorkgroups(g, g, LAYERS);
    pass.setPipeline(this.mipPipe);
    this.mipGroups.forEach((group, i) => {
      const size = N >> (i + 1);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(Math.ceil(size / 8), Math.ceil(size / 8), LAYERS);
    });
    if (this.queryCount) {
      pass.setPipeline(this.pipes.query);
      pass.setBindGroup(0, this.groups.query);
      pass.dispatchWorkgroups(1);
    }
    pass.end();
    if (this.queryCount && !this.reading) enc.copyBufferToBuffer(this.heightBuf, 0, this.staging, 0, MAX_QUERIES * 4);
  }

  /** Call after the frame's commands are submitted. */
  afterSubmit() {
    if (!this.queryCount || this.reading) return;
    this.reading = true;
    this.staging.mapAsync(GPUMapMode.READ).then(() => {
      this.heights.set(new Float32Array(this.staging.getMappedRange()));
      this.staging.unmap();
      this.reading = false;
    }).catch(() => { this.reading = false; });
  }
}

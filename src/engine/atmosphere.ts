// Owns the physically based sky LUTs: transmittance and multiple scattering are baked once, the
// sky-view LUT is refreshed every frame for the current sun (see wgsl/atmosphere.ts).
import { ATMO_MULTISCATTER, ATMO_SKYVIEW, ATMO_TRANSMITTANCE } from './wgsl/atmosphere';

export class Atmosphere {
  readonly skyView: GPUTexture;
  private trans: GPUTexture;
  private ms: GPUTexture;
  private pipe: GPUComputePipeline;
  private group: GPUBindGroup;
  private uni: GPUBuffer;
  private data = new Float32Array(8);

  constructor(private d: GPUDevice) {
    const F = 'rgba16float';
    const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
    this.trans = d.createTexture({ size: [256, 64], format: F, usage });
    this.ms = d.createTexture({ size: [32, 32], format: F, usage });
    this.skyView = d.createTexture({ size: [192, 108], format: F, usage: usage | GPUTextureUsage.COPY_SRC });
    const samp = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.uni = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const C = GPUShaderStage.COMPUTE;
    const out: GPUBindGroupLayoutEntry = { binding: 0, visibility: C, storageTexture: { access: 'write-only', format: F } };
    const tex = (binding: number): GPUBindGroupLayoutEntry => ({ binding, visibility: C, texture: { sampleType: 'float' } });
    const smp: GPUBindGroupLayoutEntry = { binding: 2, visibility: C, sampler: { type: 'filtering' } };
    const mk = (label: string, code: string, entries: GPUBindGroupLayoutEntry[]) => {
      const layout = d.createBindGroupLayout({ entries });
      const module = d.createShaderModule({ label, code });
      module.getCompilationInfo().then((info) => { for (const m of info.messages) if (m.type === 'error') console.error(`[${label}] ${m.lineNum}:${m.linePos} ${m.message}`); });
      return { layout, pipe: d.createComputePipeline({ label, layout: d.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module, entryPoint: 'main' } }) };
    };
    const t = mk('atmo-transmittance', ATMO_TRANSMITTANCE, [out]);
    const m = mk('atmo-multiscatter', ATMO_MULTISCATTER, [out, tex(1), smp]);
    const s = mk('atmo-skyview', ATMO_SKYVIEW, [out, tex(1), smp, tex(3), { binding: 4, visibility: C, buffer: { type: 'uniform' } }]);
    this.pipe = s.pipe;
    this.group = d.createBindGroup({ layout: s.layout, entries: [
      { binding: 0, resource: this.skyView.createView() }, { binding: 1, resource: this.trans.createView() }, { binding: 2, resource: samp },
      { binding: 3, resource: this.ms.createView() }, { binding: 4, resource: { buffer: this.uni } },
    ] });
    const enc = d.createCommandEncoder();
    const run = (p: GPUComputePipeline, g: GPUBindGroup, w: number, h: number) => {
      const pass = enc.beginComputePass();
      pass.setPipeline(p);
      pass.setBindGroup(0, g);
      pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
      pass.end();
    };
    run(t.pipe, d.createBindGroup({ layout: t.layout, entries: [{ binding: 0, resource: this.trans.createView() }] }), 256, 64);
    run(m.pipe, d.createBindGroup({ layout: m.layout, entries: [
      { binding: 0, resource: this.ms.createView() }, { binding: 1, resource: this.trans.createView() }, { binding: 2, resource: samp },
    ] }), 32, 32);
    d.queue.submit([enc.finish()]);
  }

  /** Re-renders the sky around the camera for a sun direction (y up) and camera height (m). */
  update(enc: GPUCommandEncoder, sunY: number, camHeight: number) {
    const u = this.data;
    u[0] = 0; u[1] = 0; u[2] = Math.max(-1, Math.min(1, sunY)); u[3] = 0;
    u[4] = Math.max(0.001, Math.min(camHeight, 2000) / 1000); u[5] = 0; u[6] = 0; u[7] = 0;
    this.d.queue.writeBuffer(this.uni, 0, u);
    const pass = enc.beginComputePass({ label: 'sky-view' });
    pass.setPipeline(this.pipe);
    pass.setBindGroup(0, this.group);
    pass.dispatchWorkgroups(Math.ceil(192 / 8), Math.ceil(108 / 8));
    pass.end();
  }
}

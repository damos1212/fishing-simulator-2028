import { FrameState } from './frame';
import type { GPUContext } from './gpu';
import type { MeshData, ModelData } from './glb';
import { mat4, type Mat4 } from './math';
import { MESH, OCEAN, PARTICLES, POST, SKY, UNLIT } from './shaders';

const HDR: GPUTextureFormat = 'rgba16float';
const DEPTH: GPUTextureFormat = 'depth32float';
const INST_FLOATS = 32;
const PART_FLOATS = 12;
const UNLIT_FLOATS = 7;
const BLOOM_LEVELS = 5;

export interface GpuMesh {
  name: string;
  vbuf: GPUBuffer;
  ibuf: GPUBuffer;
  indexCount: number;
  matrix: Mat4;
  identity: boolean;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  staging: Float32Array;
  count: number;
}

export interface GpuModel {
  meshes: GpuMesh[];
  byName: Map<string, GpuMesh>;
  nodes: Map<string, Mat4>;
}

/** Per-draw material/animation parameters, copied into the instance buffer. */
export class Inst {
  /** rgb tint (or fish back color), w = glow */
  a = new Float32Array([1, 1, 1, 0]);
  /** rgb (fish belly / hull color), w = pattern */
  b = new Float32Array([1, 1, 1, 0]);
  /** rgb (fish fins), w = animation type */
  c = new Float32Array([1, 1, 1, 0]);
  phase = 0;
  amp = 0;
  outline = 0;
  /** 0 vertex color, 1 fish mask, 2 unlit emissive, 3 terrain, 4 boat */
  mode = 0;
  static solid(mode = 0, outline = 0) {
    const i = new Inst();
    i.mode = mode;
    i.outline = outline;
    return i;
  }
}

export class Renderer {
  readonly device: GPUDevice;
  readonly frame = new FrameState();
  readonly post = { time: 0, underwater: 0, bloom: 0.55, exposure: 1, flash: [0, 0, 0, 0], fade: [0, 0, 0, 0], vignette: 0.35, saturation: 1.12, aberration: 0, threshold: 2.2 };
  width = 1;
  height = 1;
  renderScale = 1;

  private ctx: GPUContext;
  private frameData = new Float32Array(FrameState.FLOATS);
  private frameBuf: GPUBuffer;
  private frameBGL: GPUBindGroupLayout;
  private frameBG: GPUBindGroup;

  private msaaColor!: GPUTexture;
  private depthTex!: GPUTexture;
  private hdr!: GPUTexture;
  private bloom: GPUTexture[] = [];

  private meshPipe: GPURenderPipeline;
  private outlinePipe: GPURenderPipeline;
  private instBGL: GPUBindGroupLayout;
  private instBuf!: GPUBuffer;
  private instBG!: GPUBindGroup;
  private instData = new Float32Array(0);
  private active: GpuMesh[] = [];

  private oceanPipe: GPURenderPipeline;
  private oceanVB: GPUBuffer;
  private oceanIB: GPUBuffer;
  private oceanCount: number;
  private oceanBGL: GPUBindGroupLayout;
  private oceanBG!: GPUBindGroup;
  private heightTex!: GPUTexture;
  private linSampler: GPUSampler;

  private skyPipe: GPURenderPipeline;

  private partPipe: GPURenderPipeline;
  private partBGL: GPUBindGroupLayout;
  private partBuf!: GPUBuffer;
  private partBG!: GPUBindGroup;
  readonly parts = { data: new Float32Array(4096 * PART_FLOATS), count: 0, max: 4096 };

  private unlitPipe: GPURenderPipeline;
  private unlitVB: GPUBuffer;
  readonly unlit = { data: new Float32Array(16384 * UNLIT_FLOATS), count: 0, max: 16384 };

  private postBGL: GPUBindGroupLayout;
  private prefilterPipe: GPURenderPipeline;
  private downPipe: GPURenderPipeline;
  private upPipe: GPURenderPipeline;
  private compositePipe: GPURenderPipeline;
  private postBufs: GPUBuffer[] = [];
  private postBGs: GPUBindGroup[] = [];
  private dummyTex: GPUTexture;
  private postData = new Float32Array(20);

  constructor(ctx: GPUContext) {
    this.ctx = ctx;
    const d = (this.device = ctx.device);
    this.frameBuf = d.createBuffer({ size: FrameState.FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.frameBGL = d.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.frameBG = d.createBindGroup({ layout: this.frameBGL, entries: [{ binding: 0, resource: { buffer: this.frameBuf } }] });
    this.linSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    const ms: GPUMultisampleState = { count: 4 };
    const depthOpaque: GPUDepthStencilState = { format: DEPTH, depthWriteEnabled: true, depthCompare: 'greater' };
    const depthRead: GPUDepthStencilState = { format: DEPTH, depthWriteEnabled: false, depthCompare: 'greater' };
    const premul: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };

    // meshes
    this.instBGL = d.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }],
    });
    const meshModule = this.module('mesh', MESH);
    const meshLayout = d.createPipelineLayout({ bindGroupLayouts: [this.frameBGL, this.instBGL] });
    const meshVB: GPUVertexBufferLayout = {
      arrayStride: 40,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x4' },
      ],
    };
    this.meshPipe = d.createRenderPipeline({
      label: 'mesh', layout: meshLayout,
      vertex: { module: meshModule, entryPoint: 'vs', buffers: [meshVB] },
      fragment: { module: meshModule, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOpaque, multisample: ms,
    });
    this.outlinePipe = d.createRenderPipeline({
      label: 'outline', layout: meshLayout,
      vertex: { module: meshModule, entryPoint: 'vsOutline', buffers: [meshVB] },
      fragment: { module: meshModule, entryPoint: 'fsOutline', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'front' },
      depthStencil: depthOpaque, multisample: ms,
    });
    this.ensureInstances(4096);

    // ocean
    this.oceanBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, sampler: { type: 'filtering' } },
      ],
    });
    const oceanModule = this.module('ocean', OCEAN);
    this.oceanPipe = d.createRenderPipeline({
      label: 'ocean', layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameBGL, this.oceanBGL] }),
      vertex: { module: oceanModule, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module: oceanModule, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOpaque, multisample: ms,
    });
    const N = 448;
    const grid = new Float32Array((N + 1) * (N + 1) * 2);
    for (let j = 0, k = 0; j <= N; j++) for (let i = 0; i <= N; i++) { grid[k++] = (i / N) * 2 - 1; grid[k++] = (j / N) * 2 - 1; }
    const idx = new Uint32Array(N * N * 6);
    for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, e = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = e;
    }
    this.oceanVB = this.buffer(grid, GPUBufferUsage.VERTEX);
    this.oceanIB = this.buffer(idx, GPUBufferUsage.INDEX);
    this.oceanCount = idx.length;
    this.setHeightMap(new Uint16Array(4), 2);

    // sky
    const skyModule = this.module('sky', SKY);
    this.skyPipe = d.createRenderPipeline({
      label: 'sky', layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameBGL] }),
      vertex: { module: skyModule, entryPoint: 'vs' },
      fragment: { module: skyModule, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' }, multisample: ms,
    });

    // particles
    this.partBGL = d.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }],
    });
    const partModule = this.module('particles', PARTICLES);
    this.partPipe = d.createRenderPipeline({
      label: 'particles', layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameBGL, this.partBGL] }),
      vertex: { module: partModule, entryPoint: 'vs' },
      fragment: { module: partModule, entryPoint: 'fs', targets: [{ format: HDR, blend: premul }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depthRead, multisample: ms,
    });
    this.partBuf = d.createBuffer({ size: this.parts.data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.partBG = d.createBindGroup({ layout: this.partBGL, entries: [{ binding: 0, resource: { buffer: this.partBuf } }] });

    // unlit ribbons (fishing line etc.)
    const unlitModule = this.module('unlit', UNLIT);
    this.unlitPipe = d.createRenderPipeline({
      label: 'unlit', layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameBGL] }),
      vertex: {
        module: unlitModule, entryPoint: 'vs',
        buffers: [{ arrayStride: 28, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x4' }] }],
      },
      fragment: { module: unlitModule, entryPoint: 'fs', targets: [{ format: HDR, blend: premul }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthRead, multisample: ms,
    });
    this.unlitVB = d.createBuffer({ size: this.unlit.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

    // post
    this.postBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const postModule = this.module('post', POST);
    const postLayout = d.createPipelineLayout({ bindGroupLayouts: [this.postBGL] });
    const postPipe = (entry: string, format: GPUTextureFormat, blend?: GPUBlendState) => d.createRenderPipeline({
      label: 'post-' + entry, layout: postLayout,
      vertex: { module: postModule, entryPoint: 'vs' },
      fragment: { module: postModule, entryPoint: entry, targets: [{ format, blend }] },
      primitive: { topology: 'triangle-list' },
    });
    this.prefilterPipe = postPipe('prefilter', HDR);
    this.downPipe = postPipe('down', HDR);
    this.upPipe = postPipe('up', HDR, {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
    this.compositePipe = postPipe('composite', ctx.format);
    this.dummyTex = d.createTexture({ size: [1, 1], format: HDR, usage: GPUTextureUsage.TEXTURE_BINDING });
    this.resize();
  }

  private module(label: string, code: string) {
    const m = this.device.createShaderModule({ label, code });
    m.getCompilationInfo().then((info) => {
      for (const msg of info.messages) {
        if (msg.type === 'error') console.error(`[${label}] ${msg.lineNum}:${msg.linePos} ${msg.message}\n${code.split('\n')[msg.lineNum - 1]}`);
      }
    });
    return m;
  }

  private buffer(data: Float32Array | Uint32Array, usage: number) {
    const b = this.device.createBuffer({ size: Math.max(16, data.byteLength), usage: usage | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(b, 0, data.buffer, data.byteOffset, data.byteLength);
    return b;
  }

  private ensureInstances(n: number) {
    if (this.instData.length >= n * INST_FLOATS) return;
    const cap = Math.max(n, (this.instData.length / INST_FLOATS) * 2);
    this.instData = new Float32Array(cap * INST_FLOATS);
    this.instBuf?.destroy();
    this.instBuf = this.device.createBuffer({ size: this.instData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.instBG = this.device.createBindGroup({ layout: this.instBGL, entries: [{ binding: 0, resource: { buffer: this.instBuf } }] });
  }

  registerMesh(m: MeshData): GpuMesh {
    let identity = true;
    const id = mat4.create();
    for (let i = 0; i < 16; i++) if (Math.abs(m.matrix[i] - id[i]) > 1e-6) identity = false;
    return {
      name: m.name,
      vbuf: this.buffer(m.vertices, GPUBufferUsage.VERTEX),
      ibuf: this.buffer(m.indices, GPUBufferUsage.INDEX),
      indexCount: m.indices.length,
      matrix: m.matrix,
      identity,
      boundsMin: m.boundsMin,
      boundsMax: m.boundsMax,
      staging: new Float32Array(INST_FLOATS * 8),
      count: 0,
    };
  }

  registerModel(data: ModelData): GpuModel {
    const meshes = data.meshes.map((m) => this.registerMesh(m));
    return { meshes, byName: new Map(meshes.map((m) => [m.name, m])), nodes: data.nodes };
  }

  private tmp = mat4.create();
  draw(mesh: GpuMesh, model: Mat4, inst: Inst) {
    if (mesh.count === 0) this.active.push(mesh);
    let s = mesh.staging;
    const o = mesh.count * INST_FLOATS;
    if (o + INST_FLOATS > s.length) {
      const ns = new Float32Array(s.length * 2);
      ns.set(s);
      s = mesh.staging = ns;
    }
    s.set(mesh.identity ? model : mat4.multiply(this.tmp, model, mesh.matrix), o);
    s.set(inst.a, o + 16);
    s.set(inst.b, o + 20);
    s.set(inst.c, o + 24);
    s[o + 28] = inst.phase;
    s[o + 29] = inst.amp;
    s[o + 30] = inst.outline;
    s[o + 31] = inst.mode;
    mesh.count++;
  }

  drawModel(model: GpuModel, m: Mat4, inst: Inst, skip?: (mesh: GpuMesh) => boolean) {
    for (const mesh of model.meshes) if (!skip || !skip(mesh)) this.draw(mesh, m, inst);
  }

  /** Pushes a particle: kind 0 soft, 1 ring, 2 flat water ring, 3 sparkle, 4 hard disc. alpha 0 = additive. */
  particle(x: number, y: number, z: number, size: number, r: number, g: number, b: number, alpha: number, kind = 0, rot = 0) {
    const p = this.parts;
    if (p.count >= p.max) return;
    const o = p.count++ * PART_FLOATS;
    const d = p.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = alpha;
    d[o + 8] = kind; d[o + 9] = rot;
  }

  /** Pushes one unlit triangle vertex (premultiplied by alpha in shader). */
  vertex(x: number, y: number, z: number, r: number, g: number, b: number, a: number) {
    const u = this.unlit;
    if (u.count >= u.max) return;
    const o = u.count++ * UNLIT_FLOATS;
    const d = u.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = r; d[o + 4] = g; d[o + 5] = b; d[o + 6] = a;
  }

  /** Height map in warped coordinates (see Terrain), stored as half floats. */
  setHeightMap(data: Uint16Array, size: number) {
    this.heightTex?.destroy();
    this.heightTex = this.device.createTexture({ size: [size, size], format: 'r16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.device.queue.writeTexture({ texture: this.heightTex }, data.buffer, { bytesPerRow: size * 2, offset: data.byteOffset }, [size, size]);
    this.oceanBG = this.device.createBindGroup({
      layout: this.oceanBGL,
      entries: [{ binding: 0, resource: this.heightTex.createView() }, { binding: 1, resource: this.linSampler }],
    });
  }

  resize() {
    const c = this.ctx.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale;
    const w = Math.max(1, Math.floor(c.clientWidth * dpr));
    const h = Math.max(1, Math.floor(c.clientHeight * dpr));
    if (w === this.width && h === this.height && this.hdr) return;
    this.width = w;
    this.height = h;
    c.width = w;
    c.height = h;
    const d = this.device;
    this.msaaColor?.destroy();
    this.depthTex?.destroy();
    this.hdr?.destroy();
    for (const b of this.bloom) b.destroy();
    this.msaaColor = d.createTexture({ size: [w, h], format: HDR, sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depthTex = d.createTexture({ size: [w, h], format: DEPTH, sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.hdr = d.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.bloom = [];
    let bw = w, bh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloom.push(d.createTexture({ size: [bw, bh], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }));
    }
    // post passes: 0 prefilter, 1..L-1 down, L..2L-2 up, last composite
    for (const b of this.postBufs) b.destroy();
    this.postBufs = [];
    this.postBGs = [];
    const mk = (src: GPUTexture, bloomTex: GPUTexture) => {
      const buf = d.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.postBufs.push(buf);
      this.postBGs.push(d.createBindGroup({
        layout: this.postBGL,
        entries: [
          { binding: 0, resource: { buffer: buf } },
          { binding: 1, resource: src.createView() },
          { binding: 2, resource: this.linSampler },
          { binding: 3, resource: bloomTex.createView() },
        ],
      }));
    };
    mk(this.hdr, this.dummyTex);
    for (let i = 1; i < BLOOM_LEVELS; i++) mk(this.bloom[i - 1], this.dummyTex);
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) mk(this.bloom[i + 1], this.dummyTex);
    mk(this.hdr, this.bloom[0]);
    this.frame.width = w;
    this.frame.height = h;
  }

  private writePost(i: number, texelW: number, texelH: number) {
    const p = this.post, o = this.postData;
    o[0] = p.time; o[1] = p.underwater; o[2] = p.bloom; o[3] = p.exposure;
    o.set(p.flash, 4); o.set(p.fade, 8);
    o[12] = p.vignette; o[13] = p.saturation; o[14] = p.aberration; o[15] = p.threshold;
    o[16] = texelW; o[17] = texelH; o[18] = 0; o[19] = 0;
    this.device.queue.writeBuffer(this.postBufs[i], 0, o);
  }

  render(opts: { ocean: boolean }) {
    this.resize();
    const d = this.device;
    this.frame.pack(this.frameData);
    d.queue.writeBuffer(this.frameBuf, 0, this.frameData);

    // pack instances
    let total = 0;
    for (const m of this.active) total += m.count;
    this.ensureInstances(total + 1);
    const ranges: [GpuMesh, number, number][] = [];
    let off = 0;
    for (const m of this.active) {
      this.instData.set(m.staging.subarray(0, m.count * INST_FLOATS), off * INST_FLOATS);
      ranges.push([m, off, m.count]);
      off += m.count;
      m.count = 0;
    }
    this.active.length = 0;
    if (off > 0) d.queue.writeBuffer(this.instBuf, 0, this.instData.buffer, 0, off * INST_FLOATS * 4);
    if (this.parts.count > 0) d.queue.writeBuffer(this.partBuf, 0, this.parts.data.buffer, 0, this.parts.count * PART_FLOATS * 4);
    if (this.unlit.count > 0) d.queue.writeBuffer(this.unlitVB, 0, this.unlit.data.buffer, 0, this.unlit.count * UNLIT_FLOATS * 4);

    const enc = d.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.msaaColor.createView(), resolveTarget: this.hdr.createView(), loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }],
      depthStencilAttachment: { view: this.depthTex.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 0 },
    });
    pass.setBindGroup(0, this.frameBG);
    pass.setPipeline(this.skyPipe);
    pass.draw(3);

    pass.setPipeline(this.meshPipe);
    pass.setBindGroup(1, this.instBG);
    for (const [m, first, count] of ranges) {
      pass.setVertexBuffer(0, m.vbuf);
      pass.setIndexBuffer(m.ibuf, 'uint32');
      pass.drawIndexed(m.indexCount, count, 0, 0, first);
    }
    pass.setPipeline(this.outlinePipe);
    for (const [m, first, count] of ranges) {
      pass.setVertexBuffer(0, m.vbuf);
      pass.setIndexBuffer(m.ibuf, 'uint32');
      pass.drawIndexed(m.indexCount, count, 0, 0, first);
    }
    if (opts.ocean) {
      pass.setPipeline(this.oceanPipe);
      pass.setBindGroup(1, this.oceanBG);
      pass.setVertexBuffer(0, this.oceanVB);
      pass.setIndexBuffer(this.oceanIB, 'uint32');
      pass.drawIndexed(this.oceanCount);
    }
    if (this.unlit.count > 0) {
      pass.setPipeline(this.unlitPipe);
      pass.setVertexBuffer(0, this.unlitVB);
      pass.draw(this.unlit.count);
    }
    if (this.parts.count > 0) {
      pass.setPipeline(this.partPipe);
      pass.setBindGroup(1, this.partBG);
      pass.draw(6, this.parts.count);
    }
    pass.end();
    this.parts.count = 0;
    this.unlit.count = 0;

    // bloom chain
    const blit = (pipe: GPURenderPipeline, target: GPUTexture, bg: number, load: boolean) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: load ? 'load' : 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      p.setPipeline(pipe);
      p.setBindGroup(0, this.postBGs[bg]);
      p.draw(3);
      p.end();
    };
    let k = 0;
    this.writePost(k, 1 / this.width, 1 / this.height);
    blit(this.prefilterPipe, this.bloom[0], k++, false);
    for (let i = 1; i < BLOOM_LEVELS; i++) {
      this.writePost(k, 1 / this.bloom[i - 1].width, 1 / this.bloom[i - 1].height);
      blit(this.downPipe, this.bloom[i], k++, false);
    }
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      this.writePost(k, 1 / this.bloom[i + 1].width, 1 / this.bloom[i + 1].height);
      blit(this.upPipe, this.bloom[i], k++, true);
    }
    this.writePost(k, 1 / this.width, 1 / this.height);
    const swap = this.ctx.context.getCurrentTexture();
    const p = enc.beginRenderPass({ colorAttachments: [{ view: swap.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    p.setPipeline(this.compositePipe);
    p.setBindGroup(0, this.postBGs[k]);
    p.draw(3);
    p.end();
    d.queue.submit([enc.finish()]);
  }
}

/** float32 -> IEEE half, for r16float uploads. */
const halfF = new Float32Array(1);
const halfU = new Uint32Array(halfF.buffer);
export function toHalf(v: number) {
  halfF[0] = v;
  const x = halfU[0];
  const sign = (x >> 16) & 0x8000;
  let exp = ((x >> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (exp <= 0) return sign;
  if (exp >= 31) return sign | 0x7bff;
  mant >>= 13;
  exp <<= 10;
  return sign | exp | mant;
}

// WebGPU renderer. Per frame:
//   1. volumetric clouds raymarched into a hemi-octahedral dome texture
//   2. cascaded sun shadow maps (depth only)
//   3. planar reflection: the scene mirrored below the sea surface, at reduced resolution
//   4. opaque pass (MSAA): sky, meshes, outlines -> resolved to `sceneColor` (alpha = view distance)
//   5. water pass (MSAA, continues on the same targets): ocean refracting `sceneColor`, ribbons, particles
//   6. post: god rays, bloom chain, tonemapping and grading
import { FrameState } from './frame';
import type { GPUContext } from './gpu';
import type { MeshData, ModelData } from './glb';
import { mat4, type Mat4, Vec3 } from './math';
import { CLOUDS, DETAIL, MESH, NOISE3D, OCEAN, PARTICLES, POST, SKY, UNLIT, WATER_NORMALS } from './shaders';

const HDR: GPUTextureFormat = 'rgba16float';
const DEPTH: GPUTextureFormat = 'depth32float';
const INST_FLOATS = 32;
const PART_FLOATS = 12;
const UNLIT_FLOATS = 7;
const BLOOM_LEVELS = 5;
const POST_FLOATS = 28;

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
  /** Shading kind this frame (instance mode of the first draw) and whether any instance has an outline. */
  mode: number;
  outlined: boolean;
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

export interface GraphicsQuality {
  name: string;
  /** shadow cascades (0 = off) */
  shadows: number;
  shadowSize: number;
  reflections: boolean;
  reflScale: number;
  clouds: boolean;
  cloudSize: number;
  cloudSteps: number;
  rays: boolean;
}

export const QUALITY: GraphicsQuality[] = [
  { name: 'Low', shadows: 0, shadowSize: 1024, reflections: false, reflScale: 0.5, clouds: false, cloudSize: 256, cloudSteps: 16, rays: false },
  { name: 'Medium', shadows: 1, shadowSize: 2048, reflections: false, reflScale: 0.5, clouds: true, cloudSize: 384, cloudSteps: 22, rays: true },
  { name: 'High', shadows: 2, shadowSize: 2048, reflections: true, reflScale: 0.5, clouds: true, cloudSize: 512, cloudSteps: 30, rays: true },
  { name: 'Ultra', shadows: 2, shadowSize: 4096, reflections: true, reflScale: 0.75, clouds: true, cloudSize: 768, cloudSteps: 44, rays: true },
];

interface PostSlot { buf: GPUBuffer; bg: GPUBindGroup }

export class Renderer {
  readonly device: GPUDevice;
  readonly frame = new FrameState();
  readonly post = {
    time: 0, underwater: 0, bloom: 0.55, exposure: 1, flash: [0, 0, 0, 0], fade: [0, 0, 0, 0], vignette: 0.35, saturation: 1.12, aberration: 0, threshold: 2.2,
    rays: 0.55, contrast: 0.22, warmth: 0.6, grain: 0.018,
  };
  width = 1;
  height = 1;
  renderScale = 1;
  quality: GraphicsQuality = QUALITY[2];

  private ctx: GPUContext;
  private frameData = new Float32Array(FrameState.FLOATS);
  private reflData = new Float32Array(FrameState.FLOATS);
  private frameBuf: GPUBuffer;
  private reflBuf: GPUBuffer;
  private baseBGL: GPUBindGroupLayout;
  private frameBGL: GPUBindGroupLayout;
  private baseBG!: GPUBindGroup;
  private frameBG!: GPUBindGroup;
  private reflBG!: GPUBindGroup;

  private msaaColor!: GPUTexture;
  private depthTex!: GPUTexture;
  private sceneColor!: GPUTexture;
  private hdr!: GPUTexture;
  private raysTex!: GPUTexture;
  private reflColor!: GPUTexture;
  private reflDepth!: GPUTexture;
  private bloom: GPUTexture[] = [];

  private noiseTex: GPUTexture;
  private waterNrm: GPUTexture;
  private detailTex: GPUTexture;
  private cloudTex!: GPUTexture;
  private shadowTex!: GPUTexture;
  private linSampler: GPUSampler;
  private repSampler: GPUSampler;
  private cmpSampler: GPUSampler;

  private meshPipe: GPURenderPipeline;
  private fishPipe: GPURenderPipeline;
  private terrainPipe: GPURenderPipeline;
  private meshReflPipe: GPURenderPipeline;
  private outlinePipe: GPURenderPipeline;
  private shadowPipes: GPURenderPipeline[];
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

  private skyPipe: GPURenderPipeline;
  private skyReflPipe: GPURenderPipeline;
  private cloudPipe: GPURenderPipeline;

  private partPipe: GPURenderPipeline;
  private partBGL: GPUBindGroupLayout;
  private partBuf!: GPUBuffer;
  private partBG!: GPUBindGroup;
  readonly parts = { data: new Float32Array(8192 * PART_FLOATS), count: 0, max: 8192 };

  private unlitPipe: GPURenderPipeline;
  private unlitVB: GPUBuffer;
  readonly unlit = { data: new Float32Array(16384 * UNLIT_FLOATS), count: 0, max: 16384 };

  private postBGL: GPUBindGroupLayout;
  private prefilterPipe: GPURenderPipeline;
  private downPipe: GPURenderPipeline;
  private upPipe: GPURenderPipeline;
  private compositePipe: GPURenderPipeline;
  private raysPipe: GPURenderPipeline;
  private slots: { prefilter?: PostSlot; down: PostSlot[]; up: PostSlot[]; composite?: PostSlot; rays?: PostSlot } = { down: [], up: [] };
  private dummyTex: GPUTexture;
  private postData = new Float32Array(POST_FLOATS);
  private sunUV = [0.5, 0.5, 0];

  constructor(ctx: GPUContext) {
    this.ctx = ctx;
    const d = (this.device = ctx.device);
    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
    this.frameBuf = d.createBuffer({ size: FrameState.FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.reflBuf = d.createBuffer({ size: FrameState.FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.baseBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: VF, buffer: { type: 'uniform' } },
        { binding: 1, visibility: VF, texture: { sampleType: 'float', viewDimension: '3d' } },
        { binding: 2, visibility: VF, sampler: { type: 'filtering' } },
      ],
    });
    this.frameBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: VF, buffer: { type: 'uniform' } },
        { binding: 1, visibility: VF, texture: { sampleType: 'float', viewDimension: '3d' } },
        { binding: 2, visibility: VF, sampler: { type: 'filtering' } },
        { binding: 3, visibility: VF, texture: { sampleType: 'depth', viewDimension: '2d-array' } },
        { binding: 4, visibility: VF, sampler: { type: 'comparison' } },
        { binding: 5, visibility: VF, texture: { sampleType: 'float' } },
        { binding: 6, visibility: VF, sampler: { type: 'filtering' } },
        { binding: 7, visibility: VF, texture: { sampleType: 'float' } },
      ],
    });
    this.linSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.repSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat' });
    this.cmpSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', compare: 'less', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    const ms: GPUMultisampleState = { count: 4 };
    const depthOpaque: GPUDepthStencilState = { format: DEPTH, depthWriteEnabled: true, depthCompare: 'greater' };
    const depthRead: GPUDepthStencilState = { format: DEPTH, depthWriteEnabled: false, depthCompare: 'greater' };
    const premul: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };

    // generated textures
    this.noiseTex = d.createTexture({ size: [128, 128, 128], dimension: '3d', format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
    this.waterNrm = d.createTexture({ size: [256, 256], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
    this.detailTex = d.createTexture({ size: [512, 512], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING });
    this.generate();

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
    const meshPipe = (label: string, fs: string, vs: string, cull: GPUCullMode, samples: number) => d.createRenderPipeline({
      label, layout: meshLayout,
      vertex: { module: meshModule, entryPoint: vs, buffers: [meshVB] },
      fragment: { module: meshModule, entryPoint: fs, targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: cull },
      depthStencil: depthOpaque, multisample: { count: samples },
    });
    this.meshPipe = meshPipe('mesh', 'fs', 'vs', 'none', 4);
    this.fishPipe = meshPipe('fish', 'fsFish', 'vs', 'none', 4);
    this.terrainPipe = meshPipe('terrain', 'fsTerrain', 'vs', 'none', 4);
    this.meshReflPipe = meshPipe('mesh-refl', 'fsRefl', 'vs', 'none', 1);
    this.outlinePipe = meshPipe('outline', 'fsOutline', 'vsOutline', 'front', 4);
    const shadowLayout = d.createPipelineLayout({ bindGroupLayouts: [this.baseBGL, this.instBGL] });
    this.shadowPipes = ['vsShadow0', 'vsShadow1'].map((entry) => d.createRenderPipeline({
      label: entry, layout: shadowLayout,
      vertex: { module: meshModule, entryPoint: entry, buffers: [meshVB] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5, depthBiasClamp: 0.002 },
    }));
    this.ensureInstances(4096);

    // ocean
    this.oceanBGL = d.createBindGroupLayout({
      entries: [0, 1, 2, 3].map((binding) => ({ binding, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, texture: { sampleType: 'float' as const } })),
    });
    const oceanModule = this.module('ocean', OCEAN);
    this.oceanPipe = d.createRenderPipeline({
      label: 'ocean', layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameBGL, this.oceanBGL] }),
      vertex: { module: oceanModule, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module: oceanModule, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOpaque, multisample: ms,
    });
    const N = 512;
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

    // sky and clouds
    const skyModule = this.module('sky', SKY);
    const skyPipe = (samples: number) => d.createRenderPipeline({
      label: 'sky', layout: d.createPipelineLayout({ bindGroupLayouts: [this.frameBGL] }),
      vertex: { module: skyModule, entryPoint: 'vs' },
      fragment: { module: skyModule, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'always' }, multisample: { count: samples },
    });
    this.skyPipe = skyPipe(4);
    this.skyReflPipe = skyPipe(1);
    const cloudModule = this.module('clouds', CLOUDS);
    this.cloudPipe = d.createRenderPipeline({
      label: 'clouds', layout: d.createPipelineLayout({ bindGroupLayouts: [this.baseBGL] }),
      vertex: { module: cloudModule, entryPoint: 'vs' },
      fragment: { module: cloudModule, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list' },
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
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
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
    this.raysPipe = postPipe('rays', HDR);
    this.compositePipe = postPipe('composite', ctx.format);
    this.dummyTex = d.createTexture({ size: [1, 1], format: HDR, usage: GPUTextureUsage.TEXTURE_BINDING });
    this.setQuality(2);
    this.setHeightMap(new Uint16Array(4), 2);
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

  /** Bakes the tiling cloud noise volume and the water detail texture on the GPU. */
  private generate() {
    const d = this.device;
    const enc = d.createCommandEncoder();
    const run = (code: string, label: string, tex: GPUTexture, format: GPUTextureFormat, dim: GPUTextureViewDimension, groups: [number, number, number]) => {
      const module = this.module(label, code);
      const bgl = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format, viewDimension: dim } }] });
      const pipe = d.createComputePipeline({ label, layout: d.createPipelineLayout({ bindGroupLayouts: [bgl] }), compute: { module, entryPoint: 'main' } });
      const bg = d.createBindGroup({ layout: bgl, entries: [{ binding: 0, resource: tex.createView({ dimension: dim }) }] });
      const pass = enc.beginComputePass();
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(...groups);
      pass.end();
    };
    run(NOISE3D, 'noise3d', this.noiseTex, 'rgba8unorm', '3d', [32, 32, 32]);
    run(WATER_NORMALS, 'water-normals', this.waterNrm, 'rgba16float', '2d', [32, 32, 1]);
    run(DETAIL, 'detail', this.detailTex, 'rgba8unorm', '2d', [64, 64, 1]);
    d.queue.submit([enc.finish()]);
  }

  /** Applies a graphics preset (0 Low .. 3 Ultra): shadow maps, reflections, volumetric clouds, god rays. */
  setQuality(level: number) {
    const q = QUALITY[Math.max(0, Math.min(QUALITY.length - 1, Math.round(level)))];
    const d = this.device;
    const first = !this.shadowTex;
    const shadowSize = q.shadows ? q.shadowSize : 16;
    if (first || this.shadowTex.width !== shadowSize) {
      this.shadowTex?.destroy();
      this.shadowTex = d.createTexture({ size: [shadowSize, shadowSize, 2], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    }
    const cloudSize = q.clouds ? q.cloudSize : 4;
    if (first || this.cloudTex.width !== cloudSize) {
      this.cloudTex?.destroy();
      this.cloudTex = d.createTexture({ size: [cloudSize, cloudSize], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    }
    const reflChanged = q.reflections !== this.quality.reflections || q.reflScale !== this.quality.reflScale;
    this.quality = q;
    this.makeFrameGroups();
    if (reflChanged && this.hdr) { this.hdr.destroy(); this.hdr = undefined as unknown as GPUTexture; this.resize(); }
  }

  private makeFrameGroups() {
    const d = this.device;
    this.baseBG = d.createBindGroup({
      layout: this.baseBGL,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuf } },
        { binding: 1, resource: this.noiseTex.createView({ dimension: '3d' }) },
        { binding: 2, resource: this.repSampler },
      ],
    });
    const full = (buf: GPUBuffer) => d.createBindGroup({
      layout: this.frameBGL,
      entries: [
        { binding: 0, resource: { buffer: buf } },
        { binding: 1, resource: this.noiseTex.createView({ dimension: '3d' }) },
        { binding: 2, resource: this.repSampler },
        { binding: 3, resource: this.shadowTex.createView({ dimension: '2d-array' }) },
        { binding: 4, resource: this.cmpSampler },
        { binding: 5, resource: this.cloudTex.createView() },
        { binding: 6, resource: this.linSampler },
        { binding: 7, resource: this.detailTex.createView() },
      ],
    });
    this.frameBG = full(this.frameBuf);
    this.reflBG = full(this.reflBuf);
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
      mode: 0,
      outlined: false,
    };
  }

  registerModel(data: ModelData): GpuModel {
    const meshes = data.meshes.map((m) => this.registerMesh(m));
    return { meshes, byName: new Map(meshes.map((m) => [m.name, m])), nodes: data.nodes };
  }

  /** Frees a mesh's GPU buffers (e.g. the terrain of a realm that was swapped out). */
  destroyMesh(m: GpuMesh) {
    m.vbuf.destroy();
    m.ibuf.destroy();
  }

  private tmp = mat4.create();
  draw(mesh: GpuMesh, model: Mat4, inst: Inst) {
    if (mesh.count === 0) {
      this.active.push(mesh);
      mesh.mode = inst.mode;
      mesh.outlined = false;
    }
    if (inst.outline > 0) mesh.outlined = true;
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
  particle(x: number, y: number, z: number, size: number, r: number, g: number, b: number, alpha: number, kind = 0, rot = 0, stretch = 1) {
    const p = this.parts;
    if (p.count >= p.max) return;
    const o = p.count++ * PART_FLOATS;
    const d = p.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = alpha;
    d[o + 8] = kind; d[o + 9] = rot; d[o + 10] = stretch; d[o + 11] = 0;
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
    this.makeOceanGroup();
  }

  private makeOceanGroup() {
    if (!this.heightTex || !this.sceneColor) return;
    this.oceanBG = this.device.createBindGroup({
      layout: this.oceanBGL,
      entries: [
        { binding: 0, resource: this.heightTex.createView() },
        { binding: 1, resource: this.sceneColor.createView() },
        { binding: 2, resource: this.reflColor.createView() },
        { binding: 3, resource: this.waterNrm.createView() },
      ],
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
    for (const t of [this.msaaColor, this.depthTex, this.hdr, this.sceneColor, this.raysTex, this.reflColor, this.reflDepth, ...this.bloom]) t?.destroy();
    const RT = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.msaaColor = d.createTexture({ size: [w, h], format: HDR, sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depthTex = d.createTexture({ size: [w, h], format: DEPTH, sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.hdr = d.createTexture({ size: [w, h], format: HDR, usage: RT });
    this.sceneColor = d.createTexture({ size: [w, h], format: HDR, usage: RT });
    this.raysTex = d.createTexture({ size: [Math.max(1, w >> 1), Math.max(1, h >> 1)], format: HDR, usage: RT });
    const rs = this.quality.reflections ? this.quality.reflScale : 0;
    const rw = rs ? Math.max(1, Math.floor(w * rs)) : 4, rh = rs ? Math.max(1, Math.floor(h * rs)) : 4;
    this.reflColor = d.createTexture({ size: [rw, rh], format: HDR, usage: RT });
    this.reflDepth = d.createTexture({ size: [rw, rh], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.bloom = [];
    let bw = w, bh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloom.push(d.createTexture({ size: [bw, bh], format: HDR, usage: RT }));
    }
    for (const s of [this.slots.prefilter, this.slots.composite, this.slots.rays, ...this.slots.down, ...this.slots.up]) s?.buf.destroy();
    const mk = (src: GPUTexture, bloomTex: GPUTexture = this.dummyTex, rays: GPUTexture = this.dummyTex): PostSlot => {
      const buf = d.createBuffer({ size: POST_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const bg = d.createBindGroup({
        layout: this.postBGL,
        entries: [
          { binding: 0, resource: { buffer: buf } },
          { binding: 1, resource: src.createView() },
          { binding: 2, resource: this.linSampler },
          { binding: 3, resource: bloomTex.createView() },
          { binding: 4, resource: rays.createView() },
        ],
      });
      return { buf, bg };
    };
    this.slots = {
      prefilter: mk(this.hdr),
      down: this.bloom.slice(1).map((_, i) => mk(this.bloom[i])),
      up: this.bloom.slice(0, -1).map((_, i) => mk(this.bloom[i + 1])),
      composite: mk(this.hdr, this.bloom[0], this.raysTex),
      rays: mk(this.sceneColor),
    };
    this.frame.width = w;
    this.frame.height = h;
    this.makeOceanGroup();
  }

  private writePost(slot: PostSlot, texelW: number, texelH: number) {
    const p = this.post, o = this.postData;
    o[0] = p.time; o[1] = p.underwater; o[2] = p.bloom; o[3] = p.exposure;
    o.set(p.flash, 4); o.set(p.fade, 8);
    o[12] = p.vignette; o[13] = p.saturation; o[14] = p.aberration; o[15] = p.threshold;
    o[16] = texelW; o[17] = texelH; o[18] = this.quality.rays ? p.rays * this.sunUV[2] : 0; o[19] = 0;
    o[20] = this.sunUV[0]; o[21] = this.sunUV[1]; o[22] = 1; o[23] = 0;
    o[24] = p.contrast; o[25] = p.warmth; o[26] = p.grain; o[27] = 0;
    this.device.queue.writeBuffer(slot.buf, 0, o);
  }

  // ------------------------------------------------------------------ per-frame setup
  private shadowView = mat4.create();
  private shadowProj = mat4.create();
  private cascades = [{ dist: 18, r: 34 }, { dist: 150, r: 260 }];

  /** Fits each shadow cascade around a point ahead of the camera, snapped to texels to avoid shimmering. */
  private updateShadows() {
    const f = this.frame;
    const L = f.sunDir;
    const v = f.view;
    const fwd = new Vec3(-v[2], -v[6], -v[10]);
    const up = Math.abs(L.y) > 0.99 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
    const xAxis = new Vec3().copy(up).cross(L).normalize();
    const yAxis = new Vec3().copy(L).cross(xAxis).normalize();
    const size = this.quality.shadowSize;
    this.cascades.forEach((c, i) => {
      const center = f.camPos.clone().addScaled(fwd, c.dist);
      center.y = Math.max(-40, Math.min(25, center.y));
      const texel = (2 * c.r) / size;
      const cx = center.dot(xAxis), cy = center.dot(yAxis);
      center.addScaled(xAxis, Math.round(cx / texel) * texel - cx).addScaled(yAxis, Math.round(cy / texel) * texel - cy);
      const eye = center.clone().addScaled(L, 900);
      mat4.lookAt(this.shadowView, eye, center, yAxis);
      mat4.ortho(this.shadowProj, -c.r, c.r, -c.r, c.r, 1, 1900);
      mat4.multiply(i === 0 ? f.sunVP0 : f.sunVP1, this.shadowProj, this.shadowView);
    });
  }

  /** Screen position and visibility of the sun, for god rays. */
  private updateSun() {
    const f = this.frame;
    const p = f.camPos.clone().addScaled(f.sunDir, 5000);
    const m = f.viewProj;
    const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
    const y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
    const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
    if (w <= 0 || f.cameraUnderwater > 0.5) { this.sunUV[2] = 0; return; }
    const nx = x / w, ny = y / w;
    const edge = Math.max(Math.abs(nx), Math.abs(ny));
    const vis = 1 - Math.min(1, Math.max(0, (edge - 0.9) / 0.9));
    this.sunUV[0] = nx * 0.5 + 0.5;
    this.sunUV[1] = 0.5 - ny * 0.5;
    this.sunUV[2] = vis * Math.min(1, f.sunDir.y * 6) * (1 - f.night * 0.8);
  }

  /** Mirror of the frame across the sea plane, for the planar reflection pass. */
  private packReflection(rw: number, rh: number) {
    const o = this.reflData;
    o.set(this.frameData);
    const view = mat4.copy(mat4.create(), this.frame.view);
    view[4] = -view[4]; view[5] = -view[5]; view[6] = -view[6]; view[7] = -view[7];
    const vp = mat4.multiply(mat4.create(), this.frame.proj, view);
    o.set(vp, 0);
    o.set(mat4.invert(mat4.create(), vp), 16);
    o.set(view, 32);
    o[49] = -this.frame.camPos.y;
    o[108] = rw; o[109] = rh; o[110] = 1 / rw; o[111] = 1 / rh;
    o[168] = 1;
  }

  render(opts: { ocean: boolean }) {
    this.resize();
    const d = this.device;
    const f = this.frame;
    const q = this.quality;
    const under = f.cameraUnderwater > 0.5;
    const planar = q.reflections && !under;
    f.shadowOn = q.shadows > 0 ? 1 : 0;
    f.shadowCascades = q.shadows;
    f.shadowTexel = 1 / q.shadowSize;
    f.volumetric = q.clouds ? 1 : 0;
    f.cloudSteps = q.cloudSteps;
    f.planar = planar ? 1 : 0;
    f.clipReflect = 0;
    if (q.shadows) this.updateShadows();
    this.updateSun();
    f.pack(this.frameData);
    d.queue.writeBuffer(this.frameBuf, 0, this.frameData);
    if (planar) {
      this.packReflection(this.reflColor.width, this.reflColor.height);
      d.queue.writeBuffer(this.reflBuf, 0, this.reflData);
    }

    // pack instances
    let total = 0;
    for (const m of this.active) total += m.count;
    this.ensureInstances(total + 1);
    const ranges: [GpuMesh, number, number][] = [];
    let off = 0;
    // group by shading kind so each pipeline is bound once
    this.active.sort((a, b) => a.mode - b.mode);
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
    const drawMeshes = (pass: GPURenderPassEncoder, pick?: (m: GpuMesh) => GPURenderPipeline | null) => {
      let bound: GPURenderPipeline | null = null;
      for (const [m, first, count] of ranges) {
        if (pick) {
          const pipe = pick(m);
          if (!pipe) continue;
          if (pipe !== bound) { pass.setPipeline(pipe); bound = pipe; }
        }
        pass.setVertexBuffer(0, m.vbuf);
        pass.setIndexBuffer(m.ibuf, 'uint32');
        pass.drawIndexed(m.indexCount, count, 0, 0, first);
      }
    };

    const enc = d.createCommandEncoder();
    // 1. clouds
    if (q.clouds && f.cloudCover > 0.001) {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: this.cloudTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      p.setPipeline(this.cloudPipe);
      p.setBindGroup(0, this.baseBG);
      p.draw(3);
      p.end();
    }
    // 2. shadow cascades
    for (let c = 0; c < q.shadows; c++) {
      const p = enc.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: this.shadowTex.createView({ dimension: '2d', baseArrayLayer: c, arrayLayerCount: 1 }), depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 },
      });
      p.setPipeline(this.shadowPipes[c]);
      p.setBindGroup(0, this.baseBG);
      p.setBindGroup(1, this.instBG);
      drawMeshes(p);
      p.end();
    }
    // 3. planar reflection
    if (planar) {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: this.reflColor.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        depthStencilAttachment: { view: this.reflDepth.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 0 },
      });
      p.setBindGroup(0, this.reflBG);
      p.setPipeline(this.skyReflPipe);
      p.draw(3);
      p.setPipeline(this.meshReflPipe);
      p.setBindGroup(1, this.instBG);
      drawMeshes(p);
      p.end();
    }
    // 4. opaque scene
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.msaaColor.createView(), resolveTarget: this.sceneColor.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 60000] }],
      depthStencilAttachment: { view: this.depthTex.createView(), depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 0 },
    });
    pass.setBindGroup(0, this.frameBG);
    pass.setPipeline(this.skyPipe);
    pass.draw(3);
    pass.setBindGroup(1, this.instBG);
    drawMeshes(pass, (m) => (m.mode === 3 ? this.terrainPipe : m.mode === 1 ? this.fishPipe : this.meshPipe));
    drawMeshes(pass, (m) => (m.outlined ? this.outlinePipe : null));
    pass.end();
    // 5. water and transparent effects
    const wpass = enc.beginRenderPass({
      colorAttachments: [{ view: this.msaaColor.createView(), resolveTarget: this.hdr.createView(), loadOp: 'load', storeOp: 'discard' }],
      depthStencilAttachment: { view: this.depthTex.createView(), depthLoadOp: 'load', depthStoreOp: 'discard' },
    });
    wpass.setBindGroup(0, this.frameBG);
    if (opts.ocean) {
      wpass.setPipeline(this.oceanPipe);
      wpass.setBindGroup(1, this.oceanBG);
      wpass.setVertexBuffer(0, this.oceanVB);
      wpass.setIndexBuffer(this.oceanIB, 'uint32');
      wpass.drawIndexed(this.oceanCount);
    }
    if (this.unlit.count > 0) {
      wpass.setPipeline(this.unlitPipe);
      wpass.setVertexBuffer(0, this.unlitVB);
      wpass.draw(this.unlit.count);
    }
    if (this.parts.count > 0) {
      wpass.setPipeline(this.partPipe);
      wpass.setBindGroup(1, this.partBG);
      wpass.draw(6, this.parts.count);
    }
    wpass.end();
    this.parts.count = 0;
    this.unlit.count = 0;

    // 6. post
    const blit = (pipe: GPURenderPipeline, target: GPUTexture, slot: PostSlot, load: boolean) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: load ? 'load' : 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      p.setPipeline(pipe);
      p.setBindGroup(0, slot.bg);
      p.draw(3);
      p.end();
    };
    const s = this.slots;
    if (q.rays && this.sunUV[2] > 0.01) {
      this.writePost(s.rays!, 1 / this.width, 1 / this.height);
      blit(this.raysPipe, this.raysTex, s.rays!, false);
    } else {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: this.raysTex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      p.end();
    }
    this.writePost(s.prefilter!, 1 / this.width, 1 / this.height);
    blit(this.prefilterPipe, this.bloom[0], s.prefilter!, false);
    for (let i = 1; i < BLOOM_LEVELS; i++) {
      this.writePost(s.down[i - 1], 1 / this.bloom[i - 1].width, 1 / this.bloom[i - 1].height);
      blit(this.downPipe, this.bloom[i], s.down[i - 1], false);
    }
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
      this.writePost(s.up[i], 1 / this.bloom[i + 1].width, 1 / this.bloom[i + 1].height);
      blit(this.upPipe, this.bloom[i], s.up[i], true);
    }
    this.writePost(s.composite!, 1 / this.width, 1 / this.height);
    const swap = this.ctx.context.getCurrentTexture();
    const p = enc.beginRenderPass({ colorAttachments: [{ view: swap.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    p.setPipeline(this.compositePipe);
    p.setBindGroup(0, s.composite!.bg);
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

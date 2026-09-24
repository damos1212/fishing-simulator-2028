// Tessendorf FFT ocean on the GPU: a directional wind-sea spectrum per cascade, time evolution into
// eight displacement/derivative fields (packed as four complex signals), a shared-memory radix-2
// inverse FFT per row/column, and an assemble pass that writes displacement, slopes, the Jacobian and
// persistent foam. Four cascades of different tile sizes are layers of the same texture arrays.

export const FFT_N = 256;
const LOG_N = 8;

const COMMON_OCEAN = /* wgsl */ `
struct OceanParams {
  lengths: vec4f,   // tile size (m) per cascade
  wind: vec4f,      // direction x, z, speed (m/s), choppiness
  band: vec4f,      // spectrum amplitude, swell mix, time, foam decay per frame
  cut: vec4f,       // k-band boundaries between cascades (low cut of cascades 1..3), unused
};
@group(0) @binding(0) var<uniform> op: OceanParams;
const PI2 = 6.28318530718;
const G = 9.81;
const N = ${FFT_N};
fn kVec(id: vec2u, L: f32) -> vec2f {
  let n = vec2f(f32(id.x), f32(id.y)) - f32(N) * 0.5;
  return n * (PI2 / L);
}
fn cascadeBand(c: u32, k: f32) -> f32 {
  // each cascade keeps the wavelengths its coarser neighbour can't resolve (bands meet at N/4)
  var klo = 0.0;
  var khi = 1e9;
  if (c > 0u) { klo = PI2 / op.lengths[c - 1u] * f32(N) * 0.25; }
  if (c < 3u) { khi = PI2 / op.lengths[c] * f32(N) * 0.25; }
  return step(klo, k) * step(k, khi);
}
`;

/** h0(k) and conj(h0(-k)) per cascade, from a Phillips-style wind spectrum with swell spreading. */
export const FFT_SPECTRUM = /* wgsl */ `
${COMMON_OCEAN}
@group(0) @binding(1) var h0Tex: texture_storage_2d_array<rgba32float, write>;
fn pcg(v0: u32) -> u32 {
  var v = v0 * 747796405u + 2891336453u;
  let w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(seed: u32) -> f32 { return f32(pcg(seed)) / 4294967295.0; }
fn gauss(seed: u32) -> vec2f {
  let u1 = max(rnd(seed), 1e-6);
  let u2 = rnd(seed * 3u + 17u);
  let r = sqrt(-2.0 * log(u1));
  return vec2f(r * cos(PI2 * u2), r * sin(PI2 * u2));
}
fn spectrum(k: vec2f, c: u32) -> f32 {
  let kl = length(k);
  if (kl < 1e-4) { return 0.0; }
  let V = max(op.wind.z, 0.5);
  let Lw = V * V / G;
  let kh = k / kl;
  let w = normalize(op.wind.xy);
  let cosT = dot(kh, w);
  // directional spreading: mostly downwind, a little crosswind, almost nothing upwind
  let dir = pow(max(cosT, 0.0), 2.0) + 0.08 * (1.0 - abs(cosT)) + select(0.0, 0.05 * cosT * cosT, cosT < 0.0);
  let small = 0.0012 * op.lengths[3];
  let p = op.band.x * exp(-1.0 / (kl * Lw * kl * Lw)) / (kl * kl * kl * kl) * dir * exp(-kl * kl * small * small);
  return p * cascadeBand(c, kl);
}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(N) || id.y >= u32(N)) { return; }
  let c = id.z;
  let L = op.lengths[c];
  let k = kVec(id.xy, L);
  let dk = PI2 / L;
  let seed = (id.x + id.y * u32(N) + c * u32(N * N)) * 2u + 1u;
  let amp = sqrt(spectrum(k, c) * 0.5) * dk;
  let a = gauss(seed) * amp;
  let b = gauss(seed + 911u) * sqrt(spectrum(-k, c) * 0.5) * dk;
  textureStore(h0Tex, vec2u(id.xy), c, vec4f(a.x, a.y, b.x, -b.y));
}
`;

/** h(k, t) and the spectra of all displacement/derivative fields, packed two real signals per complex. */
export const FFT_EVOLVE = /* wgsl */ `
${COMMON_OCEAN}
@group(0) @binding(1) var h0Tex: texture_2d_array<f32>;
@group(0) @binding(2) var outA: texture_storage_2d_array<rgba32float, write>;
@group(0) @binding(3) var outB: texture_storage_2d_array<rgba32float, write>;
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(N) || id.y >= u32(N)) { return; }
  let c = id.z;
  let L = op.lengths[c];
  let k = kVec(id.xy, L);
  let kl = max(length(k), 1e-4);
  let h0 = textureLoad(h0Tex, vec2u(id.xy), c, 0);
  let w = sqrt(G * kl);
  let ph = w * op.band.z;
  let e = vec2f(cos(ph), sin(ph));
  let h = cmul(h0.xy, e) + cmul(h0.zw, vec2f(e.x, -e.y));
  let ih = vec2f(-h.y, h.x);
  let lam = op.wind.w;
  let dx = -ih * (k.x / kl) * lam;
  let dz = -ih * (k.y / kl) * lam;
  let dydx = ih * k.x;
  let dydz = ih * k.y;
  let dxdx = h * (k.x * k.x / kl) * lam;
  let dzdz = h * (k.y * k.y / kl) * lam;
  let dxdz = h * (k.x * k.y / kl) * lam;
  // pack: f1 + i*f2 for pairs of real-valued outputs
  let t0 = dx + vec2f(-h.y, h.x);
  let t1 = dz + vec2f(-dydx.y, dydx.x);
  let t2 = dydz + vec2f(-dxdx.y, dxdx.x);
  let t3 = dzdz + vec2f(-dxdz.y, dxdz.x);
  textureStore(outA, vec2u(id.xy), c, vec4f(t0, t1));
  textureStore(outB, vec2u(id.xy), c, vec4f(t2, t3));
}
`;

/** One inverse FFT pass over rows (horizontal) or columns, in workgroup memory. */
export const FFT_IFFT = /* wgsl */ `
const N = ${FFT_N}u;
const LOGN = ${LOG_N}u;
const PI2 = 6.28318530718;
struct Pass { vertical: u32, pad0: u32, pad1: u32, pad2: u32 };
@group(0) @binding(0) var<uniform> pass_: Pass;
@group(0) @binding(1) var inA: texture_2d_array<f32>;
@group(0) @binding(2) var inB: texture_2d_array<f32>;
@group(0) @binding(3) var outA: texture_storage_2d_array<rgba32float, write>;
@group(0) @binding(4) var outB: texture_storage_2d_array<rgba32float, write>;
var<workgroup> sa: array<vec4f, ${FFT_N}>;
var<workgroup> sb: array<vec4f, ${FFT_N}>;
fn rev(i: u32) -> u32 { return reverseBits(i) >> (32u - LOGN); }
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
fn coord(line: u32, i: u32) -> vec2u { return select(vec2u(i, line), vec2u(line, i), pass_.vertical == 1u); }
@compute @workgroup_size(${FFT_N / 2}, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u) {
  let line = wid.x;
  let layer = wid.y;
  let t = lid.x;
  for (var k = 0u; k < 2u; k++) {
    let i = t + k * (N / 2u);
    let c = coord(line, i);
    sa[rev(i)] = textureLoad(inA, c, layer, 0);
    sb[rev(i)] = textureLoad(inB, c, layer, 0);
  }
  workgroupBarrier();
  for (var s = 0u; s < LOGN; s++) {
    let half = 1u << s;
    let len = half << 1u;
    let grp = t / half;
    let pos = t % half;
    let i0 = grp * len + pos;
    let i1 = i0 + half;
    let ang = PI2 * f32(pos) / f32(len);
    let w = vec2f(cos(ang), sin(ang));
    let a0 = sa[i0]; let a1 = sa[i1];
    let b0 = sb[i0]; let b1 = sb[i1];
    let a1w = vec4f(cmul(a1.xy, w), cmul(a1.zw, w));
    let b1w = vec4f(cmul(b1.xy, w), cmul(b1.zw, w));
    workgroupBarrier();
    sa[i0] = a0 + a1w; sa[i1] = a0 - a1w;
    sb[i0] = b0 + b1w; sb[i1] = b0 - b1w;
    workgroupBarrier();
  }
  for (var k = 0u; k < 2u; k++) {
    let i = t + k * (N / 2u);
    let c = coord(line, i);
    textureStore(outA, c, layer, sa[i]);
    textureStore(outB, c, layer, sb[i]);
  }
}
`;

/** Unpacks the fields, fixes the checkerboard sign, and accumulates foam where the surface folds. */
export const FFT_ASSEMBLE = /* wgsl */ `
${COMMON_OCEAN}
@group(0) @binding(1) var inA: texture_2d_array<f32>;
@group(0) @binding(2) var inB: texture_2d_array<f32>;
@group(0) @binding(3) var dispTex: texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(4) var derivTex: texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(5) var foamTex: texture_storage_2d_array<r32float, read_write>;
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(N) || id.y >= u32(N)) { return; }
  let c = id.z;
  let sgn = select(-1.0, 1.0, ((id.x + id.y) & 1u) == 0u);
  let a = textureLoad(inA, vec2u(id.xy), c, 0) * sgn;
  let b = textureLoad(inB, vec2u(id.xy), c, 0) * sgn;
  let dx = a.x; let dy = a.y; let dz = a.z; let dydx = a.w;
  let dydz = b.x; let dxdx = b.y; let dzdz = b.z; let dxdz = b.w;
  let J = (1.0 + dxdx) * (1.0 + dzdz) - dxdz * dxdz;
  let prev = textureLoad(foamTex, vec2u(id.xy), c).r;
  let fresh = clamp((0.72 - J) * 2.5, 0.0, 1.0);
  let foam = max(prev * op.band.w, fresh);
  textureStore(foamTex, vec2u(id.xy), c, vec4f(foam, 0.0, 0.0, 0.0));
  textureStore(dispTex, vec2u(id.xy), c, vec4f(dx, dy, dz, foam));
  textureStore(derivTex, vec2u(id.xy), c, vec4f(dydx, dydz, dxdx, dzdz));
}
`;

/** Samples the water surface height at query points (for buoyancy), inverting the horizontal shift. */
export const FFT_QUERY = /* wgsl */ `
${COMMON_OCEAN}
@group(0) @binding(1) var dispTex: texture_2d_array<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<storage, read> points: array<vec4f, 16>;
@group(0) @binding(4) var<storage, read_write> heights: array<f32, 16>;
fn disp(xz: vec2f) -> vec3f {
  var d = vec3f(0.0);
  for (var c = 0; c < 4; c++) {
    d += textureSampleLevel(dispTex, samp, xz / op.lengths[c], c, 0.0).xyz;
  }
  return d;
}
@compute @workgroup_size(16, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let p = points[id.x].xz;
  var q = p;
  for (var it = 0; it < 3; it++) {
    let d = disp(q);
    q = p - d.xz;
  }
  heights[id.x] = disp(q).y;
}
`;

/** 2x2 box downsample of the displacement and derivative cascades into the next mip level. */
export const FFT_MIP = /* wgsl */ `
@group(0) @binding(0) var srcD: texture_2d_array<f32>;
@group(0) @binding(1) var srcN: texture_2d_array<f32>;
@group(0) @binding(2) var dstD: texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(3) var dstN: texture_storage_2d_array<rgba16float, write>;
fn box(t: texture_2d_array<f32>, p: vec2i, l: i32) -> vec4f {
  return (textureLoad(t, p, l, 0) + textureLoad(t, p + vec2i(1, 0), l, 0) + textureLoad(t, p + vec2i(0, 1), l, 0) + textureLoad(t, p + vec2i(1, 1), l, 0)) * 0.25;
}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(dstD);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let p = vec2i(id.xy) * 2;
  let l = i32(id.z);
  textureStore(dstD, id.xy, l, box(srcD, p, l));
  textureStore(dstN, id.xy, l, box(srcN, p, l));
}
`;

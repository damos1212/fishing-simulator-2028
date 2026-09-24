// Physically based sky after Hillaire 2020 ("A Scalable and Production Ready Sky and Atmosphere
// Rendering Technique"): a transmittance LUT, a multiple-scattering LUT (both computed once) and a
// sky-view LUT raymarched every frame for the current sun. Units: kilometres.

const ATMO_COMMON = /* wgsl */ `
const PI = 3.14159265;
const RG = 6360.0;
const RT = 6460.0;
const RAY_S = vec3f(5.802, 13.558, 33.1) * 1e-3;
const RAY_H = 8.0;
const MIE_S = 3.996e-3;
const MIE_E = 4.40e-3;
const MIE_H = 1.2;
const OZONE_A = vec3f(0.650, 1.881, 0.085) * 1e-3;
const GROUND_ALBEDO = vec3f(0.3);

struct Medium { scat: vec3f, scatR: vec3f, scatM: f32, ext: vec3f };
fn medium(r: f32) -> Medium {
  let h = max(r - RG, 0.0);
  let dR = exp(-h / RAY_H);
  let dM = exp(-h / MIE_H);
  let dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  var m: Medium;
  m.scatR = RAY_S * dR;
  m.scatM = MIE_S * dM;
  m.scat = m.scatR + vec3f(m.scatM);
  m.ext = m.scatR + vec3f(MIE_E * dM) + OZONE_A * dO;
  return m;
}
/** Distance along a ray from radius r with zenith cosine mu to a sphere of radius R (-1 if missed). */
fn raySphere(r: f32, mu: f32, R: f32) -> f32 {
  let b = r * mu;
  let c = r * r - R * R;
  let disc = b * b - c;
  if (disc < 0.0) { return -1.0; }
  let s = sqrt(disc);
  let t0 = -b - s;
  let t1 = -b + s;
  if (t0 > 0.0) { return t0; }
  if (t1 > 0.0) { return t1; }
  return -1.0;
}
fn rayleighPhase(c: f32) -> f32 { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
fn miePhase(c: f32) -> f32 {
  let g = 0.8;
  let k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);
  return k * (1.0 + c * c) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
}
// Bruneton's transmittance parametrisation
fn transUV(r: f32, mu: f32) -> vec2f {
  let H = sqrt(RT * RT - RG * RG);
  let rho = sqrt(max(r * r - RG * RG, 0.0));
  let disc = r * r * (mu * mu - 1.0) + RT * RT;
  let d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  let dMin = RT - r;
  let dMax = rho + H;
  return vec2f((d - dMin) / (dMax - dMin), rho / H);
}
fn transParams(uv: vec2f) -> vec2f {
  let H = sqrt(RT * RT - RG * RG);
  let rho = H * uv.y;
  let r = sqrt(rho * rho + RG * RG);
  let dMin = RT - r;
  let dMax = rho + H;
  let d = dMin + uv.x * (dMax - dMin);
  var mu = select((H * H - rho * rho - d * d) / (2.0 * r * d), 1.0, d == 0.0);
  return vec2f(r, clamp(mu, -1.0, 1.0));
}
`;

/** Transmittance to the top of the atmosphere (256 x 64). */
export const ATMO_TRANSMITTANCE = /* wgsl */ `
${ATMO_COMMON}
@group(0) @binding(0) var outTex: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(outTex);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
  let rm = transParams(uv);
  let r = rm.x;
  let mu = rm.y;
  let len = raySphere(r, mu, RT);
  let steps = 40;
  let dt = max(len, 0.0) / f32(steps);
  var od = vec3f(0.0);
  for (var i = 0; i < steps; i++) {
    let t = (f32(i) + 0.5) * dt;
    let ri = sqrt(r * r + t * t + 2.0 * r * mu * t);
    od += medium(ri).ext * dt;
  }
  textureStore(outTex, id.xy, vec4f(exp(-od), 1.0));
}
`;

const ATMO_SAMPLING = /* wgsl */ `
fn transmittance(r: f32, mu: f32) -> vec3f {
  return textureSampleLevel(transTex, lutSamp, transUV(r, mu), 0.0).rgb;
}
`;

/** Isotropic multiple scattering contribution Psi_ms per (sun zenith, height) (32 x 32). */
export const ATMO_MULTISCATTER = /* wgsl */ `
${ATMO_COMMON}
@group(0) @binding(0) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var transTex: texture_2d<f32>;
@group(0) @binding(2) var lutSamp: sampler;
${ATMO_SAMPLING}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(outTex);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
  let muS = uv.x * 2.0 - 1.0;
  let r = RG + clamp(uv.y, 0.0, 1.0) * (RT - RG - 0.01) + 0.005;
  let sunDir = vec3f(sqrt(max(1.0 - muS * muS, 0.0)), 0.0, muS);
  var L2 = vec3f(0.0);
  var fms = vec3f(0.0);
  let N = 8;
  for (var a = 0; a < N; a++) {
    for (var b = 0; b < N; b++) {
      // uniform directions over the sphere
      let u = (f32(a) + 0.5) / f32(N);
      let v = (f32(b) + 0.5) / f32(N);
      let cosT = 1.0 - 2.0 * u;
      let sinT = sqrt(max(1.0 - cosT * cosT, 0.0));
      let phi = 2.0 * PI * v;
      let dir = vec3f(sinT * cos(phi), sinT * sin(phi), cosT);
      let mu = dir.z;
      let tG = raySphere(r, mu, RG);
      let tT = raySphere(r, mu, RT);
      let len = select(tT, tG, tG > 0.0);
      let steps = 20;
      let dt = max(len, 0.0) / f32(steps);
      var T = vec3f(1.0);
      var Ls = vec3f(0.0);
      var f = vec3f(0.0);
      for (var i = 0; i < steps; i++) {
        let t = (f32(i) + 0.5) * dt;
        let P = vec3f(0.0, 0.0, r) + dir * t;
        let ri = length(P);
        let up = P / ri;
        let m = medium(ri);
        let mus = dot(up, sunDir);
        let Tsun = transmittance(ri, mus) * step(raySphere(ri, mus, RG), 0.0);
        // isotropic phase for the multiple scattering estimate
        let S = m.scat * Tsun / (4.0 * PI);
        let Tstep = exp(-m.ext * dt);
        let Sint = (S - S * Tstep) / max(m.ext, vec3f(1e-6));
        Ls += T * Sint;
        let Fint = (m.scat - m.scat * Tstep) / max(m.ext, vec3f(1e-6));
        f += T * Fint;
        T *= Tstep;
      }
      if (tG > 0.0) {
        let P = vec3f(0.0, 0.0, r) + dir * tG;
        let up = normalize(P);
        let mus = dot(up, sunDir);
        Ls += T * transmittance(RG, mus) * max(mus, 0.0) * GROUND_ALBEDO / PI;
      }
      L2 += Ls;
      fms += f / (4.0 * PI);
    }
  }
  let sw = 4.0 * PI / f32(N * N);
  L2 *= sw;
  fms *= sw;
  let psi = L2 / (1.0 - fms);
  textureStore(outTex, id.xy, vec4f(psi, 1.0));
}
`;

/** Sky radiance around the camera for the current sun (192 x 108), horizon-aware latitude mapping. */
export const ATMO_SKYVIEW = /* wgsl */ `
${ATMO_COMMON}
struct SkyU { sun: vec4f, cam: vec4f };
@group(0) @binding(0) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(1) var transTex: texture_2d<f32>;
@group(0) @binding(2) var lutSamp: sampler;
@group(0) @binding(3) var msTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> su: SkyU;
${ATMO_SAMPLING}
fn multiScatter(r: f32, muS: f32) -> vec3f {
  let uv = vec2f(muS * 0.5 + 0.5, (r - RG) / (RT - RG));
  return textureSampleLevel(msTex, lutSamp, uv, 0.0).rgb;
}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(outTex);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
  let r = RG + su.cam.x;
  let vHorizon = sqrt(max(r * r - RG * RG, 0.0));
  let beta = acos(clamp(vHorizon / r, -1.0, 1.0));
  let zenithHorizon = PI - beta;
  var viewZenith: f32;
  if (uv.y < 0.5) {
    var c = 1.0 - 2.0 * uv.y;
    c = 1.0 - c * c;
    viewZenith = zenithHorizon * c;
  } else {
    var c = uv.y * 2.0 - 1.0;
    c *= c;
    viewZenith = zenithHorizon + beta * c;
  }
  let az = PI * uv.x * uv.x;
  let muS = su.sun.z;
  let sunDir = vec3f(sqrt(max(1.0 - muS * muS, 0.0)), 0.0, muS);
  let dir = vec3f(sin(viewZenith) * cos(az), sin(viewZenith) * sin(az), cos(viewZenith));
  let mu = dir.z;
  let tG = raySphere(r, mu, RG);
  let tT = raySphere(r, mu, RT);
  let len = select(tT, tG, tG > 0.0);
  let cosT = dot(dir, sunDir);
  let pR = rayleighPhase(cosT);
  let pM = miePhase(cosT);
  let steps = 30;
  var L = vec3f(0.0);
  var T = vec3f(1.0);
  var tPrev = 0.0;
  for (var i = 0; i < steps; i++) {
    // denser samples near the camera
    let f = (f32(i) + 0.3) / f32(steps);
    let t = len * f * f;
    let dt = t - tPrev;
    tPrev = t;
    let P = vec3f(0.0, 0.0, r) + dir * t;
    let ri = length(P);
    let up = P / ri;
    let m = medium(ri);
    let mus = dot(up, sunDir);
    let Tsun = transmittance(ri, mus) * step(raySphere(ri, mus, RG), 0.0);
    let S = (m.scatR * pR + vec3f(m.scatM * pM)) * Tsun + m.scat * multiScatter(ri, mus);
    let Tstep = exp(-m.ext * dt);
    L += T * (S - S * Tstep) / max(m.ext, vec3f(1e-6));
    T *= Tstep;
  }
  textureStore(outTex, id.xy, vec4f(L, 1.0));
}
`;

/** Samples the sky-view LUT for a world direction (y up). Needs skyViewTex and the true sun direction. */
export const ATMO_LOOKUP = /* wgsl */ `
fn skyViewUV(dir: vec3f, sun: vec3f, camAltKm: f32) -> vec2f {
  let RGk = 6360.0;
  let r = RGk + camAltKm;
  let vHorizon = sqrt(max(r * r - RGk * RGk, 0.0));
  let beta = acos(clamp(vHorizon / r, -1.0, 1.0));
  let zenithHorizon = PI - beta;
  let viewZenith = acos(clamp(dir.y, -1.0, 1.0));
  var v: f32;
  if (viewZenith < zenithHorizon) {
    v = 0.5 * (1.0 - sqrt(max(1.0 - viewZenith / zenithHorizon, 0.0)));
  } else {
    v = 0.5 + 0.5 * sqrt(clamp((viewZenith - zenithHorizon) / beta, 0.0, 1.0));
  }
  let a = normalize(dir.xz + vec2f(1e-5, 0.0));
  let b = normalize(sun.xz + vec2f(1e-5, 0.0));
  let az = acos(clamp(dot(a, b), -1.0, 1.0));
  return vec2f(sqrt(az / PI), v);
}
`;

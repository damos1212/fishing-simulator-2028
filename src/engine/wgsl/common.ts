// Shared WGSL: the Frame uniform (layout mirrors FrameState in frame.ts), noise, clouds,
// shadows, sky color and the stylized-PBR lighting used by every lit surface.

export const COMMON = /* wgsl */ `
struct Frame {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  view: mat4x4f,
  camPos: vec4f,       // xyz, time
  sunDir: vec4f,       // xyz (towards sun), intensity
  sunColor: vec4f,     // rgb, camera underwater (0/1)
  skyTop: vec4f,       // rgb, stars
  skyHorizon: vec4f,   // rgb, nebula
  cloudColor: vec4f,   // rgb, cloud cover
  fogColor: vec4f,     // rgb, density (above water)
  ambient: vec4f,      // rgb, intensity
  ground: vec4f,       // rgb, wave scale
  waterShallow: vec4f, // rgb, eerie
  waterDeep: vec4f,    // rgb, sparkle
  uwColor: vec4f,      // rgb, density
  uwDeep: vec4f,       // rgb, dark depth
  lampPos: vec4f,      // xyz, radius
  lampColor: vec4f,    // rgb, intensity
  res: vec4f,          // w, h, 1/w, 1/h
  misc: vec4f,         // void, frost, underwater light falloff, caustics strength
  ocean: vec4f,        // grid offset x, z, extent, warp power
  mapInfo: vec4f,      // height map extent, warp power, night (0..1), rain (0..1)
  boat: vec4f,         // x, z, heading, speed
  lava: vec4f,         // rgb, strength
  sunVP0: mat4x4f,     // shadow cascade 0 (near)
  sunVP1: mat4x4f,     // shadow cascade 1 (far)
  shadow: vec4f,       // enabled, texel size (uv), strength, cascades
  fx: vec4f,           // reflection clip (1 in the mirrored pass), aurora, neon, vortex
  water: vec4f,        // absorption per meter, planar reflections (0/1), foam amount, detail normal strength
  cloud: vec4f,        // base height, thickness, density, volumetric (0/1)
  extra: vec4f,        // cloud march steps, god ray strength, realm style, low gravity
  planetA: vec4f,      // direction, angular radius
  planetAC: vec4f,     // tint, style (1 earth, 2 gas giant, 3 cracked fel world, 4 moon, 5 ringed)
  planetB: vec4f,
  planetBC: vec4f,
  wake: array<vec4f, 16>, // x, z, age (s), strength
};
@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var noiseTex: texture_3d<f32>;
@group(0) @binding(2) var repSamp: sampler;
@group(0) @binding(3) var shadowTex: texture_depth_2d_array;
@group(0) @binding(4) var shadowSamp: sampler_comparison;
@group(0) @binding(5) var cloudTex: texture_2d<f32>;
@group(0) @binding(6) var clampSamp: sampler;
@group(0) @binding(7) var detailTex: texture_2d<f32>;

const PI = 3.14159265;
const SKY_DIST = 60000.0;

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}
fn hash22(p: vec2f) -> vec2f {
  let n = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(n) * 43758.5453);
}
fn hash31(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x),
             mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn fbm(p: vec2f) -> f32 {
  var a = 0.5;
  var s = 0.0;
  var q = p;
  for (var i = 0; i < 5; i++) {
    s += a * vnoise(q);
    q = q * 2.03 + vec2f(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
fn fbm3(p: vec2f) -> f32 {
  return vnoise(p) * 0.57 + vnoise(p * 2.07 + vec2f(3.1, 1.7)) * 0.29 + vnoise(p * 4.13 + vec2f(7.3, 2.9)) * 0.14;
}
// Animated cellular noise: returns (F1, F2).
fn worley(p: vec2f, t: f32) -> vec2f {
  let i = floor(p);
  let f = fract(p);
  var d1 = 8.0;
  var d2 = 8.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let g = vec2f(f32(x), f32(y));
      let h = hash22(i + g);
      let o = 0.5 + 0.5 * sin(t + 6.2831 * h);
      let r = g + o - f;
      let d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return vec2f(sqrt(d1), sqrt(d2));
}
/** Tiling detail noise (texture based): r fbm, a fine grain. */
fn dnoise(p: vec2f) -> vec4f { return textureSampleLevel(detailTex, repSamp, p, 0.0); }
fn causticAt(p: vec2f, t: f32) -> f32 {
  // two drifting caustic networks; where they cross the light focuses
  let a = textureSampleLevel(detailTex, repSamp, p + vec2f(t * 0.021, t * 0.013), 0.0).g;
  let b = textureSampleLevel(detailTex, repSamp, p * 1.37 + vec2f(-t * 0.017, t * 0.019), 0.0).b;
  return a * 0.55 + b * 0.45 + a * b * 1.4;
}
/** Caustic light at a point under water, projected along the sun and split into colors. */
fn causticsRGB(wp: vec3f) -> vec3f {
  let t = frame.camPos.w;
  let depth = max(-wp.y, 0.0);
  let proj = wp.xz + frame.sunDir.xz / max(frame.sunDir.y, 0.25) * depth;
  let p = proj * (0.028 / (1.0 + depth * 0.004));
  let off = vec2f(0.0016, 0.0011) * (1.0 + depth * 0.02);
  return clamp(vec3f(causticAt(p + off, t), causticAt(p, t), causticAt(p - off, t)), vec3f(0.0), vec3f(1.6));
}

fn underwaterness(y: f32) -> f32 { return smoothstep(0.3, -1.2, y); }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn remap(v: f32, lo: f32, hi: f32, a: f32, b: f32) -> f32 { return a + (v - lo) / max(hi - lo, 1e-4) * (b - a); }

// ---------------------------------------------------------------- clouds
fn cloudWind() -> vec2f { return vec2f(frame.camPos.w * 9.0, frame.camPos.w * 3.5); }
/** Coverage-shaped low frequency cloud density (0..1) at a world point. */
fn cloudBase(p: vec3f) -> f32 {
  let w = cloudWind();
  let q = vec3f(p.x + w.x, p.y * 1.6, p.z + w.y) * (1.0 / 5200.0);
  let n = textureSampleLevel(noiseTex, repSamp, q, 0.0).r;
  let weather = textureSampleLevel(noiseTex, repSamp, vec3f(q.x * 0.21, 0.31, q.z * 0.21), 0.0).g;
  let cov = clamp(frame.cloudColor.w * (0.7 + 0.6 * weather), 0.0, 1.0);
  return clamp(remap(n, 1.0 - cov, 1.0, 0.0, 1.0), 0.0, 1.0);
}
fn cloudDensity(p: vec3f, h01: f32, detail: bool) -> f32 {
  let shape = smoothstep(0.0, 0.1, h01) * smoothstep(1.0, 0.45, h01);
  var d = cloudBase(p) - (1.0 - shape) * 0.75;
  if (d <= 0.0) { return 0.0; }
  if (detail) {
    let w = cloudWind() * 1.4;
    let dn = textureSampleLevel(noiseTex, repSamp, vec3f(p.x + w.x, p.y, p.z + w.y) * (1.0 / 900.0), 0.0);
    let det = dn.g * 0.625 + dn.b * 0.25 + dn.a * 0.125;
    d = remap(d, (1.0 - det) * 0.3 * (1.0 - h01 * 0.5), 1.0, 0.0, 1.0);
  }
  return clamp(d, 0.0, 1.0) * frame.cloud.z;
}
/** Soft shadow of the cloud layer on a point (1 = open sky). */
fn cloudShadow(wp: vec3f) -> f32 {
  if (frame.cloudColor.w < 0.03 || frame.cloud.w < 0.5) { return 1.0; }
  let sy = max(frame.sunDir.y, 0.15);
  let h = frame.cloud.x + frame.cloud.y * 0.35;
  let p = wp + frame.sunDir.xyz / sy * (h - wp.y);
  let d = cloudBase(p);
  return 1.0 - smoothstep(0.02, 0.45, d) * 0.62;
}

// Hemi-octahedral mapping of the upper hemisphere onto a square (cloud dome texture).
fn hemiOctEncode(d: vec3f) -> vec2f {
  let p = d.xz / (abs(d.x) + abs(d.y) + abs(d.z));
  return vec2f(p.x + p.y, p.x - p.y);
}
fn hemiOctDecode(e: vec2f) -> vec3f {
  let p = vec2f(e.x + e.y, e.x - e.y) * 0.5;
  return normalize(vec3f(p.x, max(1.0 - abs(p.x) - abs(p.y), 0.0), p.y));
}

// ---------------------------------------------------------------- sky
fn starField(dir: vec3f, t: f32) -> f32 {
  let cell = floor(dir * 220.0);
  let h = hash31(cell);
  let tw = 0.6 + 0.4 * sin(t * 3.0 + h * 50.0);
  let f = fract(dir * 220.0) - 0.5;
  let shape = 1.0 - smoothstep(0.15, 0.45, length(f));
  return step(0.9965, h) * tw * 2.5 * shape;
}
/** Draws a planet (and its rings) over the sky color, lit by the sun. */
fn skyPlanet(dir: vec3f, p: vec4f, pc: vec4f, col: vec3f) -> vec3f {
  if (p.w <= 0.0) { return col; }
  let C = normalize(p.xyz);
  let r = sin(p.w);
  let style = u32(pc.w + 0.5);
  let t = frame.camPos.w;
  var out = col;
  let b = dot(dir, C);
  let disc = b * b - (1.0 - r * r);
  var tPlanet = 1e9;
  let L = frame.sunDir.xyz;
  if (disc > 0.0 && b > 0.0) {
    tPlanet = b - sqrt(disc);
    let P = dir * tPlanet;
    let n = normalize(P - C);
    let up = vec3f(0.0, 1.0, 0.0);
    let u = normalize(cross(C, up));
    let v = cross(u, C);
    let q = vec3f(dot(n, u), dot(n, v), dot(n, C));
    let spin = t * 0.01;
    var base = pc.rgb;
    var emis = vec3f(0.0);
    if (style == 1u) {
      let land = fbm(vec2f(q.x * 2.2 + spin, q.y * 2.2 + q.z));
      let cloud = fbm(vec2f(q.x * 3.1 - spin * 1.5, q.y * 3.3 + 7.0));
      base = select(vec3f(0.05, 0.2, 0.6), mix(vec3f(0.2, 0.5, 0.15), vec3f(0.6, 0.5, 0.3), fbm(q.xy * 5.0)), land > 0.55);
      base = mix(base, vec3f(0.95), smoothstep(0.55, 0.7, cloud));
      base = mix(base, vec3f(0.95), smoothstep(0.8, 0.9, abs(q.y)));
    } else if (style == 2u || style == 5u) {
      let bands = sin(q.y * 14.0 + fbm(vec2f(q.x * 2.0 + spin, q.y * 3.0)) * 3.0);
      base = mix(pc.rgb, pc.rgb * vec3f(1.3, 1.15, 1.0) + 0.1, bands * 0.5 + 0.5);
      let spot = 1.0 - smoothstep(0.08, 0.14, length(vec2f(q.x * 0.8 - 0.25, q.y - 0.3)));
      base = mix(base, pc.rgb * vec3f(1.4, 0.7, 0.5), spot);
    } else if (style == 3u) {
      let cr = worley(vec2f(q.x * 4.0 + q.z, q.y * 4.0), 0.0);
      let crack = 1.0 - smoothstep(0.0, 0.08, cr.y - cr.x);
      base = pc.rgb * (0.6 + 0.4 * fbm(q.xy * 6.0));
      emis = vec3f(0.3, 1.4, 0.2) * crack * (0.8 + 0.4 * sin(t * 1.5 + q.x * 9.0));
    } else {
      let crater = fbm(q.xy * 6.0 + 3.0);
      base = pc.rgb * (0.65 + 0.4 * crater) * (1.0 - 0.3 * smoothstep(0.6, 0.7, fbm(q.xy * 11.0)));
    }
    let ndl = dot(n, L);
    let lit = smoothstep(-0.15, 0.35, ndl) * max(frame.sunDir.w, 0.4) * 0.7 + 0.04;
    let rim = pow(1.0 - max(dot(-n, dir), 0.0), 3.0) * select(0.15, 0.6, style == 1u);
    out = base * lit + emis + vec3f(0.4, 0.6, 1.0) * rim * lit;
  }
  if (style == 2u || style == 5u) {
    let nr = normalize(vec3f(0.3, 1.0, 0.2));
    let dn = dot(dir, nr);
    if (abs(dn) > 1e-4) {
      let tr = dot(C, nr) / dn;
      if (tr > 0.0 && tr < tPlanet) {
        let d = length(dir * tr - C) / r;
        if (d > 1.35 && d < 2.4) {
          let band = 0.55 + 0.45 * sin(d * 38.0) * sin(d * 11.0 + 1.0);
          let a = smoothstep(1.35, 1.45, d) * smoothstep(2.4, 2.25, d) * band * 0.85;
          let rc = mix(pc.rgb, vec3f(0.95, 0.9, 0.8), 0.5) * max(frame.sunDir.w, 0.4) * 0.8;
          out = mix(out, rc, a);
        }
      }
    }
  }
  return out;
}

/** Sky radiance in a direction: gradient, sun glow, stars, nebula, aurora and clouds. */
fn skyColor(dir: vec3f, withSun: bool) -> vec3f {
  let t = frame.camPos.w;
  let y = dir.y;
  var col = mix(frame.skyHorizon.rgb, frame.skyTop.rgb, pow(clamp(y, 0.0, 1.0), 0.55));
  col = mix(col, frame.fogColor.rgb, 1.0 - smoothstep(-0.02, 0.12, y));
  let sd = dot(dir, frame.sunDir.xyz);
  let night = frame.mapInfo.z;
  // forward scattering glow around the sun
  col += frame.sunColor.rgb * (pow(max(sd, 0.0), 10.0) * 0.22 + pow(max(sd, 0.0), 90.0) * 0.5) * (1.0 - night * 0.7);
  if (frame.skyTop.w > 0.001) {
    col += vec3f(starField(dir, t)) * frame.skyTop.w * smoothstep(-0.05, 0.1, y);
  }
  if (frame.skyHorizon.w > 0.001) {
    let q = dir.xz / (abs(dir.y) + 0.35);
    let nb = fbm(q * 1.4 + vec2f(t * 0.01, 0.0));
    let nb2 = fbm(q * 2.3 - vec2f(0.0, t * 0.013));
    let neb = mix(vec3f(0.5, 0.1, 0.8), vec3f(0.05, 0.6, 0.9), nb2) * smoothstep(0.45, 0.8, nb);
    col += neb * frame.skyHorizon.w * smoothstep(-0.05, 0.3, y);
  }
  // aurora curtains
  if (frame.fx.y > 0.01 && y > 0.0) {
    let q = dir.xz / (y + 0.15);
    let band = fbm(vec2f(q.x * 0.35 + t * 0.02, q.y * 0.12));
    let curtain = smoothstep(0.1, 0.0, abs(band - 0.5 - 0.2 * sin(q.x * 0.6 + t * 0.1))) ;
    let rays = 0.6 + 0.4 * vnoise(vec2f(q.x * 6.0 + t * 0.3, 0.0));
    let ac = mix(vec3f(0.1, 1.0, 0.5), vec3f(0.7, 0.2, 1.0), smoothstep(0.2, 0.9, y + band * 0.4));
    col += ac * curtain * rays * smoothstep(0.05, 0.35, y) * frame.fx.y * 1.4;
  }
  col = skyPlanet(dir, frame.planetA, frame.planetAC, col);
  col = skyPlanet(dir, frame.planetB, frame.planetBC, col);
  var sunDisc = vec3f(0.0);
  if (withSun) {
    let disc = mix(smoothstep(0.9993, 0.9996, sd), smoothstep(0.9986, 0.9990, sd), night);
    let crater = mix(1.0, 0.75 + 0.25 * vnoise(dir.xz * 900.0), night);
    sunDisc = frame.sunColor.rgb * disc * mix(6.0, 2.5, night) * crater * max(frame.sunDir.w, 0.6);
  }
  if (y > 0.0 && frame.cloudColor.w > 0.001) {
    if (frame.cloud.w > 0.5) {
      let c = textureSampleLevel(cloudTex, clampSamp, hemiOctEncode(normalize(vec3f(dir.x, max(y, 0.002), dir.z))) * 0.5 + 0.5, 0.0);
      let k = smoothstep(0.0, 0.03, y);
      return mix(col + sunDisc, (col + sunDisc) * c.a + c.rgb, k);
    }
    let uv = dir.xz / (y + 0.08) * 0.9 + vec2f(t * 0.004, t * 0.002);
    let nC = fbm(uv * 0.9);
    let edge = 1.0 - frame.cloudColor.w;
    let c = smoothstep(edge, edge + 0.06, nC) * smoothstep(0.0, 0.15, y);
    let shade = smoothstep(edge, edge + 0.25, fbm(uv * 0.9 + vec2f(0.05, 0.05)));
    let cc = mix(frame.cloudColor.rgb, frame.cloudColor.rgb * 0.72, shade);
    return mix(col + sunDisc, cc, c * 0.95);
  }
  return col + sunDisc;
}
/** Cheap environment color for glossy reflections on meshes. */
fn envColor(r: vec3f) -> vec3f {
  let y = r.y;
  var c = mix(frame.skyHorizon.rgb, frame.skyTop.rgb, pow(clamp(y, 0.0, 1.0), 0.6));
  c = mix(c, mix(frame.waterDeep.rgb, frame.waterShallow.rgb, 0.3) * 0.7, smoothstep(0.05, -0.2, y));
  c += frame.sunColor.rgb * pow(max(dot(r, frame.sunDir.xyz), 0.0), 40.0) * frame.sunDir.w * 0.6;
  return c;
}

// ---------------------------------------------------------------- shadows
fn shadowCascade(wp: vec3f, idx: i32, texel: f32) -> f32 {
  var p: vec4f;
  if (idx == 0) { p = frame.sunVP0 * vec4f(wp, 1.0); } else { p = frame.sunVP1 * vec4f(wp, 1.0); }
  let uv = p.xy * vec2f(0.5, -0.5) + 0.5;
  if (any(uv < vec2f(0.001)) || any(uv > vec2f(0.999)) || p.z >= 1.0 || p.z <= 0.0) { return -1.0; }
  let z = p.z - 0.0004;
  var s = 0.0;
  let o = texel * 1.25;
  s += textureSampleCompareLevel(shadowTex, shadowSamp, uv, idx, z) * 2.0;
  s += textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(o, 0.0), idx, z);
  s += textureSampleCompareLevel(shadowTex, shadowSamp, uv - vec2f(o, 0.0), idx, z);
  s += textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(0.0, o), idx, z);
  s += textureSampleCompareLevel(shadowTex, shadowSamp, uv - vec2f(0.0, o), idx, z);
  s += textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(o, o) * 0.7, idx, z);
  s += textureSampleCompareLevel(shadowTex, shadowSamp, uv - vec2f(o, o) * 0.7, idx, z);
  s += textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(o, -o) * 0.7, idx, z);
  s += textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(-o, o) * 0.7, idx, z);
  return s / 10.0;
}
/** Sun visibility (1 lit, 0 shadowed) from the cascaded shadow maps. */
fn sunShadow(wp: vec3f, n: vec3f) -> f32 {
  if (frame.shadow.x < 0.5) { return 1.0; }
  let ndl = dot(n, frame.sunDir.xyz);
  let slope = clamp(1.0 - abs(ndl), 0.0, 1.0);
  let texel = frame.shadow.y;
  var s = shadowCascade(wp + n * (0.04 + 0.12 * slope), 0, texel);
  if (s < 0.0 && frame.shadow.w > 1.5) { s = shadowCascade(wp + n * (0.25 + 0.8 * slope), 1, texel); }
  if (s < 0.0) { return 1.0; }
  return mix(1.0, s, frame.shadow.z);
}

// ---------------------------------------------------------------- lighting
struct Mat { rough: f32, metal: f32, f0: f32, trans: f32, sheen: f32 };
fn defaultMat() -> Mat { return Mat(0.62, 0.0, 0.04, 0.0, 0.0); }

/** Stylized PBR: soft toon terminator, shadows, sky + sea bounce ambient, glossy specular and env reflections. */
fn shade(albedo: vec3f, n: vec3f, wp: vec3f, ao: f32, m: Mat) -> vec3f {
  let V = normalize(frame.camPos.xyz - wp);
  let L = frame.sunDir.xyz;
  let depth = max(0.0, -wp.y);
  let under = underwaterness(wp.y);
  let sunAtt = exp(-depth * frame.misc.z);
  let ndl = dot(n, L);
  let band = smoothstep(-0.03, 0.12, ndl) * 0.72 + smoothstep(0.32, 0.62, ndl) * 0.28;
  let vis = sunShadow(wp, n) * cloudShadow(wp);
  let sunCol = frame.sunColor.rgb * frame.sunDir.w * mix(1.0, sunAtt * 0.75, under);
  let kd = 1.0 - m.metal;
  var col = albedo * kd * sunCol * band * vis;
  col += albedo * sunCol * m.trans * pow(clamp(dot(-V, L), 0.0, 1.0), 4.0) * 0.9 * vis;
  col += albedo * sunCol * m.trans * 0.18 * clamp(-ndl, 0.0, 1.0);
  // ambient: sky hemisphere, bounce light off the sea, and the underwater glow
  let up = n.y * 0.5 + 0.5;
  let hemi = mix(frame.ground.rgb, frame.ambient.rgb, up) * frame.ambient.w;
  let bounce = frame.waterShallow.rgb * clamp(-n.y, 0.0, 1.0) * exp(-max(wp.y, 0.0) * 0.12) * frame.sunDir.w * 0.12;
  let uwAmb = mix(frame.uwDeep.rgb, frame.uwColor.rgb, sunAtt) * (0.7 + 0.6 * up) * 1.4;
  col += albedo * kd * (mix(hemi + bounce, uwAmb, under) * ao + frame.ambient.rgb * m.sheen * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.5);
  // specular highlight
  let H = normalize(L + V);
  let ndh = max(dot(n, H), 0.0);
  let ndv = max(dot(n, V), 0.0);
  let shin = exp2(11.0 * (1.0 - m.rough) + 1.0);
  let f0 = mix(vec3f(m.f0), albedo, m.metal);
  let F = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0);
  let sp = min(pow(ndh, shin) * (shin + 8.0) / 25.0, 24.0);
  col += F * sunCol * sp * vis * smoothstep(0.0, 0.15, ndl) * (1.0 - under * 0.5);
  // glossy environment
  let R = reflect(-V, n);
  let gloss = (1.0 - m.rough) * (1.0 - m.rough);
  col += envColor(R) * F * gloss * ao * mix(0.35, 1.0, m.metal) * (1.0 - under * 0.8);
  // caustics dance on everything under the surface
  if (wp.y < -0.2 && m.metal < 0.5) {
    let ca = causticsRGB(wp) * exp(-depth * 0.03) * smoothstep(-0.2, -2.0, wp.y) * frame.misc.w * max(n.y * 0.8 + 0.2, 0.0) * vis;
    col += frame.sunColor.rgb * ca * (albedo * 0.9 + 0.05);
  }
  // lure / boat lamp
  if (frame.lampPos.w > 0.0) {
    let ld = frame.lampPos.xyz - wp;
    let dist = length(ld);
    let att = pow(clamp(1.0 - dist / frame.lampPos.w, 0.0, 1.0), 1.6);
    let nl = max(dot(n, ld / max(dist, 0.001)), 0.0) * 0.7 + 0.3;
    col += albedo * frame.lampColor.rgb * frame.lampColor.w * att * nl;
  }
  let rim = smoothstep(0.6, 0.8, 1.0 - ndv) * 0.28;
  let rimCol = mix(frame.sunColor.rgb * frame.sunDir.w * 0.45, frame.uwColor.rgb * 2.0 + frame.lampColor.rgb * 0.2, under);
  col += rim * rimCol * albedo * (0.4 + 0.6 * vis);
  return col;
}

fn uwFogColor(y: f32) -> vec3f {
  let t = smoothstep(0.0, frame.uwDeep.w, max(0.0, -y));
  return mix(frame.uwColor.rgb, frame.uwDeep.rgb, t);
}

fn applyFog(c: vec3f, wp: vec3f) -> vec3f {
  let d = distance(wp, frame.camPos.xyz);
  if (frame.sunColor.w > 0.5) {
    let y = mix(wp.y, frame.camPos.y, 0.5);
    let f = 1.0 - exp(-d * frame.uwColor.w);
    return mix(c, uwFogColor(y), f);
  }
  let f = 1.0 - exp(-pow(d * frame.fogColor.w, 1.6));
  // height fog: thicker near the sea surface
  let hf = exp(-max(wp.y, 0.0) * 0.004);
  let dir = normalize(wp - frame.camPos.xyz);
  let sunGlow = pow(max(dot(dir, frame.sunDir.xyz), 0.0), 8.0) * 0.35;
  let fogCol = frame.fogColor.rgb + frame.sunColor.rgb * sunGlow * frame.sunDir.w * 0.3;
  return mix(c, fogCol, clamp(f * mix(0.75, 1.0, hf), 0.0, 1.0));
}

struct FSVOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
fn fullscreen(i: u32) -> FSVOut {
  var o: FSVOut;
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
`;

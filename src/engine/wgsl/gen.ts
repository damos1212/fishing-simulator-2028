// One-time GPU generators: tiling 3D cloud noise (Perlin-Worley + Worley octaves) and a tiling
// water detail texture (slopes, height and a foam pattern).

const HASH = /* wgsl */ `
fn pcg3(v0: vec3u) -> vec3u {
  var v = v0 * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
fn rand3(c: vec3i, seed: u32) -> vec3f {
  let h = pcg3(bitcast<vec3u>(c) + vec3u(seed, seed * 7u + 3u, seed * 13u + 11u));
  return vec3f(h & vec3u(0xffffu)) / 65535.0;
}
fn wrapi(c: vec3i, per: i32) -> vec3i { return ((c % per) + per) % per; }
`;

export const NOISE3D = /* wgsl */ `
@group(0) @binding(0) var outTex: texture_storage_3d<rgba8unorm, write>;
${HASH}
fn worleyP(p: vec3f, per: i32, seed: u32) -> f32 {
  let i = vec3i(floor(p));
  let f = fract(p);
  var d = 9.0;
  for (var z = -1; z <= 1; z++) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let o = vec3i(x, y, z);
        let h = rand3(wrapi(i + o, per), seed);
        let r = vec3f(o) + h - f;
        d = min(d, dot(r, r));
      }
    }
  }
  return clamp(sqrt(d), 0.0, 1.0);
}
fn gradP(c: vec3i, per: i32, seed: u32) -> vec3f {
  return normalize(rand3(wrapi(c, per), seed) * 2.0 - 1.0 + vec3f(1e-4));
}
fn perlinP(p: vec3f, per: i32, seed: u32) -> f32 {
  let i = vec3i(floor(p));
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  var n: array<f32, 8>;
  for (var k = 0; k < 8; k++) {
    let o = vec3i(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    n[k] = dot(gradP(i + o, per, seed), f - vec3f(o));
  }
  let x0 = mix(n[0], n[1], u.x);
  let x1 = mix(n[2], n[3], u.x);
  let x2 = mix(n[4], n[5], u.x);
  let x3 = mix(n[6], n[7], u.x);
  return mix(mix(x0, x1, u.y), mix(x2, x3, u.y), u.z);
}
fn worleyFbm(p: vec3f, f: i32, seed: u32) -> f32 {
  let a = worleyP(p * f32(f), f, seed);
  let b = worleyP(p * f32(f * 2), f * 2, seed + 1u);
  let c = worleyP(p * f32(f * 4), f * 4, seed + 2u);
  return 1.0 - (a * 0.625 + b * 0.25 + c * 0.125);
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(outTex);
  if (any(id >= size)) { return; }
  let p = (vec3f(id) + 0.5) / vec3f(size);
  var per = 0.0;
  var amp = 1.0;
  var tot = 0.0;
  for (var o = 0; o < 4; o++) {
    let f = 4 << u32(o);
    per += perlinP(p * f32(f), f, 17u + u32(o)) * amp;
    tot += amp;
    amp *= 0.5;
  }
  per = per / tot * 0.9 + 0.5;
  let w4 = worleyFbm(p, 4, 101u);
  let pw = clamp(remapv(per, w4 - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  let g = worleyFbm(p, 6, 211u);
  let b = worleyFbm(p, 12, 307u);
  let a = worleyFbm(p, 24, 401u);
  textureStore(outTex, id, vec4f(pw, g, b, a));
}
fn remapv(v: f32, lo: f32, hi: f32, a: f32, b: f32) -> f32 { return a + (v - lo) / max(hi - lo, 1e-4) * (b - a); }
`;

export const WATER_NORMALS = /* wgsl */ `
@group(0) @binding(0) var outTex: texture_storage_2d<rgba16float, write>;
${HASH}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(outTex);
  if (any(id.xy >= size)) { return; }
  let p = (vec2f(id.xy) + 0.5) / vec2f(size);
  var h = 0.0;
  var dx = 0.0;
  var dz = 0.0;
  for (var i = 0; i < 72; i++) {
    let r = rand3(vec3i(i, 7, 3), 5u);
    var kx = i32(floor(r.x * 21.0)) - 10;
    var kz = i32(floor(r.y * 21.0)) - 10;
    if (kx == 0 && kz == 0) { kx = 3; }
    let k = vec2f(f32(kx), f32(kz)) * 6.2831853;
    let kl = length(k);
    let a = 0.9 / pow(kl, 1.35);
    let f = dot(k, p) + r.z * 6.2831853;
    h += a * sin(f);
    dx += a * k.x * cos(f);
    dz += a * k.y * cos(f);
  }
  // tiling cellular foam pattern
  let fp = p * 12.0;
  let fi = vec3i(vec2i(floor(fp)), 0);
  let ff = fract(fp);
  var d1 = 9.0;
  var d2 = 9.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let o = vec2i(x, y);
      let c = vec3i(((fi.xy + o) % 12 + 12) % 12, 0);
      let hh = rand3(c, 9u).xy;
      let rr = vec2f(o) + hh - ff;
      let d = dot(rr, rr);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  // soft bubbly blobs (cell centers), not a net of cell edges
  let blob = 1.0 - smoothstep(0.05, 0.75, sqrt(d1));
  let foam = clamp(blob * (0.6 + 0.4 * sin(h * 3.0)), 0.0, 1.0);
  textureStore(outTex, vec2i(id.xy), vec4f(dx * 0.08, dz * 0.08, h, foam));
}
`;

/** Tiling 2D detail texture: r = value-noise fbm, g/b = two caustic networks, a = fine noise. */
export const DETAIL = /* wgsl */ `
@group(0) @binding(0) var outTex: texture_storage_2d<rgba8unorm, write>;
${HASH}
fn vnoiseP(p: vec2f, per: i32, seed: u32) -> f32 {
  let i = vec2i(floor(p));
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = rand3(vec3i(((i + vec2i(0, 0)) % per + per) % per, 0), seed).x;
  let b = rand3(vec3i(((i + vec2i(1, 0)) % per + per) % per, 0), seed).x;
  let c = rand3(vec3i(((i + vec2i(0, 1)) % per + per) % per, 0), seed).x;
  let d = rand3(vec3i(((i + vec2i(1, 1)) % per + per) % per, 0), seed).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn cells(p: vec2f, per: i32, seed: u32) -> vec2f {
  let i = vec2i(floor(p));
  let f = fract(p);
  var d1 = 9.0;
  var d2 = 9.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let o = vec2i(x, y);
      let h = rand3(vec3i(((i + o) % per + per) % per, 0), seed).xy;
      let r = vec2f(o) + h * 0.9 + 0.05 - f;
      let d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return vec2f(sqrt(d1), sqrt(d2));
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(outTex);
  if (any(id.xy >= size)) { return; }
  let p = (vec2f(id.xy) + 0.5) / vec2f(size);
  var n = 0.0;
  var amp = 0.5;
  var per = 8;
  for (var o = 0; o < 5; o++) {
    n += vnoiseP(p * f32(per), per, 3u + u32(o)) * amp;
    amp *= 0.5;
    per *= 2;
  }
  let c1 = cells(p * 10.0, 10, 21u);
  let c2 = cells(p * 13.0, 13, 37u);
  let ca = 1.0 - smoothstep(0.0, 0.16, c1.y - c1.x);
  let cb = 1.0 - smoothstep(0.0, 0.16, c2.y - c2.x);
  let fine = vnoiseP(p * 64.0, 64, 51u) * 0.6 + vnoiseP(p * 128.0, 128, 53u) * 0.4;
  textureStore(outTex, vec2i(id.xy), vec4f(n / 0.97, ca, cb, fine));
}
`;

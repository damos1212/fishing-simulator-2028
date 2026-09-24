// WGSL sources. The Frame struct layout must match FrameUniforms in frame.ts.

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
  mapInfo: vec4f,      // height map extent, warp power, -, -
  boat: vec4f,         // x, z, heading, speed
  lava: vec4f,         // rgb, strength
  wake: array<vec4f, 16>, // x, z, age (s), strength
};
@group(0) @binding(0) var<uniform> frame: Frame;

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
fn caustics(xz: vec2f, t: f32) -> f32 {
  let a = worley(xz * 0.32, t * 0.9);
  let b = worley(xz * 0.41 + vec2f(3.1, 7.7), t * 0.7);
  let ea = 1.0 - smoothstep(0.0, 0.1, a.y - a.x);
  let eb = 1.0 - smoothstep(0.0, 0.1, b.y - b.x);
  return clamp(ea + eb * 0.6, 0.0, 1.0);
}

fn underwaterness(y: f32) -> f32 { return smoothstep(0.3, -1.2, y); }

fn toon(albedo: vec3f, n: vec3f, wp: vec3f) -> vec3f {
  let depth = max(0.0, -wp.y);
  let under = underwaterness(wp.y);
  let sunAtt = exp(-depth * frame.misc.z);
  let ndl = dot(n, frame.sunDir.xyz);
  let band = smoothstep(-0.04, 0.04, ndl) * 0.62 + smoothstep(0.42, 0.5, ndl) * 0.38;
  var light = frame.sunColor.rgb * frame.sunDir.w * band * mix(1.0, sunAtt * 0.7, under);
  let hemi = mix(frame.ground.rgb, frame.ambient.rgb, n.y * 0.5 + 0.5) * frame.ambient.w;
  let uwAmb = mix(frame.uwDeep.rgb, frame.uwColor.rgb, sunAtt) * (0.7 + 0.6 * (n.y * 0.5 + 0.5)) * 1.4;
  light += mix(hemi, uwAmb, under);
  if (frame.lampPos.w > 0.0) {
    let ld = frame.lampPos.xyz - wp;
    let dist = length(ld);
    let att = pow(clamp(1.0 - dist / frame.lampPos.w, 0.0, 1.0), 1.6);
    let nl = max(dot(n, ld / max(dist, 0.001)), 0.0) * 0.7 + 0.3;
    light += frame.lampColor.rgb * frame.lampColor.w * att * nl;
  }
  let v = normalize(frame.camPos.xyz - wp);
  let rim = smoothstep(0.6, 0.8, 1.0 - max(dot(n, v), 0.0)) * 0.3;
  let rimCol = mix(frame.sunColor.rgb, frame.uwColor.rgb * 2.0 + frame.lampColor.rgb * 0.2, under);
  return albedo * light + rim * rimCol * albedo;
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
  return mix(c, frame.fogColor.rgb, clamp(f, 0.0, 1.0));
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

export const MESH = /* wgsl */ `
${COMMON}
struct Inst { model: mat4x4f, a: vec4f, b: vec4f, c: vec4f, p: vec4f };
@group(1) @binding(0) var<storage, read> insts: array<Inst>;

struct VIn {
  @location(0) pos: vec3f,
  @location(1) nor: vec3f,
  @location(2) col: vec4f,
  @builtin(instance_index) ii: u32,
};
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) col: vec4f,
  @location(3) lp: vec3f,
  @location(4) @interpolate(flat) ii: u32,
};

fn animate(p: vec3f, inst: Inst) -> vec3f {
  let anim = u32(inst.c.w + 0.5);
  let ph = inst.p.x;
  let amp = inst.p.y;
  var q = p;
  switch anim {
    case 1u: { // fish: lateral body wave, grows towards the tail (-z)
      let t = clamp(0.55 - p.z, 0.0, 1.3);
      q.x += sin(ph - p.z * 5.0) * amp * (t * t * 0.8 + 0.08);
    }
    case 2u: { // eel
      q.x += sin(ph - p.z * 10.0) * amp * (0.35 + 0.65 * clamp(0.5 - p.z, 0.0, 1.0));
    }
    case 3u: { // whale: vertical fluke stroke
      let t = clamp(0.4 - p.z, 0.0, 1.3);
      q.y += sin(ph - p.z * 3.0) * amp * t * t;
    }
    case 4u: { // ray wings
      let ax = abs(p.x);
      q.y += sin(ph - ax * 3.0) * amp * ax * ax * 1.6;
      q.y += sin(ph * 1.3 + p.z * 8.0) * 0.02 * max(-p.z - 0.3, 0.0);
    }
    case 5u: { // jellyfish pulse
      let pulse = sin(ph) * 0.5 + 0.5;
      if (p.y > -0.05) {
        q.x *= 1.0 - pulse * amp;
        q.z *= 1.0 - pulse * amp;
        q.y *= 1.0 + pulse * amp * 0.6;
      } else {
        let t = -p.y;
        q.x += sin(ph * 0.7 - t * 3.0 + p.z * 2.0) * 0.08 * t;
        q.z += cos(ph * 0.6 - t * 2.5 + p.x * 2.0) * 0.08 * t;
        q.x *= 1.0 - pulse * amp * 0.5;
        q.z *= 1.0 - pulse * amp * 0.5;
      }
    }
    case 6u: { // squid / eyeball: trailing arms
      let t = clamp(-0.1 - p.z, 0.0, 1.2);
      q.x += sin(ph - p.z * 6.0) * amp * t;
      q.y += cos(ph * 0.8 - p.z * 5.0) * amp * 0.6 * t;
      if (p.z > -0.1) {
        let pulse = sin(ph * 0.5) * 0.5 + 0.5;
        q.x *= 1.0 - pulse * 0.08;
        q.y *= 1.0 - pulse * 0.08;
      }
    }
    case 7u: { // sway by height (kelp, tentacles)
      let h = max(p.y, 0.0);
      q.x += sin(ph + h * 0.18) * amp * h * h * 0.01;
      q.z += cos(ph * 0.8 + h * 0.15) * amp * h * h * 0.006;
    }
    case 8u: { // bird wing flap
      let ax = abs(p.x);
      q.y += sin(ph) * amp * ax * ax;
    }
    default: {}
  }
  return q;
}

@vertex fn vs(v: VIn) -> VOut {
  let inst = insts[v.ii];
  let p = animate(v.pos, inst);
  let wp = (inst.model * vec4f(p, 1.0)).xyz;
  var o: VOut;
  o.clip = frame.viewProj * vec4f(wp, 1.0);
  o.wp = wp;
  o.n = normalize((inst.model * vec4f(v.nor, 0.0)).xyz);
  o.col = v.col;
  o.lp = v.pos;
  o.ii = v.ii;
  return o;
}

@vertex fn vsOutline(v: VIn) -> VOut {
  let inst = insts[v.ii];
  var o: VOut;
  let w = inst.p.z;
  if (w <= 0.0) {
    o.clip = vec4f(0.0, 0.0, -2.0, 1.0);
    return o;
  }
  let p = animate(v.pos, inst) + normalize(v.nor) * w;
  let wp = (inst.model * vec4f(p, 1.0)).xyz;
  o.clip = frame.viewProj * vec4f(wp, 1.0);
  o.wp = wp;
  o.n = v.nor;
  o.col = v.col;
  o.lp = v.pos;
  o.ii = v.ii;
  return o;
}

fn fishColor(m: vec4f, lp: vec3f, inst: Inst, emis: ptr<function, vec3f>) -> vec3f {
  let body = clamp(1.0 - m.b, 0.0, 1.0);
  let s = smoothstep(0.42, 0.58, m.r);
  var c = mix(inst.b.rgb, inst.a.rgb, s);
  let pat = u32(inst.b.w + 0.5);
  let t = frame.camPos.w;
  if (pat == 1u) {
    let st = smoothstep(0.1, 0.13, abs(fract(lp.z * 2.3 + 0.1) - 0.5));
    c = mix(vec3f(0.92, 0.92, 0.9), c, st);
  } else if (pat == 2u) {
    let sp = vnoise(lp.zy * 24.0 + vec2f(lp.x * 9.0, 0.0));
    c = mix(c, inst.c.rgb, smoothstep(0.64, 0.68, sp) * s);
  } else if (pat == 3u) {
    c = mix(c, inst.c.rgb, 1.0 - smoothstep(0.018, 0.028, abs(lp.y - 0.005)));
  } else if (pat == 4u) {
    let h = hash31(floor(lp * 40.0));
    *emis += vec3f(1.0, 0.95, 0.85) * step(0.93, h) * (2.0 + sin(t * 4.0 + h * 40.0));
    c = mix(c, inst.c.rgb, 0.6 * vnoise(lp.zy * 5.0 + vec2f(t * 0.3, 0.0)));
  } else if (pat == 5u) {
    let vein = 1.0 - smoothstep(0.0, 0.07, abs(vnoise(lp.zy * 9.0 + vec2f(lp.x * 3.0, 0.0)) - 0.5));
    *emis += inst.c.rgb * vein * (1.6 + 0.8 * sin(t * 3.0 + lp.z * 10.0));
  } else if (pat == 6u) {
    let cell = worley(lp.zy * 9.0 + vec2f(lp.x * 4.0, 0.0), 0.0);
    let e = 1.0 - smoothstep(0.16, 0.2, cell.x);
    let pupil = 1.0 - smoothstep(0.06, 0.08, cell.x);
    c = mix(c, vec3f(0.95, 0.9, 0.7), e * s);
    c = mix(c, vec3f(0.02, 0.02, 0.02), pupil * s);
    *emis += inst.c.rgb * e * s * 0.6;
  }
  return c * body + inst.c.rgb * clamp(m.b, 0.0, 1.0);
}

@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let inst = insts[in.ii];
  var n = normalize(in.n);
  if (!ff) { n = -n; }
  let mode = u32(inst.p.w + 0.5);
  var albedo = in.col.rgb * inst.a.rgb;
  var emissive = vec3f(0.0);
  if (mode == 1u) {
    albedo = fishColor(in.col, in.lp, inst, &emissive);
    emissive += albedo * inst.a.w;
  } else if (mode == 2u) {
    let c = in.col.rgb * inst.a.rgb * inst.a.w;
    return vec4f(applyFog(c, in.wp), 1.0);
  } else if (mode == 3u) {
    albedo = in.col.rgb;
    if (in.wp.y < 0.6) {
      let depth = max(0.0, -in.wp.y);
      let ca = caustics(in.wp.xz, frame.camPos.w) * exp(-depth * 0.035) * smoothstep(0.6, -0.6, in.wp.y);
      emissive += frame.sunColor.rgb * ca * frame.misc.w * max(n.y, 0.2);
    }
    let lava = in.col.a;
    if (lava > 0.01) {
      let flick = 0.75 + 0.25 * sin(frame.camPos.w * 2.0 + in.wp.x * 0.13 + in.wp.z * 0.11);
      emissive += frame.lava.rgb * lava * flick * frame.lava.w;
    }
  } else if (mode == 4u) {
    albedo = in.col.rgb;
    if (distance(in.col.rgb, vec3f(0.0284, 0.1095, 0.2542)) < 0.012) { albedo = inst.b.rgb; }
    emissive += albedo * inst.a.w;
  } else {
    emissive += albedo * inst.a.w;
  }
  let lit = toon(albedo, n, in.wp) + emissive;
  return vec4f(applyFog(lit, in.wp), 1.0);
}

@fragment fn fsOutline(in: VOut) -> @location(0) vec4f {
  let inst = insts[in.ii];
  let base = vec3f(0.035, 0.03, 0.05) + inst.c.rgb * 0.0;
  let under = underwaterness(in.wp.y);
  let c = mix(base, frame.uwDeep.rgb * 0.5, under * 0.5);
  return vec4f(applyFog(c, in.wp), 1.0);
}
`;

export const OCEAN = /* wgsl */ `
${COMMON}
@group(1) @binding(0) var heightTex: texture_2d<f32>;
@group(1) @binding(1) var linSamp: sampler;

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wp: vec3f,
  @location(1) xz: vec2f,
  @location(2) fade: f32,
};

struct WaveOut { d: vec3f, n: vec3f };

fn addWave(acc: ptr<function, WaveOut>, xz: vec2f, w: vec4f, sc: f32, t: f32) {
  let dir = normalize(w.xy);
  let k = 6.2831853 / w.z;
  let a = w.w * sc;
  let c = sqrt(9.8 / k);
  let f = k * (dot(dir, xz) - c * t);
  let q = 0.55;
  let cf = cos(f);
  let sf = sin(f);
  (*acc).d += vec3f(dir.x * q * a * cf, a * sf, dir.y * q * a * cf);
  (*acc).n += vec3f(-dir.x * k * a * cf, -q * k * a * sf, -dir.y * k * a * cf);
}

fn waves(xz: vec2f) -> WaveOut {
  var o: WaveOut;
  o.d = vec3f(0.0);
  o.n = vec3f(0.0);
  let sc = frame.ground.w;
  let t = frame.camPos.w;
  addWave(&o, xz, vec4f(1.0, 0.35, 64.0, 0.55), sc, t);
  addWave(&o, xz, vec4f(0.4, 1.0, 33.0, 0.3), sc, t);
  addWave(&o, xz, vec4f(-0.8, 0.6, 19.0, 0.16), sc, t);
  addWave(&o, xz, vec4f(0.6, -0.9, 11.0, 0.08), sc, t);
  addWave(&o, xz, vec4f(-0.3, -1.0, 6.5, 0.035), sc, t);
  o.n = normalize(vec3f(o.n.x, 1.0 + o.n.y, o.n.z));
  return o;
}

fn mapUV(xz: vec2f) -> vec2f {
  let a = clamp(abs(xz) / frame.mapInfo.x, vec2f(0.0), vec2f(1.0));
  return sign(xz) * pow(a, vec2f(1.0 / frame.mapInfo.y)) * 0.5 + 0.5;
}
fn terrainHeight(xz: vec2f) -> f32 {
  return textureSampleLevel(heightTex, linSamp, mapUV(xz), 0.0).r;
}

@vertex fn vs(@location(0) g: vec2f) -> VOut {
  let R = frame.ocean.z;
  let P = frame.ocean.w;
  let local = sign(g) * pow(abs(g), vec2f(P)) * R;
  let xz = local + frame.ocean.xy;
  let dist = length(xz - frame.camPos.xz);
  let fade = 1.0 - smoothstep(250.0, 1400.0, dist);
  let w = waves(xz);
  var wp = vec3f(xz.x + w.d.x * fade, w.d.y * fade, xz.y + w.d.z * fade);
  var o: VOut;
  o.clip = frame.viewProj * vec4f(wp, 1.0);
  o.wp = wp;
  o.xz = xz;
  o.fade = fade;
  return o;
}

@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let t = frame.camPos.w;
  let W = waves(in.xz);
  let n = normalize(mix(vec3f(0.0, 1.0, 0.0), W.n, in.fade * 0.9 + 0.1));
  let v = normalize(frame.camPos.xyz - in.wp);
  let h = terrainHeight(in.xz);
  let depth = max(-h, 0.0);
  let wl = worley(in.xz * 0.11 + n.xz * 1.5, t * 0.6);
  let lines = 1.0 - smoothstep(0.0, 0.08, wl.y - wl.x);

  if (!ff) {
    let up = clamp(-v.y, 0.0, 1.0);
    var c = frame.uwColor.rgb * 2.2 + lines * 0.12 * frame.sunDir.w * frame.sunColor.rgb;
    let window = smoothstep(0.55, 0.85, up);
    c = mix(c, frame.skyHorizon.rgb * 1.3 + frame.sunColor.rgb * 0.3, window * 0.8);
    return vec4f(applyFog(c, in.wp), 1.0);
  }

  let shallowT = exp(-depth * 0.09);
  var col = mix(frame.waterDeep.rgb, frame.waterShallow.rgb, shallowT);
  let ndl = dot(n, frame.sunDir.xyz);
  col *= 0.82 + 0.18 * smoothstep(0.1, 0.6, ndl);
  let fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col = mix(col, frame.skyHorizon.rgb, fres * 0.55);
  col += lines * (0.05 + 0.1 * shallowT) * frame.sunDir.w * (1.0 - fres) * in.fade * frame.sunColor.rgb;

  // foam: wave crests, shoreline bands, boat wake
  let sc = max(frame.ground.w, 0.05);
  var foam = smoothstep(0.65, 0.95, W.d.y / sc) * in.fade * lines * 0.9;
  let shore = 1.0 - smoothstep(0.0, 1.1, depth + 0.25 * sin(t * 1.3 + (in.xz.x + in.xz.y) * 0.07));
  let bandPos = fract(t * 0.12 + vnoise(in.xz * 0.05) * 0.3);
  let band = (1.0 - smoothstep(0.0, 0.35, abs(depth - (4.0 - bandPos * 3.5)))) * (1.0 - bandPos) * step(depth, 5.0);
  foam = max(foam, max(shore, band * 0.55) * step(0.001, depth + 1.0));
  for (var i = 0; i < 16; i++) {
    let w = frame.wake[i];
    if (w.w <= 0.0) { continue; }
    let d = distance(in.xz, w.xy);
    let r = 1.6 + w.z * 1.4;
    let ring = (1.0 - smoothstep(r - 0.8, r, d)) * smoothstep(r - 3.0, r - 0.8, d * 1.0 + 0.6);
    let blob = 1.0 - smoothstep(0.0, r, d);
    let life = clamp(1.0 - w.z / 6.0, 0.0, 1.0);
    foam = max(foam, max(ring, blob * 0.6) * life * w.w * step(0.45, vnoise(in.xz * 1.3 + w.xy)));
  }
  let bd = in.xz - frame.boat.xy;
  let fwd = vec2f(sin(frame.boat.z), cos(frame.boat.z));
  let side = vec2f(fwd.y, -fwd.x);
  let along = dot(bd, fwd);
  let across = abs(dot(bd, side));
  let hull = (1.0 - smoothstep(1.3, 2.2, across + max(abs(along) - 3.2, 0.0) * 1.2)) * smoothstep(0.3, 1.3, frame.boat.w);
  foam = max(foam, hull * step(0.4, vnoise(in.xz * 2.0 + vec2f(t * 3.0, 0.0))));

  col = mix(col, vec3f(0.95, 0.98, 1.0) * clamp(frame.sunDir.w * 0.5, 0.35, 1.0), clamp(foam, 0.0, 1.0));

  let r = reflect(-frame.sunDir.xyz, n);
  let spec = pow(max(dot(r, v), 0.0), 140.0);
  col += frame.sunColor.rgb * smoothstep(0.35, 0.45, spec) * 2.5 * frame.sunDir.w;
  let cell = floor(in.xz * 0.9);
  let sp = step(0.97, hash21(cell + floor(t * 2.0 + hash21(cell) * 4.0)));
  let dotShape = 1.0 - smoothstep(0.03, 0.09, length(fract(in.xz * 0.9) - 0.5));
  let camDist = distance(in.wp, frame.camPos.xyz);
  let sparkle = sp * dotShape * smoothstep(0.3, 0.7, dot(n, frame.sunDir.xyz)) * (1.0 - smoothstep(20.0, 120.0, camDist));
  col += sparkle * frame.waterDeep.w * frame.sunColor.rgb * 1.5;

  // eldritch / lava tint of the water near hot spots
  col = mix(col, frame.lava.rgb * 0.6, clamp(frame.lava.w * 0.15 * shallowT, 0.0, 0.6));
  // void: the ocean reflects the cosmos
  if (frame.misc.x > 0.01) {
    let sd = reflect(-v, n);
    let starCell = sd * 90.0;
    let dotS = 1.0 - smoothstep(0.08, 0.2, length(fract(starCell) - 0.5));
    let st = step(0.985, hash31(floor(starCell))) * dotS * frame.misc.x * 2.5;
    col = mix(col, col * 0.4 + vec3f(st), frame.misc.x * 0.6);
  }
  return vec4f(applyFog(col, in.wp), 1.0);
}
`;

export const SKY = /* wgsl */ `
${COMMON}
@vertex fn vs(@builtin(vertex_index) i: u32) -> FSVOut { return fullscreen(i); }

@fragment fn fs(in: FSVOut) -> @location(0) vec4f {
  let ndc = vec2f(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);
  let p = frame.invViewProj * vec4f(ndc, 1.0, 1.0);
  let dir = normalize(p.xyz / p.w - frame.camPos.xyz);
  let t = frame.camPos.w;
  if (frame.sunColor.w > 0.5) {
    let base = uwFogColor(frame.camPos.y);
    let deep = uwFogColor(frame.camPos.y - 60.0);
    var c = mix(deep, base * 1.25, smoothstep(-0.6, 0.8, dir.y));
    if (frame.misc.x > 0.01) {
      let h = hash31(floor(dir * 160.0));
      c += vec3f(step(0.993, h) * (0.6 + 0.4 * sin(t * 2.0 + h * 30.0)) * 1.5) * frame.misc.x;
      let q = dir.xz / (abs(dir.y) + 0.4);
      let nb = fbm(q * 1.6 + vec2f(t * 0.01, 0.0));
      c += mix(vec3f(0.4, 0.05, 0.6), vec3f(0.05, 0.4, 0.7), fbm(q * 2.5)) * smoothstep(0.5, 0.85, nb) * 0.5 * frame.misc.x;
    }
    return vec4f(c, 1.0);
  }
  let y = dir.y;
  var col = mix(frame.skyHorizon.rgb, frame.skyTop.rgb, pow(clamp(y, 0.0, 1.0), 0.55));
  col = mix(col, frame.fogColor.rgb, 1.0 - smoothstep(-0.02, 0.12, y));
  let sd = dot(dir, frame.sunDir.xyz);
  col += frame.sunColor.rgb * pow(max(sd, 0.0), 12.0) * 0.25;
  col += frame.sunColor.rgb * smoothstep(0.9993, 0.9996, sd) * 6.0 * frame.sunDir.w;

  // stars and nebula (void zone)
  if (frame.skyTop.w > 0.001) {
    let cell = floor(dir * 220.0);
    let h = hash31(cell);
    let tw = 0.6 + 0.4 * sin(t * 3.0 + h * 50.0);
    col += vec3f(step(0.9965, h) * tw * 2.5) * frame.skyTop.w * smoothstep(-0.05, 0.1, y);
  }
  if (frame.skyHorizon.w > 0.001) {
    let q = dir.xz / (abs(dir.y) + 0.35);
    let nb = fbm(q * 1.4 + vec2f(t * 0.01, 0.0));
    let nb2 = fbm(q * 2.3 - vec2f(0.0, t * 0.013));
    let neb = mix(vec3f(0.5, 0.1, 0.8), vec3f(0.05, 0.6, 0.9), nb2) * smoothstep(0.45, 0.8, nb);
    col += neb * frame.skyHorizon.w * smoothstep(-0.05, 0.3, y);
  }

  // stylized clouds on a virtual plane
  if (y > 0.0 && frame.cloudColor.w > 0.001) {
    let uv = dir.xz / (y + 0.08) * 0.9 + vec2f(t * 0.004, t * 0.002);
    let nC = fbm(uv * 0.9);
    let cover = frame.cloudColor.w;
    let edge = 1.0 - cover;
    let c = smoothstep(edge, edge + 0.06, nC) * smoothstep(0.0, 0.15, y);
    let shade = smoothstep(edge, edge + 0.25, fbm(uv * 0.9 + vec2f(0.05, 0.05)));
    let cc = mix(frame.cloudColor.rgb, frame.cloudColor.rgb * 0.72, shade);
    col = mix(col, cc, c * 0.95);
  }
  return vec4f(col, 1.0);
}
`;

export const PARTICLES = /* wgsl */ `
${COMMON}
struct P { pos: vec4f, col: vec4f, ex: vec4f };
@group(1) @binding(0) var<storage, read> parts: array<P>;
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec4f,
  @location(2) @interpolate(flat) kind: u32,
  @location(3) wp: vec3f,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  let pr = parts[ii];
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
                                vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let kind = u32(pr.ex.x + 0.5);
  let rot = pr.ex.y;
  let cr = vec2f(c.x * cos(rot) - c.y * sin(rot), c.x * sin(rot) + c.y * cos(rot));
  var wp: vec3f;
  if (kind == 2u) {
    wp = pr.pos.xyz + vec3f(cr.x, 0.0, cr.y) * pr.pos.w;
  } else {
    let right = vec3f(frame.view[0][0], frame.view[1][0], frame.view[2][0]);
    let up = vec3f(frame.view[0][1], frame.view[1][1], frame.view[2][1]);
    wp = pr.pos.xyz + (right * cr.x + up * cr.y) * pr.pos.w;
  }
  var o: VOut;
  o.clip = frame.viewProj * vec4f(wp, 1.0);
  o.uv = c;
  o.col = pr.col;
  o.kind = kind;
  o.wp = wp;
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let r = length(in.uv);
  var a = 0.0;
  if (in.kind == 1u || in.kind == 2u) {
    a = smoothstep(1.0, 0.85, r) * smoothstep(0.55, 0.75, r);
  } else if (in.kind == 3u) {
    let s = max(1.0 - abs(in.uv.x * in.uv.y) * 12.0, 0.0) * smoothstep(1.0, 0.0, r);
    a = s;
  } else if (in.kind == 4u) {
    a = smoothstep(1.0, 0.8, r);
  } else {
    a = smoothstep(1.0, 0.2, r);
  }
  if (a <= 0.001) { discard; }
  let fogged = applyFog(in.col.rgb, in.wp);
  let fogK = select(1.0, clamp(1.0 - distance(in.wp, frame.camPos.xyz) * frame.uwColor.w * 0.8, 0.0, 1.0), frame.sunColor.w > 0.5);
  // col.a: 1 = alpha blended, 0 = additive (premultiplied output)
  let alpha = a * in.col.a;
  let pm = select(in.col.a, 1.0, in.col.a <= 0.0);
  return vec4f(fogged * a * pm * fogK, alpha);
}
`;

export const UNLIT = /* wgsl */ `
${COMMON}
struct VOut { @builtin(position) clip: vec4f, @location(0) col: vec4f, @location(1) wp: vec3f };
@vertex fn vs(@location(0) pos: vec3f, @location(1) col: vec4f) -> VOut {
  var o: VOut;
  o.clip = frame.viewProj * vec4f(pos, 1.0);
  o.col = col;
  o.wp = pos;
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  return vec4f(applyFog(in.col.rgb, in.wp) * in.col.a, in.col.a);
}
`;

export const POST = /* wgsl */ `
struct FSVOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
fn fullscreen(i: u32) -> FSVOut {
  var o: FSVOut;
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
struct PostU { a: vec4f, flash: vec4f, fade: vec4f, b: vec4f, texel: vec4f };
@group(0) @binding(0) var<uniform> pu: PostU;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) i: u32) -> FSVOut { return fullscreen(i); }

fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

@fragment fn prefilter(in: FSVOut) -> @location(0) vec4f {
  let d = pu.texel.xy;
  var c = textureSample(src, samp, in.uv + vec2f(-d.x, -d.y)).rgb;
  c += textureSample(src, samp, in.uv + vec2f(d.x, -d.y)).rgb;
  c += textureSample(src, samp, in.uv + vec2f(-d.x, d.y)).rgb;
  c += textureSample(src, samp, in.uv + vec2f(d.x, d.y)).rgb;
  c *= 0.25;
  c = min(c, vec3f(40.0));
  let l = lum(c);
  let k = smoothstep(pu.b.w, pu.b.w + 0.6, l);
  return vec4f(c * k, 1.0);
}
@fragment fn down(in: FSVOut) -> @location(0) vec4f {
  let d = pu.texel.xy;
  var c = textureSample(src, samp, in.uv).rgb * 0.5;
  c += textureSample(src, samp, in.uv + vec2f(-d.x, -d.y)).rgb * 0.125;
  c += textureSample(src, samp, in.uv + vec2f(d.x, -d.y)).rgb * 0.125;
  c += textureSample(src, samp, in.uv + vec2f(-d.x, d.y)).rgb * 0.125;
  c += textureSample(src, samp, in.uv + vec2f(d.x, d.y)).rgb * 0.125;
  return vec4f(c, 1.0);
}
@fragment fn up(in: FSVOut) -> @location(0) vec4f {
  let d = pu.texel.xy;
  var c = textureSample(src, samp, in.uv).rgb * 4.0;
  c += textureSample(src, samp, in.uv + vec2f(-d.x, 0.0)).rgb * 2.0;
  c += textureSample(src, samp, in.uv + vec2f(d.x, 0.0)).rgb * 2.0;
  c += textureSample(src, samp, in.uv + vec2f(0.0, -d.y)).rgb * 2.0;
  c += textureSample(src, samp, in.uv + vec2f(0.0, d.y)).rgb * 2.0;
  c += textureSample(src, samp, in.uv + vec2f(-d.x, -d.y)).rgb;
  c += textureSample(src, samp, in.uv + vec2f(d.x, -d.y)).rgb;
  c += textureSample(src, samp, in.uv + vec2f(-d.x, d.y)).rgb;
  c += textureSample(src, samp, in.uv + vec2f(d.x, d.y)).rgb;
  return vec4f(c / 16.0, 1.0);
}

fn neutral(color: vec3f) -> vec3f {
  let startCompression = 0.8 - 0.04;
  let desaturation = 0.15;
  let x = min(color.r, min(color.g, color.b));
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
  var c = color - offset;
  let peak = max(c.r, max(c.g, c.b));
  if (peak < startCompression) { return c; }
  let d = 1.0 - startCompression;
  let newPeak = 1.0 - d * d / (peak + d - startCompression);
  c *= newPeak / peak;
  let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(c, vec3f(newPeak), g);
}
fn toSRGB(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment fn composite(in: FSVOut) -> @location(0) vec4f {
  let t = pu.a.x;
  let uw = pu.a.y;
  var uv = in.uv;
  uv += vec2f(sin(uv.y * 22.0 + t * 2.1), cos(uv.x * 19.0 + t * 1.7)) * 0.0022 * uw;
  let ab = pu.b.z;
  var col: vec3f;
  if (ab > 0.0001) {
    let dir = (uv - 0.5) * ab;
    col = vec3f(textureSample(src, samp, uv + dir).r, textureSample(src, samp, uv).g, textureSample(src, samp, uv - dir).b);
  } else {
    col = textureSample(src, samp, uv).rgb;
  }
  col += textureSample(bloomTex, samp, uv).rgb * pu.a.z;
  col *= pu.a.w;
  col = neutral(col);
  let l = lum(col);
  col = max(mix(vec3f(l), col, pu.b.y), vec3f(0.0));
  let vd = length((in.uv - 0.5) * vec2f(1.0, 0.8));
  col *= 1.0 - pu.b.x * smoothstep(0.35, 0.85, vd);
  col = mix(col, pu.flash.rgb, pu.flash.a);
  col = mix(col, pu.fade.rgb, pu.fade.a);
  return vec4f(toSRGB(clamp(col, vec3f(0.0), vec3f(1.0))), 1.0);
}
`;

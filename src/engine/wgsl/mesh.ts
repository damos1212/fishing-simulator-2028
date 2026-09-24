// Instanced meshes: props, creatures, the boat and terrain. Vertex animation, procedural
// materials (vertex color alpha = material id + baked AO), shadows and outlines.
import { COMMON } from './common';

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
  @location(5) ao: f32,
  @location(6) ln: vec3f,
  @location(7) @interpolate(flat) matId: u32,
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
    case 9u: { // crab / lobster: scuttling legs and snapping claws
      let ax = abs(p.x);
      let leg = smoothstep(0.16, 0.3, ax) * step(p.y, 0.16);
      let s = sign(p.x) * 1.6;
      q.y += max(sin(ph * 2.0 + p.z * 9.0 + s), 0.0) * amp * 0.7 * leg;
      q.z += cos(ph * 2.0 + p.z * 9.0 + s) * amp * 0.4 * leg;
      let claw = smoothstep(0.4, 0.55, p.z);
      q.x += sin(ph * 1.5) * amp * 0.35 * claw * sign(p.x);
    }
    case 10u: { // turtle / plesiosaur flippers
      let ax = abs(p.x);
      let fl = smoothstep(0.24, 0.4, ax) * (ax - 0.24);
      let off = select(0.0, 3.14159, p.z < 0.0);
      q.y += sin(ph + off) * amp * fl * 3.0;
      q.z += cos(ph + off) * amp * fl * 1.2;
    }
    case 11u: { // seahorse: fluttering fin, curling tail
      q.x += sin(ph * 4.0 + p.y * 12.0) * amp * 0.08;
      let tail = clamp(-0.15 - p.y, 0.0, 1.0);
      q.z += sin(ph * 0.7) * amp * tail * 0.6;
    }
    case 12u: { // starfish: slowly curling arms
      let r = length(p.xz);
      q.y += sin(ph * 0.6 + atan2(p.z, p.x) * 2.0) * amp * r * r * 0.8;
    }
    case 13u: { // long neck: gentle neck sway ahead of the body (+z) and paddling
      let neck = clamp(p.z - 0.15, 0.0, 1.0);
      q.x += sin(ph * 0.6 + p.z * 2.0) * amp * neck * neck * 0.8;
      q.y += sin(ph * 0.45) * amp * neck * neck * 0.3;
      let ax = abs(p.x);
      let fl = smoothstep(0.18, 0.32, ax) * (ax - 0.18);
      q.y += sin(ph + select(0.0, 3.14159, p.z < 0.0)) * amp * fl * 2.5;
    }
    case 14u: { // hover / bob in place (floating rocks, drones)
      q.y += sin(ph * 0.8) * amp * 0.5;
      q.x += sin(ph * 0.5) * amp * 0.15;
    }
    default: {}
  }
  return q;
}

fn decodeMat(a: f32) -> vec2f {
  // alpha = (material + ao * 0.999) / 16; legacy exports use alpha 1 (material 0, no AO)
  let a16 = a * 16.0;
  if (a16 > 15.5) { return vec2f(0.0, 1.0); }
  let id = floor(a16 + 0.0005);
  return vec2f(id, clamp((a16 - id) / 0.999, 0.0, 1.0));
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
  o.ln = normalize(v.nor);
  let mode = u32(inst.p.w + 0.5);
  if (mode == 0u || mode == 4u) {
    let md = decodeMat(v.col.a);
    o.matId = u32(md.x);
    o.ao = md.y;
  } else if (mode == 1u) {
    o.matId = 0u;
    o.ao = select(v.col.a / 0.999, 1.0, v.col.a > 0.9995);
  } else {
    o.matId = 0u;
    o.ao = clamp(length(v.nor), 0.0, 1.0);
  }
  return o;
}

fn shadowVertex(v: VIn, vp: mat4x4f) -> vec4f {
  let inst = insts[v.ii];
  if (u32(inst.p.w + 0.5) == 2u) { return vec4f(0.0, 0.0, -2.0, 1.0); }
  let p = animate(v.pos, inst);
  let wp = (inst.model * vec4f(p, 1.0)).xyz;
  return vp * vec4f(wp, 1.0);
}
@vertex fn vsShadow0(v: VIn) -> @builtin(position) vec4f { return shadowVertex(v, frame.sunVP0); }
@vertex fn vsShadow1(v: VIn) -> @builtin(position) vec4f { return shadowVertex(v, frame.sunVP1); }

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
  o.ao = 1.0;
  o.ln = v.nor;
  o.matId = 0u;
  return o;
}

fn triNoise(p: vec3f, n: vec3f, s: f32) -> f32 {
  let w = pow(abs(n), vec3f(4.0));
  let ws = w / (w.x + w.y + w.z + 1e-4);
  let k = s * 0.12;
  return dnoise(p.yz * k).r * ws.x + dnoise(p.xz * k + vec2f(0.51, 0.13)).r * ws.y + dnoise(p.xy * k + vec2f(0.27, 0.81)).r * ws.z;
}

fn hue(h: f32) -> vec3f {
  return clamp(abs(fract(h + vec3f(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));
}

/** Procedural surface detail per material id; returns the lighting parameters. */
fn materialize(id: u32, lp: vec3f, ln: vec3f, wp: vec3f, albedo: ptr<function, vec3f>, emis: ptr<function, vec3f>) -> Mat {
  var m = defaultMat();
  switch id {
    case 1u: { // wood: rings and grain
      let r = length(lp.xy * 2.4) + vnoise(lp.xz * vec2f(1.5, 14.0)) * 0.5 + lp.z * 0.2;
      let ring = smoothstep(0.1, 0.9, fract(r * 5.0));
      let grain = vnoise(vec2f(lp.x * 60.0 + lp.z * 40.0, lp.y * 4.0));
      *albedo *= 0.8 + 0.16 * ring + 0.1 * grain;
      m.rough = 0.78;
    }
    case 2u: { // stone
      let n1 = triNoise(lp, ln, 3.5);
      let crack = smoothstep(0.4, 0.9, dnoise(lp.xz * 0.35 + vec2f(lp.y * 0.21, 0.0)).g);
      *albedo *= (0.72 + 0.45 * n1) * (1.0 - crack * 0.35);
      m.rough = 0.92;
    }
    case 3u: { // metal
      let brushed = vnoise(vec2f(lp.x * 3.0, lp.y * 90.0 + lp.z * 90.0));
      *albedo *= 0.9 + 0.15 * brushed;
      m.metal = 1.0;
      m.rough = 0.32;
    }
    case 4u: { // cloth / canvas / rope
      let weave = sin(lp.x * 260.0) * sin(lp.y * 260.0 + lp.z * 260.0);
      *albedo *= 0.93 + 0.07 * weave + 0.08 * (vnoise(lp.xy * 6.0) - 0.5);
      m.rough = 1.0;
      m.sheen = 0.6;
      m.trans = 0.25;
    }
    case 5u: { // foliage
      *albedo *= 0.82 + 0.3 * vnoise(lp.xz * 5.0 + lp.y * 3.0);
      m.rough = 0.7;
      m.trans = 0.75;
    }
    case 6u: { // glass / crystal
      m.rough = 0.06;
      m.f0 = 0.09;
      m.trans = 0.4;
      let v = normalize(frame.camPos.xyz - wp);
      *emis += *albedo * pow(1.0 - abs(dot(normalize(ln), v)), 2.0) * 0.35;
    }
    case 7u: { // gold
      *albedo *= 0.95 + 0.1 * vnoise(lp.xz * 20.0);
      m.metal = 1.0;
      m.rough = 0.22;
    }
    case 8u: { // ice / snow
      let sp = step(0.985, hash31(floor(wp * 9.0)));
      *emis += vec3f(sp * 2.0) * frame.sunDir.w * 0.3;
      m.rough = 0.35;
      m.trans = 0.35;
    }
    case 9u: { // glossy plastic / paint
      m.rough = 0.3;
    }
    case 10u: { // organic / skin
      m.rough = 0.5;
      m.trans = 0.3;
    }
    case 11u: { // slime / wet
      m.rough = 0.15;
      m.f0 = 0.06;
    }
    default: {}
  }
  return m;
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
  } else if (pat == 7u) { // pixel grid (neon realm)
    let g = abs(fract(lp.zy * 14.0) - 0.5);
    let edge = 1.0 - smoothstep(0.4, 0.46, max(g.x, g.y));
    c *= 0.75 + 0.25 * edge;
    *emis += inst.c.rgb * (1.0 - edge) * 0.8;
  } else if (pat == 8u) { // fel / lava cracks
    let cr = worley(lp.zy * 7.0 + vec2f(lp.x * 3.0, t * 0.2), t * 0.5);
    let crack = 1.0 - smoothstep(0.0, 0.07, cr.y - cr.x);
    *emis += inst.c.rgb * crack * (2.0 + sin(t * 3.0 + lp.z * 6.0));
  }
  // overlapping scales on the body
  let sc = worley(vec2f(lp.z * 26.0 + floor(lp.y * 22.0) * 0.5, lp.y * 22.0), 0.0);
  c *= mix(1.0, 0.9 + 0.12 * smoothstep(0.15, 0.55, sc.x), body * s * 0.8);
  return c * body + inst.c.rgb * clamp(m.b, 0.0, 1.0);
}

struct FOut { @location(0) color: vec4f };

fn faceNormal(in: VOut, ff: bool) -> vec3f {
  let n = normalize(in.n);
  return select(-n, n, ff);
}

// Props, the boat and glowing parts (modes 0, 2, 4).
@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> FOut {
  let inst = insts[in.ii];
  let mode = u32(inst.p.w + 0.5);
  let dist = distance(in.wp, frame.camPos.xyz);
  var o: FOut;
  var albedo = in.col.rgb * inst.a.rgb;
  if (mode == 2u) {
    o.color = vec4f(applyFog(albedo * inst.a.w, in.wp), dist);
    return o;
  }
  var emissive = vec3f(0.0);
  if (mode == 4u && distance(in.col.rgb, vec3f(0.0284, 0.1095, 0.2542)) < 0.012) { albedo = inst.b.rgb; }
  var m = materialize(in.matId, in.lp, in.ln, in.wp, &albedo, &emissive);
  if (mode == 4u && in.matId == 0u) { m.rough = 0.35; }
  emissive += albedo * inst.a.w;
  let lit = shade(albedo, faceNormal(in, ff), in.wp, in.ao, m) + emissive;
  o.color = vec4f(applyFog(lit, in.wp), dist);
  return o;
}

// Creatures (mode 1): species colors and patterns on the mask, scales, wet iridescent sheen.
@fragment fn fsFish(in: VOut, @builtin(front_facing) ff: bool) -> FOut {
  let inst = insts[in.ii];
  let n = faceNormal(in, ff);
  var emissive = vec3f(0.0);
  var albedo = fishColor(in.col, in.lp, inst, &emissive);
  emissive += albedo * inst.a.w;
  var m = defaultMat();
  m.rough = 0.24;
  m.f0 = 0.05;
  m.trans = 0.15;
  let v = normalize(frame.camPos.xyz - in.wp);
  let fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  albedo += hue(fr * 1.5 + in.lp.z * 2.0 + in.lp.y) * fr * 0.18 * clamp(1.0 - in.col.b, 0.0, 1.0);
  var o: FOut;
  o.color = vec4f(applyFog(shade(albedo, n, in.wp, in.ao, m) + emissive, in.wp), distance(in.wp, frame.camPos.xyz));
  return o;
}

// Terrain (mode 3): texture-based detail, strata, sand ripples, grass, wet shoreline, lava glow.
@fragment fn fsTerrain(in: VOut, @builtin(front_facing) ff: bool) -> FOut {
  var n = faceNormal(in, ff);
  var albedo = in.col.rgb;
  var emissive = vec3f(0.0);
  var m = defaultMat();
  let wp = in.wp;
  let slope = 1.0 - n.y;
  let dMacro = dnoise(wp.xz * 0.0045);
  let dMid = dnoise(wp.xz * 0.021 + vec2f(0.3, 0.7));
  let dFine = dnoise(wp.xz * 0.11);
  albedo *= 0.84 + 0.3 * dMacro.r;
  albedo *= 0.92 + 0.16 * dFine.a;
  let steep = smoothstep(0.3, 0.6, slope);
  let strata = smoothstep(0.2, 0.8, fract(wp.y * 0.18 + dMid.r * 1.4)) * (1.0 - smoothstep(0.5, 0.75, luma(albedo)));
  albedo *= 1.0 - steep * (0.1 * strata + 0.12 * dFine.r);
  let sandy = smoothstep(0.12, 0.3, albedo.r - albedo.b) * (1.0 - steep);
  let ripPhase = dot(wp.xz, vec2f(0.8, 0.6)) * 2.3 + dMid.r * 9.0;
  albedo *= 1.0 + 0.07 * sin(ripPhase) * sandy;
  n = normalize(n + vec3f(0.6, 0.0, 0.45) * cos(ripPhase) * 0.12 * sandy);
  let grassy = smoothstep(0.05, 0.2, albedo.g - max(albedo.r, albedo.b)) * (1.0 - steep);
  albedo = mix(albedo, albedo * vec3f(1.15, 1.08, 0.7), grassy * smoothstep(0.5, 0.75, dMid.r));
  albedo *= 1.0 - grassy * 0.18 * step(0.62, dFine.a);
  if (luma(albedo) > 0.75) { emissive += vec3f(step(0.992, hash31(floor(wp * 7.0)))) * frame.sunDir.w * 0.5; }
  let wet = smoothstep(1.4, 0.2, wp.y) * smoothstep(-1.5, 0.0, wp.y);
  albedo *= mix(1.0, 0.6, wet);
  m.rough = mix(0.95, 0.18, wet);
  m.f0 = mix(0.03, 0.05, wet);
  let lava = in.col.a;
  if (lava > 0.01) {
    let flick = 0.75 + 0.25 * sin(frame.camPos.w * 2.0 + wp.x * 0.13 + wp.z * 0.11);
    emissive += frame.lava.rgb * lava * flick * frame.lava.w;
  }
  var o: FOut;
  o.color = vec4f(applyFog(shade(albedo, n, wp, in.ao, m) + emissive, wp), distance(wp, frame.camPos.xyz));
  return o;
}

// Mirrored pass: everything above the water, with lighter shading.
@fragment fn fsRefl(in: VOut, @builtin(front_facing) ff: bool) -> FOut {
  if (in.wp.y < -0.15) { discard; }
  let inst = insts[in.ii];
  let mode = u32(inst.p.w + 0.5);
  var albedo = in.col.rgb * inst.a.rgb;
  var o: FOut;
  let dist = distance(in.wp, frame.camPos.xyz);
  if (mode == 2u) {
    o.color = vec4f(applyFog(albedo * inst.a.w, in.wp), dist);
    return o;
  }
  if (mode == 3u) { albedo = in.col.rgb * (0.84 + 0.3 * dnoise(in.wp.xz * 0.0045).r); }
  if (mode == 4u && distance(in.col.rgb, vec3f(0.0284, 0.1095, 0.2542)) < 0.012) { albedo = inst.b.rgb; }
  var emissive = albedo * inst.a.w;
  if (mode == 3u && in.col.a > 0.01) { emissive = frame.lava.rgb * in.col.a * frame.lava.w; }
  o.color = vec4f(applyFog(shade(albedo, faceNormal(in, ff), in.wp, in.ao, defaultMat()) + emissive, in.wp), dist);
  return o;
}

@fragment fn fsOutline(in: VOut) -> FOut {
  let base = vec3f(0.035, 0.03, 0.05);
  let under = underwaterness(in.wp.y);
  let c = mix(base, frame.uwDeep.rgb * 0.5, under * 0.5);
  var o: FOut;
  o.color = vec4f(applyFog(c, in.wp), distance(in.wp, frame.camPos.xyz));
  return o;
}
`;

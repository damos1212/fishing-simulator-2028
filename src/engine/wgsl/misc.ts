// Particles (billboards, rings, streaks) and unlit ribbons (fishing line, lightning, beams).
import { COMMON } from './common';

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
  let stretch = select(pr.ex.z, 1.0, pr.ex.z <= 0.0);
  var wp: vec3f;
  if (kind == 2u) {
    wp = pr.pos.xyz + vec3f(cr.x, 0.0, cr.y) * pr.pos.w;
  } else if (kind == 5u || kind == 6u) {
    let toCam = normalize(frame.camPos.xyz - pr.pos.xyz);
    let right = normalize(cross(vec3f(0.0, 1.0, 0.0), toCam));
    wp = pr.pos.xyz + right * c.x * pr.pos.w + vec3f(0.0, 1.0, 0.0) * c.y * pr.pos.w * stretch;
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
@group(1) @binding(1) var sceneTex: texture_2d<f32>;

@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let r = length(in.uv);
  var a = 0.0;
  // soft particles: fade where they meet solid geometry
  let sd = abs(textureLoad(sceneTex, vec2i(in.clip.xy), 0).a);
  let soft = clamp((sd - distance(in.wp, frame.camPos.xyz)) / 0.8, 0.0, 1.0);
  if (in.kind == 1u || in.kind == 2u) {
    a = smoothstep(1.0, 0.85, r) * smoothstep(0.55, 0.75, r);
  } else if (in.kind == 3u) {
    let s = max(1.0 - abs(in.uv.x * in.uv.y) * 12.0, 0.0) * smoothstep(1.0, 0.0, r);
    a = s;
  } else if (in.kind == 4u) {
    a = smoothstep(1.0, 0.8, r);
  } else if (in.kind == 5u) {
    a = pow(max(1.0 - abs(in.uv.x), 0.0), 1.5) * (0.35 + 0.65 * (in.uv.y * 0.5 + 0.5)) * smoothstep(-1.0, -0.4, in.uv.y) * smoothstep(1.0, 0.8, in.uv.y);
  } else if (in.kind == 6u) {
    a = (1.0 - smoothstep(0.2, 1.0, abs(in.uv.x))) * smoothstep(-1.0, 0.0, in.uv.y);
  } else {
    a = smoothstep(1.0, 0.2, r);
  }
  if (a <= 0.001) { discard; }
  let fogged = applyFog(in.col.rgb, in.wp);
  let fogK = select(1.0, clamp(1.0 - distance(in.wp, frame.camPos.xyz) * frame.uwColor.w * 0.8, 0.0, 1.0), frame.sunColor.w > 0.5);
  // col.a: 1 = alpha blended, 0 = additive (premultiplied output)
  a *= soft;
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

// Volumetric light: raymarches the view ray through the water (or the hazy air above it), gathering
// sunlight that isn't blocked by shadows or clouds. Under water the caustic pattern turns it into
// shimmering light shafts. Rendered at half resolution and added in the composite.
import { COMMON } from './common';

export const VOLUME = /* wgsl */ `
${COMMON}
@group(1) @binding(0) var sceneTex: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) i: u32) -> FSVOut { return fullscreen(i); }

fn sunVisible(p: vec3f) -> f32 {
  if (frame.shadow.x < 0.5) { return 1.0; }
  let s0 = frame.sunVP0 * vec4f(p, 1.0);
  let uv0 = s0.xy * vec2f(0.5, -0.5) + 0.5;
  if (all(uv0 > vec2f(0.01)) && all(uv0 < vec2f(0.99)) && s0.z < 1.0 && s0.z > 0.0) {
    return textureSampleCompareLevel(shadowTex, shadowSamp, uv0, 0, s0.z - 0.0005);
  }
  if (frame.shadow.w > 1.5) {
    let s1 = frame.sunVP1 * vec4f(p, 1.0);
    let uv1 = s1.xy * vec2f(0.5, -0.5) + 0.5;
    if (all(uv1 > vec2f(0.0)) && all(uv1 < vec2f(1.0)) && s1.z < 1.0 && s1.z > 0.0) {
      return textureSampleCompareLevel(shadowTex, shadowSamp, uv1, 1, s1.z - 0.001);
    }
  }
  return 1.0;
}

@fragment fn fs(in: FSVOut) -> @location(0) vec4f {
  let ndc = vec2f(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);
  let pn = frame.invViewProj * vec4f(ndc, 1.0, 1.0);
  let cam = frame.camPos.xyz;
  let dir = normalize(pn.xyz / pn.w - cam);
  let sceneD = abs(textureSampleLevel(sceneTex, clampSamp, in.uv, 0.0).a);
  let under = frame.sunColor.w > 0.5;
  let sunI = frame.sunDir.w;
  if (sunI < 0.05) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  var maxD = sceneD;
  var density: f32;
  if (under) {
    maxD = min(maxD, 110.0);
    if (dir.y > 0.001) { maxD = min(maxD, -cam.y / dir.y); }
    density = frame.uwColor.w * 0.9;
  } else {
    maxD = min(maxD, 600.0);
    if (dir.y < -0.001) { maxD = min(maxD, cam.y / -dir.y); }
    // only hazy weather and golden hours show shafts above the water
    density = frame.fogColor.w * (0.6 + frame.mapInfo.w * 1.5) * 1.2;
  }
  if (maxD <= 0.5 || density <= 0.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let steps = 28;
  let jit = fract(52.9829189 * fract(dot(in.pos.xy, vec2f(0.06711056, 0.00583715))) + fract(frame.camPos.w * 7.31));
  let dt = maxD / f32(steps);
  let L = frame.sunDir.xyz;
  let cosT = dot(dir, L);
  let g = select(0.55, 0.75, under);
  let phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5) * 0.25 + 0.05;
  var acc = vec3f(0.0);
  var T = 1.0;
  let t = frame.camPos.w;
  for (var i = 0; i < steps; i++) {
    let d = (f32(i) + jit) * dt;
    let p = cam + dir * d;
    var light: vec3f;
    var dens = density;
    if (under) {
      let depth = max(-p.y, 0.0);
      let proj = p.xz + L.xz / max(L.y, 0.25) * depth;
      let c = causticAt(proj * 0.028, t);
      light = frame.sunColor.rgb * exp(-depth * frame.misc.z) * (0.25 + c * 1.1) * (1.0 - smoothstep(0.0, 1.0, max(p.y, 0.0)));
    } else {
      light = frame.sunColor.rgb * 0.9;
      dens *= exp(-max(p.y, 0.0) * 0.012);
    }
    let vis = sunVisible(p) * cloudShadow(p);
    acc += T * light * vis * dens * dt;
    T *= exp(-dens * dt * 0.6);
    if (T < 0.02) { break; }
  }
  let strength = select(0.65, 1.6, under);
  return vec4f(acc * phase * sunI * strength, 1.0);
}
`;

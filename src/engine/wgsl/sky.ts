// Sky dome and the volumetric cloud pass (raymarched into a hemi-octahedral dome texture that
// both the sky and the reflections sample).
import { COMMON } from './common';

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
    // light pouring down from the surface
    let shaft = pow(max(dir.y, 0.0), 3.0) * (0.6 + 0.4 * vnoise(dir.xz * 12.0 + vec2f(t * 0.2, 0.0)));
    c += frame.sunColor.rgb * frame.sunDir.w * shaft * 0.12 * exp(-max(-frame.camPos.y, 0.0) * 0.02);
    if (frame.misc.x > 0.01) {
      let h = hash31(floor(dir * 160.0));
      c += vec3f(step(0.993, h) * (0.6 + 0.4 * sin(t * 2.0 + h * 30.0)) * 1.5) * frame.misc.x;
      let q = dir.xz / (abs(dir.y) + 0.4);
      let nb = fbm(q * 1.6 + vec2f(t * 0.01, 0.0));
      c += mix(vec3f(0.4, 0.05, 0.6), vec3f(0.05, 0.4, 0.7), fbm(q * 2.5)) * smoothstep(0.5, 0.85, nb) * 0.5 * frame.misc.x;
    }
    return vec4f(c, SKY_DIST);
  }
  var col = skyColor(dir, true);
  // synthwave sun sinking into the horizon
  if (frame.fx.z > 0.01) {
    let sd = normalize(vec3f(frame.sunDir.x, 0.12, frame.sunDir.z));
    let a = acos(clamp(dot(dir, sd), -1.0, 1.0));
    let disc = 1.0 - smoothstep(0.2, 0.205, a);
    let yy = dir.y - sd.y;
    let stripes = step(0.5, fract(yy * 60.0 + t * 0.2)) * step(yy, 0.02) + step(0.02, yy);
    let sc = mix(vec3f(1.0, 0.25, 0.55), vec3f(1.0, 0.85, 0.2), smoothstep(-0.15, 0.15, yy));
    col = mix(col, sc * 3.0, disc * stripes * frame.fx.z);
  }
  // swirling cosmic vortex (black hole with an accretion disk)
  if (frame.fx.w > 0.01) {
    let c0 = normalize(vec3f(-0.4, 0.45, -0.8));
    let d = dir - c0 * dot(dir, c0);
    let r = length(d);
    let ang = atan2(dot(d, normalize(cross(c0, vec3f(0.0, 1.0, 0.0)))), dot(d, vec3f(0.0, 1.0, 0.0)));
    let swirl = fbm(vec2f(ang * 2.0 + r * 30.0 - t * 0.3, r * 8.0));
    let disk = smoothstep(0.35, 0.08, r) * smoothstep(0.03, 0.06, r) * (0.5 + swirl);
    let hole = smoothstep(0.045, 0.03, r) * step(0.0, dot(dir, c0));
    col += mix(vec3f(1.0, 0.5, 0.2), vec3f(0.6, 0.3, 1.0), swirl) * disk * 2.5 * frame.fx.w * step(0.0, dot(dir, c0));
    col = mix(col, vec3f(0.0), hole * frame.fx.w);
  }
  return vec4f(col, SKY_DIST);
}
`;

export const CLOUDS = /* wgsl */ `
${COMMON}
@vertex fn vs(@builtin(vertex_index) i: u32) -> FSVOut { return fullscreen(i); }

fn hg(c: f32, g: f32) -> f32 {
  let g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}
fn sphereExit(oy: f32, d: vec3f, r: f32) -> f32 {
  // ray from (0, oy, 0) inside a sphere of radius r centered at the origin
  let b = oy * d.y;
  let c = oy * oy - r * r;
  return -b + sqrt(max(b * b - c, 0.0));
}

@fragment fn fs(in: FSVOut) -> @location(0) vec4f {
  let dir = hemiOctDecode(in.uv * 2.0 - 1.0);
  if (dir.y < 0.004 || frame.cloudColor.w < 0.01) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  let RP = 60000.0;
  let h0 = frame.cloud.x;
  let h1 = frame.cloud.x + frame.cloud.y;
  let oy = RP + clamp(frame.camPos.y, 0.0, 200.0);
  let t0 = sphereExit(oy, dir, RP + h0);
  var t1 = sphereExit(oy, dir, RP + h1);
  if (t0 > 70000.0) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  t1 = min(t1, t0 + 14000.0);
  let steps = i32(mix(frame.extra.x * 1.5, frame.extra.x, clamp(dir.y * 2.0, 0.0, 1.0)));
  let dt = (t1 - t0) / f32(steps);
  let jitter = hash21(in.pos.xy + vec2f(fract(frame.camPos.w * 7.13) * 91.0, 0.0));
  let L = frame.sunDir.xyz;
  let cosT = dot(dir, L);
  let phase = mix(hg(cosT, 0.65), hg(cosT, -0.2), 0.35) * 4.0 * PI;
  let sunI = frame.sunColor.rgb * frame.sunDir.w * 1.15;
  let ambTop = mix(frame.skyHorizon.rgb, frame.skyTop.rgb, 0.6) * (0.55 + 0.35 * frame.ambient.w);
  let ambBot = frame.fogColor.rgb * 0.45 + frame.waterDeep.rgb * 0.1;
  let albedo = frame.cloudColor.rgb;
  let sigma = 0.018;
  var trans = 1.0;
  var scat = vec3f(0.0);
  var firstHit = t1;
  for (var i = 0; i < steps; i++) {
    let t = t0 + (f32(i) + jitter) * dt;
    let pl = vec3f(dir.x * t, oy + dir.y * t, dir.z * t);
    let height = length(pl) - RP;
    let h01 = clamp((height - h0) / (h1 - h0), 0.0, 1.0);
    let wp = vec3f(frame.camPos.x + dir.x * t, height, frame.camPos.z + dir.z * t);
    let d = cloudDensity(wp, h01, true);
    if (d > 0.002) {
      firstHit = min(firstHit, t);
      // march towards the sun for self-shadowing
      var od = 0.0;
      var ls = 45.0;
      var lp = wp;
      for (var j = 0; j < 5; j++) {
        lp += L * ls;
        let lh = clamp((lp.y - h0) / (h1 - h0), 0.0, 1.0);
        od += cloudDensity(lp, lh, j < 2) * ls;
        ls *= 1.9;
      }
      let beer = exp(-od * sigma * 0.9);
      let powder = 1.0 - exp(-od * sigma * 2.2);
      let direct = sunI * beer * mix(1.0, powder, 0.55) * phase;
      let amb = mix(ambBot, ambTop, h01) * (0.6 + 0.4 * h01);
      let S = albedo * (direct + amb) * d * sigma;
      let Tr = exp(-d * sigma * dt);
      scat += trans * (S - S * Tr) / max(d * sigma, 1e-5);
      trans *= Tr;
      if (trans < 0.015) { break; }
    }
  }
  // aerial perspective: distant clouds melt into the horizon haze
  let haze = 1.0 - exp(-firstHit * 0.000045);
  scat = mix(scat, frame.skyHorizon.rgb * (1.0 - trans), haze * 0.85);
  return vec4f(scat, trans);
}
`;

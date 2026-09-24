// Ocean surface: Gerstner waves on a camera-following warped grid, detail normals from a tiling
// normal map, planar reflections, refraction with depth absorption, subsurface glow and foam.
import { COMMON } from './common';

export const OCEAN = /* wgsl */ `
${COMMON}
@group(1) @binding(0) var heightTex: texture_2d<f32>;
@group(1) @binding(1) var sceneTex: texture_2d<f32>;
@group(1) @binding(2) var reflTex: texture_2d<f32>;
@group(1) @binding(3) var nrmTex: texture_2d<f32>;

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wp: vec3f,
  @location(1) xz: vec2f,
  @location(2) fade: f32,
};

struct WaveOut { d: vec3f, n: vec3f, crest: f32 };

fn addWave(acc: ptr<function, WaveOut>, xz: vec2f, w: vec4f, sc: f32, t: f32) {
  let dir = normalize(w.xy);
  let k = 6.2831853 / w.z;
  let a = w.w * sc;
  let c = sqrt(9.8 / k);
  let f = k * (dot(dir, xz) - c * t);
  let q = 0.6;
  let cf = cos(f);
  let sf = sin(f);
  (*acc).d += vec3f(dir.x * q * a * cf, a * sf, dir.y * q * a * cf);
  (*acc).n += vec3f(-dir.x * k * a * cf, -q * k * a * sf, -dir.y * k * a * cf);
  (*acc).crest += q * k * a * sf;
}

fn waves(xz: vec2f) -> WaveOut {
  var o: WaveOut;
  o.d = vec3f(0.0);
  o.n = vec3f(0.0);
  o.crest = 0.0;
  let sc = frame.ground.w;
  let t = frame.camPos.w;
  addWave(&o, xz, vec4f(1.0, 0.35, 64.0, 0.55), sc, t);
  addWave(&o, xz, vec4f(0.4, 1.0, 33.0, 0.3), sc, t);
  addWave(&o, xz, vec4f(-0.8, 0.6, 19.0, 0.16), sc, t);
  addWave(&o, xz, vec4f(0.6, -0.9, 11.0, 0.08), sc, t);
  addWave(&o, xz, vec4f(-0.3, -1.0, 6.5, 0.035), sc, t);
  addWave(&o, xz, vec4f(0.9, -0.25, 4.1, 0.02), sc, t);
  addWave(&o, xz, vec4f(-0.6, 0.8, 2.7, 0.012), sc, t);
  addWave(&o, xz, vec4f(0.15, 0.95, 1.9, 0.008), sc, t);
  o.n = normalize(vec3f(o.n.x, 1.0 + o.n.y, o.n.z));
  return o;
}

fn mapUV(xz: vec2f) -> vec2f {
  let a = clamp(abs(xz) / frame.mapInfo.x, vec2f(0.0), vec2f(1.0));
  return sign(xz) * pow(a, vec2f(1.0 / frame.mapInfo.y)) * 0.5 + 0.5;
}
fn terrainHeight(xz: vec2f) -> f32 {
  return textureSampleLevel(heightTex, clampSamp, mapUV(xz), 0.0).r;
}

@vertex fn vs(@location(0) g: vec2f) -> VOut {
  let R = frame.ocean.z;
  let P = frame.ocean.w;
  let local = sign(g) * pow(abs(g), vec2f(P)) * R;
  let xz = local + frame.ocean.xy;
  let dist = length(xz - frame.camPos.xz);
  // waves calm down over the shallows so they don't climb the beach
  let h = terrainHeight(xz);
  let shoreDamp = smoothstep(-0.5, -6.0, h);
  let fade = (1.0 - smoothstep(250.0, 1400.0, dist)) * mix(0.35, 1.0, shoreDamp);
  let w = waves(xz);
  var wp = vec3f(xz.x + w.d.x * fade, w.d.y * fade, xz.y + w.d.z * fade);
  var o: VOut;
  o.clip = frame.viewProj * vec4f(wp, 1.0);
  o.wp = wp;
  o.xz = xz;
  o.fade = fade;
  return o;
}

fn detailNormal(xz: vec2f, t: f32, strength: f32) -> vec2f {
  // slopes are scale-free, so each layer contributes by weight only
  let a = textureSampleLevel(nrmTex, repSamp, xz / 31.0 + vec2f(t * 0.013, t * 0.008), 0.0).xy;
  let b = textureSampleLevel(nrmTex, repSamp, xz / 11.3 + vec2f(-t * 0.021, t * 0.017), 0.0).xy;
  let c = textureSampleLevel(nrmTex, repSamp, xz / 4.1 + vec2f(t * 0.034, -t * 0.029), 0.0).xy;
  return (a * 0.6 + b * 0.5 + c * 0.35) * strength;
}

@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let t = frame.camPos.w;
  let W = waves(in.xz);
  let camDist = distance(in.wp, frame.camPos.xyz);
  let v = normalize(frame.camPos.xyz - in.wp);
  let detailFade = 1.0 - smoothstep(40.0, 700.0, camDist);
  let dn = detailNormal(in.xz, t, frame.water.w * (0.5 + 0.5 * frame.ground.w) * detailFade);
  var n = normalize(mix(vec3f(0.0, 1.0, 0.0), W.n, in.fade * 0.9 + 0.1));
  n = normalize(vec3f(n.x - dn.x, n.y, n.z - dn.y));
  let h = terrainHeight(in.xz);
  let foamTex = textureSampleLevel(nrmTex, repSamp, in.xz / 9.0 + vec2f(t * 0.01, -t * 0.006), 0.0).w;
  let foamTex2 = textureSampleLevel(nrmTex, repSamp, in.xz / 3.7 - vec2f(t * 0.02, t * 0.013), 0.0).w;
  let suv = in.clip.xy * frame.res.zw;

  if (!ff) {
    // seen from below: Snell's window with the refracted sky, total internal reflection outside it
    let up = clamp(-v.y, 0.0, 1.0);
    let nd = -n;
    let refr = refract(-v, nd, 1.33);
    var c = frame.uwColor.rgb * 2.0;
    let window = smoothstep(0.62, 0.8, up);
    if (dot(refr, refr) > 0.0) {
      let sky = skyColor(normalize(vec3f(refr.x, abs(refr.y), refr.z)), true);
      c = mix(c, sky * 0.9 + frame.uwColor.rgb * 0.3, window);
    }
    let rip = 1.0 - smoothstep(0.0, 0.08, abs(fract(dn.x * 40.0 + dn.y * 30.0) - 0.5));
    c += rip * 0.04 * frame.sunDir.w * window;
    return vec4f(applyFog(c, in.wp), 1.0);
  }

  // refraction: what lies under the surface, absorbed by the water it travels through
  let distort = n.xz * (0.035 / (1.0 + camDist * 0.015));
  var sc = textureSampleLevel(sceneTex, clampSamp, suv + distort, 0.0);
  if (sc.a < camDist) { sc = textureSampleLevel(sceneTex, clampSamp, suv, 0.0); }
  let thick = max(sc.a - camDist, 0.0);
  let vDepth = thick * clamp(-dot(-v, vec3f(0.0, 1.0, 0.0)) + 0.15, 0.15, 1.0);
  let absorb = frame.water.x;
  let ext = (vec3f(1.0) - frame.waterShallow.rgb * 0.85) * absorb * 1.6 + absorb * 0.25;
  let transmit = exp(-ext * thick);
  let shallowT = exp(-vDepth * 0.06);
  let body = mix(frame.waterDeep.rgb, frame.waterShallow.rgb, shallowT * 0.85);
  var col = mix(body, sc.rgb * mix(vec3f(1.0), frame.waterShallow.rgb * 1.3, 0.3), transmit);
  let ndl = dot(n, frame.sunDir.xyz);
  col *= 0.86 + 0.14 * smoothstep(0.1, 0.6, ndl);

  // subsurface glow through backlit wave crests
  let sc2 = max(frame.ground.w, 0.05);
  let crestH = clamp(W.d.y / sc2 * 0.8 + 0.35, 0.0, 1.5);
  let back = pow(clamp(dot(-v, frame.sunDir.xyz) * 0.5 + 0.5, 0.0, 1.0), 4.0);
  col += frame.waterShallow.rgb * frame.sunColor.rgb * frame.sunDir.w * (back * 0.55 + 0.1) * crestH * 0.35 * in.fade;

  // reflection: planar mirror of the scene, or the sky
  let fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  let R = reflect(-v, n);
  var refl: vec3f;
  if (frame.water.y > 0.5) {
    let rd = n.xz * (0.06 / (1.0 + camDist * 0.01));
    refl = textureSampleLevel(reflTex, clampSamp, suv + rd, 0.0).rgb;
  } else {
    refl = skyColor(normalize(vec3f(R.x, abs(R.y) + 0.01, R.z)), false);
  }
  col = mix(col, refl, clamp(fres * 0.95, 0.0, 1.0));

  // foam: whitecaps, shoreline and around anything in the water, boat wake
  var foam = smoothstep(0.35, 0.95, W.crest * 0.55 + W.d.y / sc2 * 0.35) * in.fade * smoothstep(0.35, 0.6, foamTex) * frame.water.z;
  let depth = max(-h, 0.0);
  let shore = 1.0 - smoothstep(0.0, 1.1, depth + 0.25 * sin(t * 1.3 + (in.xz.x + in.xz.y) * 0.07));
  let bandPos = fract(t * 0.12 + vnoise(in.xz * 0.05) * 0.3);
  let band = (1.0 - smoothstep(0.0, 0.35, abs(depth - (4.0 - bandPos * 3.5)))) * (1.0 - bandPos) * step(depth, 5.0);
  foam = max(foam, max(shore, band * 0.55 * smoothstep(0.3, 0.55, foamTex2)) * step(0.001, depth + 1.0));
  let soft = dnoise(in.xz * 0.35 + vec2f(t * 0.03, -t * 0.02)).a;
  let touch = (1.0 - smoothstep(0.0, 0.6, thick)) * smoothstep(0.35, 0.7, soft + 0.1 * sin(t * 2.0 + in.xz.x * 0.7));
  foam = max(foam, touch * 0.55);
  for (var i = 0; i < 16; i++) {
    let w = frame.wake[i];
    if (w.w <= 0.0) { continue; }
    let d = distance(in.xz, w.xy);
    let r = 1.6 + w.z * 1.4;
    let ring = (1.0 - smoothstep(r - 0.8, r, d)) * smoothstep(r - 3.0, r - 0.8, d * 1.0 + 0.6);
    let blob = 1.0 - smoothstep(0.0, r, d);
    let life = clamp(1.0 - w.z / 6.0, 0.0, 1.0);
    let wn = dnoise(in.xz * 0.21 + w.xy * 0.013).a * 0.6 + dnoise(in.xz * 0.05 - w.xy * 0.02).r * 0.4;
    foam = max(foam, max(ring, blob * 0.6) * life * w.w * smoothstep(0.32, 0.62, wn));
  }
  let bd = in.xz - frame.boat.xy;
  let fwd = vec2f(sin(frame.boat.z), cos(frame.boat.z));
  let side = vec2f(fwd.y, -fwd.x);
  let along = dot(bd, fwd);
  let across = abs(dot(bd, side));
  let hull = (1.0 - smoothstep(1.3, 2.2, across + max(abs(along) - 3.2, 0.0) * 1.2)) * smoothstep(0.3, 1.3, frame.boat.w);
  foam = max(foam, hull * step(0.4, vnoise(in.xz * 2.0 + vec2f(t * 3.0, 0.0))));
  let vis = sunShadow(in.wp, vec3f(0.0, 1.0, 0.0)) * cloudShadow(in.wp);
  let foamLight = frame.sunColor.rgb * frame.sunDir.w * (0.45 + 0.4 * vis) + frame.ambient.rgb * frame.ambient.w * 0.5;
  col = mix(col, vec3f(0.95, 0.98, 1.0) * foamLight * 0.62, clamp(foam, 0.0, 1.0));

  // sun glint: sharp core plus a soft glitter lobe, blocked by shadows and clouds
  let hv = normalize(frame.sunDir.xyz + v);
  let ndh = max(dot(n, hv), 0.0);
  let core = pow(ndh, 900.0) * 14.0;
  let lobe = pow(ndh, 90.0) * 0.6;
  col += frame.sunColor.rgb * (core + lobe) * frame.sunDir.w * vis * (1.0 - clamp(foam, 0.0, 1.0));
  let cell = floor(in.xz * 0.9);
  let sp = step(0.97, hash21(cell + floor(t * 2.0 + hash21(cell) * 4.0)));
  let dotShape = 1.0 - smoothstep(0.03, 0.09, length(fract(in.xz * 0.9) - 0.5));
  let sparkle = sp * dotShape * smoothstep(0.3, 0.7, ndl) * (1.0 - smoothstep(20.0, 120.0, camDist));
  col += sparkle * frame.waterDeep.w * frame.sunColor.rgb * 1.5 * vis;

  // rain ripples
  let rain = frame.mapInfo.w;
  if (rain > 0.01) {
    let rc = floor(in.xz * 0.8);
    let rf = fract(in.xz * 0.8) - 0.5 - (hash22(rc) - 0.5) * 0.4;
    let tt = fract(t * 0.9 + hash21(rc));
    let ring = (1.0 - smoothstep(0.0, 0.05, abs(length(rf) - tt * 0.45))) * (1.0 - tt);
    col += ring * rain * 0.16 * in.fade * max(frame.sunDir.w, 0.5) * (1.0 - smoothstep(8.0, 70.0, camDist));
  }
  // night: glowing plankton in the wave lines and foam
  let night = frame.mapInfo.z;
  if (night > 0.01) {
    let wl = worley(in.xz * 0.11 + n.xz * 1.5, t * 0.6);
    let lines = 1.0 - smoothstep(0.0, 0.08, wl.y - wl.x);
    let glowPatch = smoothstep(0.45, 0.8, vnoise(in.xz * 0.015 + vec2f(t * 0.01, 0.0)));
    col += (lines * 0.25 * glowPatch + clamp(foam, 0.0, 1.0) * 0.5) * night * vec3f(0.15, 0.95, 1.0) * 0.7 * in.fade;
  }
  // eldritch / lava tint of the water near hot spots
  col = mix(col, frame.lava.rgb * 0.6, clamp(frame.lava.w * 0.15 * shallowT, 0.0, 0.6));
  // neon realm: glowing grid on the water
  if (frame.fx.z > 0.01) {
    let g = 0.5 - abs(fract(in.xz / 12.0) - 0.5);
    let lw = 0.004 + camDist * 0.00016;
    let line = 1.0 - smoothstep(lw * 0.5, lw * 1.6, min(g.x, g.y));
    col += mix(vec3f(1.0, 0.2, 0.9), vec3f(0.1, 0.9, 1.0), 0.5 + 0.5 * sin(in.xz.x * 0.01 + t * 0.2)) * line * frame.fx.z * 1.5 * (1.0 - smoothstep(200.0, 1600.0, camDist));
  }
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

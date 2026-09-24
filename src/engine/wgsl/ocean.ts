// Ocean surface: Gerstner waves on a camera-following warped grid, detail normals from a tiling
// normal map, planar reflections, refraction with depth absorption, subsurface glow and foam.
import { COMMON } from './common';

export const OCEAN = /* wgsl */ `
${COMMON}
@group(1) @binding(0) var heightTex: texture_2d<f32>;
@group(1) @binding(1) var sceneTex: texture_2d<f32>;
@group(1) @binding(2) var reflTex: texture_2d<f32>;
@group(1) @binding(3) var nrmTex: texture_2d<f32>;
@group(1) @binding(4) var dispTex: texture_2d_array<f32>;
@group(1) @binding(5) var derivTex: texture_2d_array<f32>;
struct OceanParams { lengths: vec4f, wind: vec4f, band: vec4f, cut: vec4f };
@group(1) @binding(6) var<uniform> op: OceanParams;
@group(1) @binding(7) var fftSamp: sampler;

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
  // long swell (mirrored on the CPU); the wind sea comes from the FFT cascades
  addWave(&o, xz, vec4f(1.0, 0.35, 64.0, 0.45), sc, t);
  addWave(&o, xz, vec4f(0.4, 1.0, 33.0, 0.22), sc, t);
  addWave(&o, xz, vec4f(-0.8, 0.6, 19.0, 0.1), sc, t);
  o.n = normalize(vec3f(o.n.x, 1.0 + o.n.y, o.n.z));
  return o;
}

/** How much of each FFT cascade to show at a distance (fine ripples fade out first). */
fn cascadeFade(c: i32, dist: f32) -> f32 {
  let far = array<f32, 4>(3000.0, 1800.0, 700.0, 220.0);
  var f = far;
  return 1.0 - smoothstep(f[c] * 0.4, f[c], dist);
}
// foam weight per cascade: the mid cascades make the best-looking whitecaps
fn foamWeight(c: i32) -> f32 { return select(0.6, 1.0, c == 1 || c == 2); }
/** Displacement for a vertex whose neighbours are spacing metres away (mip picked so it doesn't alias). */
fn fftDispLod(xz: vec2f, dist: f32, spacing: f32) -> vec4f {
  var d = vec4f(0.0);
  for (var c = 0; c < 4; c++) {
    let k = cascadeFade(c, dist);
    if (k <= 0.0) { continue; }
    let L = op.lengths[c];
    let lod = log2(max(spacing * 256.0 / L, 1.0));
    d += textureSampleLevel(dispTex, fftSamp, xz / L, c, lod) * vec4f(k, k, k, k * foamWeight(c));
  }
  return d;
}
/** Screen-space filtered displacement (w = foam) and slopes for a pixel. */
struct FftSample { disp: vec4f, deriv: vec4f };
fn fftPixel(xz: vec2f, dist: f32, gx: vec2f, gy: vec2f) -> FftSample {
  var o: FftSample;
  o.disp = vec4f(0.0);
  o.deriv = vec4f(0.0);
  for (var c = 0; c < 4; c++) {
    let k = cascadeFade(c, dist);
    if (k <= 0.0) { continue; }
    let L = op.lengths[c];
    o.disp += textureSampleGrad(dispTex, fftSamp, xz / L, c, gx / L, gy / L) * vec4f(k, k, k, k * foamWeight(c));
    o.deriv += textureSampleGrad(derivTex, fftSamp, xz / L, c, gx / L, gy / L) * k;
  }
  return o;
}

/** Breakers rolling onto a beach: x height, y whitewater foam, z swash lift (m). */
fn shoreSurf(xz: vec2f, t: f32) -> vec3f {
  if (frame.shore.x <= 0.0) { return vec3f(0.0); }
  let hm = textureSampleLevel(heightTex, clampSamp, mapUV(xz), 0.0);
  let hC = hm.r;
  let ds = hm.g;
  if (ds > 75.0 || hC > 1.0 || hC < -12.0) { return vec3f(0.0); }
  let depth = max(-hC, 0.0);
  let ph = surfPhase(xz, t);
  let cd = 70.0 * (1.0 - ph);
  let x = ds - cd;
  // the wave grows as it feels the bottom, pitches over where it gets too shallow, then rolls on as whitewater
  let feel = smoothstep(11.0, 2.5, depth + max(x, 0.0) * 0.15);
  let A = mix(0.12, 0.55, feel) * frame.shore.x * clamp(frame.ground.w, 0.5, 1.6);
  let br = smoothstep(2.4, 1.1, depth * (1.0 - clamp(x, 0.0, 12.0) * 0.05));
  let face = select(exp(-x * x / 30.0), exp(-x * x / mix(2.5, 0.8, br)), x < 0.0);
  let shoal = smoothstep(75.0, 55.0, ds) * smoothstep(12.0, 6.0, depth) * smoothstep(0.0, 3.0, ds);
  let h = A * mix(1.0, 0.45, br * smoothstep(-1.0, 3.0, x)) * face * shoal;
  let lip = exp(-(x + 0.6) * (x + 0.6) / 3.5);
  let bore = smoothstep(-0.5, 0.8, x) * exp(-max(x, 0.0) / 12.0);
  let foam = br * (lip * 1.2 + bore * 0.8) * shoal;
  let lift = swashLift(ph) * 0.34 * frame.shore.y * smoothstep(-2.5, -0.3, hC);
  return vec3f(h, clamp(foam, 0.0, 1.0), lift);
}

/** Kelvin wake of a hull moving at src.w m/s (src = x, z, heading, speed): x height, y foam. */
fn kelvin(p: vec2f, src: vec4f, len: f32) -> vec2f {
  let U = abs(src.w);
  if (U < 0.8) { return vec2f(0.0); }
  let fwd = vec2f(sin(src.z), cos(src.z)) * sign(src.w);
  let d = p - src.xy;
  let along = dot(d, fwd);
  if (along > len * 0.8 || along < -(60.0 + U * 6.0)) { return vec2f(0.0); }
  let across = dot(d, vec2f(fwd.y, -fwd.x));
  let ac = abs(across);
  if (ac > 6.0 - along * 0.45) { return vec2f(0.0); }
  let b = max(-along - len * 0.35, 0.0);
  let r = ac / (b + len * 0.25);
  let lam = clamp(U * U * 0.03, 2.2, 9.0);
  let k = 6.2831853 / lam;
  let fade = exp(-b / (16.0 + U * 3.0));
  let amp = clamp(U * 0.012, 0.04, 0.3) * clamp(len / 7.0, 0.7, 1.6);
  // the V: diverging crests fanned along the 19.5 degree arms, transverse crests across the wedge
  let arm = exp(-pow((r - 0.354) / 0.085, 2.0));
  let inside = smoothstep(0.4, 0.28, r) * smoothstep(0.0, lam, b);
  let div = cos(k * 1.5 * (b * 0.57 + ac * 0.82));
  let trans = cos(k * b);
  var h = amp * fade * (arm * div * 0.9 + inside * trans * 0.35);
  // bow wave: water piles up around the stem and spills along the hull
  let hw = len * 0.23;
  let bowZone = smoothstep(len * 0.62, len * 0.3, along) * smoothstep(-len * 0.55, len * 0.1, along);
  let bow = bowZone * exp(-pow((ac - hw - max(len * 0.45 - along, 0.0) * 0.08) / 0.55, 2.0)) * smoothstep(1.0, 8.0, U);
  h += bow * amp * 1.4;
  // churned propeller wash down the middle, turbulent foam along the arms
  let wash = exp(-pow(across / (0.8 + b * 0.05), 2.0)) * exp(-b / (10.0 + U * 1.2)) * smoothstep(-len * 0.4, 0.0, -along - len * 0.3);
  let foam = clamp(arm * fade * smoothstep(0.0, 3.0, b) * (0.5 + 0.4 * div) + wash * 0.75 + bow * 0.7, 0.0, 1.0) * smoothstep(1.5, 6.0, U);
  return vec2f(h, foam);
}
/** Sum of the wakes of the player's boat, a cruising whale and a passing boat. */
fn wakes(p: vec2f) -> vec2f {
  var w = kelvin(p, frame.boat, 7.0);
  let a = kelvin(p, frame.whaleA, 16.0);
  let c = kelvin(p, frame.whaleB, 7.0);
  return vec2f(w.x + a.x + c.x, max(w.y, max(a.y, c.y)));
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
  // grid spacing here (the grid is denser near the camera), to pick the FFT mip level
  let spacing = P * R * pow(max(max(abs(g.x), abs(g.y)), 0.002), P - 1.0) * (2.0 / 512.0);
  let fd = fftDispLod(xz, dist, spacing).xyz * mix(0.3, 1.0, shoreDamp);
  let wk = wakes(xz).x * shoreDamp;
  let su = shoreSurf(xz, frame.camPos.w);
  var wp = vec3f(xz.x + w.d.x * fade + fd.x, w.d.y * fade + fd.y + wk + su.x + su.z, xz.y + w.d.z * fade + fd.z);
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
  let detailFade = 1.0 - smoothstep(20.0, 160.0, camDist);
  let dn = detailNormal(in.xz, t, frame.water.w * 0.25 * detailFade);
  let fft = fftPixel(in.xz, camDist, dpdx(in.xz), dpdy(in.xz));
  let sl = fft.deriv;
  let fdisp = fft.disp;
  var n = normalize(mix(vec3f(0.0, 1.0, 0.0), W.n, in.fade * 0.9 + 0.1));
  n = normalize(vec3f(n.x - sl.x / (1.0 + sl.z) - dn.x, n.y, n.z - sl.y / (1.0 + sl.w) - dn.y));
  // breakers: slope by finite differences near beaches
  let su0 = shoreSurf(in.xz, t);
  if (su0.x + su0.z != 0.0) {
    let e2 = 0.3;
    let sx = shoreSurf(in.xz + vec2f(e2, 0.0), t);
    let sz = shoreSurf(in.xz + vec2f(0.0, e2), t);
    n = normalize(vec3f(n.x - (sx.x + sx.z - su0.x - su0.z) / e2, n.y, n.z - (sz.x + sz.z - su0.x - su0.z) / e2));
  }
  // wakes: slope by finite differences, only where a hull is close
  let wk0 = wakes(in.xz);
  if (wk0.x != 0.0 || wk0.y > 0.0) {
    let e = 0.12;
    let gx = (wakes(in.xz + vec2f(e, 0.0)).x - wk0.x) / e;
    let gz = (wakes(in.xz + vec2f(0.0, e)).x - wk0.x) / e;
    n = normalize(vec3f(n.x - gx, n.y, n.z - gz));
  }
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
    return vec4f(applyFog(c, in.wp), camDist);
  }

  // refraction: what lies under the surface, absorbed by the water it travels through
  let distort = n.xz * (0.035 / (1.0 + camDist * 0.015));
  var sc = textureSampleLevel(sceneTex, clampSamp, suv + distort, 0.0);
  if (abs(sc.a) < camDist) { sc = textureSampleLevel(sceneTex, clampSamp, suv, 0.0); }
  let thick = max(abs(sc.a) - camDist, 0.0);
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
  let crestH = clamp((W.d.y / sc2 + fdisp.y * 0.7) * 0.8 + 0.35, 0.0, 1.5);
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
  // whitecaps where the FFT surface folds over (persisting and fading), swell crests, wind streaks
  let fold = clamp(fdisp.w, 0.0, 1.0) * frame.water.z;
  var foam = fold * smoothstep(0.2, 0.55, foamTex * 0.7 + dnoise(in.xz * 0.35).a * 0.5);
  foam = max(foam, smoothstep(0.55, 0.95, W.crest * 0.55 + W.d.y / sc2 * 0.35) * in.fade * smoothstep(0.35, 0.6, foamTex) * frame.water.z * 0.6);
  let wd = normalize(op.wind.xy);
  let wAlong = dot(in.xz, wd);
  let wAcross = dot(in.xz, vec2f(-wd.y, wd.x));
  // long lacy foam lines along the wind, only in a stiff breeze
  let streak = smoothstep(0.5, 0.95, dnoise(vec2f(wAlong * 0.003, wAcross * 0.045) + vec2f(t * 0.002, 0.0)).a)
    * smoothstep(0.4, 0.75, dnoise(vec2f(wAlong * 0.015, wAcross * 0.015)).r) * smoothstep(0.3, 0.6, foamTex2);
  foam = max(foam, streak * clamp((op.wind.z - 10.0) / 6.0, 0.0, 1.0) * 0.4 * (1.0 - smoothstep(150.0, 700.0, camDist)));
  let depth = max(-h, 0.0);
  let shore = 1.0 - smoothstep(0.0, 1.1, depth + 0.25 * sin(t * 1.3 + (in.xz.x + in.xz.y) * 0.07));
  foam = max(foam, shore * 0.8 * smoothstep(0.25, 0.5, foamTex2) * step(0.001, depth + 1.0));
  // whitewater: bright at the spilling lip, breaking up into lace behind it
  let wlace = dnoise(in.xz * 0.28 + vec2f(t * 0.04, -t * 0.03)).a * 0.55 + dnoise(in.xz * 0.9 + vec2f(-t * 0.06, t * 0.05)).a * 0.45;
  foam = max(foam, su0.y * smoothstep(0.9, 0.42, wlace + (1.0 - su0.y) * 0.5));
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
    foam = max(foam, max(ring * 0.5, blob * 0.3) * life * life * w.w * smoothstep(0.4, 0.7, wn));
  }
  let bd = in.xz - frame.boat.xy;
  let fwd = vec2f(sin(frame.boat.z), cos(frame.boat.z));
  let side = vec2f(fwd.y, -fwd.x);
  let along = dot(bd, fwd);
  let across = abs(dot(bd, side));
  let hull = (1.0 - smoothstep(1.3, 2.2, across + max(abs(along) - 3.2, 0.0) * 1.2)) * smoothstep(0.3, 1.3, frame.boat.w);
  foam = max(foam, hull * step(0.4, vnoise(in.xz * 2.0 + vec2f(t * 3.0, 0.0))));
  let lace = dnoise(in.xz * 0.45 + vec2f(t * 0.05, 0.0)).a * 0.6 + dnoise(in.xz * 1.3 - vec2f(0.0, t * 0.08)).a * 0.4;
  foam = max(foam, wk0.y * smoothstep(0.55, 0.25, lace + (1.0 - wk0.y) * 0.5));
  let vis = sunShadow(in.wp, vec3f(0.0, 1.0, 0.0)) * cloudShadow(in.wp);
  let foamLight = frame.sunColor.rgb * frame.sunDir.w * (0.45 + 0.4 * vis) + frame.ambient.rgb * frame.ambient.w * 0.5;
  col = mix(col, vec3f(0.95, 0.98, 1.0) * foamLight * 0.62, clamp(foam, 0.0, 1.0));

  // sun glint: sharp core plus a soft glitter lobe, blocked by shadows and clouds
  let hv = normalize(frame.sunDir.xyz + v);
  let ndh = max(dot(n, hv), 0.0);
  let core = pow(ndh, 900.0) * 14.0;
  let lobe = pow(ndh, 90.0) * 0.6;
  col += frame.sunColor.rgb * (core + lobe) * frame.sunDir.w * vis * (1.0 - clamp(foam, 0.0, 1.0));
  // lamps glinting and pooling on the water
  let lc = u32(lights.count.x);
  for (var li = 0u; li < lc; li++) {
    let pl = lights.items[li];
    let d = pl.pos.xyz - in.wp;
    let dist = length(d);
    let reach = pl.pos.w * 3.0;
    if (dist > reach) { continue; }
    let ld = d / max(dist, 0.001);
    let hv2 = normalize(ld + v);
    let nh = max(dot(n, hv2), 0.0);
    let gl = pow(nh, 160.0) * 3.0 + pow(nh, 20.0) * 0.12;
    col += pl.col.rgb * pl.col.w * (gl * pow(1.0 - dist / reach, 2.0) + pow(max(1.0 - dist / pl.pos.w, 0.0), 2.0) * 0.1);
  }
  let cell = floor(in.xz * 0.9);
  let sp = step(0.97, hash21(cell + floor(t * 2.0 + hash21(cell) * 4.0)));
  let dotShape = 1.0 - smoothstep(0.03, 0.09, length(fract(in.xz * 0.9) - 0.5));
  let sparkle = sp * dotShape * smoothstep(0.3, 0.7, ndl) * (1.0 - smoothstep(20.0, 120.0, camDist));
  col += sparkle * frame.waterDeep.w * frame.sunColor.rgb * 1.5 * vis;

  // rain: small drop rings popping all over the surface
  let rain = frame.mapInfo.w;
  if (rain > 0.01 && camDist < 45.0) {
    var rings = 0.0;
    for (var layer = 0; layer < 2; layer++) {
      let rp = in.xz * (2.6 + f32(layer) * 1.4) + f32(layer) * 17.3;
      let rc = floor(rp);
      let rf = fract(rp) - 0.5 - (hash22(rc) - 0.5) * 0.5;
      let tt = fract(t * 1.4 + hash21(rc + f32(layer) * 3.1));
      rings += (1.0 - smoothstep(0.0, 0.05, abs(length(rf) - tt * 0.42))) * (1.0 - tt) * step(hash21(rc * 1.7 + 0.3), rain);
    }
    col += rings * rain * 0.09 * in.fade * max(frame.sunDir.w, 0.5) * (1.0 - smoothstep(6.0, 45.0, camDist));
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
  return vec4f(applyFog(col, in.wp), camDist);
}
`;

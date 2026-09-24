// Screen-space passes that run between the scene and post: ground-truth ambient occlusion (GTAO)
// with screen-space contact shadows, a depth-aware blur, the temporal resolve (anti-aliasing and
// upscaling to the output resolution) and the auto exposure meter.
import { COMMON } from './common';

const SCREEN_COMMON = /* wgsl */ `
/** World position of a pixel from its view distance (scene alpha holds the signed distance). */
fn worldAt(uv: vec2f, dist: f32) -> vec3f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let p = frame.invViewProj * vec4f(ndc, 1.0, 1.0);
  let dir = normalize(p.xyz / p.w - frame.camPos.xyz);
  return frame.camPos.xyz + dir * dist;
}
`;

/** Half resolution GTAO (2 slices x 4 steps per side, rotated per pixel and frame) plus contact shadows. */
export const GTAO = /* wgsl */ `
${COMMON}
${SCREEN_COMMON}
@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> FSVOut { return fullscreen(i); }

fn distAt(ip: vec2i) -> f32 {
  let s = vec2i(textureDimensions(sceneTex)) - 1;
  return abs(textureLoad(sceneTex, clamp(ip, vec2i(0), s), 0).a);
}
fn posAt(ip: vec2i) -> vec3f {
  let res = vec2f(textureDimensions(sceneTex));
  return worldAt((vec2f(ip) + 0.5) / res, distAt(ip));
}

@fragment fn fs(in: FSVOut) -> @location(0) vec4f {
  let res = vec2f(textureDimensions(sceneTex));
  let ip = vec2i(in.pos.xy) * 2;
  let d = distAt(ip);
  if (d > 160.0 || frame.ssao.x <= 0.0) { return vec4f(1.0, 1.0, 0.0, 1.0); }
  let P = posAt(ip);
  // normal from the flatter of the two neighbours on each axis (keeps edges clean)
  let px = posAt(ip + vec2i(1, 0)) - P;
  let nx = P - posAt(ip - vec2i(1, 0));
  let py = posAt(ip + vec2i(0, 1)) - P;
  let ny = P - posAt(ip - vec2i(0, 1));
  let dx = select(nx, px, dot(px, px) < dot(nx, nx));
  let dy = select(ny, py, dot(py, py) < dot(ny, ny));
  var N = normalize(cross(dy, dx));
  let V = normalize(frame.camPos.xyz - P);
  if (dot(N, V) < 0.0) { N = -N; }

  // screen radius of a 1.4 m world sphere
  let focal = frame.taa.w * res.y * 0.5;
  let radiusPx = clamp(1.4 * focal / d, 3.0, 90.0);
  let frameNoise = fract(frame.camPos.w * 7.123);
  let noise = fract(52.9829189 * fract(dot(in.pos.xy, vec2f(0.06711056, 0.00583715))) + frameNoise);
  let noise2 = fract(noise * 1.618 + 0.37);
  // camera basis to turn screen directions into world directions
  let right = normalize(vec3f(frame.view[0][0], frame.view[1][0], frame.view[2][0]));
  let up = normalize(vec3f(frame.view[0][1], frame.view[1][1], frame.view[2][1]));
  var vis = 0.0;
  // with temporal AA the slice rotates every frame, so one slice per pixel is enough
  let SLICES = select(2, 1, frame.taa.z > 0.5);
  let STEPS = 4;
  for (var sl = 0; sl < SLICES; sl++) {
    let phi = (f32(sl) + noise) * PI / f32(SLICES);
    let omega = vec2f(cos(phi), sin(phi));
    let dirW = normalize(right * omega.x + up * omega.y);
    let orthoDir = dirW - dot(dirW, V) * V;
    let axis = normalize(cross(dirW, V));
    let projN = N - axis * dot(N, axis);
    let projLen = length(projN);
    let sgnN = sign(dot(orthoDir, projN));
    let cosN = clamp(dot(projN, V) / max(projLen, 1e-4), 0.0, 1.0);
    let n = sgnN * acos(cosN);
    var hc = array<f32, 2>(-1.0, -1.0);
    for (var side = 0; side < 2; side++) {
      let sgn = f32(side) * 2.0 - 1.0;
      var best = cos(n + sgn * PI * 0.5);
      for (var st = 0; st < STEPS; st++) {
        let t = (f32(st) + noise2) / f32(STEPS);
        let off = omega * vec2f(1.0, -1.0) * sgn * radiusPx * t * t;
        let S = posAt(ip + vec2i(off));
        let delta = S - P;
        let len = length(delta);
        let shc = dot(delta / max(len, 1e-4), V);
        let w = clamp(1.0 - len * len / (1.4 * 1.4 * 2.0), 0.0, 1.0);
        best = max(best, mix(cos(n + sgn * PI * 0.5), shc, w));
      }
      hc[side] = best;
    }
    var h0 = -acos(clamp(hc[0], -1.0, 1.0));
    var h1 = acos(clamp(hc[1], -1.0, 1.0));
    h0 = n + max(h0 - n, -PI * 0.5);
    h1 = n + min(h1 - n, PI * 0.5);
    let sinN = sin(n);
    let a0 = (cosN + 2.0 * h0 * sinN - cos(2.0 * h0 - n)) * 0.25;
    let a1 = (cosN + 2.0 * h1 * sinN - cos(2.0 * h1 - n)) * 0.25;
    vis += projLen * (a0 + a1);
  }
  vis /= f32(SLICES);
  let ao = mix(1.0, clamp(vis, 0.0, 1.0), frame.ssao.x * (1.0 - smoothstep(90.0, 160.0, d)));

  // contact shadows: a short march towards the sun through the depth buffer
  var contact = 1.0;
  let L = frame.sunDir.xyz;
  if (frame.ssao.y > 0.0 && d < 45.0 && dot(N, L) > 0.05 && frame.sunDir.w > 0.1) {
    let len = 0.6 + d * 0.012;
    var occ = 0.0;
    for (var k = 1; k <= 10; k++) {
      let t = (f32(k) - 0.5 + noise) / 10.0;
      let Q = P + N * 0.03 + L * len * t * t;
      let c = frame.viewProj * vec4f(Q, 1.0);
      let quv = c.xy / c.w * vec2f(0.5, -0.5) + 0.5;
      if (any(quv < vec2f(0.0)) || any(quv > vec2f(1.0))) { break; }
      let sd = distAt(vec2i(quv * res));
      let qd = distance(Q, frame.camPos.xyz);
      let depthDiff = qd - sd;
      if (depthDiff > 0.02 && depthDiff < 0.35 + d * 0.004) { occ = 1.0 - t * 0.5; break; }
    }
    contact = 1.0 - occ * frame.ssao.y * (1.0 - smoothstep(25.0, 45.0, d));
  }
  return vec4f(ao, contact, 0.0, 1.0);
}
`;

/** 4x4 depth-aware blur of the half resolution occlusion. */
export const GTAO_BLUR = /* wgsl */ `
${COMMON}
@group(1) @binding(0) var aoRaw: texture_2d<f32>;
@group(1) @binding(1) var sceneTex: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> FSVOut { return fullscreen(i); }
@fragment fn fs(in: FSVOut) -> @location(0) vec4f {
  let ip = vec2i(in.pos.xy);
  let s = vec2i(textureDimensions(aoRaw)) - 1;
  let sf = vec2i(textureDimensions(sceneTex)) - 1;
  let d0 = abs(textureLoad(sceneTex, clamp(ip * 2, vec2i(0), sf), 0).a);
  var acc = vec2f(0.0);
  var wsum = 0.0;
  for (var y = -2; y < 2; y++) {
    for (var x = -2; x < 2; x++) {
      let q = clamp(ip + vec2i(x, y), vec2i(0), s);
      let dq = abs(textureLoad(sceneTex, clamp(q * 2, vec2i(0), sf), 0).a);
      let w = exp(-abs(dq - d0) / (0.05 * d0 + 0.1));
      acc += textureLoad(aoRaw, q, 0).rg * w;
      wsum += w;
    }
  }
  return vec4f(acc / max(wsum, 1e-4), 0.0, 1.0);
}
`;

/**
 * Temporal resolve at the output resolution: applies the occlusion to surfaces seen directly, then
 * blends with the reprojected history (clipped to the current neighbourhood). Moving surfaces
 * (negative distance) keep less history. With temporal AA off it only upsamples.
 */
export const RESOLVE = /* wgsl */ `
${COMMON}
${SCREEN_COMMON}
@group(1) @binding(0) var curTex: texture_2d<f32>;
@group(1) @binding(1) var histTex: texture_2d<f32>;
@group(1) @binding(2) var aoTex: texture_2d<f32>;
@group(1) @binding(3) var sceneTex: texture_2d<f32>;
@group(1) @binding(4) var linSamp: sampler;
@vertex fn vs(@builtin(vertex_index) i: u32) -> FSVOut { return fullscreen(i); }

fn toYCoCg(c: vec3f) -> vec3f {
  return vec3f(c.r * 0.25 + c.g * 0.5 + c.b * 0.25, c.r * 0.5 - c.b * 0.5, -c.r * 0.25 + c.g * 0.5 - c.b * 0.25);
}
fn fromYCoCg(c: vec3f) -> vec3f { return vec3f(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
/** Tone-mapped weight so bright sparkles don't dominate the blend. */
fn tm(c: vec3f) -> vec3f { return c / (1.0 + luma(c)); }
fn itm(c: vec3f) -> vec3f { return c / max(1.0 - luma(c), 1e-3); }

/** Occlusion for the surface seen at a render texel. */
fn occlusion(ip: vec2i, dist: f32, uv: vec2f) -> f32 {
  let opaque = abs(textureLoad(sceneTex, ip, 0).a);
  let direct = 1.0 - smoothstep(0.02, 0.06, abs(abs(dist) - opaque) / max(opaque, 1.0));
  let a = textureSampleLevel(aoTex, linSamp, uv, 0.0).rg;
  return mix(1.0, a.x * a.y, direct);
}

fn catmull(uv: vec2f, size: vec2f) -> vec3f {
  // 5-tap bicubic (Catmull-Rom) history fetch: sharper than bilinear
  let pos = uv * size;
  let c = floor(pos - 0.5) + 0.5;
  let f = pos - c;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let tc12 = (c + w2 / w12) / size;
  let tc0 = (c - 1.0) / size;
  let tc3 = (c + 2.0) / size;
  var r = textureSampleLevel(histTex, linSamp, vec2f(tc12.x, tc0.y), 0.0).rgb * (w12.x * w0.y);
  r += textureSampleLevel(histTex, linSamp, vec2f(tc0.x, tc12.y), 0.0).rgb * (w0.x * w12.y);
  r += textureSampleLevel(histTex, linSamp, tc12, 0.0).rgb * (w12.x * w12.y);
  r += textureSampleLevel(histTex, linSamp, vec2f(tc3.x, tc12.y), 0.0).rgb * (w3.x * w12.y);
  r += textureSampleLevel(histTex, linSamp, vec2f(tc12.x, tc3.y), 0.0).rgb * (w12.x * w3.y);
  let wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / wsum, vec3f(0.0));
}

@fragment fn fs(in: FSVOut) -> @location(0) vec4f {
  let res = vec2f(textureDimensions(curTex));
  let uv = in.uv;
  let ip = clamp(vec2i(uv * res), vec2i(0), vec2i(res) - 1);
  let center = textureLoad(curTex, ip, 0);
  let dist = center.a;
  let cur = textureSampleLevel(curTex, linSamp, uv, 0.0).rgb * occlusion(ip, dist, uv);
  if (frame.debug.x > 0.5) {
    let a = textureSampleLevel(aoTex, linSamp, uv, 0.0).rg;
    return vec4f(vec3f(a.x, a.x * a.y, a.x * a.y), dist);
  }
  if (frame.taa.z < 0.5) { return vec4f(cur, dist); }

  // neighbourhood of the current frame (in render texels)
  var mn = vec3f(1e9);
  var mx = vec3f(-1e9);
  var m1 = vec3f(0.0);
  var m2 = vec3f(0.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let q = clamp(ip + vec2i(x, y), vec2i(0), vec2i(res) - 1);
      let c = toYCoCg(tm(textureLoad(curTex, q, 0).rgb * occlusion(q, dist, uv)));
      mn = min(mn, c);
      mx = max(mx, c);
      m1 += c;
      m2 += c * c;
    }
  }
  // variance clipping box, tighter than min/max
  let mean = m1 / 9.0;
  let sd = sqrt(max(m2 / 9.0 - mean * mean, vec3f(0.0)));
  let moving = dist < 0.0;
  let gamma = select(1.25, 0.9, moving);
  let bmin = max(mn, mean - sd * gamma);
  let bmax = min(mx, mean + sd * gamma);

  let P = worldAt(uv, abs(dist));
  let pc = frame.prevViewProj * vec4f(P, 1.0);
  let puv = pc.xy / pc.w * vec2f(0.5, -0.5) + 0.5;
  let offscreen = any(puv < vec2f(0.0)) || any(puv > vec2f(1.0)) || pc.w <= 0.0;
  let hsize = vec2f(textureDimensions(histTex));
  var hist = toYCoCg(tm(catmull(puv, hsize)));
  // clip towards the box centre
  let cc = (bmin + bmax) * 0.5;
  let ext = max((bmax - bmin) * 0.5, vec3f(1e-4));
  let rel = (hist - cc) / ext;
  let k = max(abs(rel.x), max(abs(rel.y), abs(rel.z)));
  if (k > 1.0) { hist = cc + (hist - cc) / k; }
  var feedback = select(0.9, 0.7, moving);
  // less history when the image moves a lot (reduces smearing)
  let motion = length((puv - uv) * hsize);
  feedback *= 1.0 - smoothstep(8.0, 40.0, motion) * 0.3;
  if (offscreen) { feedback = 0.0; }
  let outC = mix(toYCoCg(tm(cur)), hist, feedback);
  return vec4f(itm(fromYCoCg(outC)), dist);
}
`;

/** Measures the scene's average log luminance and eases the exposure towards it. */
export const EXPOSURE = /* wgsl */ `
struct ExpU { dt: f32, speed: f32, minE: f32, maxE: f32, key: f32, p0: f32, p1: f32, p2: f32 };
@group(0) @binding(0) var<uniform> eu: ExpU;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> state: array<f32, 4>;
var<workgroup> acc: array<f32, 256>;
@compute @workgroup_size(16, 16, 1)
fn main(@builtin(local_invocation_id) lid: vec3u, @builtin(local_invocation_index) li: u32) {
  let size = vec2f(textureDimensions(src));
  var s = 0.0;
  // 4 samples per thread on a 32x32 grid, centre weighted
  for (var k = 0u; k < 4u; k++) {
    let g = vec2f(f32(lid.x * 2u + (k & 1u)), f32(lid.y * 2u + (k >> 1u))) + 0.5;
    let uv = g / 32.0;
    let c = textureLoad(src, vec2i(uv * size), 0).rgb;
    let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
    let w = 1.0 - 0.6 * length(uv - 0.5);
    s += log2(max(l, 1e-4)) * w;
  }
  acc[li] = s;
  workgroupBarrier();
  for (var st = 128u; st > 0u; st >>= 1u) {
    if (li < st) { acc[li] += acc[li + st]; }
    workgroupBarrier();
  }
  if (li == 0u) {
    let avg = exp2(acc[0] / (1024.0 * 0.78));
    // partial adaptation towards a key luminance, faster when it gets brighter
    let goal = clamp(pow(eu.key / max(avg, 1e-4), 0.65), eu.minE, eu.maxE);
    var cur = state[0];
    if (cur <= 0.0 || cur != cur) { cur = goal; }
    let rate = select(eu.speed, eu.speed * 2.2, goal < cur);
    cur = mix(cur, goal, 1.0 - exp(-eu.dt * rate));
    state[0] = cur;
    state[1] = avg;
  }
}
`;

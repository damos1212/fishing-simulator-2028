// Post-processing: bloom chain, god rays, tonemapping, grading and screen effects.

export const POST = /* wgsl */ `
struct FSVOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
fn fullscreen(i: u32) -> FSVOut {
  var o: FSVOut;
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
struct PostU { a: vec4f, flash: vec4f, fade: vec4f, b: vec4f, texel: vec4f, sun: vec4f, grade: vec4f };
@group(0) @binding(0) var<uniform> pu: PostU;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var raysTex: texture_2d<f32>;

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

// Screen-space god rays: march from each pixel towards the sun, gathering bright open sky.
@fragment fn rays(in: FSVOut) -> @location(0) vec4f {
  let sunUV = pu.sun.xy;
  var uv = in.uv;
  let N = 40;
  let delta = (uv - sunUV) / f32(N) * 0.92;
  var acc = vec3f(0.0);
  var decay = 1.0;
  let jit = fract(sin(dot(in.pos.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  uv -= delta * jit;
  for (var i = 0; i < N; i++) {
    uv -= delta;
    let s = textureSampleLevel(src, samp, clamp(uv, vec2f(0.001), vec2f(0.999)), 0.0);
    let sky = smoothstep(30000.0, 50000.0, s.a);
    acc += min(s.rgb, vec3f(5.0)) * sky * decay;
    decay *= 0.955;
  }
  return vec4f(acc / f32(N) * pu.sun.z, 1.0);
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
  // rift warp: swirl the image around the center and zoom it outwards
  let warp = pu.grade.w;
  if (warp > 0.001) {
    let d = uv - 0.5;
    let r = length(d);
    let ang = warp * 2.6 * (1.0 - smoothstep(0.0, 0.75, r));
    let cs = cos(ang);
    let sn = sin(ang);
    uv = 0.5 + vec2f(d.x * cs - d.y * sn, d.x * sn + d.y * cs) * (1.0 - warp * 0.35 * r);
  }
  let ab = pu.b.z + warp * 0.02;
  var col: vec3f;
  if (ab > 0.0001) {
    let dir = (uv - 0.5) * ab;
    col = vec3f(textureSample(src, samp, uv + dir).r, textureSample(src, samp, uv).g, textureSample(src, samp, uv - dir).b);
  } else {
    col = textureSample(src, samp, uv).rgb;
  }
  col += textureSample(bloomTex, samp, uv).rgb * pu.a.z;
  col += textureSample(raysTex, samp, uv).rgb * pu.texel.z;
  col *= pu.a.w;
  col = neutral(col);
  // gentle filmic contrast and a warm/cool split tone
  let sc = col * col * (3.0 - 2.0 * col);
  col = mix(col, sc, pu.grade.x);
  let lw = lum(col);
  col += (vec3f(0.04, 0.015, -0.02) * lw - vec3f(0.01, -0.005, -0.02) * (1.0 - lw)) * pu.grade.y;
  let l = lum(col);
  col = max(mix(vec3f(l), col, pu.b.y), vec3f(0.0));
  let vd = length((in.uv - 0.5) * vec2f(1.0, 0.8));
  col *= 1.0 - pu.b.x * smoothstep(0.35, 0.85, vd);
  if (warp > 0.001) {
    let rr = length(in.uv - 0.5);
    let streak = fract(atan2(in.uv.y - 0.5, in.uv.x - 0.5) * 7.0 + rr * 6.0 - t * 3.0);
    col += vec3f(0.8, 0.4, 1.2) * smoothstep(0.85, 1.0, streak) * warp * smoothstep(0.1, 0.6, rr) * 0.8;
    col = mix(col, col * vec3f(1.1, 0.8, 1.3), warp * 0.5);
  }
  col = mix(col, pu.flash.rgb, pu.flash.a);
  col = mix(col, pu.fade.rgb, pu.fade.a);
  let grain = (fract(sin(dot(in.uv * 1000.0 + vec2f(t * 13.1, t * 7.7), vec2f(12.9898, 78.233))) * 43758.5453) - 0.5) * pu.grade.z;
  return vec4f(toSRGB(clamp(col + grain, vec3f(0.0), vec3f(1.0))), 1.0);
}
`;

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
struct PostU {
  a: vec4f,      // time, underwater, bloom, exposure
  flash: vec4f,
  fade: vec4f,
  b: vec4f,      // vignette, saturation, aberration, bloom threshold
  texel: vec4f,  // texel w, h, rays, unused
  sun: vec4f,    // sun uv, visibility, flare
  grade: vec4f,  // contrast, warmth, grain, warp
  wl: vec4f,     // waterline across the near plane: s = a x + b y + c (m, NDC), mode (1 camera above, -1 below)
  lens: vec4f,   // droplets, seconds since surfacing, motion blur, auto exposure (0/1)
  uwc: vec4f,    // underwater tint, sharpening
  invVP: mat4x4f,
  prevVP: mat4x4f,
  cam: vec4f,
};
@group(0) @binding(0) var<uniform> pu: PostU;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;
@group(0) @binding(4) var raysTex: texture_2d<f32>;
@group(0) @binding(5) var volTex: texture_2d<f32>;
@group(0) @binding(6) var<storage, read> expo: array<f32, 4>;

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
    let sky = smoothstep(30000.0, 50000.0, abs(s.a));
    acc += min(s.rgb, vec3f(5.0)) * sky * decay;
    decay *= 0.955;
  }
  return vec4f(acc / f32(N), 1.0);
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

fn hash2(p: vec2f) -> vec2f {
  let n = vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)));
  return fract(sin(n) * 43758.5453);
}
/** Water drops on the lens after surfacing: refracting blobs that slide down and dry up. */
fn droplets(uv: vec2f, amount: f32, t: f32, aspect: f32) -> vec3f {
  var off = vec2f(0.0);
  var edge = 0.0;
  for (var layer = 0; layer < 2; layer++) {
    let sc = select(9.0, 15.0, layer == 1);
    let p = vec2f(uv.x * aspect, uv.y) * sc + f32(layer) * 3.7;
    let h = hash2(floor(p));
    let slide = t * (0.15 + h.y * 0.5) * step(0.55, h.x);
    let q = vec2f(uv.x * aspect, uv.y - slide / sc) * sc + f32(layer) * 3.7;
    let h2 = hash2(floor(q));
    let f = fract(q) - 0.5 - (h2 - 0.5) * 0.6;
    let r = (0.12 + h2.x * 0.2) * amount;
    let d = length(f * vec2f(1.0, 0.85));
    let inside = 1.0 - smoothstep(r * 0.85, r, d);
    let present = step(0.62, h2.y);
    off += -f / max(r, 1e-3) * inside * present * 0.012;
    edge += smoothstep(r * 0.6, r, d) * inside * present;
  }
  return vec3f(off, edge);
}

@fragment fn composite(in: FSVOut) -> @location(0) vec4f {
  let t = pu.a.x;
  let uw = pu.a.y;
  var uv = in.uv;
  uv += vec2f(sin(uv.y * 22.0 + t * 2.1), cos(uv.x * 19.0 + t * 1.7)) * 0.0022 * uw;
  let aspect = pu.texel.y / pu.texel.x;
  // lens droplets refract what is behind them
  var dropEdge = 0.0;
  if (pu.lens.x > 0.01) {
    let dr = droplets(in.uv, pu.lens.x, pu.lens.y, aspect);
    uv += dr.xy;
    dropEdge = dr.z;
  }
  // the waterline crossing the lens when the camera is half in the sea
  let ndc = vec2f(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);
  var split = 0.0;
  var meniscus = 0.0;
  if (abs(pu.wl.w) > 0.5) {
    let wob = sin(ndc.x * 5.0 + t * 2.3) * 0.012 + sin(ndc.x * 13.0 - t * 3.1) * 0.005;
    let sd = pu.wl.x * ndc.x + pu.wl.y * ndc.y + pu.wl.z + wob;
    // the part of the lens on the other side of the surface from the camera
    split = select(smoothstep(0.004, -0.004, sd), smoothstep(-0.004, 0.004, sd), pu.wl.w < 0.0);
    meniscus = exp(-sd * sd / 0.00004);
    uv += vec2f(0.0, sin(ndc.x * 30.0 + t * 4.0) * 0.004) * split;
  }
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
  // contrast adaptive sharpening (restores detail after temporal filtering / upscaling)
  if (pu.uwc.w > 0.001) {
    let d = pu.texel.xy;
    let n0 = textureSample(src, samp, uv + vec2f(0.0, -d.y)).rgb;
    let n1 = textureSample(src, samp, uv + vec2f(-d.x, 0.0)).rgb;
    let n2 = textureSample(src, samp, uv + vec2f(d.x, 0.0)).rgb;
    let n3 = textureSample(src, samp, uv + vec2f(0.0, d.y)).rgb;
    let mn = min(col, min(min(n0, n1), min(n2, n3)));
    let mx = max(col, max(max(n0, n1), max(n2, n3)));
    let amp = sqrt(clamp(min(mn, vec3f(1.0) - min(mx, vec3f(1.0))) / max(mx, vec3f(1e-4)), vec3f(0.0), vec3f(1.0)));
    let w = -amp * mix(0.125, 0.2, pu.uwc.w);
    col = max((col + (n0 + n1 + n2 + n3) * w) / (1.0 + 4.0 * w), vec3f(0.0));
  }
  // camera motion blur along the reprojected screen velocity (moving surfaces like the boat stay crisp)
  if (pu.lens.z > 0.001) {
    let dist = textureSampleLevel(src, samp, uv, 0.0).a;
    if (dist > 0.0) {
      let pn = pu.invVP * vec4f(ndc, 1.0, 1.0);
      let dir = normalize(pn.xyz / pn.w - pu.cam.xyz);
      let P = pu.cam.xyz + dir * min(dist, 5000.0);
      let pc = pu.prevVP * vec4f(P, 1.0);
      let puv = pc.xy / pc.w * vec2f(0.5, -0.5) + 0.5;
      var vel = (uv - puv) * pu.lens.z;
      let vl = length(vel);
      if (vl > 0.035) { vel *= 0.035 / vl; }
      if (vl / pu.texel.x > 1.5) {
        var acc = col;
        var wsum = 1.0;
        for (var k = 1; k <= 8; k++) {
          let o = vel * (f32(k) / 8.0 - 0.5);
          let s2 = textureSampleLevel(src, samp, uv + o, 0.0);
          let w = step(0.0, s2.a);
          acc += s2.rgb * w;
          wsum += w;
        }
        col = acc / wsum;
      }
    }
  }
  // the other side of the waterline: murky blue-green below, a bright blur above
  if (split > 0.001) {
    let d = pu.texel.xy * 3.0;
    var blur = col * 0.4;
    blur += textureSampleLevel(src, samp, uv + vec2f(d.x, d.y), 0.0).rgb * 0.15;
    blur += textureSampleLevel(src, samp, uv + vec2f(-d.x, d.y), 0.0).rgb * 0.15;
    blur += textureSampleLevel(src, samp, uv + vec2f(d.x, -d.y), 0.0).rgb * 0.15;
    blur += textureSampleLevel(src, samp, uv + vec2f(-d.x, -d.y), 0.0).rgb * 0.15;
    let below = mix(blur, pu.uwc.rgb * 1.6, 0.55) * vec3f(0.75, 0.95, 1.0);
    let above = blur * 1.35 + vec3f(0.08, 0.1, 0.12);
    col = mix(col, select(below, above, pu.wl.w < 0.0), split);
  }
  col = mix(col, col * 0.55 + vec3f(0.35, 0.45, 0.5), meniscus * 0.6);
  col *= 1.0 - dropEdge * 0.25;
  col += textureSample(bloomTex, samp, uv).rgb * pu.a.z;
  col += textureSample(raysTex, samp, uv).rgb * pu.texel.z;
  col += textureSample(volTex, samp, uv).rgb;
  // lens flare: ghosts mirrored through the screen center, a halo and an anamorphic streak
  if (pu.sun.z * pu.sun.w > 0.01) {
    let sp = pu.sun.xy;
    let aspect = pu.texel.y / pu.texel.x;
    let occ = smoothstep(1.5, 5.0, lum(textureSampleLevel(bloomTex, samp, sp, 0.0).rgb) * 4.0);
    let k = pu.sun.z * pu.sun.w * occ;
    let toC = vec2f(0.5) - sp;
    var fl = vec3f(0.0);
    var offs = array<f32, 6>(0.45, 0.72, 1.1, 1.35, 1.7, 2.2);
    var rads = array<f32, 6>(0.035, 0.06, 0.02, 0.09, 0.05, 0.12);
    for (var gi = 0; gi < 6; gi++) {
      let fk = f32(gi);
      let off = offs[gi];
      let rad = rads[gi];
      let gp = sp + toC * off;
      let d = length((uv - gp) * vec2f(aspect, 1.0));
      let gcol = clamp(abs(fract(fk * 0.17 + 0.05 + vec3f(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));
      fl += gcol * smoothstep(rad, rad * 0.55, d) * 0.08;
    }
    let dsun = (uv - sp) * vec2f(aspect, 1.0);
    let ring = smoothstep(0.02, 0.0, abs(length(dsun) - 0.22)) * 0.05;
    let streak = exp(-abs(dsun.y) * 90.0) * exp(-abs(dsun.x) * 2.5) * 0.35;
    fl += vec3f(1.0, 0.85, 0.7) * ring + vec3f(0.7, 0.8, 1.0) * streak;
    col += fl * k;
  }
  col *= pu.a.w * select(1.0, expo[0], pu.lens.w > 0.5);
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

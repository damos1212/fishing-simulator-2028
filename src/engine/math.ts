// Small math library: mutable Vec3 plus column-major Float32Array mat4 helpers (WGSL layout).

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const dampAngle = (a: number, b: number, rate: number, dt: number) =>
  a + wrapAngle(b - a) * (1 - Math.exp(-rate * dt));

export class Vec3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v: Vec3) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  add(v: Vec3) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v: Vec3) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaled(v: Vec3, s: number) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  scale(s: number) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v: Vec3) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v: Vec3) {
    const { x, y, z } = this;
    this.x = y * v.z - z * v.y; this.y = z * v.x - x * v.z; this.z = x * v.y - y * v.x;
    return this;
  }
  length() { return Math.hypot(this.x, this.y, this.z); }
  lengthXZ() { return Math.hypot(this.x, this.z); }
  normalize() { const l = this.length() || 1; return this.scale(1 / l); }
  distanceTo(v: Vec3) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  distanceXZ(v: Vec3) { return Math.hypot(this.x - v.x, this.z - v.z); }
  lerp(v: Vec3, t: number) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  damp(v: Vec3, rate: number, dt: number) { return this.lerp(v, 1 - Math.exp(-rate * dt)); }
  subVectors(a: Vec3, b: Vec3) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  applyMat4(m: Float32Array) {
    const { x, y, z } = this;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    this.x = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    this.y = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    this.z = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return this;
  }
  toArray(out: number[] | Float32Array = [], o = 0) { out[o] = this.x; out[o + 1] = this.y; out[o + 2] = this.z; return out; }
}

export type Mat4 = Float32Array;

export const mat4 = {
  create(): Mat4 { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(o: Mat4) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  copy(o: Mat4, a: Mat4) { o.set(a); return o; },
  multiply(o: Mat4, a: Mat4, b: Mat4) {
    const r = tmpM;
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      r[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      r[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      r[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      r[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    o.set(r);
    return o;
  },
  /** Reversed-Z infinite perspective for WebGPU (depth 1 at near, 0 at infinity). */
  perspectiveReversedInf(o: Mat4, fovY: number, aspect: number, near: number) {
    const f = 1 / Math.tan(fovY / 2);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[11] = -1; o[14] = near;
    return o;
  },
  /** Orthographic projection for WebGPU clip space (depth 0 at near, 1 at far). */
  ortho(o: Mat4, l: number, r: number, b: number, t: number, n: number, f: number) {
    o.fill(0);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -1 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -n / (f - n); o[15] = 1;
    return o;
  },
  lookAt(o: Mat4, eye: Vec3, target: Vec3, up: Vec3) {
    let zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * eye.x + xy * eye.y + xz * eye.z);
    o[13] = -(yx * eye.x + yy * eye.y + yz * eye.z);
    o[14] = -(zx * eye.x + zy * eye.y + zz * eye.z);
    o[15] = 1;
    return o;
  },
  invert(o: Mat4, m: Mat4) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return mat4.identity(o);
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  /** Translation * RotY(yaw) * RotX(pitch) * RotZ(roll) * uniform scale. */
  compose(o: Mat4, x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, s = 1) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    const cz = Math.cos(roll), sz = Math.sin(roll);
    // R = Ry * Rx * Rz
    const m00 = cy * cz + sy * sx * sz, m01 = cx * sz, m02 = -sy * cz + cy * sx * sz;
    const m10 = -cy * sz + sy * sx * cz, m11 = cx * cz, m12 = sy * sz + cy * sx * cz;
    const m20 = sy * cx, m21 = -sx, m22 = cy * cx;
    o[0] = m00 * s; o[1] = m01 * s; o[2] = m02 * s; o[3] = 0;
    o[4] = m10 * s; o[5] = m11 * s; o[6] = m12 * s; o[7] = 0;
    o[8] = m20 * s; o[9] = m21 * s; o[10] = m22 * s; o[11] = 0;
    o[12] = x; o[13] = y; o[14] = z; o[15] = 1;
    return o;
  },
  /** Basis from a forward (+Z local) direction and approximate up. */
  fromForward(o: Mat4, pos: Vec3, fwd: Vec3, up: Vec3, s = 1) {
    const f = tmpA.copy(fwd).normalize();
    const r = tmpB.copy(up).cross(f);
    if (r.length() < 1e-4) r.set(1, 0, 0); else r.normalize();
    const u = tmpC.copy(f).cross(r);
    o[0] = r.x * s; o[1] = r.y * s; o[2] = r.z * s; o[3] = 0;
    o[4] = u.x * s; o[5] = u.y * s; o[6] = u.z * s; o[7] = 0;
    o[8] = f.x * s; o[9] = f.y * s; o[10] = f.z * s; o[11] = 0;
    o[12] = pos.x; o[13] = pos.y; o[14] = pos.z; o[15] = 1;
    return o;
  },
  rotateX(o: Mat4, a: number) { return mat4.multiply(o, o, mat4.compose(tmpR, 0, 0, 0, 0, a, 0)); },
  rotateY(o: Mat4, a: number) { return mat4.multiply(o, o, mat4.compose(tmpR, 0, 0, 0, a, 0, 0)); },
  translation(m: Mat4, out: Vec3) { return out.set(m[12], m[13], m[14]); },
};

const tmpM = new Float32Array(16);
const tmpR = new Float32Array(16);
const tmpA = new Vec3(), tmpB = new Vec3(), tmpC = new Vec3();

export type RGB = [number, number, number];

export function srgbToLinear(c: number) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** '#rrggbb' -> linear RGB triple. */
export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}
export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D simplex noise (Gustavson), returns roughly [-1, 1].
const perm = new Uint8Array(512);
{
  const r = rng(1337);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const G2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
export function noise2(x: number, y: number) {
  const F2 = 0.5 * (Math.sqrt(3) - 1), Gc = (3 - Math.sqrt(3)) / 6;
  const s = (x + y) * F2;
  const i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * Gc;
  const x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + Gc, y1 = y0 - j1 + Gc, x2 = x0 - 1 + 2 * Gc, y2 = y0 - 1 + 2 * Gc;
  const ii = i & 255, jj = j & 255;
  let n = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) { const g = G2[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) { const g = G2[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) { const g = G2[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
  return 70 * n;
}
export function fbm2(x: number, y: number, oct = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

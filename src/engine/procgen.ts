// Procedural meshes for things that are easier to generate than to model (kelp, palms, planets...).
import type { MeshData } from './glb';
import { hex, type RGB, rng, Vec3 } from './math';

class Builder {
  v: number[] = [];
  i: number[] = [];
  vert(p: Vec3, n: Vec3, c: RGB, a = 1) {
    this.v.push(p.x, p.y, p.z, n.x, n.y, n.z, c[0], c[1], c[2], a);
    return this.v.length / 10 - 1;
  }
  tri(a: number, b: number, c: number) { this.i.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number) { this.i.push(a, b, c, a, c, d); }
  build(name: string): MeshData {
    const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1;
    const vs = new Float32Array(this.v);
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < vs.length; k += 10) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], vs[k + a]); max[a] = Math.max(max[a], vs[k + a]); }
    return { name, vertices: vs, indices: new Uint32Array(this.i), matrix: m, boundsMin: min, boundsMax: max };
  }

  /** Tube along points with per-point radius and color. */
  tube(pts: Vec3[], radii: number[], colors: RGB[], segs = 8, glow: number[] | null = null) {
    let prevN: Vec3 | null = null;
    const rings: number[][] = [];
    for (let k = 0; k < pts.length; k++) {
      const t = (k === 0 ? pts[1].clone().sub(pts[0]) : k === pts.length - 1 ? pts[k].clone().sub(pts[k - 1]) : pts[k + 1].clone().sub(pts[k - 1])).normalize();
      let n: Vec3;
      if (!prevN) n = t.clone().cross(Math.abs(t.y) < 0.9 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0)).normalize();
      else n = prevN.clone().addScaled(t, -prevN.dot(t)).normalize();
      prevN = n;
      const b = t.clone().cross(n);
      const ring: number[] = [];
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const dir = n.clone().scale(Math.cos(a)).addScaled(b, Math.sin(a));
        ring.push(this.vert(pts[k].clone().addScaled(dir, radii[k]), dir, colors[k], glow ? glow[k] : 0));
      }
      rings.push(ring);
    }
    for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      this.quad(rings[k][s], rings[k + 1][s], rings[k + 1][s2], rings[k][s2]);
    }
  }

  /** Double-sided flat blade from a spine; width per point, bends with the spine. */
  blade(spine: Vec3[], widths: number[], side: Vec3, c: RGB, c2: RGB, alpha?: (t: number) => number) {
    const up = new Vec3();
    const idx: [number, number][] = [];
    for (let k = 0; k < spine.length; k++) {
      const t = k / (spine.length - 1);
      const col: RGB = [c[0] + (c2[0] - c[0]) * t, c[1] + (c2[1] - c[1]) * t, c[2] + (c2[2] - c[2]) * t];
      const dir = (k < spine.length - 1 ? spine[k + 1].clone().sub(spine[k]) : spine[k].clone().sub(spine[k - 1])).normalize();
      up.copy(dir).cross(side).normalize();
      const al = alpha ? alpha(t) : 1;
      const a = this.vert(spine[k].clone().addScaled(side, -widths[k]), up, col, al);
      const b = this.vert(spine[k].clone().addScaled(side, widths[k]), up, col, al);
      idx.push([a, b]);
    }
    for (let k = 0; k < idx.length - 1; k++) this.quad(idx[k][0], idx[k + 1][0], idx[k + 1][1], idx[k][1]);
  }

  sphere(center: Vec3, r: number, c: RGB | ((n: Vec3) => RGB), seg = 24, rings = 16, glow = 0) {
    const base = this.v.length / 10;
    for (let j = 0; j <= rings; j++) {
      const th = (j / rings) * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const ph = (i / seg) * Math.PI * 2;
        const n = new Vec3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
        this.vert(center.clone().addScaled(n, r), n, typeof c === 'function' ? c(n) : c, glow);
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + seg + 1;
      this.quad(a, b, b + 1, a + 1);
    }
  }

  cylinder(r1: number, r2: number, h: number, c: RGB, segs = 12, y0 = 0) {
    this.tube([new Vec3(0, y0, 0), new Vec3(0, y0 + h, 0)], [r1, r2], [c, c], segs);
    // caps
    const top = this.vert(new Vec3(0, y0 + h, 0), new Vec3(0, 1, 0), c);
    const bot = this.vert(new Vec3(0, y0, 0), new Vec3(0, -1, 0), c);
    const tRing: number[] = [], bRing: number[] = [];
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      tRing.push(this.vert(new Vec3(Math.cos(a) * r2, y0 + h, Math.sin(a) * r2), new Vec3(0, 1, 0), c));
      bRing.push(this.vert(new Vec3(Math.cos(a) * r1, y0, Math.sin(a) * r1), new Vec3(0, -1, 0), c));
    }
    for (let s = 0; s < segs; s++) { const s2 = (s + 1) % segs; this.tri(top, tRing[s2], tRing[s]); this.tri(bot, bRing[s], bRing[s2]); }
  }
}

export function kelpMesh(): MeshData {
  const b = new Builder();
  const r = rng(21);
  const stalk = hex('#5a6a1f'), leaf = hex('#8a9a2a'), leaf2 = hex('#b8a83a');
  const H = 40, N = 24;
  const pts: Vec3[] = [];
  for (let k = 0; k <= N; k++) {
    const y = (k / N) * H;
    pts.push(new Vec3(Math.sin(y * 0.15) * 0.6, y, Math.cos(y * 0.11) * 0.5));
  }
  b.tube(pts, pts.map(() => 0.12), pts.map(() => stalk), 5);
  for (let k = 2; k < N; k++) {
    const p = pts[k];
    const ang = r() * Math.PI * 2;
    const side = new Vec3(Math.cos(ang), 0, Math.sin(ang));
    const out = new Vec3(-Math.sin(ang), 0, Math.cos(ang));
    const len = 1.6 + r() * 1.4;
    const spine = [0, 1, 2, 3, 4].map((i) => p.clone().addScaled(out, (i / 4) * len).add(new Vec3(0, (i / 4) * len * 0.6 + Math.sin(i) * 0.1, 0)));
    b.blade(spine, [0.05, 0.28, 0.32, 0.22, 0.02], side, leaf, leaf2);
  }
  return b.build('kelp');
}

export function seagrassMesh(): MeshData {
  const b = new Builder();
  const r = rng(33);
  const c1 = hex('#4a9a3a'), c2 = hex('#9ad05a');
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = r() * 1.2;
    const base = new Vec3(Math.cos(a) * d, 0, Math.sin(a) * d);
    const h = 1.2 + r() * 1.8;
    const lean = new Vec3(r() - 0.5, 0, r() - 0.5).scale(0.6);
    const spine = [0, 1, 2, 3, 4].map((k) => base.clone().add(new Vec3(0, (k / 4) * h, 0)).addScaled(lean, (k / 4) ** 2));
    b.blade(spine, [0.08, 0.07, 0.06, 0.04, 0.005], new Vec3(Math.cos(a + 1.3), 0, Math.sin(a + 1.3)), c1, c2);
  }
  return b.build('seagrass');
}

/** Vertex alpha for the foliage material with ambient occlusion rising from the base (see wgsl/mesh.ts). */
const foliage = (t: number) => (5 + (0.45 + 0.55 * t) * 0.999) / 16;

/** A tuft of grass blades for island meadows (~0.7 m tall). */
export function grassMesh(tint = '#6fc04a', tip = '#c8e87a'): MeshData {
  const b = new Builder();
  const r = rng(71);
  const c1 = hex(tint), c2 = hex(tip);
  for (let i = 0; i < 11; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.35;
    const base = new Vec3(Math.cos(a) * d, 0, Math.sin(a) * d);
    const h = 0.35 + r() * 0.5;
    const lean = new Vec3(Math.cos(a), 0, Math.sin(a)).scale(0.12 + r() * 0.2);
    const spine = [0, 1, 2, 3].map((k) => base.clone().add(new Vec3(0, (k / 3) * h, 0)).addScaled(lean, (k / 3) ** 2));
    b.blade(spine, [0.035, 0.03, 0.02, 0.002], new Vec3(Math.cos(a + 1.3), 0, Math.sin(a + 1.3)), c1, c2, foliage);
  }
  return b.build('grass');
}

/** A little flower: stem, leaves and a ring of petals. */
export function flowerMesh(petal: string): MeshData {
  const b = new Builder();
  const green = hex('#4a9a3a'), green2 = hex('#7ac050'), pc = hex(petal), center = hex('#ffd23a');
  const h = 0.55;
  b.blade([new Vec3(0, 0, 0), new Vec3(0.02, h * 0.5, 0), new Vec3(0, h, 0)], [0.015, 0.012, 0.01], new Vec3(1, 0, 0), green, green2, foliage);
  b.blade([new Vec3(0, 0.05, 0), new Vec3(0.12, 0.15, 0.03), new Vec3(0.2, 0.18, 0.05)], [0.01, 0.04, 0.005], new Vec3(0, 0, 1), green, green2, foliage);
  const top = new Vec3(0, h, 0);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const d = new Vec3(Math.cos(a), 0.25, Math.sin(a));
    b.blade([top, top.clone().addScaled(d, 0.07), top.clone().addScaled(d, 0.13)], [0.02, 0.045, 0.01], new Vec3(-Math.sin(a), 0, Math.cos(a)), pc, pc, () => (10 + 0.95 * 0.999) / 16);
  }
  b.sphere(top.clone().add(new Vec3(0, 0.015, 0)), 0.03, center, 8, 6, (0 + 0.999) / 16);
  return b.build('flower');
}

export function palmMesh(): MeshData {
  const b = new Builder();
  const trunk = hex('#a07a4a'), trunk2 = hex('#8a6438'), frond = hex('#3fae4a'), frond2 = hex('#6fd05a');
  const pts: Vec3[] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    pts.push(new Vec3(t * t * 1.6, t * 7, 0));
  }
  b.tube(pts, pts.map((_, k) => 0.32 - k * 0.018), pts.map((_, k) => (k % 2 ? trunk : trunk2)), 8);
  const top = pts[10];
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2 + 0.3;
    const out = new Vec3(Math.cos(a), 0, Math.sin(a));
    const side = new Vec3(-Math.sin(a), 0, Math.cos(a));
    const spine = [0, 1, 2, 3, 4, 5].map((i) => {
      const t = i / 5;
      return top.clone().addScaled(out, t * 4.2).add(new Vec3(0, Math.sin(t * Math.PI * 0.8) * 1.1 - t * t * 1.8, 0));
    });
    b.blade(spine, [0.1, 0.55, 0.7, 0.6, 0.4, 0.05], side, frond, frond2);
  }
  b.sphere(top.clone().add(new Vec3(0.2, -0.4, 0.3)), 0.28, hex('#6a4a2a'), 8, 6);
  b.sphere(top.clone().add(new Vec3(-0.3, -0.45, 0.1)), 0.28, hex('#6a4a2a'), 8, 6);
  return b.build('palm');
}

export function planetMesh(kind: number): MeshData {
  const b = new Builder();
  const palettes: [string, string, string][] = [
    ['#e07a5a', '#f2c08a', '#b04a3a'],
    ['#6ad0ff', '#e0f8ff', '#3a70d0'],
    ['#c070ff', '#ffd0f0', '#6a2ab0'],
  ];
  const [p1, p2, p3] = palettes[kind % 3].map(hex);
  b.sphere(new Vec3(), 1, (n) => {
    const band = Math.sin(n.y * 9 + Math.sin(n.x * 3) * 1.5);
    return band > 0.4 ? p2 : band < -0.5 ? p3 : p1;
  }, 48, 32, 0.25);
  if (kind !== 1) {
    const ring = hex('#f0e0c0');
    const segs = 96;
    const base = b.v.length / 10;
    for (let s = 0; s <= segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      for (const [rr, c] of [[1.5, ring], [2.3, hex('#c0a080')]] as [number, RGB][]) {
        b.vert(new Vec3(Math.cos(a) * rr, 0, Math.sin(a) * rr), new Vec3(0, 1, 0), c, 0.35);
      }
    }
    for (let s = 0; s < segs; s++) { const a = base + s * 2; b.quad(a, a + 2, a + 3, a + 1); }
  }
  return b.build('planet' + kind);
}

export function buoyMesh(): MeshData {
  const b = new Builder();
  b.cylinder(0.9, 0.9, 0.8, hex('#d64933'), 14, -0.5);
  b.cylinder(0.5, 0.2, 2.4, hex('#f7f3e8'), 12, 0.3);
  b.cylinder(0.22, 0.22, 0.5, hex('#d64933'), 10, 2.6);
  b.sphere(new Vec3(0, 3.3, 0), 0.25, hex('#ffe07a'), 10, 8, 1);
  return b.build('buoy');
}

/** Unit-length rod segment along +Z (radius 1 at base, 1 at top; scaled per segment). */
export function rodSegmentMesh(): MeshData {
  const b = new Builder();
  const c = hex('#2a2a30');
  b.tube([new Vec3(0, 0, 0), new Vec3(0, 0, 1)], [1, 0.82], [c, c], 8);
  return b.build('rodseg');
}

export function reelMesh(): MeshData {
  const b = new Builder();
  b.tube([new Vec3(-0.06, 0, 0), new Vec3(0.06, 0, 0)], [0.07, 0.07], [hex('#c7cdd3'), hex('#c7cdd3')], 14);
  b.tube([new Vec3(0.06, 0, 0), new Vec3(0.1, 0, 0)], [0.02, 0.02], [hex('#d64933'), hex('#d64933')], 8);
  return b.build('reel');
}

export function flagMesh(): MeshData {
  const b = new Builder();
  b.cylinder(0.05, 0.05, 6, hex('#e8e4dc'), 8);
  b.blade([new Vec3(0, 5.8, 0), new Vec3(0.8, 5.5, 0), new Vec3(1.6, 5.2, 0)], [0.5, 0.35, 0.02], new Vec3(0, 1, 0), hex('#ffd23a'), hex('#ff7a1a'));
  return b.build('flag');
}

/** Unit tentacle segment along +Z (radius 1 at the base, tapering): purple skin with pale suckers underneath. */
export function tentacleSegmentMesh(): MeshData {
  const b = new Builder();
  const skin = hex('#8a3ac0'), belly = hex('#f0a0d8'), sucker = hex('#fff4fa');
  const segs = 14, rings = 5;
  const idx: number[][] = [];
  for (let k = 0; k <= rings; k++) {
    const z = k / rings;
    const rad = 1 - 0.14 * z;
    const ring: number[] = [];
    for (let s2 = 0; s2 < segs; s2++) {
      const a = (s2 / segs) * Math.PI * 2;
      const n = new Vec3(Math.cos(a), Math.sin(a), 0);
      // the underside (-Y) is pale and dotted with suckers
      const under = Math.max(0, -n.y);
      const dot = under > 0.7 && (k === 1 || k === 3) && s2 % 2 === 0;
      const c: RGB = dot ? sucker : [skin[0] + (belly[0] - skin[0]) * under, skin[1] + (belly[1] - skin[1]) * under, skin[2] + (belly[2] - skin[2]) * under];
      ring.push(b.vert(new Vec3(n.x * rad * (dot ? 1.08 : 1), n.y * rad * (dot ? 1.08 : 1), z), n, c));
    }
    idx.push(ring);
  }
  for (let k = 0; k < rings; k++) for (let s2 = 0; s2 < segs; s2++) {
    const n2 = (s2 + 1) % segs;
    b.quad(idx[k][s2], idx[k + 1][s2], idx[k + 1][n2], idx[k][n2]);
  }
  return b.build('tentacle');
}

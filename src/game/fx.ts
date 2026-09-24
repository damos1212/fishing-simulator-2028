// CPU particle effects (splashes, bubbles, smoke, snow...) rendered as billboards.
import { rng, type Vec3 } from '../engine/math';
import type { Renderer } from '../engine/renderer';

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; grow: number;
  r: number; g: number; b: number; a: number;
  kind: number; gravity: number; drag: number;
  floatUp: boolean;
  stretch: number;
}

export class FX {
  private ps: P[] = [];
  private rand = rng(4242);

  spawn(p: Partial<P> & { x: number; y: number; z: number }) {
    if (this.ps.length > 6000) return;
    this.ps.push({
      vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.3, grow: 0, r: 1, g: 1, b: 1, a: 1,
      kind: 0, gravity: 0, drag: 0, floatUp: false, stretch: 1, ...p,
    });
  }

  rnd(a = -1, b = 1) { return a + (b - a) * this.rand(); }

  splash(pos: Vec3, size = 1) {
    for (let i = 0; i < 40 * size; i++) {
      const a = this.rnd(0, Math.PI * 2), s = this.rnd(1, 5) * size;
      this.spawn({ x: pos.x, y: 0.2, z: pos.z, vx: Math.cos(a) * s, vy: this.rnd(4, 11) * size, vz: Math.sin(a) * s,
        max: this.rnd(0.6, 1.2), size: this.rnd(0.15, 0.4) * size, r: 0.95, g: 0.98, b: 1, a: 1, kind: 4, gravity: 18 });
    }
    for (let i = 0; i < 3; i++) this.spawn({ x: pos.x, y: 0.15, z: pos.z, max: 1.2 + i * 0.4, size: 0.6 * size, grow: (3 + i * 1.5) * size, r: 1, g: 1, b: 1, a: 0.9, kind: 2 });
  }

  bubbles(pos: Vec3, n = 6, spread = 0.4) {
    for (let i = 0; i < n; i++) {
      this.spawn({ x: pos.x + this.rnd() * spread, y: pos.y + this.rnd() * spread, z: pos.z + this.rnd() * spread,
        vx: this.rnd() * 0.4, vy: this.rnd(1, 3), vz: this.rnd() * 0.4, max: this.rnd(1, 2.5), size: this.rnd(0.05, 0.16),
        r: 0.8, g: 0.95, b: 1, a: 0.7, kind: 1, floatUp: true });
    }
  }

  burst(pos: Vec3, color: [number, number, number], n = 20, speed = 4, size = 0.3, additive = true) {
    for (let i = 0; i < n; i++) {
      const a = this.rnd(0, Math.PI * 2), e = this.rnd(-1, 1);
      const s = this.rnd(0.3, 1) * speed;
      this.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * s * Math.sqrt(1 - e * e), vy: e * s + speed * 0.3, vz: Math.sin(a) * s * Math.sqrt(1 - e * e),
        max: this.rnd(0.5, 1.1), size, r: color[0], g: color[1], b: color[2], a: additive ? 0 : 1, kind: 3, drag: 2 });
    }
  }

  smoke(x: number, y: number, z: number, dark = 0.25, size = 6) {
    this.spawn({ x: x + this.rnd() * 3, y, z: z + this.rnd() * 3, vx: this.rnd() * 1.5 + 2, vy: this.rnd(5, 9), vz: this.rnd() * 1.5,
      max: this.rnd(6, 10), size, grow: 3, r: dark, g: dark * 0.95, b: dark * 0.9, a: 0.6, kind: 0, drag: 0.1 });
  }

  update(dt: number, water: (x: number, z: number) => number) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.vy -= p.gravity * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
      if (p.floatUp && p.y > water(p.x, p.z) - 0.1) p.life = p.max;
      if (p.gravity > 0 && p.y < -0.3 && p.vy < 0) p.life = p.max;
    }
  }

  draw(r: Renderer) {
    for (const p of this.ps) {
      const t = p.life / p.max;
      const fade = t < 0.1 ? t / 0.1 : 1 - Math.pow((t - 0.1) / 0.9, 2);
      if (p.a === 0) r.particle(p.x, p.y, p.z, p.size, p.r * fade * 2, p.g * fade * 2, p.b * fade * 2, 0, p.kind, 0, p.stretch);
      else r.particle(p.x, p.y, p.z, p.size, p.r, p.g, p.b, p.a * fade, p.kind, 0, p.stretch);
    }
  }
}

// The Kraken: a rare encounter over deep water at night, in storms or under a blood moon. The sea
// trembles, tentacles burst up and wrap the boat, and the player mashes the reel to break free.
import { clamp, mat4, rng, Vec3 } from '../engine/math';
import { Inst, type Renderer } from '../engine/renderer';
import type { Assets } from './assets';
import type { FX } from './fx';

export type KrakenState = 'idle' | 'warn' | 'rise' | 'grab' | 'win' | 'lose';
export type KrakenEvent = { type: 'warn' } | { type: 'rise' } | { type: 'slap' } | { type: 'win' } | { type: 'lose' };

interface Tentacle { angle: number; dist: number; phase: number; size: number; delay: number }

const SEGS = 16;
/** Seconds to break free once the tentacles have the boat. */
export const GRAB_TIME = 11;

export class Kraken {
  state: KrakenState = 'idle';
  t = 0;
  /** 0..1 escape progress while grabbed */
  progress = 0;
  timeLeft = 0;
  /** >1 makes the fight easier (Kraken Tamer perk) */
  ease = 1;
  events: KrakenEvent[] = [];
  readonly center = new Vec3();
  private cooldown = 200;
  private nextSlap = 1;
  private tentacles: Tentacle[] = [];
  private r = rng(1313);
  private inst = (() => { const i = Inst.solid(0, 0.03, true); i.a.set([1.25, 1.1, 1.3, 0.1]); return i; })();
  private m = mat4.create();
  private pts: Vec3[] = Array.from({ length: SEGS + 1 }, () => new Vec3());

  get active() { return this.state !== 'idle'; }

  /** Rolls for an encounter while the conditions hold (pressure > 1 makes it likelier). */
  tick(dt: number, eligible: boolean, pressure: number, boat: Vec3) {
    if (this.state !== 'idle' || !eligible) return;
    this.cooldown -= dt * pressure;
    if (this.cooldown <= 0 && this.r() < dt * 0.05 * pressure) this.start(boat);
  }

  start(boat: Vec3) {
    this.state = 'warn';
    this.t = 0;
    this.progress = 0.15;
    this.center.copy(boat);
    this.tentacles = [];
    const n = 6;
    for (let k = 0; k < n; k++) {
      this.tentacles.push({ angle: (k / n) * Math.PI * 2 + this.r() * 0.4, dist: 6.5 + this.r() * 2.5, phase: this.r() * 6, size: 0.8 + this.r() * 0.45, delay: this.r() * 0.6 });
    }
    this.events.push({ type: 'warn' });
  }

  /** One mash of the reel while grabbed. */
  press() { if (this.state === 'grab') this.progress = Math.min(1, this.progress + 0.07 * this.ease); }

  update(dt: number, boat: Vec3, fx: FX) {
    if (this.state === 'idle') return;
    this.t += dt;
    this.center.lerp(boat, Math.min(1, dt * 4));
    const c = this.center;
    switch (this.state) {
      case 'warn':
        // bubbles and a dark churn under the boat
        for (let i = 0; i < 6; i++) fx.spawn({ x: c.x + fx.rnd() * 9, y: 0.1, z: c.z + fx.rnd() * 9, max: 0.8, size: 0.4, grow: 1.2, r: 0.85, g: 0.95, b: 1, a: 0.5, kind: 2 });
        if (this.t > 3.5) { this.state = 'rise'; this.t = 0; this.events.push({ type: 'rise' }); }
        break;
      case 'rise':
        if (this.t > 1.6) { this.state = 'grab'; this.t = 0; this.timeLeft = GRAB_TIME; }
        break;
      case 'grab':
        this.timeLeft -= dt;
        this.progress = clamp(this.progress - dt * 0.13 / this.ease, 0, 1);
        this.nextSlap -= dt;
        if (this.nextSlap <= 0) { this.nextSlap = 1 + this.r() * 1.3; this.events.push({ type: 'slap' }); }
        if (this.progress >= 1) { this.state = 'win'; this.t = 0; this.events.push({ type: 'win' }); }
        else if (this.timeLeft <= 0) { this.state = 'lose'; this.t = 0; this.events.push({ type: 'lose' }); }
        break;
      case 'win':
      case 'lose':
        if (this.t > 2.4) { this.state = 'idle'; this.cooldown = 420 + this.r() * 300; }
        break;
    }
  }

  /** How far the tentacles drag the boat down (m). */
  get squeeze() {
    if (this.state === 'grab') return 0.25 + (1 - this.progress) * 0.45 + Math.sin(this.t * 3) * 0.08;
    if (this.state === 'rise') return this.t / 1.6 * 0.3;
    return 0;
  }

  /** How far out of the water the tentacles are (0..1). */
  private lift(tn: Tentacle) {
    const t = this.t - tn.delay;
    switch (this.state) {
      case 'rise': return clamp(t / 1.2, 0, 1) ** 0.6;
      case 'grab': return 1;
      case 'win': return clamp(1 - this.t / 1.6, 0, 1);
      case 'lose': return clamp(1 - (this.t - 0.6) / 1.8, 0, 1);
      default: return 0;
    }
  }

  draw(r: Renderer, a: Assets, time: number, fx: FX) {
    if (this.state === 'idle') return;
    const c = this.center;
    const up = new Vec3(0, 1, 0);
    // glowing eyes under the boat
    if (this.state !== 'warn') {
      const fade = this.state === 'win' || this.state === 'lose' ? clamp(1 - this.t / 2, 0, 1) : 1;
      for (const s of [-1, 1]) {
        const ex = c.x + s * 2.2, ez = c.z + 3;
        r.particle(ex, -3.5, ez, 1.4, 2.2 * fade, 1.6 * fade, 0.2 * fade, 0, 0);
        r.particle(ex, -3.5, ez, 0.45, 0.1, 0.02, 0, 0.9 * fade, 4);
      }
      r.light(c.x, -2.5, c.z + 3, 14, 1, 0.75, 0.2, 2 * fade);
    }
    for (const tn of this.tentacles) {
      const lift = this.lift(tn);
      if (lift <= 0.001) continue;
      const out = new Vec3(Math.cos(tn.angle), 0, Math.sin(tn.angle));
      const side = new Vec3(-out.z, 0, out.x);
      const L = 11 * tn.size;
      const grab = this.state === 'grab' ? 1 : this.state === 'rise' ? 0.3 : 0.5;
      const squeeze = this.state === 'grab' ? 0.6 + 0.4 * Math.sin(time * 2.2 + tn.phase) : 0;
      for (let k = 0; k <= SEGS; k++) {
        const s = k / SEGS;
        const p = this.pts[k];
        p.set(c.x + out.x * tn.dist, -1.2 - (1 - lift) * L * 0.9, c.z + out.z * tn.dist);
        // up out of the water, arching over towards the boat, the tip curling down onto the deck
        p.addScaled(up, L * 0.62 * Math.sin(Math.min(s * 1.25, 1) * Math.PI * 0.55) * lift);
        p.addScaled(out, -tn.dist * (0.25 + 0.6 * grab) * s ** 1.5 * lift);
        p.addScaled(up, -L * 0.28 * s ** 3 * grab * lift * (0.8 + 0.2 * squeeze));
        p.addScaled(side, Math.sin(time * 1.7 + tn.phase + s * 3.2) * s * 1.4);
      }
      for (let k = 0; k < SEGS; k++) {
        const s = k / SEGS;
        const p0 = this.pts[k], p1 = this.pts[k + 1];
        const d = p1.clone().sub(p0);
        const len = d.length();
        if (len < 1e-3) continue;
        const rad = tn.size * (0.62 * (1 - s) + 0.07);
        const m = mat4.fromForward(this.m, p0, d, up);
        m[0] *= rad; m[1] *= rad; m[2] *= rad;
        m[4] *= rad; m[5] *= rad; m[6] *= rad;
        m[8] *= len * 1.08; m[9] *= len * 1.08; m[10] *= len * 1.08;
        r.draw(a.tentacle, m, this.inst);
      }
      // churning foam where it breaks the surface
      const b = this.pts[0];
      if (Math.random() < 0.25) fx.spawn({ x: b.x + fx.rnd() * 1.2, y: 0.2, z: b.z + fx.rnd() * 1.2, vy: 0.6, max: 0.8, size: 0.3, grow: 1, r: 1, g: 1, b: 1, a: 0.28, kind: 0 });
    }
  }
}

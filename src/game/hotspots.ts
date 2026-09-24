// Fishing hot spots: bubbling water, circling gulls and jumping fish. Casting inside one
// brings more fish and better odds for rare ones.
import { SPECIES } from '../data/fish';
import { NAMED_ZONES, realmZoneIdx, zoneWeights } from '../data/zones';
import { mat4, rng, Vec3 } from '../engine/math';
import { Inst, type Renderer } from '../engine/renderer';
import { heightAt } from '../world/terrain';
import type { Assets } from './assets';
import { FishActor } from './fishing';
import type { FX } from './fx';

export interface Hotspot { pos: Vec3; zone: number; radius: number; expires: number; seed: number }

interface Jumper { actor: FishActor; t: number; start: Vec3; vel: Vec3 }

const gullInst = Inst.solid(0, 0.02);
gullInst.c[3] = 8;
gullInst.amp = 0.35;

export class Hotspots {
  spots: Hotspot[] = [];
  private rand = rng(31337);
  private jumpers: Jumper[] = [];
  private nextJump = 2;
  private m = mat4.create();
  private w: number[] = [];

  constructor() {
    for (const zi of realmZoneIdx()) for (let k = 0; k < (zi === 0 ? 4 : 3); k++) this.spawn(zi, 0);
  }

  private spawn(zi: number, now: number) {
    const zn = NAMED_ZONES[zi];
    for (let tries = 0; tries < 40; tries++) {
      const a = this.rand() * Math.PI * 2, d = Math.sqrt(this.rand()) * zn.radius * 0.85;
      const x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
      if (heightAt(x, z) > -10 || zoneWeights(x, z, this.w)[zi] < 0.6) continue;
      if (zi === 0 && Math.hypot(x, z) < 110) continue;
      this.spots.push({ pos: new Vec3(x, 0, z), zone: zi, radius: 32, expires: now + 180 + this.rand() * 140, seed: this.rand() * 100 });
      return;
    }
  }

  /** 0..1 strength of the hot spot covering a point. */
  strengthAt(x: number, z: number) {
    let s = 0;
    for (const h of this.spots) {
      const d = Math.hypot(x - h.pos.x, z - h.pos.z);
      if (d < h.radius * 1.4) s = Math.max(s, 1 - Math.max(0, d - h.radius) / (h.radius * 0.4));
    }
    return s;
  }

  update(dt: number, now: number, cam: Vec3, fx: FX) {
    for (let i = this.spots.length - 1; i >= 0; i--) {
      const h = this.spots[i];
      if (h.expires < now) { this.spots.splice(i, 1); this.spawn(h.zone, now); continue; }
      const d = h.pos.distanceXZ(cam);
      if (d > 700) continue;
      if (this.rand() < dt * 14) {
        const a = this.rand() * Math.PI * 2, rr = Math.sqrt(this.rand()) * h.radius * 0.6;
        fx.spawn({ x: h.pos.x + Math.cos(a) * rr, y: 0.2, z: h.pos.z + Math.sin(a) * rr, max: 0.8 + this.rand() * 0.6, size: 0.3, grow: 1.4, r: 1, g: 1, b: 1, a: 0.8, kind: 2 });
      }
    }
    this.nextJump -= dt;
    if (this.nextJump <= 0) {
      this.nextJump = 1.2 + this.rand() * 2.5;
      const near = this.spots.filter((h) => h.pos.distanceXZ(cam) < 450);
      if (near.length) {
        const h = near[Math.floor(this.rand() * near.length)];
        const pool = SPECIES.filter((s) => s.zone === NAMED_ZONES[h.zone].id && !s.hazard && s.model !== 'jelly' && s.size < 3);
        const sp = pool[Math.floor(this.rand() * pool.length)];
        if (sp) {
          const a = this.rand() * Math.PI * 2, rr = this.rand() * h.radius * 0.6;
          const start = new Vec3(h.pos.x + Math.cos(a) * rr, -0.5, h.pos.z + Math.sin(a) * rr);
          const dir = this.rand() * Math.PI * 2;
          const actor = new FishActor(sp, 1);
          this.jumpers.push({ actor, t: 0, start, vel: new Vec3(Math.cos(dir) * 3, 7 + this.rand() * 3, Math.sin(dir) * 3) });
          fx.splash(start, 0.4);
        }
      }
    }
    for (let i = this.jumpers.length - 1; i >= 0; i--) {
      const j = this.jumpers[i];
      j.t += dt;
      const p = j.actor.pos.copy(j.start).addScaled(j.vel, j.t);
      p.y -= 7 * j.t * j.t;
      j.actor.dir.set(j.vel.x, j.vel.y - 14 * j.t, j.vel.z).normalize();
      j.actor.phase += dt * 25;
      if (j.t > 0.3 && p.y < 0) { fx.splash(p, 0.35); this.jumpers.splice(i, 1); }
    }
  }

  draw(r: Renderer, a: Assets, cam: Vec3, time: number, drawFish: (f: FishActor) => void) {
    const gull = a.models.gull;
    for (const h of this.spots) {
      if (h.pos.distanceXZ(cam) > 900) continue;
      for (let k = 0; k < 3; k++) {
        const ang = time * (0.35 + k * 0.07) + k * 2.1 + h.seed;
        const rad = 10 + k * 5;
        const x = h.pos.x + Math.cos(ang) * rad, z = h.pos.z + Math.sin(ang) * rad;
        const y = 12 + k * 3 + Math.sin(time + k) * 1.5;
        mat4.compose(this.m, x, y, z, -ang, 0, -0.35, 1.3);
        gullInst.phase = time * 9 + k;
        r.drawModel(gull, this.m, gullInst);
      }
    }
    for (const j of this.jumpers) drawFish(j.actor);
  }
}

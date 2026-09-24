// Life in the water column while the lure dives: collectible orb chains, background schools,
// giant silhouettes in the deep fog and named depth layers.
import { CATCHABLE, type Species, speciesById } from '../data/fish';
import { type ZoneId } from '../data/zones';
import { clamp, rng, Vec3 } from '../engine/math';
import type { Renderer } from '../engine/renderer';
import { heightAt } from '../world/terrain';
import { FishActor } from './fishing';

export interface DepthLayer { name: string; from: number; tag: string; color: string }
export const DEPTH_LAYERS: DepthLayer[] = [
  { name: 'Sunlight Zone', from: 0, tag: 'Bright, busy and full of snacks', color: '#7fe0ff' },
  { name: 'Twilight Zone', from: 60, tag: 'The light is fading...', color: '#5a9aff' },
  { name: 'Midnight Zone', from: 250, tag: 'Only the glowing survive', color: '#8a6aff' },
  { name: 'The Abyss', from: 1000, tag: 'Crushing pressure. Strange shapes.', color: '#c060ff' },
  { name: 'The Hadal Zone', from: 3000, tag: 'Nothing should live down here', color: '#ff60a0' },
];
export const layerAt = (depth: number) => {
  let k = 0;
  for (let i = 0; i < DEPTH_LAYERS.length; i++) if (depth >= DEPTH_LAYERS[i].from) k = i;
  return k;
};

interface Orb { pos: Vec3; pearl: boolean; chain: number; born: number; taken: boolean }
interface School { center: Vec3; angle: number; radius: number; speed: number; members: FishActor[]; offsets: Vec3[]; zone: ZoneId }
interface Giant { actor: FishActor; pos: Vec3; vel: Vec3; life: number }

export type DepthEvent =
  | { type: 'orb'; pos: Vec3; pearl: boolean; streak: number }
  | { type: 'layer'; layer: number }
  | { type: 'giant'; name: string };

export class Depths {
  orbs: Orb[] = [];
  private schools: School[] = [];
  private giant: Giant | null = null;
  private nextChain = 1;
  private nextGiant = 25;
  private streak = 0;
  private lastOrb = -10;
  private layer = 0;
  private r = rng(4242);
  events: DepthEvent[] = [];

  /** Called when the lure hits the water. */
  reset(lure: Vec3) {
    this.orbs = [];
    this.schools = [];
    this.giant = null;
    this.nextChain = 0.6;
    this.streak = 0;
    this.layer = layerAt(-lure.y);
  }

  clear() { this.orbs = []; this.schools = []; this.giant = null; }

  update(dt: number, time: number, lure: Vec3, vel: Vec3, zone: ZoneId, maxLine: number, magnet = 0) {
    const depth = -lure.y;
    // layers
    const lay = layerAt(depth);
    if (lay > this.layer) this.events.push({ type: 'layer', layer: lay });
    this.layer = lay;
    // orb chains ahead of the lure: a spiral you can steer through
    this.nextChain -= dt * (vel.y < -3 ? 1.6 : 0.5);
    if (this.nextChain <= 0 && this.orbs.length < 36) {
      this.nextChain = 1.4 + this.r() * 1.6;
      const floor = heightAt(lure.x, lure.z);
      const ahead = clamp(Math.max(10, -vel.y * 1.1), 10, 45);
      const startY = Math.max(lure.y - ahead, floor + 3);
      if (startY < -3 && -startY < maxLine) {
        const a0 = this.r() * Math.PI * 2, n = 5 + Math.floor(this.r() * 5);
        const cx = lure.x + Math.cos(a0) * (3 + this.r() * 6), cz = lure.z + Math.sin(a0) * (3 + this.r() * 6);
        const pearlAt = this.r() < 0.12 ? n - 1 : -1;
        for (let k = 0; k < n; k++) {
          const a = a0 + k * 0.7;
          const y = startY - k * 2.6;
          if (y < heightAt(cx, cz) + 1) break;
          this.orbs.push({ pos: new Vec3(cx + Math.cos(a) * 3, y, cz + Math.sin(a) * 3), pearl: k === pearlAt, chain: k, born: time, taken: false });
        }
      }
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (o.taken || o.pos.distanceTo(lure) > 80) { this.orbs.splice(i, 1); continue; }
      const reach = (o.pearl ? 3 : 2.4) * (1 + magnet);
      const dist = o.pos.distanceTo(lure);
      // magnet perk: orbs drift towards the lure before they're grabbed
      if (magnet > 0 && dist < reach * 2.2) o.pos.lerp(lure, Math.min(1, dt * 3 * magnet));
      if (dist < reach) {
        o.taken = true;
        this.streak = time - this.lastOrb < 2.2 ? this.streak + 1 : 0;
        this.lastOrb = time;
        this.events.push({ type: 'orb', pos: o.pos.clone(), pearl: o.pearl, streak: this.streak });
      }
    }
    // background schools circling the lure
    if (this.schools.length < 3 || this.schools.some((s) => s.zone !== zone && s.center.distanceTo(lure) > 40)) this.refreshSchools(lure, zone);
    for (const s of this.schools) {
      s.angle += dt * s.speed;
      const want = new Vec3(lure.x + Math.cos(s.angle) * s.radius, clamp(lure.y + Math.sin(s.angle * 0.7) * 8, heightAt(lure.x, lure.z) + 3, -2), lure.z + Math.sin(s.angle) * s.radius);
      s.center.damp(want, 1.2, dt);
      const tangent = new Vec3(-Math.sin(s.angle), Math.cos(s.angle * 0.7) * 0.2, Math.cos(s.angle)).scale(Math.sign(s.speed));
      s.members.forEach((m, k) => {
        const o = s.offsets[k];
        m.pos.set(s.center.x + o.x + Math.sin(time * 0.9 + k) * 0.6, s.center.y + o.y + Math.cos(time * 1.1 + k) * 0.4, s.center.z + o.z + Math.sin(time * 0.7 + k * 1.7) * 0.6);
        m.dir.copy(tangent);
        m.phase += dt * 12;
      });
    }
    // a colossal shape gliding past in the deep fog
    this.nextGiant -= dt;
    if (!this.giant && this.nextGiant <= 0 && depth > 120) {
      this.nextGiant = 35 + this.r() * 35;
      const deep = depth > 800;
      const id = deep ? ['devourer', 'netherwyrm', 'spacewhale', 'legion'][Math.floor(this.r() * 4)] : ['bluewhale', 'megalodon', 'mawwhale', 'lunarwhale'][Math.floor(this.r() * 4)];
      const sp = speciesById.get(id) ?? speciesById.get('spacewhale')!;
      const actor = new FishActor({ ...sp, colors: ['#05070c', '#0a0e16', '#10141c'], glow: 0, boss: false, size: (deep ? 55 : 32) / 1.5 }, 1);
      const a = this.r() * Math.PI * 2, d = 95 + this.r() * 40;
      const pos = new Vec3(lure.x + Math.cos(a) * d, lure.y - 10 - this.r() * 25, lure.z + Math.sin(a) * d);
      const vel = new Vec3(-Math.sin(a), 0.05, Math.cos(a)).scale(9 + this.r() * 5);
      this.giant = { actor, pos, vel, life: 16 };
      this.events.push({ type: 'giant', name: sp.name });
    }
    if (this.giant) {
      const g = this.giant;
      g.life -= dt;
      g.pos.addScaled(g.vel, dt);
      g.actor.pos.copy(g.pos);
      g.actor.dir.copy(g.vel).normalize();
      g.actor.phase += dt * 2.5;
      if (g.life <= 0) this.giant = null;
    }
  }

  private refreshSchools(lure: Vec3, zone: ZoneId) {
    const pool = CATCHABLE.filter((s) => s.zone === zone && !!s.school && !s.boss && s.size < 1.2);
    const fallback = CATCHABLE.filter((s) => s.school && s.size < 1);
    this.schools = [];
    for (let k = 0; k < 3; k++) {
      const list = pool.length ? pool : fallback;
      const sp: Species = list[Math.floor(this.r() * list.length)];
      const n = 14 + Math.floor(this.r() * 14);
      const members: FishActor[] = [];
      const offsets: Vec3[] = [];
      for (let i = 0; i < n; i++) {
        members.push(new FishActor(sp, 0.7 + this.r() * 0.4));
        offsets.push(new Vec3((this.r() - 0.5) * 7, (this.r() - 0.5) * 3, (this.r() - 0.5) * 7));
      }
      const radius = 16 + this.r() * 22;
      const angle = this.r() * Math.PI * 2;
      this.schools.push({ center: new Vec3(lure.x + Math.cos(angle) * radius, lure.y, lure.z + Math.sin(angle) * radius), angle, radius,
        speed: (0.18 + this.r() * 0.15) * (this.r() < 0.5 ? 1 : -1), members, offsets, zone });
    }
  }

  draw(r: Renderer, cam: Vec3, time: number, drawFish: (f: FishActor) => void) {
    for (const o of this.orbs) {
      if (o.pos.distanceTo(cam) > 90) continue;
      const pulse = 1 + Math.sin(time * 5 + o.chain) * 0.12;
      if (o.pearl) {
        r.particle(o.pos.x, o.pos.y, o.pos.z, 1.1 * pulse, 1.2, 0.8, 1.6, 0, 0);
        r.particle(o.pos.x, o.pos.y, o.pos.z, 0.45, 1.6, 1.5, 1.8, 0, 4);
        r.particle(o.pos.x, o.pos.y, o.pos.z, 1.6 * pulse, 0.9, 0.6, 1.4, 0, 1, time);
        r.light(o.pos.x, o.pos.y, o.pos.z, 8, 0.8, 0.5, 1, 1.5);
      } else {
        r.particle(o.pos.x, o.pos.y, o.pos.z, 1.3 * pulse, 1.4, 1.0, 0.3, 0, 0);
        r.particle(o.pos.x, o.pos.y, o.pos.z, 0.34, 2.2, 1.9, 1.0, 0, 4);
        r.particle(o.pos.x, o.pos.y, o.pos.z, 1.4 * pulse, 1.3, 1.0, 0.3, 0, 3, time + o.chain);
        r.light(o.pos.x, o.pos.y, o.pos.z, 7, 1, 0.8, 0.3, 1.2);
      }
    }
    for (const s of this.schools) for (const m of s.members) if (m.pos.distanceTo(cam) < 80) drawFish(m);
    if (this.giant && this.giant.pos.distanceTo(cam) < 220) drawFish(this.giant.actor);
  }
}

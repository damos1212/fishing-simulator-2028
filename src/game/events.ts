// Random world events: feeding frenzies, golden hours, meteor showers and the blood moon.
import { ALL_ZONES, realmZones, type Zone } from '../data/zones';
import { rng, Vec3 } from '../engine/math';
import type { Renderer } from '../engine/renderer';
import { heightAt } from '../world/terrain';
import type { FX } from './fx';

export type EventKind = 'frenzy' | 'golden' | 'meteor' | 'bloodmoon';

export interface WorldEvent {
  kind: EventKind;
  zone: Zone | null;
  pos: Vec3;
  radius: number;
  until: number;
}

interface Fragment { pos: Vec3; until: number; spin: number }
interface Meteor { from: Vec3; to: Vec3; t: number; dur: number }

export const EVENT_INFO: Record<EventKind, { title: string; sub: string; color: string }> = {
  frenzy: { title: 'FEEDING FRENZY', sub: 'Tons of fish, rare ones too. Follow the star on your map!', color: '#ff8a2a' },
  golden: { title: 'GOLDEN HOUR', sub: 'Rare and legendary fish are everywhere for 2 minutes!', color: '#ffd23a' },
  meteor: { title: 'METEOR SHOWER', sub: 'Sail through the fallen star fragments for pearls!', color: '#a0c0ff' },
  bloodmoon: { title: 'BLOOD MOON', sub: 'Rare and shiny fish surface, everything is worth 50% more... and something stirs in the deep.', color: '#ff4a4a' },
};

export class WorldEvents {
  active: WorldEvent | null = null;
  fragments: Fragment[] = [];
  private meteors: Meteor[] = [];
  private next = 150;
  private nextMeteor = 0;
  private r = rng(4711);

  /** Ends everything in progress (after changing realms). */
  clear() {
    this.active = null;
    this.fragments = [];
    this.meteors = [];
    this.next = 150;
  }

  /** Returns a newly started event, if any. */
  update(dt: number, time: number, boat: Vec3, hull: number, night: boolean, fx: FX): WorldEvent | null {
    if (this.active && (this.active.until < time || (this.active.kind === 'bloodmoon' && !night))) this.active = null;
    this.fragments = this.fragments.filter((f) => f.until > time);
    let started: WorldEvent | null = null;
    if (!this.active) {
      this.next -= dt;
      if (this.next <= 0) {
        this.next = 180 + this.r() * 180;
        const kinds: EventKind[] = night ? ['frenzy', 'meteor', 'meteor', 'golden', 'bloodmoon', 'bloodmoon'] : ['frenzy', 'frenzy', 'golden'];
        const kind = kinds[Math.floor(this.r() * kinds.length)];
        started = this.start(kind, time, boat, hull);
      }
    }
    const e = this.active;
    if (e?.kind === 'meteor') {
      this.nextMeteor -= dt;
      if (this.nextMeteor <= 0) {
        this.nextMeteor = 1.5 + this.r() * 3;
        const a = this.r() * Math.PI * 2, d = 60 + this.r() * 220;
        const to = new Vec3(boat.x + Math.cos(a) * d, 0, boat.z + Math.sin(a) * d);
        if (heightAt(to.x, to.z) < -3) {
          const from = to.clone().add(new Vec3(-120 + this.r() * 60, 380, -80 + this.r() * 60));
          this.meteors.push({ from, to, t: 0, dur: 1.4 });
        }
      }
    }
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      const p = m.from.clone().lerp(m.to, Math.min(1, m.t / m.dur));
      for (let k = 0; k < 3; k++) fx.spawn({ x: p.x + fx.rnd(), y: p.y + fx.rnd(), z: p.z + fx.rnd(), max: 0.6, size: 1.6, r: 0.8, g: 0.85, b: 1, a: 0, kind: 0 });
      if (m.t >= m.dur) {
        fx.splash(m.to, 1.4);
        this.fragments.push({ pos: m.to.clone(), until: time + 45, spin: this.r() * 6 });
        this.meteors.splice(i, 1);
      }
    }
    return started;
  }

  start(kind: EventKind, time: number, boat: Vec3, hull: number): WorldEvent {
    let zone: Zone | null = null;
    let pos = boat.clone();
    let radius = 0;
    if (kind === 'frenzy') {
      const open = realmZones().filter((z) => z.hull <= hull);
      const near = open.filter((z) => Math.hypot(z.x - boat.x, z.z - boat.z) < z.radius + 900);
      const pool = near.length ? near : open;
      zone = pool[Math.floor(this.r() * pool.length)];
      for (let t = 0; t < 40; t++) {
        const a = this.r() * Math.PI * 2, d = Math.sqrt(this.r()) * zone.radius * 0.7;
        const x = zone.x + Math.cos(a) * d, z = zone.z + Math.sin(a) * d;
        if (heightAt(x, z) < -15) { pos = new Vec3(x, 0, z); break; }
      }
      radius = 70;
    }
    this.active = { kind, zone, pos, radius, until: time + (kind === 'frenzy' ? 180 : kind === 'golden' ? 120 : kind === 'bloodmoon' ? 240 : 100) };
    return this.active;
  }

  /** Extra hot-spot strength from a frenzy at a point. */
  frenzyAt(x: number, z: number) {
    const e = this.active;
    if (!e || e.kind !== 'frenzy') return 0;
    const d = Math.hypot(x - e.pos.x, z - e.pos.z);
    return d < e.radius ? 1.5 : 0;
  }

  get golden() { return this.active?.kind === 'golden'; }
  get bloodMoon() { return this.active?.kind === 'bloodmoon'; }

  /** Collects star fragments the boat sails through; returns how many. */
  collect(boat: Vec3) {
    const before = this.fragments.length;
    this.fragments = this.fragments.filter((f) => f.pos.distanceXZ(boat) > 9);
    return before - this.fragments.length;
  }

  draw(r: Renderer, time: number) {
    for (const f of this.fragments) {
      const y = 0.8 + Math.sin(time * 2 + f.spin) * 0.3;
      r.particle(f.pos.x, f.pos.y + y, f.pos.z, 2.2 + Math.sin(time * 6 + f.spin) * 0.3, 0.7, 0.8, 1.2, 0, 3, time + f.spin);
      r.particle(f.pos.x, f.pos.y + y, f.pos.z, 1.2, 1, 1, 1, 0, 0);
    }
    const e = this.active;
    if (e?.kind === 'frenzy') {
      // swirling marker over the frenzy
      for (let k = 0; k < 6; k++) {
        const a = time * 0.8 + (k / 6) * Math.PI * 2;
        r.particle(e.pos.x + Math.cos(a) * 20, 18 + Math.sin(time * 2 + k) * 2, e.pos.z + Math.sin(a) * 20, 1.4, 1.2, 0.6, 0.2, 0, 3, time);
      }
    }
  }
}

export const zoneName = (id: string) => ALL_ZONES.find((z) => z.id === id)?.name ?? '';

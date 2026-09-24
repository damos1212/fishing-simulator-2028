// Ambient life and NPC traffic, per realm: dolphin pods and breaching whales, other fishing boats
// on the Blue Planet; pterodactyls and plesiosaurs in Jurassic Tides; fel drakes in the Shattered
// Expanse; slow-motion leapers and air jellies on Selene; chrome dolphins in the Neon Dimension;
// star whales in the Cosmic Maw.
import { type Archetype, speciesById } from '../data/fish';
import { type RealmId, realmById, type ZoneId } from '../data/zones';
import { clamp, mat4, rng, Vec3, wrapAngle } from '../engine/math';
import { Inst, type Renderer } from '../engine/renderer';
import type { Scenery } from '../world/scenery';
import { heightAt, ISLANDS } from '../world/terrain';
import type { Assets } from './assets';
import { Boat } from './boat';
import { FishActor } from './fishing';
import type { FX } from './fx';

interface Jumper { actor: FishActor; t: number; start: Vec3; vel: Vec3; delay: number; splashed: boolean; g: number }
interface Npc { boat: Boat; target: Vec3; wait: number; stuck: number }
interface Soarer { center: Vec3; radius: number; height: number; speed: number; phase: number; scale: number; inst: Inst }
interface Floater { actor: FishActor; base: Vec3; phase: number }

/** size = body length in meters */
interface Pod { model: Archetype; colors: [string, string, string]; pattern?: number; glow?: number; size?: number }
interface RealmLife {
  pods: Pod[];
  podZones: ZoneId[] | 'all';
  whale: Pod | null;
  whaleZones: ZoneId[] | 'all';
  gravity: number;
}

const LIFE: Record<RealmId, RealmLife> = {
  blue: {
    pods: [{ model: 'dolphin', colors: ['#6a8aa8', '#e8eef4', '#5a7a98'] }],
    podZones: ['open', 'shallows', 'deepblue', 'coral', 'kelp', 'atlantis'],
    whale: { model: 'whale', colors: ['#4a5a7a', '#d8dce8', '#3a4a6a'], size: 14 },
    whaleZones: ['deepblue', 'frost', 'open', 'atlantis', 'void'],
    gravity: 1,
  },
  jurassic: {
    pods: [{ model: 'dolphin', colors: ['#4a6a8a', '#d8e0e8', '#2a3a5a'], size: 3 }, { model: 'plesio', colors: ['#5a8a7a', '#d0e8e0', '#2a5a4a'], size: 4.5 }],
    podZones: 'all',
    whale: { model: 'mosasaur', colors: ['#3a5a4a', '#c0d0c0', '#1a2a20'], size: 12 },
    whaleZones: 'all',
    gravity: 1,
  },
  shattered: {
    pods: [{ model: 'drake', colors: ['#1a3a1a', '#60a060', '#80ff40'], glow: 0.6, size: 3.5 }, { model: 'slim', colors: ['#6ab0ff', '#e0f0ff', '#ffffff'], size: 1 }],
    podZones: 'all',
    whale: { model: 'drake', colors: ['#1a0a3a', '#8a60c0', '#60ffa0'], glow: 0.8, size: 14 },
    whaleZones: 'all',
    gravity: 0.85,
  },
  selene: {
    pods: [{ model: 'dolphin', colors: ['#8ab0ff', '#ffffff', '#3a60c0'] }],
    podZones: 'all',
    whale: { model: 'whale', colors: ['#2a3a6a', '#a0b0e0', '#ffffff'], pattern: 4, glow: 0.3, size: 18 },
    whaleZones: 'all',
    gravity: 0.35,
  },
  neon: {
    pods: [{ model: 'dolphin', colors: ['#c0c8e0', '#ffffff', '#ff5ab0'] }, { model: 'pixel', colors: ['#ff40c0', '#ffc0f0', '#40ffff'], pattern: 7, size: 1.2 }],
    podZones: 'all',
    whale: { model: 'whale', colors: ['#000000', '#40ff40', '#40ff40'], glow: 0.8, size: 14 },
    whaleZones: 'all',
    gravity: 1,
  },
  maw: {
    pods: [{ model: 'slim', colors: ['#a0e0ff', '#ffffff', '#ffd040'], glow: 0.8, size: 1.2 }],
    podZones: 'all',
    whale: { model: 'whale', colors: ['#0a1040', '#6080ff', '#ffffff'], pattern: 4, glow: 0.6, size: 24 },
    whaleZones: 'all',
    gravity: 0.6,
  },
};

const NPC_COLORS = ['#c8303a', '#3a8a3a', '#e0a020', '#6a4ab0', '#2a8aa8', '#e06a30'];
const NPC_HATS = ['HatCowboy', 'HatTop', 'HatPirate', 'HatChef', 'HatViking', 'HatPropeller'];
const tmpM = mat4.create();

export class Life {
  private jumpers: Jumper[] = [];
  private soarers: Soarer[] = [];
  private floaters: Floater[] = [];
  private nextPod = 12;
  private nextWhale = 25;
  private r = rng(99);
  private realm: RealmId = 'blue';
  private waypoints: Vec3[] = [];
  npcs: Npc[] = [];

  /** Swaps the creature cast for a realm. */
  setRealm(realm: RealmId, scenery: Scenery) {
    this.realm = realm;
    this.jumpers = [];
    this.soarers = [];
    this.floaters = [];
    this.npcs = [];
    this.nextPod = 8;
    this.nextWhale = 15;
    if (realm === 'blue') {
      this.waypoints = [scenery.dockSpot.clone().add(new Vec3(0, 0, 80)), ...scenery.outposts.filter((o) => ['kelp', 'coral', 'deepblue'].includes(o.zone)).map((o) => o.pos),
        new Vec3(200, 0, -250), new Vec3(-250, 0, 150), new Vec3(300, 0, 300)];
      for (let i = 0; i < 6; i++) {
        const b = new Boat();
        b.npc = true;
        const p = this.waypoints[i % this.waypoints.length];
        b.pos.set(p.x + (this.r() - 0.5) * 60, 0, p.z + (this.r() - 0.5) * 60);
        b.heading = this.r() * Math.PI * 2;
        b.paint = NPC_COLORS[i];
        b.hat = NPC_HATS[i];
        b.engineTier = 1;
        b.flagInst.a.set([0.9, 0.9, 0.9, 0]);
        this.npcs.push({ boat: b, target: this.pick(), wait: 0, stuck: 0 });
      }
    }
    if (realm === 'jurassic' || realm === 'shattered') {
      // flocks circling the islands
      const tint = realm === 'jurassic' ? [1, 1, 1, 0] : [0.35, 0.8, 0.3, 0.4];
      for (const isl of ISLANDS) {
        if (isl.r < 40) continue;
        const n = 2 + Math.floor(this.r() * 3);
        for (let k = 0; k < n; k++) {
          const inst = Inst.solid(0, 0.03);
          inst.a.set(tint);
          inst.c[3] = 8;
          inst.amp = 0.12;
          this.soarers.push({ center: new Vec3(isl.x, 0, isl.z), radius: isl.r * (0.8 + this.r()), height: isl.top + 25 + this.r() * 40,
            speed: (0.12 + this.r() * 0.1) * (this.r() < 0.5 ? 1 : -1), phase: this.r() * 10, scale: 1 + this.r() * 0.8, inst });
        }
      }
    }
    if (realm === 'selene' || realm === 'maw') {
      // jellies drifting through the air in low gravity
      const sp = speciesById.get(realm === 'selene' ? 'astrojelly' : 'nebulajelly')!;
      for (let k = 0; k < 40; k++) {
        const a = this.r() * Math.PI * 2, d = 80 + this.r() * 1800;
        const actor = new FishActor(sp, 1.5 + this.r() * 2.5);
        const base = new Vec3(Math.cos(a) * d, 6 + this.r() * 40, Math.sin(a) * d);
        actor.pos.copy(base);
        this.floaters.push({ actor, base, phase: this.r() * 10 });
      }
    }
  }

  private pick() {
    const w = this.waypoints[Math.floor(this.r() * this.waypoints.length)];
    return new Vec3(w.x + (this.r() - 0.5) * 120, 0, w.z + (this.r() - 0.5) * 120);
  }

  /** A decorative creature `length` meters long. */
  private actor(pod: Pod, length: number) {
    const sp = speciesById.get('oarfish')!;
    return new FishActor({ ...sp, model: pod.model, colors: pod.colors, glow: pod.glow ?? 0, pattern: pod.pattern ?? 0, size: length / 1.5, boss: false }, 1);
  }

  update(dt: number, time: number, player: Boat, zone: ZoneId, waveScale: number, fx: FX, sound: { splash: (s: number) => void }) {
    const cfg = LIFE[this.realm];
    const g = realmById(this.realm).gravity;
    // pods race alongside a moving boat
    this.nextPod -= dt;
    if (this.nextPod <= 0 && Math.abs(player.speed) > 6 && (cfg.podZones === 'all' || cfg.podZones.includes(zone))) {
      this.nextPod = 22 + this.r() * 28;
      const pod = cfg.pods[Math.floor(this.r() * cfg.pods.length)];
      const fwd = player.forward;
      const side = this.r() < 0.5 ? 1 : -1;
      for (let i = 0; i < 3 + Math.floor(this.r() * 3); i++) {
        const a = this.actor(pod, pod.size ?? 2.4);
        const start = player.pos.clone().addScaled(fwd, 10 + i * 4).add(new Vec3(fwd.z * side * (6 + i * 2), -0.8, -fwd.x * side * (6 + i * 2)));
        const vel = fwd.clone().scale(Math.abs(player.speed) + 2).add(new Vec3(0, (6 + this.r() * 3) * Math.sqrt(g), 0));
        const hop = (Math.abs(player.speed) * 1.6 + 8) / Math.sqrt(g);
        for (let k = 0; k < 3; k++) this.jumpers.push({ actor: a, t: 0, start: start.clone().addScaled(fwd, k * hop), vel: vel.clone(), delay: i * 0.25 + k * 1.6 / Math.sqrt(g), splashed: false, g: 12 * g });
      }
    }
    // big creatures breach far away
    this.nextWhale -= dt;
    if (this.nextWhale <= 0 && cfg.whale && (cfg.whaleZones === 'all' || cfg.whaleZones.includes(zone))) {
      this.nextWhale = 30 + this.r() * 45;
      const ang = this.r() * Math.PI * 2, d = 140 + this.r() * 200;
      const start = new Vec3(player.pos.x + Math.cos(ang) * d, -6, player.pos.z + Math.sin(ang) * d);
      if (heightAt(start.x, start.z) < -25) {
        let pod = cfg.whale;
        if (this.realm === 'blue') {
          const sp = zone === 'void' ? speciesById.get('spacewhale')! : zone === 'frost' ? speciesById.get('yetiwhale')! : null;
          if (sp) pod = { model: 'whale', colors: sp.colors, glow: sp.glow, pattern: sp.pattern, size: 14 };
        }
        const actor = this.actor(pod, pod.size ?? 14);
        const dir = this.r() * Math.PI * 2;
        this.jumpers.push({ actor, t: 0, start, vel: new Vec3(Math.cos(dir) * 4, 13 * Math.sqrt(g), Math.sin(dir) * 4), delay: 0, splashed: false, g: 9 * g });
        fx.splash(new Vec3(start.x, 0, start.z), 2);
      }
    }
    for (let i = this.jumpers.length - 1; i >= 0; i--) {
      const j = this.jumpers[i];
      j.t += dt;
      const t = j.t - j.delay;
      if (t < 0) continue;
      const p = j.actor.pos.copy(j.start).addScaled(j.vel, t);
      p.y -= 0.5 * j.g * t * t;
      j.actor.dir.set(j.vel.x, j.vel.y - j.g * t, j.vel.z).normalize();
      j.actor.phase += dt * 10;
      if (!j.splashed && p.y > 0) { j.splashed = true; fx.splash(p, j.actor.length > 5 ? 2 : 0.5); }
      if (t > 0.4 && p.y < -1) {
        fx.splash(p, j.actor.length > 5 ? 3 : 0.6);
        if (j.actor.length > 5 && p.distanceXZ(player.pos) < 400) sound.splash(1.5);
        this.jumpers.splice(i, 1);
      }
    }
    for (const f of this.floaters) {
      f.actor.pos.set(f.base.x + Math.sin(time * 0.05 + f.phase) * 30, f.base.y + Math.sin(time * 0.4 + f.phase) * 3, f.base.z + Math.cos(time * 0.04 + f.phase) * 30);
      f.actor.dir.set(0, 1, 0.01);
      f.actor.phase += dt * 1.5;
    }
    // NPC boats wander between fishing grounds and sometimes stop to fish
    for (const n of this.npcs) {
      const b = n.boat;
      if (n.wait > 0) {
        n.wait -= dt;
        b.throttle = 0;
        b.steer = 0;
        b.anchored = true;
        b.armTarget = -0.2 + Math.sin(time * 1.3) * 0.1;
        b.rodBend = 0.3 + Math.sin(time * 2) * 0.15;
      } else {
        b.anchored = false;
        const want = Math.atan2(n.target.x - b.pos.x, n.target.z - b.pos.z);
        let steer = clamp(wrapAngle(want - b.heading) * 2, -1, 1);
        const ahead = b.pos.clone().addScaled(b.forward, 25);
        if (heightAt(ahead.x, ahead.z) > -3) steer = 1;
        b.steer = steer;
        b.throttle = 0.55;
        b.armTarget = 0;
        if (b.pos.distanceXZ(n.target) < 30) { n.wait = 15 + this.r() * 25; n.target = this.pick(); }
        n.stuck = Math.abs(b.speed) < 1 ? n.stuck + dt : 0;
        if (n.stuck > 4) { n.target = this.pick(); n.stuck = 0; b.heading += Math.PI; }
      }
      b.update(dt, time, 10, waveScale, () => {});
    }
  }

  draw(r: Renderer, a: Assets, cam: Vec3, time: number, drawFish: (f: FishActor) => void) {
    for (const j of this.jumpers) if (j.t >= j.delay) drawFish(j.actor);
    for (const n of this.npcs) if (n.boat.pos.distanceXZ(cam) < 900) n.boat.draw(r, a, time);
    for (const f of this.floaters) if (f.actor.pos.distanceXZ(cam) < 700) drawFish(f.actor);
    const ptero = a.models.ptero;
    for (const s of this.soarers) {
      const ang = s.phase + time * s.speed;
      const x = s.center.x + Math.cos(ang) * s.radius, z = s.center.z + Math.sin(ang) * s.radius;
      if (Math.hypot(x - cam.x, z - cam.z) > 1800) continue;
      const heading = Math.atan2(-Math.sin(ang) * Math.sign(s.speed), Math.cos(ang) * Math.sign(s.speed)) + Math.PI;
      s.inst.phase = time * 3 + s.phase;
      r.drawModel(ptero, mat4.compose(tmpM, x, s.height + Math.sin(time * 0.7 + s.phase) * 3, z, heading, 0, Math.sign(s.speed) * 0.35, s.scale), s.inst);
    }
  }
}

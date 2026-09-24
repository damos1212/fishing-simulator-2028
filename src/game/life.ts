// Ambient sea life and NPC traffic: dolphin pods, breaching whales, other fishing boats.
import { speciesById } from '../data/fish';
import type { ZoneId } from '../data/zones';
import { clamp, rng, Vec3, wrapAngle } from '../engine/math';
import type { Renderer } from '../engine/renderer';
import { heightAt } from '../world/terrain';
import type { Assets } from './assets';
import { Boat } from './boat';
import { FishActor } from './fishing';
import type { FX } from './fx';

interface Jumper { actor: FishActor; t: number; start: Vec3; vel: Vec3; delay: number; splashed: boolean; g: number }
interface Npc { boat: Boat; target: Vec3; wait: number; stuck: number }

const DOLPHIN_ZONES: ZoneId[] = ['open', 'shallows', 'deepblue', 'coral', 'kelp', 'atlantis'];
const WHALE_ZONES: ZoneId[] = ['deepblue', 'frost', 'open', 'atlantis', 'void'];
const NPC_COLORS = ['#c8303a', '#3a8a3a', '#e0a020', '#6a4ab0', '#2a8aa8', '#e06a30'];
const NPC_HATS = ['HatCowboy', 'HatTop', 'HatPirate', 'HatChef', 'HatViking', 'HatPropeller'];

export class Life {
  private jumpers: Jumper[] = [];
  private nextPod = 12;
  private nextWhale = 25;
  private r = rng(99);
  npcs: Npc[] = [];

  constructor(private waypoints: Vec3[]) {
    for (let i = 0; i < 6; i++) {
      const b = new Boat();
      b.npc = true;
      const p = waypoints[i % waypoints.length];
      b.pos.set(p.x + (this.r() - 0.5) * 60, 0, p.z + (this.r() - 0.5) * 60);
      b.heading = this.r() * Math.PI * 2;
      b.paint = NPC_COLORS[i];
      b.hat = NPC_HATS[i];
      b.engineTier = 1;
      b.flagInst.a.set([0.9, 0.9, 0.9, 0]);
      this.npcs.push({ boat: b, target: this.pick(), wait: 0, stuck: 0 });
    }
  }

  private pick() {
    const w = this.waypoints[Math.floor(this.r() * this.waypoints.length)];
    return new Vec3(w.x + (this.r() - 0.5) * 120, 0, w.z + (this.r() - 0.5) * 120);
  }

  update(dt: number, time: number, player: Boat, zone: ZoneId, waveScale: number, fx: FX, sound: { splash: (s: number) => void }) {
    // dolphins race alongside a moving boat
    this.nextPod -= dt;
    if (this.nextPod <= 0 && Math.abs(player.speed) > 6 && DOLPHIN_ZONES.includes(zone)) {
      this.nextPod = 25 + this.r() * 30;
      const fwd = player.forward;
      const side = this.r() < 0.5 ? 1 : -1;
      const sp = speciesById.get('oarfish')!;
      for (let i = 0; i < 3 + Math.floor(this.r() * 3); i++) {
        const a = new FishActor({ ...sp, model: 'dolphin', colors: ['#6a8aa8', '#e8eef4', '#5a7a98'], glow: 0, pattern: 0 }, 1);
        const start = player.pos.clone().addScaled(fwd, 10 + i * 4).add(new Vec3(fwd.z * side * (6 + i * 2), -0.8, -fwd.x * side * (6 + i * 2)));
        const vel = fwd.clone().scale(Math.abs(player.speed) + 2).add(new Vec3(0, 6 + this.r() * 3, 0));
        // one actor makes three consecutive leaps along the boat's path
        for (let k = 0; k < 3; k++) this.jumpers.push({ actor: a, t: 0, start: start.clone().addScaled(fwd, k * (Math.abs(player.speed) * 1.6 + 8)), vel: vel.clone(), delay: i * 0.25 + k * 1.6, splashed: false, g: 12 });
      }
    }
    // whales breach far away
    this.nextWhale -= dt;
    if (this.nextWhale <= 0 && WHALE_ZONES.includes(zone)) {
      this.nextWhale = 35 + this.r() * 50;
      const a = this.r() * Math.PI * 2, d = 140 + this.r() * 200;
      const start = new Vec3(player.pos.x + Math.cos(a) * d, -6, player.pos.z + Math.sin(a) * d);
      if (heightAt(start.x, start.z) < -25) {
        const sp = speciesById.get(zone === 'void' ? 'spacewhale' : zone === 'frost' ? 'yetiwhale' : 'oarfish')!;
        const actor = new FishActor({ ...sp, model: 'whale', colors: zone === 'void' ? sp.colors : zone === 'frost' ? sp.colors : ['#4a5a7a', '#d8dce8', '#3a4a6a'], size: 14 }, 1);
        const dir = this.r() * Math.PI * 2;
        this.jumpers.push({ actor, t: 0, start, vel: new Vec3(Math.cos(dir) * 4, 13, Math.sin(dir) * 4), delay: 0, splashed: false, g: 9 });
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
  }
}

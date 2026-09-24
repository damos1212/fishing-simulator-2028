// Casting, the underwater lure, fish AI, hooking, fights and hazards.
import { ANIM, SPECIES, type Species } from '../data/fish';
import type { Stats } from '../data/upgrades';
import { LURE_COLORS } from '../data/upgrades';
import { ZONES, zoneWeights } from '../data/zones';
import { clamp, hex, mat4, rng, Vec3 } from '../engine/math';
import { Inst, type Renderer } from '../engine/renderer';
import { waveHeight } from '../world/environment';
import { heightAt } from '../world/terrain';
import type { Assets } from './assets';
import { catchFish, type CaughtFish, pickSpecies, rollSize } from './economy';

export type FishingState = 'idle' | 'aim' | 'flight' | 'under' | 'landing' | 'retrieve';

export type FishingEvent =
  | { type: 'splash'; pos: Vec3 }
  | { type: 'shallow' }
  | { type: 'hook'; fish: FishActor }
  | { type: 'lost'; fish: FishActor; by: 'sting' | 'thief' | 'snap' }
  | { type: 'needBait'; fish: FishActor }
  | { type: 'full' }
  | { type: 'land'; catches: CaughtFish[]; actors: FishActor[]; from: Vec3 }
  | { type: 'treasure'; amount: number; pos: Vec3 }
  | { type: 'lineMax' };

export class FishActor {
  pos = new Vec3();
  dir = new Vec3(0, 0, 1);
  target = new Vec3();
  speed: number;
  timer = 0;
  phase = Math.random() * 10;
  hooked = false;
  flee = 0;
  stamina = 1;
  cooldown = 0;
  leader: FishActor | null = null;
  offset = new Vec3();
  inst = new Inst();
  glowInst: Inst | null = null;
  gone = false;
  constructor(public sp: Species, public size: number) {
    this.speed = sp.speed * (0.7 + Math.random() * 0.4);
    const [a, b, c] = sp.colors.map(hex);
    this.inst.mode = 1;
    this.inst.outline = 0.018;
    this.inst.a.set([a[0], a[1], a[2], sp.glow ?? 0]);
    this.inst.b.set([b[0], b[1], b[2], sp.pattern ?? 0]);
    this.inst.c.set([c[0], c[1], c[2], ANIM[sp.model]]);
    if (sp.model === 'angler' || sp.glow) {
      this.glowInst = Inst.solid(2);
      this.glowInst.a.set([c[0], c[1], c[2], 4]);
    }
  }
  get kg() { return this.sp.kg * this.size * this.size; }
  /** Visual/collision length (cartoon-exaggerated). */
  get length() { return this.sp.size * this.size * 1.5; }
}

const eyeInst = Inst.solid(0, 0);
const TREASURE = [150, 400, 1500, 5000, 15000, 50000, 200000];

export interface FishingContext {
  stats: Stats;
  lureTier: number;
  tip: Vec3;
  boatPos: Vec3;
  time: number;
  waveScale: number;
  camForward: Vec3;
  camRight: Vec3;
  move: { x: number; z: number };
  dive: boolean;
  reel: boolean;
  hotspot: number;
  chests: { pos: Vec3; zone: number; taken: number }[];
}

export class Fishing {
  state: FishingState = 'idle';
  power = 0;
  private powerDir = 1;
  lure = new Vec3();
  lureVel = new Vec3();
  lureDir = new Vec3(0, 0, 1);
  fish: FishActor[] = [];
  hooked: FishActor[] = [];
  tension = 0;
  fighting: FishActor | null = null;
  stun = 0;
  lineMaxed = false;
  events: FishingEvent[] = [];
  castDir = new Vec3(0, 0, 1);
  castDist = 0;
  predicted: Vec3[] = [];
  private flightT = 0;
  private land = { t: 0, from: new Vec3(), catches: [] as CaughtFish[] };
  private rand = rng(777);
  private lastNeedBait = 0;
  private stingCooldown = 0;
  private lureInst = Inst.solid(1, 0.02);
  private hookInst = Inst.solid(0, 0.01);
  private m = mat4.create();
  private w: number[] = [];
  reeling = false;

  maxCast(stats: Stats) { return clamp(12 + stats.lineLength * 0.3, 14, 48); }

  startAim() { if (this.state === 'idle') { this.state = 'aim'; this.power = 0; this.powerDir = 1; } }
  cancelAim() { if (this.state === 'aim') this.state = 'idle'; }

  release(ctx: FishingContext) {
    if (this.state !== 'aim') return;
    this.castDist = 5 + this.power * (this.maxCast(ctx.stats) - 5);
    this.castDir.copy(ctx.camForward).normalize();
    const T = 0.9 + this.castDist * 0.018;
    const g = 14;
    this.lure.copy(ctx.tip);
    const h = ctx.tip.y;
    this.lureVel.set(this.castDir.x * this.castDist / T, (-h + (g * T * T) / 2) / T, this.castDir.z * this.castDist / T);
    this.flightT = 0;
    this.state = 'flight';
  }

  private predict(ctx: FishingContext) {
    const d = 5 + this.power * (this.maxCast(ctx.stats) - 5);
    const dir = ctx.camForward;
    const T = 0.9 + d * 0.018, g = 14, h = ctx.tip.y;
    const vx = dir.x * d / T, vz = dir.z * d / T, vy = (-h + (g * T * T) / 2) / T;
    this.predicted.length = 0;
    for (let i = 1; i <= 16; i++) {
      const t = (i / 16) * T;
      this.predicted.push(new Vec3(ctx.tip.x + vx * t, h + vy * t - (g * t * t) / 2, ctx.tip.z + vz * t));
    }
  }

  update(dt: number, ctx: FishingContext) {
    this.stingCooldown -= dt;
    switch (this.state) {
      case 'idle':
        this.lure.set(ctx.tip.x, ctx.tip.y - 0.7, ctx.tip.z);
        this.lureDir.set(0, -1, 0.01);
        break;
      case 'aim':
        this.power += this.powerDir * dt * 1.15;
        if (this.power >= 1) { this.power = 1; this.powerDir = -1; }
        if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
        this.lure.set(ctx.tip.x, ctx.tip.y - 0.7, ctx.tip.z);
        this.predict(ctx);
        break;
      case 'flight': {
        this.flightT += dt;
        this.lureVel.y -= 14 * dt;
        this.lure.addScaled(this.lureVel, dt);
        this.lureDir.copy(this.lureVel).normalize();
        const wh = waveHeight(this.lure.x, this.lure.z, ctx.time, ctx.waveScale);
        if (this.lure.y <= wh) {
          const splashPos = this.lure.clone();
          this.events.push({ type: 'splash', pos: splashPos });
          if (heightAt(this.lure.x, this.lure.z) > -1.5) {
            this.events.push({ type: 'shallow' });
            this.state = 'retrieve';
            this.flightT = 0;
            this.land.from.copy(this.lure);
            break;
          }
          this.lure.y = wh - 0.6;
          this.lureVel.set(this.lureVel.x * 0.1, -3, this.lureVel.z * 0.1);
          this.enterWater(ctx);
        }
        break;
      }
      case 'under':
        this.updateUnder(dt, ctx);
        break;
      case 'landing':
      case 'retrieve': {
        this.flightT += dt;
        const t = clamp(this.flightT / 0.8, 0, 1);
        const e = t * t * (3 - 2 * t);
        this.lure.copy(this.land.from).lerp(ctx.tip, e);
        this.lure.y += Math.sin(t * Math.PI) * 5;
        this.hooked.forEach((f, i) => {
          f.pos.copy(this.lure).add(new Vec3(Math.sin(i * 2.4) * 0.5, -0.4 - i * 0.15, Math.cos(i * 2.4) * 0.5));
          f.phase += dt * 20;
        });
        if (t >= 1) {
          if (this.state === 'landing') {
            this.events.push({ type: 'land', catches: this.land.catches, actors: [...this.hooked], from: this.lure.clone() });
          }
          this.hooked = [];
          this.fish = [];
          this.state = 'idle';
        }
        break;
      }
    }
  }

  private enterWater(ctx: FishingContext) {
    this.state = 'under';
    this.fish = [];
    this.hooked = [];
    this.tension = 0;
    this.fighting = null;
    this.spawnFish(ctx, true);
  }

  private pickZone(x: number, z: number) {
    const w = zoneWeights(x, z, this.w);
    let r = this.rand();
    for (let i = 0; i < ZONES.length; i++) { r -= w[i]; if (r <= 0) return ZONES[i].id; }
    return 'open' as const;
  }

  private spawnFish(ctx: FishingContext, initial: boolean) {
    const target = Math.round(34 * (1 + ctx.hotspot * 0.7));
    let tries = 0;
    while (this.fish.length < target && tries++ < 60) {
      const ang = this.rand() * Math.PI * 2;
      const d = initial ? 4 + this.rand() * 36 : 38 + this.rand() * 18;
      const x = this.lure.x + Math.cos(ang) * d, z = this.lure.z + Math.sin(ang) * d;
      const floor = heightAt(x, z);
      if (floor > -2.5) continue;
      const y = clamp(this.lure.y + (this.rand() - 0.5) * 60, floor + 1.2, -1.2);
      const zone = this.pickZone(x, z);
      const pool = SPECIES.filter((s) => s.zone === zone);
      const sp = pickSpecies(pool, -y, this.rand, 1 + ctx.hotspot * 2.5);
      if (!sp) continue;
      const n = sp.school ? Math.max(2, Math.round(sp.school * (0.5 + this.rand() * 0.5))) : 1;
      let leader: FishActor | null = null;
      for (let k = 0; k < n; k++) {
        const f = new FishActor(sp, rollSize(this.rand));
        f.pos.set(x + (this.rand() - 0.5) * 3, clamp(y + (this.rand() - 0.5) * 2, floor + 1, -1), z + (this.rand() - 0.5) * 3);
        f.dir.set(this.rand() - 0.5, 0, this.rand() - 0.5).normalize();
        f.target.copy(f.pos);
        if (leader) { f.leader = leader; f.offset.set((this.rand() - 0.5) * 3, (this.rand() - 0.5) * 1.5, (this.rand() - 0.5) * 3); }
        else leader = f;
        this.fish.push(f);
      }
    }
  }

  private updateUnder(dt: number, ctx: FishingContext) {
    const s = ctx.stats;
    this.stun = Math.max(0, this.stun - dt);
    const slow = (this.stun > 0 ? 0.35 : 1) * clamp(1 - this.hooked.length * 0.04, 0.6, 1);
    const desired = new Vec3();
    const mv = ctx.camForward.clone().scale(ctx.move.z).addScaled(ctx.camRight, ctx.move.x);
    if (mv.length() > 0.01) desired.addScaled(mv.normalize(), s.swimSpeed * slow);
    const toTip = ctx.tip.clone().sub(this.lure);
    const tipDist = toTip.length();

    // fight: heaviest hooked fish that out-muscles the line
    this.fighting = null;
    for (const f of this.hooked) if (f.kg > s.lineStrength * 0.5 && (!this.fighting || f.kg > this.fighting.kg)) this.fighting = f;
    let reelMul = 1;
    if (this.fighting) {
      const f = this.fighting;
      const pw = clamp(f.kg / s.lineStrength, 0.2, 4) * (0.3 + 0.7 * f.stamina);
      if (ctx.reel) this.tension += dt * (0.22 + 0.5 * pw);
      else this.tension -= dt * 0.75;
      this.tension = Math.max(0, this.tension);
      f.stamina = Math.max(0, f.stamina - dt * (0.05 + 0.25 * this.tension) / Math.max(0.6, Math.sqrt(f.kg / s.lineStrength)));
      reelMul = clamp(1 - pw * 0.45, 0.15, 1);
      if (!ctx.reel) {
        const away = new Vec3(this.lure.x - ctx.boatPos.x, 0, this.lure.z - ctx.boatPos.z).normalize();
        const jerk = Math.sin(ctx.time * 2.3 + f.phase) * 0.6;
        desired.addScaled(away, f.sp.speed * pw * 0.8);
        desired.addScaled(new Vec3(-away.z, 0, away.x), jerk * f.sp.speed * pw);
        desired.y -= pw * 1.5;
      }
      if (this.tension >= 1) {
        this.drop(f, 'snap');
        this.tension = 0;
      }
    } else this.tension = Math.max(0, this.tension - dt * 2);

    this.reeling = ctx.reel;
    if (ctx.dive) desired.y -= s.diveSpeed * slow;
    else if (ctx.reel) desired.addScaled(toTip.clone().normalize(), s.reelSpeed * reelMul);
    else desired.y -= 1.2;
    this.lureVel.damp(desired, 5, dt);
    this.lure.addScaled(this.lureVel, dt);

    // constraints: surface, floor, line length
    const wh = waveHeight(this.lure.x, this.lure.z, ctx.time, ctx.waveScale);
    this.lure.y = Math.min(this.lure.y, wh - 0.5);
    const floor = heightAt(this.lure.x, this.lure.z);
    if (this.lure.y < floor + 0.4) { this.lure.y = floor + 0.4; this.lureVel.y = Math.max(0, this.lureVel.y); }
    const off = this.lure.clone().sub(ctx.tip);
    const L = off.length();
    this.lineMaxed = L > s.lineLength - 0.5;
    if (L > s.lineLength) this.lure.copy(ctx.tip).addScaled(off.scale(1 / L), s.lineLength);
    if (this.lureVel.length() > 0.4) this.lureDir.damp(this.lureVel.clone().normalize(), 6, dt).normalize();

    // finish when reeled up next to the boat
    const hd = Math.hypot(this.lure.x - ctx.boatPos.x, this.lure.z - ctx.boatPos.z);
    if (ctx.reel && this.lure.y > wh - 3 && (hd < 6 || tipDist < 5)) {
      this.finish();
      return;
    }

    // treasure
    for (const c of ctx.chests) {
      if (c.taken > ctx.time) continue;
      if (c.pos.distanceTo(this.lure) < 2.8) {
        c.taken = ctx.time + 600;
        this.events.push({ type: 'treasure', amount: TREASURE[Math.min(c.zone, TREASURE.length - 1)], pos: c.pos.clone() });
      }
    }

    this.updateFish(dt, ctx);
    this.spawnFish(ctx, false);
  }

  private finish() {
    this.land.catches = this.hooked.map((f) => catchFish(f.sp, f.size));
    this.land.from.copy(this.lure);
    this.flightT = 0;
    this.state = 'landing';
    for (const f of this.fish) if (!f.hooked) f.gone = true;
  }

  private drop(f: FishActor, by: 'sting' | 'thief' | 'snap') {
    const i = this.hooked.indexOf(f);
    if (i < 0) return;
    this.hooked.splice(i, 1);
    f.hooked = false;
    f.flee = 8;
    f.dir.copy(f.pos).sub(this.lure).normalize();
    if (by === 'thief') f.gone = true;
    this.events.push({ type: 'lost', fish: f, by });
  }

  private updateFish(dt: number, ctx: FishingContext) {
    const s = ctx.stats;
    const lure = this.lure;
    const tmp = new Vec3();
    for (const f of this.fish) {
      if (f.gone) continue;
      if (f.hooked) {
        const i = this.hooked.indexOf(f);
        const back = this.lureDir.clone().scale(-1);
        const side = new Vec3(back.z, 0, -back.x).normalize();
        const wig = Math.sin(ctx.time * 5 + i * 1.7);
        f.pos.copy(lure).addScaled(back, 0.4 + i * 0.3 + f.length * 0.45).addScaled(side, wig * 0.3).add(new Vec3(0, -0.25 - (i % 3) * 0.2, 0));
        f.dir.copy(back).addScaled(side, wig * 0.8).add(new Vec3(0, 0.15 * Math.sin(ctx.time * 3 + i), 0)).normalize();
        f.phase += dt * (14 + f.stamina * 10);
        continue;
      }
      f.flee -= dt;
      f.cooldown -= dt;
      tmp.copy(lure).sub(f.pos);
      const dist = tmp.length();
      if (dist > 72) { f.gone = true; continue; }
      let speed = f.speed;
      const sp = f.sp;
      const reach = 0.55 + f.length * 0.35;
      if (sp.hazard === 'thief') {
        if (this.hooked.length > 0 && dist < 32 && f.flee <= 0) {
          f.target.copy(lure);
          speed *= 1.5;
          if (dist < reach + 0.5) {
            let best = this.hooked[0];
            for (const h of this.hooked) if (h.sp.value * h.size > best.sp.value * best.size) best = h;
            this.drop(best, 'thief');
            f.flee = 12;
          }
        } else this.wander(f, dt, ctx);
      } else if (sp.hazard === 'sting') {
        this.wander(f, dt, ctx);
        speed *= 0.6;
        if (dist < f.length * 0.6 + 0.5 && this.stingCooldown <= 0) {
          this.stingCooldown = 1.6;
          this.stun = 1.2;
          this.lureVel.addScaled(tmp.clone().normalize(), 7);
          if (this.hooked.length > 0) this.drop(this.hooked[this.hooked.length - 1], 'sting');
        }
      } else if (f.flee <= 0 && dist < s.attract + f.length * 0.6) {
        if (s.baitTier >= sp.bait) {
          if (this.hooked.length < s.hooks) {
            f.target.copy(lure);
            speed *= 1.35;
            if (dist < reach) {
              f.hooked = true;
              f.stamina = 1;
              this.hooked.push(f);
              this.events.push({ type: 'hook', fish: f });
            }
          } else {
            if (f.cooldown <= 0 && dist < reach + 0.5) { this.events.push({ type: 'full' }); f.cooldown = 4; }
            this.wander(f, dt, ctx);
          }
        } else {
          f.target.copy(lure);
          if (dist < 2.2) {
            f.flee = 6;
            f.target.copy(f.pos).addScaled(tmp.clone().normalize(), -15);
            if (ctx.time - this.lastNeedBait > 6) { this.lastNeedBait = ctx.time; this.events.push({ type: 'needBait', fish: f }); }
          }
        }
      } else if (f.flee > 0) {
        speed *= 1.6;
        f.target.copy(f.pos).addScaled(tmp.clone().normalize(), -10);
      } else this.wander(f, dt, ctx);

      // steer
      const want = f.target.clone().sub(f.pos);
      const wl = want.length();
      if (wl > 0.05) f.dir.lerp(want.scale(1 / wl), clamp(dt * 2.2, 0, 1)).normalize();
      if (sp.model === 'jelly') f.dir.y *= 0.3;
      f.pos.addScaled(f.dir, speed * dt);
      const floor = heightAt(f.pos.x, f.pos.z);
      f.pos.y = clamp(f.pos.y, floor + 0.8, -0.8);
      f.phase += dt * (3 + speed * 2.5);
    }
    this.fish = this.fish.filter((f) => !f.gone);
  }

  private wander(f: FishActor, dt: number, ctx: FishingContext) {
    if (f.leader && !f.leader.gone && !f.leader.hooked) {
      f.target.copy(f.leader.pos).add(f.offset);
      return;
    }
    f.timer -= dt;
    if (f.timer <= 0 || f.pos.distanceTo(f.target) < 1.5) {
      f.timer = 4 + this.rand() * 5;
      const x = f.pos.x + (this.rand() - 0.5) * 40, z = f.pos.z + (this.rand() - 0.5) * 40;
      const floor = heightAt(x, z);
      const lo = Math.max(floor + 1, -f.sp.depth[1]), hi = Math.min(-1, -f.sp.depth[0]);
      const y = clamp(f.pos.y + (this.rand() - 0.5) * 12, Math.min(lo, hi), Math.max(lo, hi));
      f.target.set(x, y, z);
    }
    void ctx;
  }

  /** Legendary fish nearest to the lure (for the Legend Tracker). */
  nearestLegend(): FishActor | null {
    let best: FishActor | null = null, bd = Infinity;
    for (const f of this.fish) {
      if (f.sp.rarity !== 'legendary' || f.hooked) continue;
      const d = f.pos.distanceTo(this.lure);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  draw(r: Renderer, a: Assets, cam: Vec3, lureTier: number, time: number, tip: Vec3) {
    const up = new Vec3(0, 1, 0);
    if (this.state === 'idle') this.lure.set(tip.x, tip.y - 0.7, tip.z);
    if (this.state === 'under' || this.state === 'landing' || this.state === 'retrieve') {
      for (const f of this.fish) {
        if (f.gone || (this.state !== 'under' && !f.hooked)) continue;
        if (f.pos.distanceTo(cam) > 110) continue;
        this.drawFish(r, a, f, up);
      }
    }
    // lure
    const lc = LURE_COLORS[Math.min(lureTier, LURE_COLORS.length - 1)].map(hex);
    this.lureInst.a.set([lc[0][0], lc[0][1], lc[0][2], lureTier >= 3 ? 0.4 : 0]);
    this.lureInst.b.set([lc[1][0], lc[1][1], lc[1][2], lureTier === 1 ? 1 : 0]);
    this.lureInst.c.set([lc[2][0], lc[2][1], lc[2][2], 1]);
    this.lureInst.phase = time * 10;
    this.lureInst.amp = this.state === 'under' ? 0.05 : 0.02;
    const dir = this.lureDir.clone();
    if (dir.length() < 0.01) dir.set(0, 0, 1);
    const lm = mat4.fromForward(this.m, this.lure, dir, Math.abs(dir.y) > 0.95 ? new Vec3(1, 0, 0) : up, 0.42);
    const lure = a.models.lure;
    r.draw(lure.byName.get('Body')!, lm, this.lureInst);
    r.draw(lure.byName.get('Eye')!, lm, eyeInst);
    r.draw(lure.byName.get('Hook')!, lm, this.hookInst);
    drawLine(r, tip, this.lure, cam, this.state === 'under' ? 1 - clamp(this.tension, 0, 1) : 0.2);

    if (this.state === 'aim') {
      for (let i = 0; i < this.predicted.length; i++) {
        const p = this.predicted[i];
        r.particle(p.x, p.y, p.z, 0.12 + i * 0.01, 1, 0.9, 0.3, 0, 4);
      }
      const last = this.predicted[this.predicted.length - 1];
      if (last) r.particle(last.x, 0.15, last.z, 1.5 + Math.sin(time * 8) * 0.2, 1, 0.85, 0.2, 0, 2);
    }
  }

  drawFish(r: Renderer, a: Assets, f: FishActor, up: Vec3) {
    const model = a.fish[f.sp.model];
    const d = f.dir.clone();
    let u = up;
    if (f.sp.model === 'jelly') { d.set(f.dir.x, 0, f.dir.z); if (d.length() < 0.01) d.set(0, 0, 1); }
    else if (Math.abs(d.y) > 0.95) u = new Vec3(1, 0, 0);
    const m = mat4.fromForward(this.m, f.pos, d, u, f.length);
    f.inst.phase = f.phase;
    f.inst.amp = (f.hooked ? 0.16 : 0.08) * (f.sp.model === 'eel' ? 1.3 : f.sp.model === 'ray' ? 1.2 : f.sp.model === 'jelly' ? 1.5 : 1);
    if (f.sp.model === 'jelly') f.inst.amp = 0.12;
    r.draw(model.meshes[0], m, f.inst);
    for (let i = 1; i < model.meshes.length; i++) {
      const mesh = model.meshes[i];
      if (mesh.name === 'Glow') r.draw(mesh, m, f.glowInst ?? eyeInst);
      else r.draw(mesh, m, eyeInst);
    }
  }
}

/** Camera-facing ribbon for fishing line. `slack` 0..1 adds sag. */
export function drawLine(r: Renderer, a: Vec3, b: Vec3, cam: Vec3, slack: number) {
  const N = 24;
  const pts: Vec3[] = [];
  const dist = a.distanceTo(b);
  const sag = Math.min(4, dist * 0.12) * slack;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  for (let i = 0; i < N; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const dir = p1.clone().sub(p0).normalize();
    const w0 = Math.max(0.012, p0.distanceTo(cam) * 0.0016);
    const w1 = Math.max(0.012, p1.distanceTo(cam) * 0.0016);
    const v0 = cam.clone().sub(p0).normalize(), v1 = cam.clone().sub(p1).normalize();
    const s0 = dir.clone().cross(v0).normalize().scale(w0), s1 = dir.clone().cross(v1).normalize().scale(w1);
    const c = 0.95;
    const A = p0.clone().add(s0), B = p0.clone().sub(s0), C = p1.clone().add(s1), D = p1.clone().sub(s1);
    for (const q of [A, B, C, C, B, D]) r.vertex(q.x, q.y, q.z, c, c, c * 0.95, 0.9);
  }
}

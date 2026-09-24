// Casting, the underwater lure, fish AI, hooking, fights (incl. bosses) and hazards.
import { ANIM, BOSS_FOR_ZONE, type Species, type WeatherKind } from '../data/fish';
import type { Stats } from '../data/upgrades';
import { LEVEL_VALUE } from '../data/upgrades';
import { activeOpen, NAMED_ZONES, realmZoneIdx, zoneAt, type ZoneId, zoneWeights } from '../data/zones';
import { clamp, hex, mat4, rng, Vec3 } from '../engine/math';
import { Inst, type Renderer } from '../engine/renderer';
import { waveHeight } from '../world/environment';
import { heightAt } from '../world/terrain';
import type { Assets } from './assets';
import { catchFish, type CaughtFish, MASTERY_BONUS, pickSpecies, rollSize, zonePool } from './economy';

export type FishingState = 'idle' | 'aim' | 'flight' | 'under' | 'landing' | 'retrieve';

export type FishingEvent =
  | { type: 'splash'; pos: Vec3 }
  | { type: 'shallow' }
  | { type: 'hook'; fish: FishActor }
  | { type: 'lost'; fish: FishActor; by: 'sting' | 'thief' | 'snap' }
  | { type: 'needBait'; fish: FishActor }
  | { type: 'full' }
  | { type: 'land'; catches: CaughtFish[]; actors: FishActor[]; from: Vec3; maxDepth: number; zone: ZoneId }
  | { type: 'treasure'; amount: number; pos: Vec3 }
  | { type: 'boss'; fish: FishActor }
  | { type: 'surge'; fish: FishActor }
  | { type: 'enrage'; fish: FishActor }
  | { type: 'perfect' };

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
  /** fight: -1 pulls left, +1 pulls right (camera relative) */
  pull = 1;
  pullT = 2;
  enrage = 0;
  surgeT = -1;
  constructor(public sp: Species, public size: number) {
    this.speed = sp.speed * (0.7 + Math.random() * 0.4);
    const [a, b, c] = sp.colors.map(hex);
    this.inst.mode = 1;
    this.inst.outline = sp.boss ? 0.012 : 0.018;
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
  get length() { return this.sp.size * this.size * (this.sp.boss ? 1 : 1.5); }
}

const eyeInst = Inst.solid(0, 0);
/** Power meter sweet spot for a perfect cast. */
export const PERFECT: [number, number] = [0.86, 0.97];

export interface FishingContext {
  stats: Stats;
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
  night: boolean;
  weather: WeatherKind;
  /** Boss Bait armed for this cast */
  bossBait: boolean;
  lucky: boolean;
  /** speed multiplier from energy drinks */
  energy: number;
  golden: boolean;
  chum: { pos: Vec3; until: number } | null;
  /** extra rare-fish multiplier (golden hour) */
  rareBoost: number;
  /** zones whose fish log is complete sell for more */
  mastered: Set<ZoneId>;
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
  boss: FishActor | null = null;
  stun = 0;
  lineMaxed = false;
  events: FishingEvent[] = [];
  castDir = new Vec3(0, 0, 1);
  castDist = 0;
  predicted: Vec3[] = [];
  maxDepth = 0;
  countering = 0;
  private flightT = 0;
  private land = { from: new Vec3(), catches: [] as CaughtFish[] };
  private rand = rng(777);
  private lastNeedBait = 0;
  private stingCooldown = 0;
  private lureInst = Inst.solid(1, 0.02);
  private hookInst = Inst.solid(0, 0.01);
  private m = mat4.create();
  private w: number[] = [];
  reeling = false;
  /** Lure colors: [back, belly, fin] hex + pattern + glow. */
  lureLook: { colors: [string, string, string]; pattern: number; glow: number } = { colors: ['#e05a3a', '#f7e0b0', '#ffd23a'], pattern: 0, glow: 0 };
  lineColor: [number, number, number] = [0.9, 0.9, 0.86];

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
    this.perfect = this.power >= PERFECT[0] && this.power <= PERFECT[1];
    if (this.perfect) this.events.push({ type: 'perfect' });
  }

  /** Released inside the sweet spot of the power meter: better odds for this cast. */
  perfect = false;

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
          this.events.push({ type: 'splash', pos: this.lure.clone() });
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
          f.pos.copy(this.lure).add(new Vec3(Math.sin(i * 2.4) * 0.5, -0.4 - i * 0.15 - (f.sp.boss ? f.length * 0.3 : 0), Math.cos(i * 2.4) * 0.5));
          f.phase += dt * 20;
        });
        if (t >= 1) {
          if (this.state === 'landing') {
            this.events.push({ type: 'land', catches: this.land.catches, actors: [...this.hooked], from: this.lure.clone(), maxDepth: this.maxDepth,
              zone: zoneAt(this.land.from.x, this.land.from.z).id });
          }
          this.hooked = [];
          this.fish = [];
          this.boss = null;
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
    this.boss = null;
    this.maxDepth = 0;
    if (ctx.bossBait) {
      const zone = zoneAt(this.lure.x, this.lure.z);
      const sp = BOSS_FOR_ZONE.get(zone.id);
      if (sp) {
        const b = new FishActor(sp, 1);
        const a = this.rand() * Math.PI * 2;
        const floor = heightAt(this.lure.x, this.lure.z);
        b.pos.set(this.lure.x + Math.cos(a) * 22, clamp(this.lure.y - 10, floor + sp.size * 0.3, -3), this.lure.z + Math.sin(a) * 22);
        b.dir.copy(this.lure).sub(b.pos).normalize();
        b.speed = sp.speed * 0.6;
        this.fish.push(b);
        this.boss = b;
        this.events.push({ type: 'boss', fish: b });
      }
    }
    this.spawnFish(ctx, true);
  }

  private pickZone(x: number, z: number): ZoneId {
    const w = zoneWeights(x, z, this.w);
    let r = this.rand();
    for (const i of realmZoneIdx()) { r -= w[i]; if (r <= 0) return NAMED_ZONES[i].id; }
    return activeOpen().id;
  }

  private spawnFish(ctx: FishingContext, initial: boolean) {
    const chum = ctx.chum && ctx.chum.until > ctx.time && ctx.chum.pos.distanceXZ(this.lure) < 45 ? 1 : 0;
    const target = Math.round(34 * (1 + ctx.hotspot * 0.7) * (1 + chum));
    const boost = (1 + ctx.hotspot * 2.5) * (ctx.lucky ? 3 : 1) * (this.perfect ? 2 : 1) * ctx.rareBoost;
    let tries = 0;
    while (this.fish.length < target && tries++ < 60) {
      const ang = this.rand() * Math.PI * 2;
      const d = initial ? 4 + this.rand() * 36 : 38 + this.rand() * 18;
      const x = this.lure.x + Math.cos(ang) * d, z = this.lure.z + Math.sin(ang) * d;
      const floor = heightAt(x, z);
      if (floor > -2.5) continue;
      let y = clamp(this.lure.y + (this.rand() - 0.5) * 60, floor + 1.2, -1.2);
      const pool = zonePool(this.pickZone(x, z));
      const sp = pickSpecies(pool, -y, this.rand, boost, { night: ctx.night, weather: ctx.weather });
      if (!sp) continue;
      if (sp.bottom) y = floor + 0.3;
      const n = sp.school ? Math.max(2, Math.round(sp.school * (0.5 + this.rand() * 0.5))) : 1;
      let leader: FishActor | null = null;
      for (let k = 0; k < n; k++) {
        const f = new FishActor(sp, rollSize(this.rand));
        f.pos.set(x + (this.rand() - 0.5) * 3, clamp(y + (this.rand() - 0.5) * 2, floor + 0.3, -1), z + (this.rand() - 0.5) * 3);
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
    const en = ctx.energy;
    this.stun = Math.max(0, this.stun - dt);
    const slow = (this.stun > 0 ? 0.35 : 1) * clamp(1 - this.hooked.length * 0.03, 0.6, 1) * en;
    const desired = new Vec3();
    const mv = ctx.camForward.clone().scale(ctx.move.z).addScaled(ctx.camRight, ctx.move.x);
    const toTip = ctx.tip.clone().sub(this.lure);
    const tipDist = toTip.length();

    // fight: heaviest hooked fish that out-muscles the line (bosses always fight)
    this.fighting = null;
    for (const f of this.hooked) {
      if ((f.sp.boss || f.kg > s.lineStrength * 0.5) && (!this.fighting || f.sp.boss || f.kg > this.fighting.kg)) this.fighting = f;
    }
    let reelMul = 1;
    this.countering = 0;
    if (this.fighting) {
      const f = this.fighting;
      const ratio = f.kg / s.lineStrength;
      const pw = clamp(ratio, 0.2, 4) * (0.3 + 0.7 * f.stamina);
      // the fish yanks left/right; steer the other way to counter
      f.pullT -= dt;
      if (f.pullT <= 0) {
        f.pull = this.rand() < 0.5 ? -1 : 1;
        f.pullT = (f.sp.boss ? 1.1 : 1.6) + this.rand() * (f.sp.boss ? 1.4 - f.enrage * 0.3 : 2);
      }
      const counter = ctx.move.x !== 0 ? (Math.sign(ctx.move.x) === -f.pull ? 1 : -1) : 0;
      this.countering = counter;
      const gain = counter > 0 ? 0.45 : counter < 0 ? 1.6 : 1;
      if (ctx.reel) this.tension += dt * (0.22 + 0.5 * pw) * gain;
      else this.tension -= dt * 0.75;
      this.tension = Math.max(0, this.tension);
      const bossTough = f.sp.boss ? 3.2 : 1;
      f.stamina = Math.max(0, f.stamina - dt * (0.05 + 0.25 * this.tension) * (counter > 0 ? 2.2 : 1) / Math.max(0.6, Math.sqrt(ratio)) / bossTough);
      reelMul = clamp(1 - pw * 0.45, f.sp.boss ? 0.25 : 0.15, 1);
      // bosses enrage and surge
      if (f.sp.boss) {
        const stage = f.stamina < 0.33 ? 2 : f.stamina < 0.66 ? 1 : 0;
        if (stage > f.enrage) { f.enrage = stage; this.events.push({ type: 'enrage', fish: f }); }
        if (f.surgeT < 0 && this.rand() < dt * (0.12 + f.enrage * 0.1)) { f.surgeT = 1.1; this.events.push({ type: 'surge', fish: f }); }
        if (f.surgeT >= 0) {
          f.surgeT -= dt;
          if (f.surgeT < 0) this.tension += ctx.reel ? 0.5 : 0.08;
        }
      }
      const side = ctx.camRight.clone().scale(f.pull);
      desired.addScaled(side, f.sp.speed * pw * (counter > 0 ? 0.15 : 0.7));
      if (!ctx.reel) {
        const away = new Vec3(this.lure.x - ctx.boatPos.x, 0, this.lure.z - ctx.boatPos.z).normalize();
        desired.addScaled(away, f.sp.speed * pw * 0.8);
        desired.y -= pw * 1.5;
      }
      if (this.tension >= 1) {
        this.drop(f, 'snap');
        this.tension = 0;
      }
      if (mv.length() > 0.01) desired.addScaled(mv.normalize(), s.swimSpeed * slow * 0.35);
    } else {
      this.tension = Math.max(0, this.tension - dt * 2);
      if (mv.length() > 0.01) desired.addScaled(mv.normalize(), s.swimSpeed * slow);
    }

    this.reeling = ctx.reel;
    if (ctx.dive) desired.y -= s.diveSpeed * slow;
    else if (ctx.reel) desired.addScaled(toTip.clone().normalize(), s.reelSpeed * reelMul * en);
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
    this.maxDepth = Math.max(this.maxDepth, -this.lure.y);

    // finish when reeled up next to the boat (not while a boss is still fresh)
    const hd = Math.hypot(this.lure.x - ctx.boatPos.x, this.lure.z - ctx.boatPos.z);
    const bossFresh = this.hooked.some((f) => f.sp.boss && f.stamina > 0.05);
    if (ctx.reel && !bossFresh && this.lure.y > wh - 3 && (hd < 6 || tipDist < 5)) {
      this.finish(ctx);
      return;
    }

    // treasure
    for (const c of ctx.chests) {
      if (c.taken > ctx.time) continue;
      if (c.pos.distanceTo(this.lure) < 2.8) {
        c.taken = ctx.time + 600;
        this.events.push({ type: 'treasure', amount: LEVEL_VALUE[NAMED_ZONES[c.zone].level] * 15, pos: c.pos.clone() });
      }
    }

    this.updateFish(dt, ctx);
    this.spawnFish(ctx, false);
  }

  private finish(ctx: FishingContext) {
    this.land.catches = this.hooked.map((f) => catchFish(f.sp, f.size, ctx.golden, ctx.mastered.has(f.sp.zone) ? MASTERY_BONUS : 1));
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
    f.stamina = Math.min(1, f.stamina + 0.3);
    f.dir.copy(f.pos).sub(this.lure).normalize();
    if (by === 'thief') f.gone = true;
    if (f === this.boss && by === 'snap') { f.flee = 4; }
    this.events.push({ type: 'lost', fish: f, by });
  }

  private hook(f: FishActor) {
    f.hooked = true;
    f.stamina = 1;
    this.hooked.push(f);
    this.events.push({ type: 'hook', fish: f });
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
        const pullSide = f === this.fighting ? ctx.camRight.clone().scale(f.pull * f.length * 0.5) : new Vec3();
        f.pos.copy(lure).addScaled(back, 0.4 + i * 0.3 + f.length * 0.45).addScaled(side, wig * 0.3).add(new Vec3(0, -0.25 - (i % 3) * 0.2, 0)).add(pullSide);
        f.dir.copy(back).addScaled(side, wig * 0.8).add(pullSide.clone().scale(0.5)).add(new Vec3(0, 0.15 * Math.sin(ctx.time * 3 + i), 0)).normalize();
        f.phase += dt * (14 + f.stamina * 10);
        continue;
      }
      f.flee -= dt;
      f.cooldown -= dt;
      tmp.copy(lure).sub(f.pos);
      const dist = tmp.length();
      if (dist > (f.sp.boss ? 200 : 72)) { f.gone = true; continue; }
      let speed = f.speed;
      const sp = f.sp;
      const reach = 0.55 + f.length * 0.35;
      if (sp.boss) {
        // bosses hunt the lure, bait tier doesn't matter
        f.target.copy(lure);
        speed = Math.max(3, sp.speed) * (f.flee > 0 ? 0.3 : 1.3);
        if (dist < reach + 0.6 && f.flee <= 0) this.hook(f);
      } else if (sp.hazard === 'thief') {
        if (this.hooked.length > 0 && dist < 32 && f.flee <= 0) {
          f.target.copy(lure);
          speed *= 1.5;
          if (dist < reach + 0.5) {
            const pool = this.hooked.filter((h) => !h.sp.boss);
            if (pool.length) {
              let best = pool[0];
              for (const h of pool) if (h.sp.value * h.size > best.sp.value * best.size) best = h;
              this.drop(best, 'thief');
            }
            f.flee = 12;
          }
        } else this.wander(f, dt);
      } else if (sp.hazard === 'sting') {
        this.wander(f, dt);
        speed *= 0.6;
        if (dist < f.length * 0.6 + 0.5 && this.stingCooldown <= 0) {
          this.stingCooldown = 1.6;
          this.stun = 1.2;
          this.lureVel.addScaled(tmp.clone().normalize(), 7);
          const pool = this.hooked.filter((h) => !h.sp.boss);
          if (pool.length > 0) this.drop(pool[pool.length - 1], 'sting');
        }
      } else if (f.flee <= 0 && dist < s.attract + f.length * 0.6) {
        if (s.baitTier >= sp.bait || sp.junk) {
          if (this.hooked.length < s.hooks) {
            f.target.copy(lure);
            speed *= sp.junk ? 0 : 1.35;
            if (dist < reach + (sp.junk ? 0.4 : 0)) this.hook(f);
          } else {
            if (f.cooldown <= 0 && dist < reach + 0.5) { this.events.push({ type: 'full' }); f.cooldown = 4; }
            this.wander(f, dt);
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
      } else this.wander(f, dt);

      // steer
      const want = f.target.clone().sub(f.pos);
      const wl = want.length();
      if (wl > 0.05) f.dir.lerp(want.scale(1 / wl), clamp(dt * (sp.boss ? 1.2 : 2.2), 0, 1)).normalize();
      if (sp.upright) f.dir.y *= 0.3;
      f.pos.addScaled(f.dir, speed * dt);
      const floor = heightAt(f.pos.x, f.pos.z);
      if (sp.bottom) f.pos.y = floor + 0.25 + f.length * 0.1;
      else f.pos.y = clamp(f.pos.y, floor + 0.8 + (sp.boss ? f.length * 0.2 : 0), -0.8 - (sp.boss ? f.length * 0.15 : 0));
      f.phase += dt * (3 + speed * 2.5);
    }
    this.fish = this.fish.filter((f) => !f.gone || f.hooked);
  }

  private wander(f: FishActor, dt: number) {
    if (f.leader && !f.leader.gone && !f.leader.hooked) {
      f.target.copy(f.leader.pos).add(f.offset);
      return;
    }
    f.timer -= dt;
    if (f.timer <= 0 || f.pos.distanceTo(f.target) < 1.5) {
      f.timer = 4 + this.rand() * 5;
      const range = f.sp.bottom ? 10 : 40;
      const x = f.pos.x + (this.rand() - 0.5) * range, z = f.pos.z + (this.rand() - 0.5) * range;
      const floor = heightAt(x, z);
      const lo = Math.max(floor + 1, -f.sp.depth[1]), hi = Math.min(-1, -f.sp.depth[0]);
      const y = clamp(f.pos.y + (this.rand() - 0.5) * 12, Math.min(lo, hi), Math.max(lo, hi));
      f.target.set(x, y, z);
    }
  }

  /** Legendary fish nearest to the lure (for the Legend Tracker). */
  nearestLegend(): FishActor | null {
    let best: FishActor | null = null, bd = Infinity;
    for (const f of this.fish) {
      if ((f.sp.rarity !== 'legendary' && !f.sp.boss) || f.hooked) continue;
      const d = f.pos.distanceTo(this.lure);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  draw(r: Renderer, a: Assets, cam: Vec3, time: number, tip: Vec3) {
    const up = new Vec3(0, 1, 0);
    if (this.state === 'idle') this.lure.set(tip.x, tip.y - 0.7, tip.z);
    if (this.state === 'under' || this.state === 'landing' || this.state === 'retrieve') {
      for (const f of this.fish) {
        if (f.gone && !f.hooked) continue;
        if (this.state !== 'under' && !f.hooked) continue;
        if (f.pos.distanceTo(cam) > 110 + f.length * 3) continue;
        this.drawFish(r, a, f, up);
      }
    }
    const lc = this.lureLook.colors.map(hex);
    this.lureInst.a.set([lc[0][0], lc[0][1], lc[0][2], this.lureLook.glow]);
    this.lureInst.b.set([lc[1][0], lc[1][1], lc[1][2], this.lureLook.pattern]);
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
    drawLine(r, tip, this.lure, cam, this.state === 'under' ? 1 - clamp(this.tension, 0, 1) : 0.2, this.lineColor);

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
    if (f.sp.upright) { d.set(f.dir.x, 0, f.dir.z); if (d.length() < 0.01) d.set(0, 0, 1); }
    else if (f.sp.bottom) { d.set(f.dir.x, 0, f.dir.z); if (d.length() < 0.01) d.set(0, 0, 1); }
    else if (Math.abs(d.y) > 0.95) u = new Vec3(1, 0, 0);
    const m = mat4.fromForward(this.m, f.pos, d, u, f.length);
    f.inst.phase = f.phase;
    const k = f.sp.model;
    f.inst.amp = (f.hooked ? 0.16 : 0.08) * (k === 'eel' || k === 'serpent' ? 1.3 : k === 'ray' ? 1.2 : 1);
    if (k === 'jelly') f.inst.amp = 0.12;
    if (k === 'crab' || k === 'lobster') f.inst.amp = 0.12;
    if (k === 'turtle') f.inst.amp = 0.35;
    if (k === 'seahorse' || k === 'starfish') f.inst.amp = 0.4;
    if (f.sp.boss) f.inst.amp *= 0.7;
    r.draw(model.meshes[0], m, f.inst);
    for (let i = 1; i < model.meshes.length; i++) {
      const mesh = model.meshes[i];
      if (mesh.name === 'Glow') r.draw(mesh, m, f.glowInst ?? eyeInst);
      else r.draw(mesh, m, eyeInst);
    }
  }
}

/** Camera-facing ribbon for fishing line. `slack` 0..1 adds sag. */
export function drawLine(r: Renderer, a: Vec3, b: Vec3, cam: Vec3, slack: number, color: [number, number, number] = [0.95, 0.95, 0.9]) {
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
    const A = p0.clone().add(s0), B = p0.clone().sub(s0), C = p1.clone().add(s1), D = p1.clone().sub(s1);
    for (const q of [A, B, C, C, B, D]) r.vertex(q.x, q.y, q.z, color[0], color[1], color[2], 0.9);
  }
}

// Orchestrates the whole game: modes, input, simulation, camera, HUD and rendering.
import { RARITY_COLOR, speciesById } from '../data/fish';
import { TRACKS, type Stats, type TrackId } from '../data/upgrades';
import { type Zone, type ZoneId, ZONES, zoneAt, zoneWeights } from '../data/zones';
import { clamp, damp, dampAngle, hex, Vec3 } from '../engine/math';
import type { Renderer } from '../engine/renderer';
import { UI } from '../ui/ui';
import { Environment, waveHeight } from '../world/environment';
import { Scenery } from '../world/scenery';
import { heightAt, MAP_POWER, MAP_R, WORLD_R } from '../world/terrain';
import type { Assets } from './assets';
import { GameAudio, type Mood } from './audio';
import { Boat } from './boat';
import { CameraRig } from './camera';
import { buy, computeStats, coolerValue, formatMoney, landCatch, type SaveData, sellAll } from './economy';
import { FishActor, Fishing, type FishingContext } from './fishing';
import { FX } from './fx';
import { Hotspots } from './hotspots';
import { Input } from './input';
import { clearSave, writeSave } from './save';

const MOOD: Record<ZoneId, Mood> = { open: 'sunny', shallows: 'sunny', kelp: 'kelp', deepblue: 'deep', frost: 'frost', magma: 'magma', temple: 'eerie', void: 'void' };

interface Flyer { actor: FishActor; t: number; from: Vec3; local: Vec3; spin: number }

export class Game {
  env = new Environment();
  cam = new CameraRig();
  boat = new Boat();
  fishing = new Fishing();
  fx = new FX();
  spots = new Hotspots();
  audio = new GameAudio();
  input: Input;
  scenery: Scenery;
  stats: Stats;
  time = 0;
  playing = false;
  zone: Zone;
  private lastWarn = 0;
  private lastSave = 0;
  private flyers: Flyer[] = [];
  private pendingLand: { catches: import('./economy').CaughtFish[]; delay: number } | null = null;
  private underwater = 0;
  private camUnder = false;
  private underDist = 7;
  private sailDist = 16;
  private swingT = 0;
  private sonarT = 0;
  private suppressPause = false;
  private lastTime = 0;
  private spray = 0;

  constructor(private r: Renderer, private a: Assets, terrain: import('../engine/renderer').GpuMesh, public ui: UI, public save: SaveData, canvas: HTMLCanvasElement) {
    this.input = new Input(canvas);
    this.scenery = new Scenery(r, a, terrain);
    this.stats = computeStats(save.upgrades);
    this.applyUpgrades();
    const b = save.boat;
    if (b && Math.hypot(b.x, b.z) < WORLD_R && heightAt(b.x, b.z) < -2) {
      this.boat.pos.set(b.x, 0, b.z);
      this.boat.heading = b.heading;
    } else {
      this.boat.pos.copy(this.scenery.dockSpot);
      this.boat.heading = 0;
    }
    this.zone = zoneAt(this.boat.pos.x, this.boat.pos.z);
    this.cam.yaw = this.boat.heading + Math.PI + 0.5;
    this.cam.desired.set(this.boat.pos.x, 3, this.boat.pos.z);
    this.env.update(this.boat.pos.x, this.boat.pos.z, -1);
    this.input.onLockChange = (locked) => {
      if (!locked && this.playing && this.ui.modal === 'none' && !this.suppressPause) this.openPause();
      this.suppressPause = false;
    };
    this.ui.onClick = () => this.audio.click();
    this.audio.setVolumes(save.settings.music, save.settings.sfx);
    this.refreshHud();
    (window as unknown as { __game: Game }).__game = this;
  }

  start() {
    this.playing = true;
    this.audio.start();
    this.audio.setMood(MOOD[this.zone.id]);
    this.input.wantLock = true;
    this.input.lock();
    this.ui.banner('Welcome to', this.zone.name, this.zone.tagline);
  }

  private applyUpgrades() {
    this.stats = computeStats(this.save.upgrades);
    this.boat.hull = this.stats.hull;
    this.boat.radar = this.stats.finder >= 1;
    this.boat.lamp = this.stats.lampRadius > 0;
  }

  private persist() {
    this.save.boat = { x: this.boat.pos.x, z: this.boat.pos.z, heading: this.boat.heading };
    writeSave(this.save);
  }

  private refreshHud() {
    this.ui.setMoney(this.save.money);
    this.ui.setCooler(this.save.cooler.length, this.stats.cooler);
  }

  private water = (x: number, z: number) => waveHeight(x, z, this.time, this.r.frame.waveScale);

  // ------------------------------------------------------------------ modals
  private openPause() {
    this.ui.openPause(this.save, {
      resume: () => { this.ui.closePause(); this.input.lock(); },
      reset: () => { clearSave(); location.reload(); },
      change: (s) => { this.audio.setVolumes(s.music, s.sfx); writeSave(this.save); },
    });
  }

  private unlockForUI() {
    if (this.input.locked) { this.suppressPause = true; this.input.unlock(); }
  }

  openShop() {
    this.unlockForUI();
    this.boat.pos.copy(this.scenery.dockSpot);
    this.boat.heading = 0;
    this.boat.speed = 0;
    this.audio.setMood('shop');
    this.audio.cash();
    const hs = {
      sell: () => {
        const n = this.save.cooler.length;
        const v = sellAll(this.save);
        if (n) { this.audio.cash(); this.ui.toast(`+${formatMoney(v)}`, '#7fff8a', true, `Sold ${n} fish`); }
        this.persist();
        this.refreshHud();
        this.ui.renderShop(this.save, hs);
      },
      buy: (id: TrackId) => {
        if (buy(this.save, id)) {
          this.audio.buy();
          this.applyUpgrades();
          const t = TRACKS.find((x) => x.id === id)!;
          const tier = t.tiers[this.save.upgrades[id]];
          this.ui.toast(tier.name + '!', '#ffd23a', true, 'Upgrade installed');
          if (id === 'hull') {
            const z = ZONES.find((zz) => zz.hull === this.stats.hull);
            if (z) this.ui.toast(`${z.name} unlocked!`, '#7fe0ff');
          }
          this.persist();
          this.refreshHud();
        } else this.audio.deny();
        this.ui.renderShop(this.save, hs);
      },
      close: () => this.closeShop(),
      statText: (id: TrackId, tier: number) => statText(id, tier),
    };
    this.ui.openShop(this.save, hs);
  }

  private closeShop() {
    this.ui.closeShop();
    this.audio.setMood(MOOD[this.zone.id]);
    this.input.lock();
  }

  // ------------------------------------------------------------------ main loop
  frame(now: number) {
    const dt = this.lastTime ? clamp((now - this.lastTime) / 1000, 0, 0.05) : 0.016;
    this.lastTime = now;
    const inp = this.input;
    if (this.playing) {
      if (this.ui.modal === 'none') {
        this.time += dt;
        this.update(dt);
      } else {
        if (this.ui.modal === 'shop' && inp.hit('KeyE', 'Escape')) this.closeShop();
        else if (this.ui.modal === 'map' && inp.hit('KeyM', 'Escape')) this.ui.closeMap();
        this.time += dt * 0.3;
        this.passiveUpdate(dt);
      }
    } else {
      this.time += dt;
      this.passiveUpdate(dt);
      this.cam.yaw += dt * 0.05;
    }
    this.draw(dt);
    inp.endFrame();
  }

  private passiveUpdate(dt: number) {
    this.boat.throttle = 0;
    this.boat.steer = 0;
    this.boat.update(dt, this.time, this.stats.boatSpeed, this.r.frame.waveScale, () => {});
    if (this.ui.modal === 'shop') {
      this.cam.desired.set(this.scenery.shopPos.x, this.scenery.shopPos.y + 4.5, this.scenery.shopPos.z);
      this.cam.yaw = damp(this.cam.yaw, 0.35, 3, dt);
      this.cam.pitch = damp(this.cam.pitch, 0.12, 3, dt);
      this.cam.distTarget = 22;
      this.cam.waterSide = 1;
    } else if (!this.playing) {
      this.cam.desired.set(this.boat.pos.x, 3, this.boat.pos.z);
      this.cam.distTarget = 20;
    }
    this.cam.update(dt, this.water, heightAt);
    this.fx.update(dt, this.water);
    this.spots.update(dt, this.time, this.cam.pos, this.fx);
    this.audio.update(dt, { throttle: 0, speed: 0, underwater: this.camUnder ? 1 : 0, reeling: 0 });
  }

  private update(dt: number) {
    const inp = this.input;
    const f = this.fishing;
    const s = this.stats;
    this.lookInput(dt);
    if (inp.hit('Escape', 'KeyP') && !inp.locked && f.state !== 'aim') { this.openPause(); return; }
    if (inp.hit('KeyM')) {
      const range = [0, 350, 1200, 99999][s.finder];
      this.ui.openMap(this.boat.pos.x, this.boat.pos.z, this.boat.heading, s.hull,
        this.spots.spots.filter((h) => h.pos.distanceXZ(this.boat.pos) < range).map((h) => ({ x: h.pos.x, z: h.pos.z })), this.save.seenZones);
      return;
    }
    if (inp.hit('KeyH')) this.audio.horn();

    // ---- boat / casting
    const sailing = f.state === 'idle' || f.state === 'aim';
    const nearDock = this.boat.pos.distanceXZ(this.scenery.dockSpot) < 20 && Math.abs(this.boat.speed) < 6;
    if (sailing) {
      this.boat.throttle = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
      this.boat.steer = (inp.down('KeyA') ? 1 : 0) - (inp.down('KeyD') ? 1 : 0);
      if (nearDock && f.state === 'idle' && inp.hit('KeyE')) { this.openShop(); return; }
      if (f.state === 'idle' && inp.hit('Mouse0', 'Space')) { f.startAim(); this.audio.click(); }
      if (f.state === 'aim') {
        this.boat.faceWorldYaw(this.cam.lookYaw);
        this.boat.armTarget = -0.4 - f.power * 0.7;
        if (inp.hit('Mouse2', 'Escape')) { f.cancelAim(); this.boat.armTarget = 0; }
        else if (!inp.down('Mouse0', 'Space')) {
          f.release(this.fishCtx(dt));
          this.save.stats.casts++;
          this.boat.armTarget = 0.7;
          this.swingT = 0.35;
          this.audio.cast();
          this.boat.rodBend = -0.3;
        }
      } else this.boat.fisherYawTarget = 0;
    } else {
      this.boat.throttle = 0;
      this.boat.steer = 0;
      this.boat.faceWorldYaw(Math.atan2(f.lure.x - this.boat.pos.x, f.lure.z - this.boat.pos.z));
    }
    this.swingT -= dt;
    if (this.swingT <= 0 && f.state !== 'aim') this.boat.armTarget = f.state === 'under' ? -0.2 - f.tension * 0.4 : 0;
    this.boat.anchored = f.state !== 'idle';
    this.boat.update(dt, this.time, s.boatSpeed, this.r.frame.waveScale, () => { this.audio.thud(); this.cam.shake(0.6); });
    this.boat.rodBend = damp(this.boat.rodBend, f.state === 'under' ? 0.15 + f.tension * 0.9 + f.hooked.length * 0.05 : 0.12, 6, dt);

    // ---- fishing
    f.update(dt, this.fishCtx(dt));
    this.handleFishingEvents();

    // ---- zones and world edge
    this.updateZones(dt);

    // ---- camera
    this.updateCamera(dt);

    // ---- landing sequence
    this.updateFlyers(dt);

    // ---- ambient fx
    this.ambientFx(dt);

    // ---- HUD
    this.updateHud(nearDock);

    this.audio.update(dt, { throttle: this.boat.throttle, speed: this.boat.speed, underwater: this.camUnder ? 1 : 0, reeling: f.state === 'under' && f.reeling ? 1 : 0 });
    if (this.time - this.lastSave > 10) { this.lastSave = this.time; this.persist(); }
  }

  private fishCtx(_dt: number): FishingContext {
    const inp = this.input;
    const under = this.fishing.state === 'under';
    return {
      stats: this.stats,
      lureTier: this.save.upgrades.bait,
      tip: this.boat.rodTip,
      boatPos: this.boat.pos,
      time: this.time,
      waveScale: this.r.frame.waveScale,
      camForward: this.cam.forwardXZ,
      camRight: this.cam.rightXZ,
      move: under ? { x: (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0), z: (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0) } : { x: 0, z: 0 },
      dive: under && inp.down('Mouse2', 'ShiftLeft', 'ShiftRight'),
      reel: under && inp.down('Mouse0', 'Space'),
      hotspot: this.spots.strengthAt(this.fishing.lure.x, this.fishing.lure.z),
      chests: this.scenery.chests,
    };
  }

  private screenPos(p: Vec3) {
    const v = p.clone().applyMat4(this.r.frame.viewProj);
    const rect = { w: window.innerWidth, h: window.innerHeight };
    return { x: (v.x * 0.5 + 0.5) * rect.w, y: (0.5 - v.y * 0.5) * rect.h, behind: v.z < 0 || v.z > 1 };
  }

  private handleFishingEvents() {
    const f = this.fishing;
    for (const e of f.events) {
      switch (e.type) {
        case 'splash':
          this.fx.splash(e.pos, 1);
          this.audio.splash(1);
          this.cam.shake(0.3);
          this.r.post.flash = [0.8, 0.95, 1, 0.25];
          break;
        case 'shallow':
          this.ui.toast('Too shallow!', '#ffb0a0', false, 'Cast into deeper water');
          this.audio.warn();
          break;
        case 'hook': {
          const sp = e.fish.sp;
          this.audio.bite();
          this.audio.hooked();
          this.fx.burst(e.fish.pos, [1, 0.9, 0.4], 18, 3, 0.25);
          const sc = this.screenPos(e.fish.pos);
          this.ui.floater(sc.x, sc.y - 30, sp.name, RARITY_COLOR[sp.rarity]);
          if (sp.rarity === 'legendary') { this.ui.toast('LEGENDARY!', '#ffb020', true, sp.name); this.audio.legendary(); this.cam.shake(0.8); }
          if (e.fish.kg > this.stats.lineStrength * 0.5 && this.save.tutorial < 3) {
            this.ui.toast('Big one!', '#fff', false, 'Pulse the reel - don\'t let the line snap!');
            this.save.tutorial = 3;
          }
          break;
        }
        case 'lost': {
          const n = e.fish.sp.name;
          if (e.by === 'snap') {
            this.ui.toast('SNAP!', '#ff6a5a', true, `${n} broke your line`);
            this.audio.snap();
            this.cam.shake(1);
            this.r.post.flash = [1, 0.3, 0.2, 0.3];
            this.save.stats.snapped++;
          } else if (e.by === 'sting') {
            this.ui.toast('ZAPPED!', '#ff8fc8', false, `Lost your ${n}`);
            this.audio.sting();
            this.cam.shake(0.5);
          } else {
            this.ui.toast('STOLEN!', '#ff6a5a', false, `Something took your ${n}`);
            this.audio.chomp();
            this.cam.shake(0.7);
          }
          break;
        }
        case 'needBait':
          this.ui.toast(`${e.fish.sp.name} ignored your bait`, '#ffd0a0', false, 'Upgrade your bait at the shop');
          break;
        case 'full':
          this.ui.toast('Hooks full!', '#fff', false, 'Hold Left Click to reel in');
          break;
        case 'treasure': {
          this.save.money += e.amount;
          this.save.stats.earned += e.amount;
          this.audio.treasure();
          this.fx.burst(e.pos.clone().add(new Vec3(0, 1, 0)), [1, 0.85, 0.3], 40, 6, 0.35);
          this.ui.toast(`TREASURE! +${formatMoney(e.amount)}`, '#ffd23a', true);
          this.refreshHud();
          break;
        }
        case 'land': {
          this.audio.splash(0.6);
          this.fx.splash(new Vec3(e.from.x, 0, e.from.z), 0.6);
          e.actors.forEach((a, i) => {
            this.flyers.push({ actor: a, t: -i * 0.12, from: a.pos.clone(), local: new Vec3((Math.random() - 0.5) * 1.4, 1.1, -1.4 - Math.random() * 1.4), spin: Math.random() * 6 });
          });
          this.pendingLand = { catches: e.catches, delay: 1.3 + e.actors.length * 0.12 };
          break;
        }
        default: break;
      }
    }
    f.events.length = 0;
  }

  private updateFlyers(dt: number) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const fl = this.flyers[i];
      fl.t += dt;
      if (fl.t < 0) continue;
      const target = fl.local.clone().applyMat4(this.boat.matrix);
      const k = clamp(fl.t / 0.9, 0, 1);
      if (k < 1) {
        fl.actor.pos.copy(fl.from).lerp(target, k);
        fl.actor.pos.y += Math.sin(k * Math.PI) * 6;
        fl.actor.dir.set(Math.sin(fl.spin + fl.t * 9), Math.cos(fl.t * 7), Math.cos(fl.spin + fl.t * 9)).normalize();
      } else {
        const ft = fl.t - 0.9;
        fl.actor.pos.copy(target);
        fl.actor.pos.y += Math.abs(Math.sin(ft * 9)) * 0.4 * Math.max(0, 1 - ft / 1.6);
        fl.actor.dir.set(Math.sin(fl.spin), 0.2 * Math.sin(ft * 20), Math.cos(fl.spin)).normalize();
        if (ft > 1.6) {
          this.fx.burst(fl.actor.pos, [1, 1, 0.8], 12, 2, 0.2);
          this.audio.coin();
          this.flyers.splice(i, 1);
          continue;
        }
      }
      fl.actor.phase += dt * 25;
    }
    if (this.pendingLand) {
      this.pendingLand.delay -= dt;
      if (this.pendingLand.delay <= 0) {
        const res = landCatch(this.save, this.pendingLand.catches, this.stats.cooler);
        this.pendingLand = null;
        const deepest = Math.max(this.save.stats.deepest, 0);
        this.save.stats.deepest = deepest;
        if (res.newSpecies.length) this.audio.newSpecies();
        for (const id of res.newSpecies) this.ui.toast('NEW SPECIES!', '#7fe0ff', true, speciesById.get(id)!.name);
        this.refreshHud();
        this.persist();
        if (res.kept.length + res.released.length > 0) {
          this.unlockForUI();
          this.ui.showCatch(res, coolerValue(this.save), () => this.input.lock());
        } else this.ui.toast('Nothing this time...', '#fff', false, 'Steer the lure into fish!');
      }
    }
  }

  private updateZones(dt: number) {
    const b = this.boat.pos;
    const z = zoneAt(b.x, b.z);
    const locked = z.hull > this.stats.hull;
    if (z.id !== this.zone.id && !locked) {
      this.zone = z;
      this.ui.banner('Entering', z.name, z.tagline);
      this.audio.zone();
      this.audio.setMood(MOOD[z.id]);
      if (z.id !== 'open' && !this.save.seenZones.includes(z.id)) this.save.seenZones.push(z.id);
    }
    this.ui.setZone(this.zone.name);
    // locked zones push the boat back
    const w = zoneWeights(b.x, b.z);
    ZONES.forEach((zn, i) => {
      if (zn.hull <= this.stats.hull || w[i] < 0.12) return;
      const away = new Vec3(b.x - zn.x, 0, b.z - zn.z).normalize();
      const push = (w[i] - 0.12) * 60;
      b.x += away.x * push * dt;
      b.z += away.z * push * dt;
      this.boat.speed *= Math.exp(-dt * 3 * w[i]);
      if (this.time - this.lastWarn > 4) {
        this.lastWarn = this.time;
        this.ui.banner(zn.name, 'TURN BACK!', zn.lockedMessage, true);
        this.audio.warn();
        this.cam.shake(0.3);
      }
    });
    const r = Math.hypot(b.x, b.z);
    if (r > WORLD_R - 120) {
      const push = (r - (WORLD_R - 120)) * 0.8;
      b.x -= (b.x / r) * push * dt;
      b.z -= (b.z / r) * push * dt;
      if (this.time - this.lastWarn > 4) {
        this.lastWarn = this.time;
        this.ui.banner('The edge of the world', 'TURN BACK!', 'Here be nothing at all.', true);
      }
    }
  }

  /** Mouse (pointer lock), trackpad two-finger swipe and arrow keys all orbit the camera. */
  private lookInput(dt: number) {
    const inp = this.input, s = this.save.settings, c = this.cam;
    if (inp.locked) c.rotate(inp.mouseDX, inp.mouseDY, s.sensitivity, s.invertY);
    if (inp.orbitX || inp.orbitY) c.rotate(inp.orbitX * 1.4, inp.orbitY * 1.4, s.sensitivity, s.invertY);
    const kx = (inp.down('ArrowRight') ? 1 : 0) - (inp.down('ArrowLeft') ? 1 : 0);
    const ky = (inp.down('ArrowDown') ? 1 : 0) - (inp.down('ArrowUp') ? 1 : 0);
    if (kx || ky) {
      c.rotate(kx * 700 * dt, ky * 450 * dt, 1, s.invertY);
      inp.lastLook = performance.now();
    }
    // When the player isn't steering the camera, swing it behind the boat / moving lure.
    if (performance.now() - inp.lastLook < 1800) return;
    const f = this.fishing;
    if (f.state === 'idle' && this.boat.speed > 2) {
      c.yaw = dampAngle(c.yaw, this.boat.heading + Math.PI, 1.2, dt);
    } else if (f.state === 'under') {
      const v = f.lureVel, fw = c.forwardXZ;
      const hv = Math.hypot(v.x, v.z);
      if (hv > 1 && (v.x * fw.x + v.z * fw.z) > 0.3 * hv) c.yaw = dampAngle(c.yaw, Math.atan2(-v.x, -v.z), 0.8, dt);
    }
  }

  private updateCamera(dt: number) {
    const f = this.fishing;
    const c = this.cam;
    const inp = this.input;
    if (f.state === 'under') {
      this.underDist = clamp(this.underDist + inp.zoom * 0.8, 3.5, 16);
      c.desired.copy(f.lure);
      c.distTarget = this.underDist;
      c.waterSide = -1;
      c.fovTarget = 1.0;
      c.minPitch = -0.9;
    } else if (f.state === 'flight') {
      c.desired.copy(f.lure);
      c.distTarget = 11;
      c.waterSide = 1;
      c.fovTarget = 1.05;
    } else {
      c.desired.set(this.boat.pos.x, this.boat.y + 3, this.boat.pos.z);
      this.sailDist = clamp(this.sailDist + inp.zoom * 1.5, 8, 40);
      c.distTarget = f.state === 'aim' ? 11 : this.sailDist + Math.min(Math.abs(this.boat.speed) * 0.25, 10);
      c.waterSide = 1;
      c.fovTarget = 0.95 + Math.abs(this.boat.speed) / 250;
      c.minPitch = -0.1;
      if (f.state === 'aim') c.desired.add(this.cam.forwardXZ.scale(4));
    }
    c.update(dt, this.water, heightAt);
    this.camUnder = c.pos.y < this.water(c.pos.x, c.pos.z) - 0.05;
    this.underwater = damp(this.underwater, this.camUnder ? 1 : 0, 10, dt);
  }

  private ambientFx(dt: number) {
    const fx = this.fx;
    const c = this.cam.pos;
    const f = this.fishing;
    const env = this.env;
    if (this.camUnder) {
      for (let i = 0; i < 25 * dt * 10; i++) {
        if (Math.random() > 0.35) continue;
        fx.spawn({ x: c.x + fx.rnd() * 25, y: c.y + fx.rnd() * 15, z: c.z + fx.rnd() * 25, vx: fx.rnd() * 0.2, vy: -0.15, vz: fx.rnd() * 0.2,
          max: 5, size: 0.04 + Math.random() * 0.05, r: 0.8, g: 0.9, b: 0.85, a: env.voidAmount > 0.5 ? 0 : 0.6, kind: env.voidAmount > 0.5 ? 3 : 4 });
      }
      if (f.state === 'under' && f.lureVel.length() > 1.5 && Math.random() < dt * 12) fx.bubbles(f.lure, 1, 0.2);
    } else {
      if (env.frost > 0.3) for (let i = 0; i < 40 * dt * env.frost; i++) fx.spawn({ x: c.x + fx.rnd() * 40, y: c.y + 10 + fx.rnd() * 6, z: c.z + fx.rnd() * 40, vx: 0.6, vy: -2, vz: fx.rnd() * 0.5, max: 7, size: 0.08, r: 1, g: 1, b: 1, a: 0.9, kind: 4 });
      if (env.lavaStrength > 1.5) {
        for (let i = 0; i < 20 * dt; i++) fx.spawn({ x: c.x + fx.rnd() * 40, y: c.y - 6 + fx.rnd() * 4, z: c.z + fx.rnd() * 40, vx: fx.rnd(), vy: 1.5 + Math.random() * 2, vz: fx.rnd(), max: 4, size: 0.1, r: 1, g: 0.45, b: 0.1, a: 0, kind: 3 });
      }
      if (env.eerie > 0.3) for (let i = 0; i < 12 * dt; i++) fx.spawn({ x: c.x + fx.rnd() * 50, y: 1 + Math.random() * 8, z: c.z + fx.rnd() * 50, vx: fx.rnd() * 0.3, vy: 0.3, vz: fx.rnd() * 0.3, max: 6, size: 0.18, r: 0.3, g: 1, b: 0.5, a: 0, kind: 0 });
      if (env.voidAmount > 0.3) for (let i = 0; i < 15 * dt; i++) fx.spawn({ x: c.x + fx.rnd() * 50, y: Math.random() * 20, z: c.z + fx.rnd() * 50, vy: 0.2, max: 4, size: 0.12, r: 0.7, g: 0.5, b: 1, a: 0, kind: 3 });
      const sp = Math.abs(this.boat.speed);
      this.spray -= dt;
      if (sp > 8 && this.spray <= 0) {
        this.spray = 0.03;
        const fw = this.boat.forward;
        const side = Math.random() < 0.5 ? 1 : -1;
        fx.spawn({ x: this.boat.pos.x + fw.x * 3 + fw.z * side, y: 0.4, z: this.boat.pos.z + fw.z * 3 - fw.x * side,
          vx: fw.z * side * 3 + fw.x * sp * 0.3, vy: 2 + sp * 0.12, vz: -fw.x * side * 3 + fw.z * sp * 0.3, max: 0.7, size: 0.2, r: 1, g: 1, b: 1, a: 0.9, kind: 4, gravity: 12 });
      }
    }
    const vt = this.scenery.volcanoTop;
    if (vt.distanceXZ(c) < 2600 && Math.random() < dt * 5) fx.smoke(vt.x, vt.y, vt.z, 0.22, 10);
    if (vt.distanceXZ(c) < 2600 && Math.random() < dt * 8) fx.spawn({ x: vt.x + fx.rnd() * 8, y: vt.y, z: vt.z + fx.rnd() * 8, vx: fx.rnd() * 6, vy: 12 + Math.random() * 10, vz: fx.rnd() * 6, gravity: 9, max: 3, size: 1.2, r: 1, g: 0.4, b: 0.05, a: 0, kind: 0 });
    fx.update(dt, this.water);
    this.spots.update(dt, this.time, c, fx);
  }

  private updateHud(nearDock: boolean) {
    const f = this.fishing;
    const ui = this.ui;
    const s = this.stats;
    const coolerFull = this.save.cooler.length >= s.cooler;
    const look = this.input.locked ? '' : '<br><small>Look: <kbd>2-finger swipe</kbd> or <kbd>Arrow keys</kbd> &nbsp; Zoom: pinch</small>';
    if (f.state === 'idle') {
      let p = 'Hold <kbd>Click</kbd> or <kbd>Space</kbd> to cast';
      if (nearDock) p = '<kbd>E</kbd> Tackle Shop &nbsp; ' + p;
      else if (coolerFull) p = 'Cooler full! Sell at the dock &nbsp; ' + p;
      ui.prompt(p + look);
    } else if (f.state === 'aim') ui.prompt('Release to cast! <kbd>Esc</kbd> cancel');
    else if (f.state === 'under') {
      if (f.lineMaxed) ui.prompt('Line maxed out! Upgrade your rod for more line');
      else if (f.fighting) ui.prompt(f.tension > 0.75 ? 'Let go! Line about to snap!' : 'Pulse <kbd>Space</kbd> / <kbd>Click</kbd> to reel - watch the tension');
      else ui.prompt('<kbd>WASD</kbd> steer &nbsp; <kbd>Shift</kbd> dive &nbsp; <kbd>Space</kbd> / <kbd>Click</kbd> reel in' + look);
    } else ui.prompt('');
    ui.power(f.state === 'aim' ? f.power : null);
    const under = f.state === 'under';
    const depth = Math.max(0, -f.lure.y);
    if (under) this.save.stats.deepest = Math.max(this.save.stats.deepest, depth);
    ui.depth(under, depth, s.lineLength, -heightAt(f.lure.x, f.lure.z));
    ui.hooks(under || f.state === 'landing', f.hooked.map((h) => h.sp.colors[0]), s.hooks);
    const fighting = under && f.fighting;
    ui.tension(!!fighting, f.tension, fighting ? f.fighting!.stamina : 1, fighting ? f.fighting!.sp.name : '');
    this.ui.drawMinimap(this.boat.pos.x, this.boat.pos.z, this.boat.heading,
      this.spots.spots.filter((h) => h.pos.distanceXZ(this.boat.pos) < [0, 350, 1200, 99999][s.finder]).map((h) => ({ x: h.pos.x, z: h.pos.z })),
      { x: this.scenery.dockSpot.x, z: this.scenery.dockSpot.z });
    // sonar
    this.sonarT -= 1;
    if (s.finder >= 1 && this.sonarT <= 0) {
      this.sonarT = 4;
      if (under) {
        const blips = f.fish.filter((fi) => !fi.hooked && fi.pos.distanceXZ(f.lure) < 30).map((fi) => ({
          depth: -fi.pos.y, color: s.finder >= 2 ? RARITY_COLOR[fi.sp.rarity] : '#7fffb0', big: fi.length > 1.2,
        }));
        const legend = s.finder >= 3 ? f.nearestLegend() : null;
        ui.sonar(true, -heightAt(f.lure.x, f.lure.z), blips, legend ? 'LEGEND NEARBY! Follow the arrow' : `${blips.length} fish nearby`, Math.max(40, s.lineLength));
      } else {
        const hs = this.spots.strengthAt(this.boat.pos.x, this.boat.pos.z);
        const floor = -heightAt(this.boat.pos.x, this.boat.pos.z);
        const blips = Array.from({ length: Math.round(2 + hs * 6) }, () => ({ depth: Math.random() * floor, color: '#7fffb0', big: Math.random() < 0.1 }));
        ui.sonar(true, floor, Math.random() < 0.5 ? blips : [], hs > 0.3 ? 'HOT SPOT! Cast here!' : 'Scanning...', Math.max(60, Math.min(floor * 1.2, 800)));
      }
    } else if (s.finder < 1) ui.sonar(false);
    // legend arrow
    const legend = under && s.finder >= 3 ? f.nearestLegend() : null;
    if (legend) {
      const sp = this.screenPos(legend.pos);
      const W = window.innerWidth, H = window.innerHeight;
      let x = sp.x, y = sp.y, ang = Math.PI;
      if (sp.behind || x < 40 || x > W - 40 || y < 40 || y > H - 40) {
        const dx = (sp.behind ? -1 : 1) * (x - W / 2), dy = (sp.behind ? -1 : 1) * (y - H / 2);
        const a = Math.atan2(dy, dx);
        x = W / 2 + Math.cos(a) * (Math.min(W, H) * 0.4);
        y = H / 2 + Math.sin(a) * (Math.min(W, H) * 0.4);
        ang = a + Math.PI / 2;
      } else y -= 50;
      ui.legend({ x, y, angle: ang });
    } else ui.legend(null);
  }

  // ------------------------------------------------------------------ rendering
  private draw(dt: number) {
    const r = this.r;
    const fr = r.frame;
    const c = this.cam;
    c.matrices(r.width / r.height);
    fr.setCamera(c.view, c.proj, c.pos);
    fr.time = this.time;
    this.env.update(c.pos.x, c.pos.z, dt);
    const camDepth = Math.max(0, -c.pos.y);
    this.env.apply(fr, camDepth, this.camUnder);
    fr.sunDir.set(0.45, 0.62, -0.55).normalize();
    fr.oceanOffsetX = Math.round(c.pos.x / 8) * 8;
    fr.oceanOffsetZ = Math.round(c.pos.z / 8) * 8;
    fr.mapExtent = MAP_R;
    fr.mapPower = MAP_POWER;
    fr.boatX = this.boat.pos.x;
    fr.boatZ = this.boat.pos.z;
    fr.boatHeading = this.boat.heading;
    fr.boatSpeed = Math.abs(this.boat.speed);
    fr.wake.set(this.boat.wake);
    const f = this.fishing;
    if (f.state === 'under' && this.stats.lampRadius > 0) {
      fr.lampPos.set(f.lure.x, f.lure.y + 0.6, f.lure.z);
      fr.lampRadius = this.stats.lampRadius;
      fr.lampIntensity = 2.4;
      fr.lampColor = hex('#fff0c8');
    } else fr.lampRadius = 0;

    this.scenery.draw(c.pos, this.camUnder, this.time);
    this.boat.draw(r, this.a, this.time);
    f.draw(r, this.a, c.pos, this.save.upgrades.bait, this.time, this.boat.rodTip);
    const up = new Vec3(0, 1, 0);
    this.spots.draw(r, this.a, c.pos, this.time, (actor) => f.drawFish(r, this.a, actor, up));
    for (const fl of this.flyers) if (fl.t >= 0) f.drawFish(r, this.a, fl.actor, up);
    if (f.state === 'under' && this.stats.lampRadius > 0) r.particle(f.lure.x, f.lure.y + 0.35, f.lure.z, 0.45 + Math.sin(this.time * 6) * 0.05, 0.8, 0.7, 0.45, 0, 3, this.time * 0.5);
    this.fx.draw(r);

    const p = r.post;
    p.time = this.time;
    p.underwater = this.underwater;
    p.vignette = 0.3 + this.underwater * 0.35 + clamp(camDepth / 300, 0, 0.3);
    p.flash[3] = Math.max(0, p.flash[3] - dt * 1.5);
    p.bloom = 0.5 + this.env.lavaStrength * 0.05 + this.env.voidAmount * 0.2;
    p.saturation = 1.12 - this.env.eerie * 0.2;
    r.render({ ocean: true });
  }
}

function statText(id: TrackId, tier: number): string {
  const s = TRACKS.find((t) => t.id === id)!.tiers[tier].stats;
  switch (id) {
    case 'rod': return `Line ${s.lineLength}m, holds ${s.lineStrength}kg`;
    case 'reel': return `Reels at ${s.reelSpeed} m/s`;
    case 'bait': return `Bait level ${s.baitTier}, attracts from ${s.attract}m`;
    case 'hooks': return `Holds ${s.hooks} fish per cast`;
    case 'sinker': return `Dives ${s.diveSpeed} m/s, steers ${s.swimSpeed} m/s`;
    case 'lamp': return s.lampRadius ? `Lights up ${s.lampRadius}m` : 'Darkness';
    case 'finder': return ['Watch for gulls and bubbles', 'Nearby hot spots + sonar', 'All zone hot spots + fish colors', 'Tracks legendary fish'][s.finder ?? 0];
    case 'engine': return `Top speed ${s.boatSpeed} m/s`;
    case 'hull': return ZONES.filter((z) => z.hull === s.hull).map((z) => z.name).join(', ') || 'Starter waters';
    case 'cooler': return `Holds ${s.cooler} fish`;
  }
}

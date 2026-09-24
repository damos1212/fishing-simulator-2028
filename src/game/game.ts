// Orchestrates the whole game: modes, input, simulation, camera, HUD and rendering.
import { BOSS_FOR_ZONE, RARITY_COLOR, speciesById } from '../data/fish';
import { cosmeticById, itemById, itemPrice, ITEMS, type ItemId } from '../data/items';
import { LEVEL_VALUE, nicePrice, TRACKS, type Stats, type TrackId } from '../data/upgrades';
import {
  activeRealm, activeRealmInfo, NAMED_ZONES, type RealmId, realmById, REALMS, realmZoneIdx, realmZones, setActiveRealm, type Zone, type ZoneId,
  zoneAt, zoneWeights,
} from '../data/zones';
import { clamp, damp, dampAngle, hex, rng, Vec3 } from '../engine/math';
import { type GpuMesh, QUALITY, type Renderer } from '../engine/renderer';
import { UI } from '../ui/ui';
import { Environment, waveHeight } from '../world/environment';
import { type Outpost, type Portal, Scenery } from '../world/scenery';
import { buildHeightMap, buildTerrainMesh, heightAt, MAP_POWER, MAP_R, syncRealm, WORLD_R } from '../world/terrain';
import { TimeWeather } from '../world/timeweather';
import { Aquarium } from './aquarium';
import type { Assets } from './assets';
import { GameAudio, type Mood } from './audio';
import { Boat } from './boat';
import { CameraRig } from './camera';
import {
  buy, buyCosmetic, buyItem, type CaughtFish, computeStats, coolerValue, equipCosmetic, formatMoney, landCatch, masteredZones, progressLevel,
  type SaveData, sellAll, useItem,
} from './economy';
import { NPCS, QUESTS } from '../data/quests';
import { EVENT_INFO, WorldEvents } from './events';
import { FishActor, Fishing, type FishingContext } from './fishing';
import { FX } from './fx';
import { Hotspots } from './hotspots';
import { Input } from './input';
import { Life } from './life';
import { checkAchievements, completeQuest, currentQuest, fillContracts, progressContracts, questEvent, questStatus } from './progress';
import { clearSave, writeSave } from './save';

const MOOD: Record<ZoneId, Mood> = {
  open: 'sunny', shallows: 'sunny', kelp: 'kelp', coral: 'sunny', deepblue: 'deep', frost: 'frost', candy: 'shop', toxic: 'magma',
  magma: 'magma', storm: 'deep', pirate: 'eerie', atlantis: 'frost', temple: 'eerie', void: 'void',
  jopen: 'jungle', fern: 'jungle', tarpit: 'kelp', crater: 'magma',
  sopen: 'fel', hellfire: 'fel', nether: 'void', blackgate: 'eerie',
  lopen: 'moon', tranquil: 'moon', craters: 'frost', darkside: 'eerie',
  nopen: 'synth', sunset: 'synth', arcade: 'shop', glitch: 'synth',
  mopen: 'cosmic', rim: 'cosmic', maw: 'eerie',
};

interface Flyer { actor: FishActor; t: number; from: Vec3; local: Vec3; spin: number }
type SkyPlanet = [dx: number, dy: number, dz: number, radius: number, r: number, g: number, b: number, style: number];
/** Planets hanging in each realm's sky (style: 1 earth, 2 gas giant, 3 cracked fel world, 4 moon, 5 ringed). */
const SKY_PLANETS: Record<RealmId, SkyPlanet[]> = {
  blue: [],
  jurassic: [[0.6, 0.32, -0.7, 0.05, 0.92, 0.9, 0.85, 4]],
  shattered: [[-0.5, 0.42, -0.75, 0.3, 0.35, 0.25, 0.45, 3], [0.7, 0.3, 0.6, 0.06, 0.7, 0.6, 0.8, 4]],
  selene: [[0.3, 0.45, -0.8, 0.12, 1, 1, 1, 1], [-0.8, 0.28, 0.5, 0.2, 1.0, 0.7, 0.45, 2]],
  neon: [[-0.6, 0.38, -0.7, 0.16, 0.9, 0.4, 1.0, 5], [0.5, 0.5, 0.6, 0.05, 0.4, 1, 1, 4]],
  maw: [[0.8, 0.28, 0.4, 0.18, 0.6, 0.4, 1.0, 2]],
};
export interface RealmWorld { terrain: GpuMesh; heightmap: Uint16Array; scenery?: Scenery }
export type DockTarget = { kind: 'harbor' } | { kind: 'outpost'; outpost: Outpost };

const TUTORIAL = [
  'Hold <kbd>Space</kbd> or click to charge a cast, release to throw',
  'Steer the lure into a fish with <kbd>WASD</kbd>, then hold <kbd>Space</kbd> to reel in',
  'Sail back to the dock (the <b>$</b> on the minimap) and press <kbd>E</kbd> to sell',
  'Spend your cash on an upgrade in the shop - Hooks and Bait are great first buys',
];

export class Game {
  env = new Environment();
  cam = new CameraRig();
  boat = new Boat();
  fishing = new Fishing();
  fx = new FX();
  spots = new Hotspots();
  audio = new GameAudio();
  tw = new TimeWeather();
  input: Input;
  scenery: Scenery;
  life: Life;
  aquarium: Aquarium;
  stats: Stats;
  time = 0;
  playing = false;
  zone: Zone;
  effects = { chum: null as { pos: Vec3; until: number } | null, energyUntil: 0, sonarUntil: 0 };
  private lastWarn = 0;
  private lastSave = 0;
  private flyers: Flyer[] = [];
  private pendingLand: { catches: CaughtFish[]; delay: number; maxDepth: number; zone: ZoneId } | null = null;
  private underwater = 0;
  private camUnder = false;
  private underDist = 7;
  private sailDist = 16;
  private swingT = 0;
  private sonarT = 0;
  private suppressPause = false;
  private lastTime = 0;
  private spray = 0;
  private dock: DockTarget | null = null;
  private castLucky = false;
  private castBoss = false;
  private travel: { t: number; to: Vec3; heading: number } | null = null;
  private contractRand = rng(Date.now() & 0xfffff);
  private fpsAcc = { t: 0, n: 0, fps: 60 };
  /** Extra creatures to draw (debug/model preview via the console). */
  debugActors: FishActor[] = [];
  events = new WorldEvents();
  private mastered = new Set<ZoneId>();
  private timeScale = 1;
  private slowmo = 0;
  private photo = false;
  private captureNext = false;
  private attract = { i: 0, t: 0 };
  private lastHonk = 0;
  private questCheckT = 0;
  private fireworks = 0;
  /** Built worlds per realm (terrain, height map, scenery), so returning is instant. */
  private worlds = new Map<RealmId, RealmWorld>();
  private warp: { t: number; to: RealmId; switched: boolean; tear: boolean } | null = null;
  private portalCool = 0;
  private portalHint: Portal | null = null;
  /** Consecutive successful casts: every landed haul within the window raises the value multiplier. */
  private combo = { n: 0, until: 0 };
  /** Slow-motion orbit around a freshly landed legendary or boss. */
  private trophy: { actor: FishActor; t: number } | null = null;
  private nextAmbience = 20;

  constructor(private r: Renderer, private a: Assets, world: RealmWorld, public ui: UI, public save: SaveData, private canvas: HTMLCanvasElement) {
    this.input = new Input(canvas);
    this.scenery = new Scenery(r, a, world.terrain, save.realms);
    world.scenery = this.scenery;
    this.worlds.set(activeRealm(), world);
    const aq = this.scenery.aquarium;
    this.aquarium = new Aquarium(aq.pos, aq.halfX, aq.halfZ);
    this.stats = computeStats(save.upgrades);
    this.applyUpgrades();
    this.tw.dayTime = save.dayTime ?? 0.32;
    const b = save.boat;
    if (b && Math.hypot(b.x, b.z) < WORLD_R && heightAt(b.x, b.z) < -2) {
      this.boat.pos.set(b.x, 0, b.z);
      this.boat.heading = b.heading;
    } else {
      this.boat.pos.copy(this.scenery.dockSpot);
      this.boat.heading = this.scenery.dockHeading === Math.PI ? 0 : this.scenery.dockHeading;
    }
    this.life = new Life();
    this.life.setRealm(activeRealm(), this.scenery);
    this.zone = zoneAt(this.boat.pos.x, this.boat.pos.z);
    this.cam.yaw = this.boat.heading + Math.PI + 0.5;
    this.cam.desired.set(this.boat.pos.x, 3, this.boat.pos.z);
    this.env.update(this.boat.pos.x, this.boat.pos.z, -1);
    this.input.onLockChange = (locked) => {
      if (!locked && this.playing && this.ui.modal === 'none' && !this.suppressPause) this.openPause();
      this.suppressPause = false;
    };
    this.ui.onClick = () => this.audio.click();
    this.applySettings();
    fillContracts(save, this.contractRand, this.stats.lineLength, this.stats.hooks);
    this.aquarium.sync(save);
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
    this.mastered = masteredZones(this.save);
    setTimeout(() => this.questIntro(), 1200);
  }

  // ------------------------------------------------------------------ story
  /** Shows the active quest's introduction once. */
  private questIntro() {
    const q = currentQuest(this.save);
    if (!q || this.save.quest.intro || this.ui.modal !== 'none' || this.warp) return;
    this.unlockForUI();
    this.ui.dialog(NPCS[q.npc], q.intro, `NEW QUEST: ${q.title}`, () => {
      this.save.quest.intro = true;
      this.persist();
      this.input.lock();
      this.checkQuest();
    });
  }

  /** Completes the active quest if its goal is met, then plays the outro and the next intro. */
  private checkQuest() {
    if (this.ui.modal !== 'none' || this.warp) return;
    const done = completeQuest(this.save);
    if (!done) { this.ui.quest(this.questInfo()); return; }
    this.audio.newSpecies();
    this.audio.cash();
    this.applyCosmetics();
    this.refreshHud();
    this.persist();
    const reward = `+${formatMoney(done.reward.money)}  +${done.reward.pearls} pearls${done.reward.cosmetic ? '  + new pet!' : ''}`;
    this.unlockForUI();
    this.ui.dialog(NPCS[done.npc], done.outro, `QUEST COMPLETE: ${done.title}  ${reward}`, () => {
      this.input.lock();
      this.celebrate(checkAchievements(this.save));
      if (done.after) this.ending(done.after);
      else if (!currentQuest(this.save)) this.ending('finale');
      else setTimeout(() => this.questIntro(), 600);
    });
  }

  private questInfo() {
    const q = currentQuest(this.save);
    if (!q) return null;
    const st = questStatus(this.save);
    return { title: q.title, npc: NPCS[q.npc], value: st.value, goal: st.goal, step: this.save.quest.index + 1, total: QUESTS.length, money: q.goal.kind === 'sell' };
  }

  private ending(kind: 'teaser' | 'finale') {
    this.fireworks = kind === 'finale' ? 20 : 12;
    this.audio.legendary();
    this.unlockForUI();
    this.ui.ending(this.save, () => {
      this.input.lock();
      if (currentQuest(this.save)) setTimeout(() => this.questIntro(), 800);
    }, kind);
  }

  private applySettings() {
    const s = this.save.settings;
    this.audio.setVolumes(s.music, s.sfx);
    this.r.renderScale = s.quality;
    if (this.r.quality !== QUALITY[s.graphics]) this.r.setQuality(s.graphics);
    this.cam.shakeScale = s.shake ? 1 : 0;
  }

  private applyUpgrades() {
    this.stats = computeStats(this.save.upgrades);
    this.boat.hull = this.stats.hull;
    this.boat.radar = this.stats.finder >= 1;
    this.boat.lamp = this.stats.lampRadius > 0;
    this.boat.engineTier = this.save.upgrades.engine;
    this.applyCosmetics();
  }

  private applyCosmetics() {
    const eq = this.save.cosmetics.equipped;
    const paint = cosmeticById.get(eq.paint);
    this.boat.paint = paint?.color ?? '';
    this.boat.hat = cosmeticById.get(eq.hat)?.mesh ?? 'HatSouwester';
    const flag = cosmeticById.get(eq.flag);
    if (flag?.colors) {
      const [x, y, z] = flag.colors.map(hex);
      this.boat.flagInst.a.set([x[0], x[1], x[2], flag.glow ?? 0]);
      this.boat.flagInst.b.set([y[0], y[1], y[2], flag.pattern ?? 0]);
      this.boat.flagInst.c.set([z[0], z[1], z[2], 1]);
    }
    this.boat.pet = cosmeticById.get(eq.pet)?.mesh ?? '';
    const lure = cosmeticById.get(eq.lure);
    if (lure && lure.id !== 'lure-default' && lure.colors) this.fishing.lureLook = { colors: lure.colors, pattern: lure.pattern ?? 0, glow: lure.glow ?? 0 };
    else {
      const LC: [string, string, string][] = [['#e05a3a', '#f7e0b0', '#ffd23a'], ['#d86aa0', '#ffd8e8', '#8a3a6a'], ['#c0c8d0', '#ffffff', '#ffd23a'],
        ['#3ad0ff', '#e0fbff', '#ff8a2a'], ['#ff70c0', '#fff0a0', '#70e0ff'], ['#8aff3a', '#203010', '#e0ff60'], ['#ff5a10', '#ffd07a', '#2a1a1a'],
        ['#8ab0ff', '#ffffff', '#ffe040'], ['#e0c040', '#3a2a10', '#50ffb0'], ['#ffd060', '#fffae0', '#40d0e0'], ['#3a6a4a', '#c0ff80', '#7aff5a'],
        ['#2a1a5a', '#ffffff', '#ffe07a']];
      const t = Math.min(this.save.upgrades.bait, LC.length - 1);
      this.fishing.lureLook = { colors: LC[t], pattern: t === 1 ? 1 : 0, glow: t >= 3 ? 0.4 : 0 };
    }
    const line = cosmeticById.get(eq.line);
    this.fishing.lineColor = line?.color ? hex(line.color).map((c) => Math.min(1, c * 1.1)) as [number, number, number] : [0.9, 0.9, 0.86];
  }

  private persist() {
    this.save.boat = { x: this.boat.pos.x, z: this.boat.pos.z, heading: this.boat.heading };
    this.save.dayTime = this.tw.dayTime;
    writeSave(this.save);
  }

  private refreshHud() {
    this.ui.setMoney(this.save.money);
    this.ui.setPearls(this.save.pearls);
    this.ui.setCooler(this.save.cooler.length, this.stats.cooler);
    this.ui.inventory(this.save.inventory, this.effectsList());
    this.ui.contracts(this.save.contracts);
  }

  private effectsList() {
    const out: { label: string; color: string }[] = [];
    const t = this.time;
    if (this.effects.chum && this.effects.chum.until > t) out.push({ label: `Chum ${Math.ceil(this.effects.chum.until - t)}s`, color: '#c0603a' });
    if (this.effects.energyUntil > t) out.push({ label: `Energy ${Math.ceil(this.effects.energyUntil - t)}s`, color: '#ffd23a' });
    if (this.effects.sonarUntil > t) out.push({ label: `Sonar ${Math.ceil(this.effects.sonarUntil - t)}s`, color: '#3ad0ff' });
    if (this.save.luckyCasts > 0) out.push({ label: `Lucky x${this.save.luckyCasts}`, color: '#3ad060' });
    if (this.save.bossBait) out.push({ label: 'Boss Bait armed', color: '#ff4a4a' });
    if (this.save.goldenHook) out.push({ label: 'Golden Hook', color: '#ffb020' });
    return out;
  }

  private water = (x: number, z: number) => waveHeight(x, z, this.time, this.r.frame.waveScale);

  // ------------------------------------------------------------------ modals
  private openPause() {
    this.ui.openPause(this.save, {
      resume: () => { this.ui.closePause(); this.input.lock(); },
      reset: () => { clearSave(); location.reload(); },
      change: () => { this.applySettings(); writeSave(this.save); },
    });
  }

  private unlockForUI() {
    if (this.input.locked) { this.suppressPause = true; this.input.unlock(); }
  }

  private celebrate(got: ReturnType<typeof checkAchievements>) {
    for (const a of got) {
      this.ui.achievement(a.name, a.desc, a.pearls);
      this.audio.newSpecies();
    }
    if (got.length) this.refreshHud();
  }

  openShop(target: DockTarget) {
    this.unlockForUI();
    const at = target.kind === 'harbor' ? this.scenery.dockSpot : target.outpost.dock;
    this.boat.pos.copy(at);
    this.boat.heading = target.kind === 'harbor' ? 0 : target.outpost.yaw + Math.PI / 2;
    this.boat.speed = 0;
    this.audio.setMood('shop');
    this.audio.cash();
    const level = progressLevel(this.save);
    const hs = {
      title: target.kind === 'harbor' ? 'Tackle Shop' : target.outpost.name,
      harbor: target.kind === 'harbor',
      itemPrice: (id: ItemId) => itemPrice(itemById.get(id)!, level),
      sell: () => {
        const n = this.save.cooler.length;
        const v = sellAll(this.save);
        questEvent(this.save, { sold: v });
        if (n) { this.audio.cash(); this.ui.toast(`+${formatMoney(v)}`, '#7fff8a', true, `Sold ${n} fish`); this.ui.coinBurst(Math.min(24, 6 + n)); }
        if (this.save.tutorial === 2) this.save.tutorial = 3;
        this.celebrate(checkAchievements(this.save));
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
            const z = NAMED_ZONES.find((zz) => zz.hull === this.stats.hull);
            const rl = REALMS.find((x) => x.hull === this.stats.hull && x.id !== 'blue');
            if (rl) this.ui.toast(`The rift to ${rl.name} is open!`, '#e080ff', true, 'Sail through the swirling rift portal to cross over');
            else if (z) this.ui.toast(`${z.name} unlocked!`, '#7fe0ff');
          }
          if (this.save.tutorial === 3) this.save.tutorial = 4;
          this.celebrate(checkAchievements(this.save));
          this.persist();
          this.refreshHud();
        } else this.audio.deny();
        this.ui.renderShop(this.save, hs);
      },
      buyItem: (id: ItemId, n: number) => {
        if (buyItem(this.save, id, hs.itemPrice(id), n)) { this.audio.coin(); this.persist(); this.refreshHud(); } else this.audio.deny();
        this.ui.renderShop(this.save, hs);
      },
      buyCosmetic: (id: string) => {
        if (this.save.cosmetics.owned.includes(id)) equipCosmetic(this.save, id);
        else if (buyCosmetic(this.save, id)) { this.audio.buy(); this.celebrate(checkAchievements(this.save)); } else { this.audio.deny(); return; }
        this.applyCosmetics();
        this.persist();
        this.refreshHud();
        this.ui.renderShop(this.save, hs);
      },
      reroll: () => {
        const cost = this.rerollCost();
        if (this.save.money < cost) { this.audio.deny(); return; }
        this.save.money -= cost;
        this.save.contracts = [];
        fillContracts(this.save, this.contractRand, this.stats.lineLength, this.stats.hooks);
        this.audio.click();
        this.refreshHud();
        this.ui.renderShop(this.save, hs);
      },
      rerollCost: () => this.rerollCost(),
      destinations: () => this.destinations(),
      travel: (i: number) => {
        const d = this.destinations()[i];
        if (!d || this.save.money < d.cost || d.here) { this.audio.deny(); return; }
        this.save.money -= d.cost;
        this.save.stats.travels++;
        this.closeShop();
        this.startTravel(d.pos, d.heading);
        this.celebrate(checkAchievements(this.save));
      },
      close: () => this.closeShop(),
      statText: (id: TrackId, tier: number) => statText(id, tier),
    };
    this.ui.openShop(this.save, hs);
  }

  private rerollCost() { return nicePrice(LEVEL_VALUE[progressLevel(this.save)] * 2); }

  private destinations() {
    const list: { name: string; zone: string; cost: number; pos: Vec3; heading: number; here: boolean }[] = [];
    const here = this.boat.pos;
    const add = (name: string, zone: string, pos: Vec3, heading: number) => {
      const d = pos.distanceXZ(here);
      list.push({ name, zone, pos, heading, cost: d < 50 ? 0 : Math.round((20 + d * 0.08 * (1 + progressLevel(this.save))) / 5) * 5, here: d < 50 });
    };
    const home = activeRealm() === 'blue' ? 'Sunny Shallows' : activeRealmInfo().name;
    add(this.scenery.baseName, home, this.scenery.dockSpot, activeRealm() === 'blue' ? 0 : this.scenery.dockHeading);
    for (const o of this.scenery.outposts) {
      if (!this.save.outposts.includes(o.zone)) continue;
      add(o.name, NAMED_ZONES.find((z) => z.id === o.zone)!.name, o.dock, o.yaw + Math.PI / 2);
    }
    return list;
  }

  private startTravel(to: Vec3, heading: number) {
    this.travel = { t: 0, to: to.clone(), heading };
    this.audio.whoosh();
  }

  private comboMult() { return Math.min(2, 1 + 0.1 * Math.max(0, this.combo.n - 1)); }

  private breakCombo() {
    if (this.combo.n >= 3) this.ui.toast('COMBO LOST', '#ff8a7a', false, `Your x${this.combo.n} streak ended`);
    this.combo.n = 0;
    this.combo.until = 0;
  }

  // ------------------------------------------------------------------ realms
  /** Swaps the whole world for another realm (terrain, height map, scenery, life, hot spots). */
  private enterRealm(id: RealmId) {
    setActiveRealm(id);
    syncRealm();
    let w = this.worlds.get(id);
    if (!w) {
      const heightmap = buildHeightMap();
      const terrain = this.r.registerMesh(buildTerrainMesh());
      w = { terrain, heightmap };
      this.worlds.set(id, w);
    }
    if (!this.save.realms.includes(id)) this.save.realms.push(id);
    if (!w.scenery) w.scenery = new Scenery(this.r, this.a, w.terrain, this.save.realms);
    else w.scenery.buildPortals(this.save.realms);
    this.r.setHeightMap(w.heightmap, 800);
    this.scenery = w.scenery;
    this.spots = new Hotspots();
    this.life.setRealm(id, this.scenery);
    this.events.clear();
    this.effects.chum = null;
    this.ui.resetMap();
    this.save.realm = id;
    // arrive just in front of the harbor gate, facing the harbor
    const gate = this.scenery.portals.find((p) => p.kind === 'gate');
    const at = gate ? gate.pos.clone().add(new Vec3(-gate.pos.x, 0, -gate.pos.z).normalize().scale(40)) : this.scenery.dockSpot.clone();
    this.boat.pos.set(at.x, 0, at.z);
    this.boat.heading = Math.atan2(-at.x, -at.z);
    this.boat.speed = 8;
    this.zone = zoneAt(at.x, at.z);
    this.env.update(at.x, at.z, -1);
    this.cam.yaw = this.boat.heading + Math.PI + 0.3;
    this.cam.target.set(at.x, 3, at.z);
    this.cam.desired.copy(this.cam.target);
    this.audio.setMood(MOOD[this.zone.id]);
    this.portalCool = 4;
    this.persist();
  }

  private updatePortals(dt: number) {
    this.portalCool -= dt;
    this.portalHint = null;
    for (const p of this.scenery.portals) {
      const d = p.pos.distanceXZ(this.boat.pos);
      if (d < 140) this.portalHint = p;
      if (d > 12 || this.portalCool > 0) continue;
      const away = this.boat.pos.clone().sub(p.pos).normalize();
      if (p.kind === 'tear') {
        const next = REALMS[REALMS.findIndex((r) => r.id === activeRealm()) + 1];
        if (!next) continue;
        if (this.stats.hull < next.hull) {
          this.portalCool = 3;
          this.boat.pos.addScaled(away, 10);
          this.boat.speed = -6;
          const hullName = TRACKS.find((t) => t.id === 'hull')!.tiers[next.hull]?.name ?? 'stronger';
          this.ui.banner(next.name, 'THE RIFT IS UNSTABLE!', `Your hull can't survive the crossing. Buy the ${hullName} hull.`, true, 4500);
          this.audio.warn();
          this.cam.shake(0.8);
          this.r.post.flash = [0.8, 0.4, 1, 0.4];
          continue;
        }
        this.startWarp(next.id, true);
      } else {
        const others = this.save.realms.filter((r) => r !== activeRealm());
        if (!others.length) continue;
        this.portalCool = 3;
        this.boat.speed = 0;
        this.boat.pos.addScaled(away, 8);
        this.unlockForUI();
        this.ui.realmSelect(REALMS.map((r) => ({
          id: r.id, name: r.name, numeral: r.numeral, tagline: r.tagline, color: r.color,
          here: r.id === activeRealm(), open: this.save.realms.includes(r.id),
        })), (id) => {
          this.input.lock();
          if (id && id !== activeRealm()) this.startWarp(id as RealmId, false);
        });
      }
      return;
    }
  }

  private startWarp(to: RealmId, tear: boolean) {
    this.warp = { t: 0, to, switched: false, tear };
    this.audio.warp();
    this.audio.whoosh();
    this.boat.speed = Math.max(this.boat.speed, 14);
    this.fishing.cancelAim();
  }

  /** Being pulled through a rift: speed up, swirl, white out, swap realms, fade into the new world. */
  private updateWarp(dt: number) {
    const w = this.warp!;
    w.t += dt;
    const t = w.t;
    const p = this.r.post;
    const b = this.boat;
    b.throttle = 1;
    b.steer = 0;
    b.update(dt, this.time, this.stats.boatSpeed * (w.switched ? 0.6 : 2), this.r.frame.waveScale, () => {});
    if (!w.switched) {
      p.warp = Math.min(1, t / 1.3);
      p.fade = [1, 1, 1, clamp((t - 1.0) / 0.5, 0, 1)];
      this.cam.fovTarget = 0.95 + Math.min(t, 1.5) * 0.55;
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2, rr = 4 + Math.random() * 10;
        this.fx.spawn({ x: b.pos.x + Math.cos(a) * rr, y: 1 + Math.random() * 8, z: b.pos.z + Math.sin(a) * rr, vx: -Math.sin(a) * 12, vy: 2, vz: Math.cos(a) * 12,
          max: 0.6, size: 0.25, r: 1.2, g: 0.6, b: 1.6, a: 0, kind: 3 });
      }
      if (t >= 1.5) {
        this.enterRealm(w.to);
        w.switched = true;
        w.t = 1.5;
        this.lastTime = performance.now();
      }
    } else {
      const k = (t - 1.5) / 1.8;
      p.warp = Math.max(0, 1 - k * 1.2);
      p.fade = [1, 1, 1, clamp(1 - k * 1.6, 0, 1)];
      this.cam.fovTarget = 0.95 + Math.max(0, 1 - k) * 0.7;
      if (t - dt < 1.75 && t >= 1.75) {
        const info = realmById(w.to);
        this.ui.banner(`REALM ${info.numeral}`, info.name.toUpperCase(), info.tagline, false, 6000);
        this.audio.legendary();
        this.audio.setMood(MOOD[this.zone.id]);
        if (w.tear) this.fireworks = 6;
        this.save.stats.realmJumps++;
        this.celebrate(checkAchievements(this.save));
        questEvent(this.save, { realm: w.to });
      }
      if (k >= 1) {
        this.warp = null;
        p.warp = 0;
        p.fade = [0, 0, 0, 0];
        this.checkQuest();
        this.questIntro();
      }
    }
    this.updateCamera(dt);
    this.ambientFx(dt);
    this.updateHud();
  }

  /** Spiral of light inside each rift portal. */
  private drawPortals() {
    const r = this.r;
    const c = this.cam.pos;
    const t = this.time;
    for (const pt of this.scenery.portals) {
      const d = pt.pos.distanceXZ(c);
      if (d > 1400) continue;
      const cx = pt.pos.x, cy = 13, cz = pt.pos.z;
      const rx = Math.cos(pt.yaw), rz = -Math.sin(pt.yaw);
      const [cr, cg, cb] = pt.color;
      const n = d < 500 ? 140 : 60;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const rad = 12 * Math.sqrt(f);
        const a = i * 2.39996 + t * (1.6 - f * 0.9);
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        const k = 0.6 + 0.4 * Math.sin(t * 3 + i);
        r.particle(cx + rx * x, cy + y, cz + rz * x, 0.9 + (1 - f) * 1.4, cr * k, cg * k, cb * k, 0, i % 3 === 0 ? 3 : 0, a);
      }
      r.particle(cx, cy, cz, 16, cr * 0.25, cg * 0.25, cb * 0.25, 0, 0);
      r.particle(cx, cy, cz, 6, cr * 0.5, cg * 0.5, cb * 0.5, 0, 0);
    }
  }

  /** Realm-specific ambience: meteors, fel embers, star dust, neon sparks, comets. */
  private realmFx(dt: number) {
    this.nextAmbience -= dt;
    if (this.nextAmbience <= 0) {
      this.nextAmbience = 18 + Math.random() * 30;
      this.audio.ambience(activeRealm(), this.camUnder);
    }
    if (this.combo.n > 0 && this.time > this.combo.until) this.breakCombo();
    if (this.camUnder) return;
    const fx = this.fx;
    const c = this.cam.pos;
    switch (activeRealm()) {
      case 'jurassic':
        if (this.zone.id === 'crater' && Math.random() < dt * 1.2) {
          const a = Math.random() * Math.PI * 2;
          fx.spawn({ x: c.x + Math.cos(a) * 300, y: 260, z: c.z + Math.sin(a) * 300, vx: -Math.cos(a) * 120, vy: -90, vz: -Math.sin(a) * 120,
            max: 2.2, size: 3, r: 2, g: 0.8, b: 0.3, a: 0, kind: 6, stretch: 14 });
        }
        if (this.r.frame.night > 0.4 && Math.random() < dt * 20) {
          fx.spawn({ x: c.x + fx.rnd() * 60, y: 1 + Math.random() * 6, z: c.z + fx.rnd() * 60, vx: fx.rnd(), vy: fx.rnd() * 0.5, vz: fx.rnd(),
            max: 3, size: 0.12, r: 1, g: 1.2, b: 0.3, a: 0, kind: 3 });
        }
        break;
      case 'shattered':
        for (let i = 0; i < 20 * dt; i++) fx.spawn({ x: c.x + fx.rnd() * 60, y: Math.random() * 10, z: c.z + fx.rnd() * 60, vx: fx.rnd(), vy: 1 + Math.random() * 2, vz: fx.rnd(),
          max: 4, size: 0.12, r: 0.5, g: 1.4, b: 0.3, a: 0, kind: 3 });
        break;
      case 'selene':
        for (let i = 0; i < 10 * dt; i++) fx.spawn({ x: c.x + fx.rnd() * 60, y: Math.random() * 20, z: c.z + fx.rnd() * 60, vy: 0.2, max: 5, size: 0.08, r: 0.8, g: 0.9, b: 1.2, a: 0, kind: 3 });
        break;
      case 'neon':
        for (let i = 0; i < 12 * dt; i++) {
          const pink = Math.random() < 0.5;
          fx.spawn({ x: c.x + fx.rnd() * 60, y: 0.5 + Math.random() * 12, z: c.z + fx.rnd() * 60, vy: 0.6, max: 5, size: 0.14,
            r: pink ? 1.5 : 0.2, g: pink ? 0.3 : 1.3, b: 1.5, a: 0, kind: 4 });
        }
        break;
      case 'maw':
        if (Math.random() < dt * 0.8) {
          const a = Math.random() * Math.PI * 2;
          fx.spawn({ x: c.x + Math.cos(a) * 400, y: 300 + Math.random() * 200, z: c.z + Math.sin(a) * 400, vx: -Math.cos(a) * 200, vy: -40, vz: -Math.sin(a) * 200,
            max: 3, size: 4, r: 0.7, g: 0.9, b: 1.6, a: 0, kind: 6, stretch: 20 });
        }
        for (let i = 0; i < 12 * dt; i++) fx.spawn({ x: c.x + fx.rnd() * 60, y: Math.random() * 20, z: c.z + fx.rnd() * 60, vy: 0.3, max: 4, size: 0.1, r: 1, g: 0.6, b: 1.4, a: 0, kind: 3 });
        break;
      default: break;
    }
  }

  private closeShop() {
    this.ui.closeShop();
    this.audio.setMood(MOOD[this.zone.id]);
    this.input.lock();
    this.checkQuest();
  }

  // ------------------------------------------------------------------ main loop
  frame(now: number) {
    const realDt = this.lastTime ? clamp((now - this.lastTime) / 1000, 0, 0.05) : 0.016;
    this.lastTime = now;
    // slow motion on big bites
    this.slowmo = Math.max(0, this.slowmo - realDt);
    this.timeScale = damp(this.timeScale, this.slowmo > 0 ? 0.3 : 1, 8, realDt);
    const dt = realDt * this.timeScale;
    if (this.fireworks > 0) this.fireworksFx(realDt);
    const inp = this.input;
    this.fpsAcc.t += dt; this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) { this.fpsAcc.fps = this.fpsAcc.n / this.fpsAcc.t; this.fpsAcc.t = 0; this.fpsAcc.n = 0; }
    if (this.playing) {
      if (this.ui.modal === 'none') {
        this.time += dt;
        this.save.stats.playTime += dt;
        this.update(dt);
      } else {
        if (this.ui.modal === 'dialog' && inp.hit('Space', 'Enter', 'KeyE', 'Mouse0')) this.ui.advanceDialog();
        if (this.ui.modal === 'shop' && inp.hit('KeyE', 'Escape')) this.closeShop();
        else if (this.ui.modal === 'map' && inp.hit('KeyM', 'Escape')) this.ui.closeMap();
        this.time += dt * 0.3;
        this.passiveUpdate(dt);
      }
    } else {
      this.time += dt;
      this.attractMode(dt);
      this.passiveUpdate(dt);
    }
    this.draw(dt);
    if (this.captureNext) { this.captureNext = false; this.savePhoto(); }
    this.ui.fps(this.save.settings.fps ? this.fpsAcc.fps : null);
    inp.endFrame();
  }

  private passiveUpdate(dt: number) {
    this.boat.throttle = 0;
    this.boat.steer = 0;
    this.boat.update(dt, this.time, this.stats.boatSpeed, this.r.frame.waveScale, () => {});
    if (this.ui.modal === 'shop') {
      if (this.dock?.kind === 'outpost') {
        const o = this.dock.outpost;
        this.cam.desired.set(o.pos.x, 3, o.pos.z);
        this.cam.yaw = damp(this.cam.yaw, o.yaw + 2.4, 3, dt);
      } else {
        this.cam.desired.set(this.scenery.shopPos.x, this.scenery.shopPos.y + 4.5, this.scenery.shopPos.z);
        this.cam.yaw = damp(this.cam.yaw, 0.35, 3, dt);
      }
      this.cam.pitch = damp(this.cam.pitch, 0.12, 3, dt);
      this.cam.distTarget = 22;
      this.cam.waterSide = 1;
    }
    this.cam.update(dt, this.water, heightAt, !this.playing && this.attract.t < 0.05);
    this.fx.update(dt, this.water);
    this.spots.update(dt, this.time, this.cam.pos, this.fx);
    this.aquarium.update(dt);
    this.audio.update(dt, { throttle: 0, speed: 0, underwater: this.camUnder ? 1 : 0, reeling: 0, rain: this.tw.rain });
  }

  /** Title screen: a slow scenic tour of the world's landmarks. */
  private attractMode(dt: number) {
    const portals = this.scenery.portals.map((p) => [p.pos.x, 13, p.pos.z, 2.4, 0.08, 90] as [number, number, number, number, number, number]);
    const VIEWS: [number, number, number, number, number, number][] = activeRealm() !== 'blue' ? [
      [this.scenery.dockSpot.x, 3, this.scenery.dockSpot.z, 0.9, 0.2, 30],
      ...portals,
      ...realmZones().map((z) => [z.x, 25, z.z, 1.2, 0.12, 260] as [number, number, number, number, number, number]),
    ] : [
      // x, y, z of the target, yaw, pitch, distance
      [-9, 3, 91, 0.9, 0.22, 20],
      [-1030, 90, 150, 1.8, 0.05, 520],
      [1450, 18, -900, 0.4, 0.08, 150],
      [this.scenery.ghost.pos.x, 8, this.scenery.ghost.pos.z, 2.2, 0.1, 70],
      [-500, 20, -2000, 2.9, 0.06, 160],
      [2100, 120, 1950, 3.6, 0.1, 400],
      [1900, 20, 250, 5.2, 0.12, 180],
    ];
    const a = this.attract;
    a.t += dt;
    if (a.t > 9) { a.t = 0; a.i = (a.i + 1) % VIEWS.length; }
    const [x, y, z, yaw, pitch, dist] = VIEWS[a.i];
    const fade = a.t < 0.6 ? 1 - a.t / 0.6 : a.t > 8.4 ? (a.t - 8.4) / 0.6 : 0;
    this.r.post.fade = [0.02, 0.04, 0.1, clamp(fade, 0, 1)];
    this.cam.desired.set(x, y, z);
    this.cam.yaw = yaw + a.t * 0.03;
    this.cam.pitch = pitch;
    this.cam.distTarget = dist;
    this.cam.waterSide = 1;
    if (a.t < 0.05) { this.cam.target.set(x, y, z); this.cam.dist = dist; }
    // keep the day bright for the tour
    if (this.tw.night > 0.5) this.tw.dayTime = 0.4;
  }

  private update(dt: number) {
    const inp = this.input;
    const f = this.fishing;
    const s = this.stats;
    if (this.warp) { this.updateWarp(dt); return; }
    if (this.r.post.fade[3] > 0 && !this.travel) this.r.post.fade[3] = Math.max(0, this.r.post.fade[3] - dt * 2);
    if (inp.hit('KeyF')) this.togglePhoto();
    if (this.photo) {
      this.lookInput(dt);
      if (inp.hit('Enter')) this.captureNext = true;
      if (inp.hit('Escape')) this.togglePhoto();
      this.cam.distTarget = clamp(this.cam.distTarget + inp.zoom * 2, 3, 120);
      this.cam.update(dt, this.water, heightAt);
      this.fx.update(dt, this.water);
      return;
    }
    this.lookInput(dt);
    if (inp.hit('Escape', 'KeyP') && !inp.locked && f.state !== 'aim') { this.openPause(); return; }
    if (inp.hit('KeyM')) {
      const range = this.effects.sonarUntil > this.time ? 99999 : [0, 400, 1400, 99999][s.finder];
      this.ui.openMap(this.boat.pos.x, this.boat.pos.z, this.boat.heading, s.hull,
        this.spots.spots.filter((h) => h.pos.distanceXZ(this.boat.pos) < range).map((h) => ({ x: h.pos.x, z: h.pos.z })), this.save.seenZones,
        this.scenery.outposts.filter((o) => this.save.outposts.includes(o.zone)).map((o) => ({ x: o.pos.x, z: o.pos.z, name: o.name })), this.mapMarkers(),
        { x: this.scenery.dockSpot.x, z: this.scenery.dockSpot.z });
      return;
    }
    if (inp.hit('KeyH')) this.audio.horn();
    for (const it of ITEMS) if (inp.hit('Digit' + it.key)) this.useItem(it.id);

    // fast travel animation (fade out, jump, fade in)
    if (this.travel) {
      this.travel.t += dt;
      const t = this.travel.t;
      this.r.post.fade = [0.02, 0.05, 0.12, clamp(t < 0.6 ? t / 0.6 : 1 - (t - 0.9) / 0.6, 0, 1)];
      if (t >= 0.6 && t - dt < 0.6) {
        this.boat.pos.copy(this.travel.to);
        this.boat.heading = this.travel.heading;
        this.boat.speed = 0;
        this.cam.yaw = this.boat.heading + Math.PI + 0.4;
        this.cam.target.set(this.boat.pos.x, 3, this.boat.pos.z);
        this.env.update(this.boat.pos.x, this.boat.pos.z, -1);
      }
      if (t > 1.5) { this.travel = null; this.r.post.fade = [0, 0, 0, 0]; }
    }

    // ---- boat / casting
    const sailing = f.state === 'idle' || f.state === 'aim';
    this.dock = null;
    if (Math.abs(this.boat.speed) < 7) {
      if (this.boat.pos.distanceXZ(this.scenery.dockSpot) < 22) this.dock = { kind: 'harbor' };
      else for (const o of this.scenery.outposts) if (this.boat.pos.distanceXZ(o.dock) < 22) { this.dock = { kind: 'outpost', outpost: o }; break; }
    }
    if (sailing) {
      this.boat.throttle = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
      this.boat.steer = (inp.down('KeyA') ? 1 : 0) - (inp.down('KeyD') ? 1 : 0);
      if (this.dock && f.state === 'idle' && inp.hit('KeyE')) { this.openShop(this.dock); return; }
      if (f.state === 'idle' && inp.hit('Mouse0', 'Space')) { f.startAim(); this.audio.click(); }
      if (f.state === 'aim') {
        this.boat.faceWorldYaw(this.cam.lookYaw);
        this.boat.armTarget = -0.4 - f.power * 0.7;
        if (inp.hit('Mouse2', 'Escape')) { f.cancelAim(); this.boat.armTarget = 0; }
        else if (!inp.down('Mouse0', 'Space')) {
          this.castLucky = this.save.luckyCasts > 0;
          if (this.castLucky) this.save.luckyCasts--;
          this.castBoss = this.save.bossBait;
          f.release(this.fishCtx());
          this.save.stats.casts++;
          if (this.save.tutorial === 0) this.save.tutorial = 1;
          this.boat.armTarget = 0.7;
          this.swingT = 0.35;
          this.audio.cast();
          this.boat.rodBend = -0.3;
          this.refreshHud();
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
    const boost = this.effects.energyUntil > this.time ? 1.25 : 1;
    this.boat.update(dt, this.time, s.boatSpeed * boost, this.r.frame.waveScale, () => { this.audio.thud(); this.cam.shake(0.6); });
    this.resolveCollisions(dt);
    if (f.state === 'idle' || f.state === 'aim') this.updatePortals(dt);
    this.boat.rodBend = damp(this.boat.rodBend, f.state === 'under' ? 0.15 + f.tension * 0.9 + f.hooked.length * 0.05 : 0.12, 6, dt);

    // ---- fishing
    f.update(dt, this.fishCtx());
    this.handleFishingEvents();

    // ---- world
    this.updateZones(dt);
    const strike = this.tw.update(dt, this.env.storm, this.cam.pos);
    if (strike) {
      const d = strike.distanceXZ(this.cam.pos);
      this.r.post.flash = [0.85, 0.9, 1, this.camUnder ? 0.08 : 0.35];
      setTimeout(() => this.audio.thunder(clamp(1 - d / 900, 0.2, 1)), (d / 340) * 1000);
    }
    this.life.update(dt, this.time, this.boat, this.zone.id, this.r.frame.waveScale, this.fx, this.audio);
    this.aquarium.update(dt);
    this.updateWorldEvents(dt);
    this.updateTreasureMap();
    this.questCheckT -= dt;
    if (this.questCheckT <= 0) { this.questCheckT = 1; this.checkQuest(); }

    // ---- camera
    this.updateCamera(dt);

    // ---- landing sequence
    this.updateFlyers(dt);

    // ---- ambient fx
    this.ambientFx(dt);

    // ---- HUD
    this.updateHud();

    this.audio.update(dt, { throttle: this.boat.throttle, speed: this.boat.speed, underwater: this.camUnder ? 1 : 0, reeling: f.state === 'under' && f.reeling ? 1 : 0, rain: this.tw.rain });
    if (this.time - this.lastSave > 10) { this.lastSave = this.time; this.persist(); this.refreshHud(); }
  }

  /** Special minimap/map markers: treasure X and world events. */
  private mapMarkers() {
    const out: { x: number; z: number; kind: 'x' | 'star' | 'gate' | 'tear' }[] = [];
    const tm = this.save.treasureMap;
    if (tm && NAMED_ZONES.find((z) => z.id === tm.zone)?.realm === activeRealm()) out.push({ x: tm.x, z: tm.z, kind: 'x' });
    for (const p of this.scenery.portals) out.push({ x: p.pos.x, z: p.pos.z, kind: p.kind });
    const e = this.events.active;
    if (e?.kind === 'frenzy') out.push({ x: e.pos.x, z: e.pos.z, kind: 'star' });
    return out;
  }

  private updateWorldEvents(dt: number) {
    const started = this.events.update(dt, this.time, this.boat.pos, this.stats.hull, this.tw.isNight, this.fx);
    if (started) {
      const info = EVENT_INFO[started.kind];
      this.save.stats.events++;
      this.ui.banner(started.zone ? started.zone.name : 'Event', info.title, info.sub, false, 5000);
      this.audio.zone();
      if (started.kind === 'golden') this.r.post.flash = [1, 0.85, 0.3, 0.3];
    }
    const got = this.events.collect(this.boat.pos);
    if (got > 0) {
      this.save.pearls += got;
      this.save.stats.fragments += got;
      this.audio.treasure();
      this.fx.burst(this.boat.pos.clone().add(new Vec3(0, 2, 0)), [0.7, 0.8, 1], 30, 5, 0.3);
      this.ui.toast('STAR FRAGMENT!', '#a0c0ff', false, `+${got} pearl${got > 1 ? 's' : ''}`);
      this.refreshHud();
    }
  }

  /** Treasure maps from bottles: dive the lure down at the X to dig up the loot. */
  private updateTreasureMap() {
    const m = this.save.treasureMap;
    const f = this.fishing;
    if (!m || f.state !== 'under' || NAMED_ZONES.find((z) => z.id === m.zone)?.realm !== activeRealm()) return;
    if (Math.hypot(f.lure.x - m.x, f.lure.z - m.z) > 12) return;
    if (f.lure.y > heightAt(f.lure.x, f.lure.z) + 6) return;
    const lvl = NAMED_ZONES.find((z) => z.id === m.zone)?.level ?? 0;
    const money = LEVEL_VALUE[lvl] * 60;
    this.save.treasureMap = null;
    this.save.money += money;
    this.save.stats.earned += money;
    this.save.pearls += 5;
    this.save.stats.maps++;
    this.audio.treasure();
    this.audio.legendary();
    this.fx.burst(f.lure.clone(), [1, 0.85, 0.3], 80, 8, 0.4);
    this.ui.banner('X MARKS THE SPOT', `+${formatMoney(money)}`, 'You dug up the buried treasure! +5 pearls', false, 4500);
    this.celebrate(checkAchievements(this.save));
    this.refreshHud();
    this.persist();
  }

  private makeTreasureMap() {
    const open = realmZones().filter((z) => z.hull <= this.stats.hull && z.floorDepth <= this.stats.lineLength * 1.5);
    const r = this.contractRand;
    for (let t = 0; t < 80; t++) {
      const zone = open[Math.floor(r() * open.length)];
      if (!zone) return;
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * zone.radius * 0.8;
      const x = zone.x + Math.cos(a) * d, z = zone.z + Math.sin(a) * d;
      const h = heightAt(x, z);
      if (h < -8 && -h < this.stats.lineLength * 0.85) {
        this.save.treasureMap = { x, z, zone: zone.id };
        this.ui.toast('TREASURE MAP!', '#ffd23a', true, `An X is marked in ${zone.name}. Dive your lure to the bottom there.`);
        return;
      }
    }
  }

  /** Keeps the boat out of piers, outposts and other boats. */
  private resolveCollisions(dt: number) {
    const b = this.boat;
    const fw = b.forward;
    const hull = [b.pos.clone().addScaled(fw, 2.2), b.pos.clone(), b.pos.clone().addScaled(fw, -2.2)];
    const obstacles: [number, number, number][] = [];
    if (activeRealm() === 'blue') {
      for (let z = 55; z <= 88; z += 3) obstacles.push([0, z, 2.4]);
      for (let x = -4.5; x <= 4.5; x += 3) obstacles.push([x, 91, 3.2]);
    }
    for (const o of this.scenery.outposts) obstacles.push([o.pos.x, o.pos.z, 7.5]);
    for (const n of this.life.npcs) { obstacles.push([n.boat.pos.x + n.boat.forward.x * 2, n.boat.pos.z + n.boat.forward.z * 2, 1.8]); obstacles.push([n.boat.pos.x - n.boat.forward.x * 2, n.boat.pos.z - n.boat.forward.z * 2, 1.8]); }
    const g = activeRealm() === 'blue' ? this.scenery.ghost.pos : new Vec3(1e6, 0, 1e6);
    for (let k = -2; k <= 2; k++) {
      const hd = this.scenery.ghost.heading;
      obstacles.push([g.x + Math.sin(hd) * k * 5, g.z + Math.cos(hd) * k * 5, 4.5]);
    }
    let hit = false;
    for (const p of hull) {
      for (const [ox, oz, orad] of obstacles) {
        const dx = p.x - ox, dz = p.z - oz;
        const d = Math.hypot(dx, dz), min = orad + 1.5;
        if (d < min && d > 0.001) {
          const push = (min - d);
          b.pos.x += (dx / d) * push;
          b.pos.z += (dz / d) * push;
          hit = true;
        }
      }
    }
    if (hit) {
      if (Math.abs(b.speed) > 4 && b.bumped <= 0) { this.audio.thud(); this.cam.shake(0.4); b.bumped = 0.6; }
      b.speed *= Math.exp(-dt * 6);
    }
    // friendly honks from passing boats
    if (this.time - this.lastHonk > 25) {
      for (const n of this.life.npcs) {
        if (n.boat.pos.distanceXZ(b.pos) < 28 && Math.abs(n.boat.speed) > 3) { this.lastHonk = this.time; this.audio.horn(0.35); break; }
      }
    }
  }

  private togglePhoto() {
    this.photo = !this.photo;
    this.ui.photo(this.photo);
    this.audio.click();
    if (this.photo) this.cam.distTarget = Math.max(this.cam.distTarget, 14);
  }

  private savePhoto() {
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fishing-simulator-2028-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      this.ui.toast('Picture saved!', '#fff');
      this.audio.coin();
    }, 'image/png');
  }

  private fireworksFx(dt: number) {
    this.fireworks -= dt;
    if (Math.random() < dt * 3) {
      const p = this.boat.pos.clone().add(new Vec3(this.fx.rnd() * 60, 25 + Math.random() * 25, this.fx.rnd() * 60));
      const cols: [number, number, number][] = [[1, 0.4, 0.3], [0.4, 1, 0.5], [0.4, 0.6, 1], [1, 0.9, 0.3], [1, 0.4, 1]];
      this.fx.burst(p, cols[Math.floor(Math.random() * cols.length)], 60, 12, 0.5);
      this.audio.splash(0.3);
    }
  }

  private useItem(id: ItemId) {
    const f = this.fishing;
    const it = itemById.get(id)!;
    if ((this.save.inventory[id] ?? 0) <= 0) { this.ui.toast(`No ${it.name}s`, '#ffb0a0', false, 'Buy supplies at any shop'); this.audio.deny(); return; }
    if (id === 'bossbait') {
      const z = zoneAt(f.state === 'under' ? f.lure.x : this.boat.pos.x, f.state === 'under' ? f.lure.z : this.boat.pos.z);
      if (!BOSS_FOR_ZONE.get(z.id)) { this.ui.toast('No boss lives here', '#ffb0a0', false, 'Try a named zone'); this.audio.deny(); return; }
      if (this.save.bossBait) { this.ui.toast('Boss Bait already armed', '#fff'); return; }
    }
    if (id === 'golden' && this.save.goldenHook) { this.ui.toast('Golden Hook already on', '#fff'); return; }
    useItem(this.save, id);
    const here = f.state === 'under' ? f.lure.clone() : this.boat.pos.clone();
    switch (id) {
      case 'chum':
        this.effects.chum = { pos: here, until: this.time + 90 };
        for (let i = 0; i < 40; i++) this.fx.spawn({ x: here.x + this.fx.rnd() * 3, y: Math.min(here.y, -0.3), z: here.z + this.fx.rnd() * 3, vx: this.fx.rnd(), vy: -0.3, vz: this.fx.rnd(), max: 6, size: 0.5, grow: 0.6, r: 0.55, g: 0.3, b: 0.2, a: 0.6 });
        if (f.state !== 'under') this.fx.splash(here, 0.5);
        break;
      case 'lucky': this.save.luckyCasts += 5; break;
      case 'energy': this.effects.energyUntil = this.time + 120; break;
      case 'sonar': this.effects.sonarUntil = this.time + 300; this.audio.zone(); break;
      case 'bossbait': this.save.bossBait = true; break;
      case 'golden': this.save.goldenHook = true; break;
    }
    this.ui.toast(it.name + '!', it.color, false, it.desc);
    this.audio.coin();
    this.celebrate(checkAchievements(this.save));
    this.refreshHud();
    this.persist();
  }

  private fishCtx(): FishingContext {
    const inp = this.input;
    const under = this.fishing.state === 'under';
    return {
      stats: this.stats,
      tip: this.boat.rodTip,
      boatPos: this.boat.pos,
      time: this.time,
      waveScale: this.r.frame.waveScale,
      camForward: this.cam.forwardXZ,
      camRight: this.cam.rightXZ,
      move: under ? { x: (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0), z: (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0) } : { x: 0, z: 0 },
      dive: under && inp.down('Mouse2', 'ShiftLeft', 'ShiftRight'),
      reel: under && inp.down('Mouse0', 'Space'),
      hotspot: Math.max(this.spots.strengthAt(this.fishing.lure.x, this.fishing.lure.z), this.events.frenzyAt(this.fishing.lure.x, this.fishing.lure.z)),
      rareBoost: this.events.golden ? 2.5 : 1,
      mastered: this.mastered,
      chests: this.scenery.chests,
      night: this.tw.isNight,
      weather: this.tw.effective(),
      bossBait: this.castBoss,
      lucky: this.castLucky,
      energy: this.effects.energyUntil > this.time ? 1.6 : 1,
      golden: this.save.goldenHook,
      chum: this.effects.chum,
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
        case 'perfect':
          this.save.stats.perfect++;
          this.ui.toast('PERFECT CAST!', '#7fff8a', true, 'Rare fish are drawn to your lure');
          this.audio.coin();
          this.fx.burst(this.boat.rodTip.clone(), [0.6, 1, 0.6], 24, 4, 0.25);
          break;
        case 'boss':
          this.save.bossBait = false;
          this.castBoss = false;
          this.ui.banner('BOSS APPROACHING', e.fish.sp.name, e.fish.sp.flavor, true, 4500);
          this.audio.legendary();
          this.audio.setMood('magma');
          this.cam.shake(1);
          this.refreshHud();
          break;
        case 'hook': {
          const sp = e.fish.sp;
          this.audio.bite();
          this.audio.hooked();
          this.fx.burst(e.fish.pos, [1, 0.9, 0.4], 18, 3, 0.25);
          const sc = this.screenPos(e.fish.pos);
          this.ui.floater(sc.x, sc.y - 30, sp.name, RARITY_COLOR[sp.rarity]);
          this.boat.petBounce = 0.5;
          if (sp.rarity === 'legendary') { this.ui.toast('LEGENDARY!', '#ffb020', true, sp.name); this.audio.legendary(); this.cam.shake(0.8); this.slowmo = 0.9; }
          if (sp.boss) { this.ui.toast('HOOKED THE BOSS!', '#ff5a4a', true, 'Counter its pulls with A / D!'); this.cam.shake(1.2); this.slowmo = 1.1; }
          else if (e.fish.kg > this.stats.lineStrength * 0.5 && !this.save.achievements.includes('fighttip')) {
            this.ui.toast('Big one!', '#fff', false, 'Steer AGAINST its pull with A / D and pulse the reel');
            this.save.achievements.push('fighttip');
          }
          break;
        }
        case 'surge':
          this.ui.toast('SURGE INCOMING!', '#ff8a4a', true, 'Let go of the reel!');
          this.audio.warn();
          break;
        case 'enrage':
          this.ui.toast(`${e.fish.sp.name} is ENRAGED!`, '#ff4a4a', true);
          this.cam.shake(1);
          this.audio.chomp();
          break;
        case 'lost': {
          const n = e.fish.sp.name;
          if (e.by === 'snap') this.breakCombo();
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
            this.save.stats.stung++;
          } else {
            this.ui.toast('STOLEN!', '#ff6a5a', false, `Something took your ${n}`);
            this.audio.chomp();
            this.cam.shake(0.7);
            this.save.stats.stolen++;
          }
          break;
        }
        case 'needBait':
          this.ui.toast(`${e.fish.sp.name} ignored your bait`, '#ffd0a0', false, 'Upgrade your bait at the shop');
          break;
        case 'full':
          this.ui.toast('Hooks full!', '#fff', false, 'Hold Space to reel in');
          break;
        case 'treasure': {
          this.save.money += e.amount;
          this.save.stats.earned += e.amount;
          this.save.stats.treasures++;
          this.save.pearls += 1;
          this.audio.treasure();
          this.fx.burst(e.pos.clone().add(new Vec3(0, 1, 0)), [1, 0.85, 0.3], 40, 6, 0.35);
          this.ui.toast(`TREASURE! +${formatMoney(e.amount)}`, '#ffd23a', true, '+1 pearl');
          this.celebrate(checkAchievements(this.save));
          this.refreshHud();
          break;
        }
        case 'land': {
          this.audio.splash(0.6);
          this.fx.splash(new Vec3(e.from.x, 0, e.from.z), 0.6);
          const real = e.catches.filter((c) => !speciesById.get(c.id)?.junk);
          if (real.length) {
            this.combo.n = this.time < this.combo.until ? this.combo.n + 1 : 1;
            this.combo.until = this.time + 50;
            const mult = this.comboMult();
            if (this.combo.n >= 2) {
              for (const c of e.catches) c.value = Math.round(c.value * mult);
              const hue = ['#7fe0ff', '#7fff8a', '#ffd23a', '#ff9a3a', '#ff5ab0', '#c070ff'][Math.min(5, this.combo.n - 2)];
              this.ui.toast(`COMBO x${this.combo.n}!`, hue, this.combo.n >= 4, `Catches worth x${mult.toFixed(1)}`);
              this.audio.combo(this.combo.n);
            }
            this.save.stats.bestCombo = Math.max(this.save.stats.bestCombo, this.combo.n);
          } else this.breakCombo();
          const star = e.actors.find((a) => a.sp.boss || a.sp.rarity === 'legendary');
          if (star) this.trophy = { actor: star, t: -0.6 };
          e.actors.forEach((a, i) => {
            this.flyers.push({ actor: a, t: -i * 0.12, from: a.pos.clone(), local: new Vec3((Math.random() - 0.5) * 1.4, 1.1, -1.4 - Math.random() * 1.4), spin: Math.random() * 6 });
          });
          this.pendingLand = { catches: e.catches, delay: 1.3 + e.actors.length * 0.12, maxDepth: e.maxDepth, zone: e.zone };
          if (e.catches.length && this.save.goldenHook) { this.save.goldenHook = false; this.ui.toast('Golden Hook: double value!', '#ffb020'); }
          if (this.fishing.boss && !e.actors.includes(this.fishing.boss)) this.audio.setMood(MOOD[this.zone.id]);
          break;
        }
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
      const big = fl.actor.length > 4;
      if (k < 1) {
        fl.actor.pos.copy(fl.from).lerp(target, k);
        fl.actor.pos.y += Math.sin(k * Math.PI) * (big ? 12 : 6);
        fl.actor.dir.set(Math.sin(fl.spin + fl.t * 9), Math.cos(fl.t * 7), Math.cos(fl.spin + fl.t * 9)).normalize();
      } else {
        const ft = fl.t - 0.9;
        fl.actor.pos.copy(target);
        if (big) fl.actor.pos.y += fl.actor.length * 0.25;
        fl.actor.pos.y += Math.abs(Math.sin(ft * 9)) * 0.4 * Math.max(0, 1 - ft / 1.6);
        fl.actor.dir.set(Math.sin(fl.spin), 0.2 * Math.sin(ft * 20), Math.cos(fl.spin)).normalize();
        if (ft > (big ? 3 : 1.6)) {
          this.fx.burst(fl.actor.pos, [1, 1, 0.8], big ? 60 : 12, big ? 6 : 2, 0.2);
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
        const pl = this.pendingLand;
        this.pendingLand = null;
        const ctx = { zone: pl.zone, depth: pl.maxDepth, night: this.tw.isNight, weather: this.tw.effective() };
        const res = landCatch(this.save, pl.catches, this.stats.cooler, ctx);
        const cast = { zone: pl.zone, maxDepth: pl.maxDepth, night: ctx.night, weather: ctx.weather };
        const done = progressContracts(this.save, res.kept.concat(res.released), cast);
        questEvent(this.save, { catches: res.kept.concat(res.released), cast });
        if (pl.catches.some((c) => c.id === 'bottle') && !this.save.treasureMap && Math.random() < 0.6) this.makeTreasureMap();
        this.mastered = masteredZones(this.save);
        this.boat.petBounce = 1;
        fillContracts(this.save, this.contractRand, this.stats.lineLength, this.stats.hooks);
        if (res.newSpecies.length) this.audio.newSpecies();
        for (const id of res.newSpecies) this.ui.toast('NEW SPECIES!', '#7fe0ff', true, speciesById.get(id)!.name);
        for (const c of done) { this.ui.contractDone(c); this.audio.cash(); }
        if (pl.catches.some((c) => speciesById.get(c.id)?.boss)) { this.ui.banner('BOSS DEFEATED', speciesById.get(pl.catches.find((c) => speciesById.get(c.id)?.boss)!.id)!.name, 'A trophy for the ages!', false, 5000); this.audio.legendary(); }
        if (this.save.tutorial === 1 && res.kept.length) this.save.tutorial = 2;
        this.celebrate(checkAchievements(this.save));
        this.aquarium.sync(this.save);
        this.refreshHud();
        this.persist();
        if (res.kept.length + res.released.length > 0) {
          this.unlockForUI();
          this.ui.showCatch(res, coolerValue(this.save), () => { this.input.lock(); this.checkQuest(); });
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
      if (z.id !== 'open' && !this.save.seenZones.includes(z.id)) {
        this.save.seenZones.push(z.id);
        this.celebrate(checkAchievements(this.save));
      }
    }
    for (const o of this.scenery.outposts) {
      if (!this.save.outposts.includes(o.zone) && o.pos.distanceXZ(b) < 160) {
        this.save.outposts.push(o.zone);
        this.ui.toast('Outpost discovered!', '#7fe0ff', true, `${o.name}: sell, restock and fast travel`);
        this.audio.zone();
      }
    }
    this.ui.setZone(this.zone.name);
    const w = zoneWeights(b.x, b.z);
    for (const i of realmZoneIdx()) {
      const zn = NAMED_ZONES[i];
      if (zn.hull <= this.stats.hull || w[i] < 0.12) continue;
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
    }
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
    if (inp.mouseDX || inp.mouseDY) c.rotate(inp.mouseDX, inp.mouseDY, s.sensitivity, s.invertY);
    if (inp.orbitX || inp.orbitY) c.rotate(inp.orbitX * 1.4, inp.orbitY * 1.4, s.sensitivity, s.invertY);
    const kx = (inp.down('ArrowRight') ? 1 : 0) - (inp.down('ArrowLeft') ? 1 : 0);
    const ky = (inp.down('ArrowDown') ? 1 : 0) - (inp.down('ArrowUp') ? 1 : 0);
    if (kx || ky) {
      c.rotate(kx * 700 * dt, ky * 450 * dt, 1, s.invertY);
      inp.lastLook = performance.now();
    }
    if (performance.now() - inp.lastLook < 1800) return;
    const f = this.fishing;
    if (f.state === 'idle' && this.boat.speed > 2) {
      c.yaw = dampAngle(c.yaw, this.boat.heading + Math.PI, 1.2, dt);
    } else if (f.state === 'under' && !f.fighting) {
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
      this.underDist = clamp(this.underDist + inp.zoom * 0.8, 3.5, 22);
      c.desired.copy(f.lure);
      const bossZoom = f.boss && f.boss.pos.distanceTo(f.lure) < 40 ? f.boss.length * 0.6 : 0;
      c.distTarget = this.underDist + bossZoom;
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
      c.distTarget = f.state === 'aim' ? 11 : this.sailDist + Math.min(Math.abs(this.boat.speed) * 0.25, 12);
      c.waterSide = 1;
      c.fovTarget = 0.95 + Math.min(Math.abs(this.boat.speed) / 250, 0.25);
      c.minPitch = -0.1;
      if (f.state === 'aim') c.desired.add(this.cam.forwardXZ.scale(4));
    }
    const tr = this.trophy;
    if (tr) {
      tr.t += dt;
      if (tr.t >= 0) {
        if (tr.t - dt < 0) {
          this.slowmo = 1.4;
          const sp = tr.actor.sp;
          if (!sp.boss) this.ui.banner('LEGENDARY CATCH!', sp.name, sp.flavor, false, 4200, 'rainbow');
          this.fx.burst(tr.actor.pos.clone(), [1, 0.85, 0.3], 70, 9, 0.3);
          this.fx.burst(tr.actor.pos.clone(), [0.5, 0.8, 1], 50, 7, 0.3);
          this.fireworks = Math.max(this.fireworks, 3);
        }
        c.desired.copy(tr.actor.pos);
        c.distTarget = tr.actor.length * 1.3 + 5;
        c.yaw += dt * 0.9;
        c.pitch = damp(c.pitch, 0.25, 3, dt);
        c.fovTarget = 0.8;
        c.waterSide = 1;
        if (tr.t > 2.6) this.trophy = null;
      }
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
      // light shafts near the surface in daylight
      const day = 1 - this.r.frame.night;
      if (c.y > -70 && day > 0.3 && Math.random() < dt * 5 * day) {
        const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 30;
        fx.spawn({ x: c.x + Math.cos(a) * d, y: -8 - Math.random() * 6, z: c.z + Math.sin(a) * d, max: 5 + Math.random() * 3, size: 1 + Math.random() * 1.5,
          r: 0.35 * day, g: 0.45 * day, b: 0.5 * day, a: 0, kind: 5, stretch: 9, vx: 0.2 });
      }
      if (this.effects.chum && this.effects.chum.until > this.time && this.effects.chum.pos.distanceTo(c) < 60 && Math.random() < dt * 8) {
        const p = this.effects.chum.pos;
        fx.spawn({ x: p.x + fx.rnd() * 6, y: p.y + fx.rnd() * 4, z: p.z + fx.rnd() * 6, vy: -0.2, max: 4, size: 0.3, grow: 0.3, r: 0.5, g: 0.3, b: 0.2, a: 0.5 });
      }
    } else {
      if (env.frost > 0.3) for (let i = 0; i < 40 * dt * env.frost; i++) fx.spawn({ x: c.x + fx.rnd() * 40, y: c.y + 10 + fx.rnd() * 6, z: c.z + fx.rnd() * 40, vx: 0.6, vy: -2, vz: fx.rnd() * 0.5, max: 7, size: 0.08, r: 1, g: 1, b: 1, a: 0.9, kind: 4 });
      if (env.lavaStrength > 1.5 && this.zone.id === 'magma') {
        for (let i = 0; i < 20 * dt; i++) fx.spawn({ x: c.x + fx.rnd() * 40, y: c.y - 6 + fx.rnd() * 4, z: c.z + fx.rnd() * 40, vx: fx.rnd(), vy: 1.5 + Math.random() * 2, vz: fx.rnd(), max: 4, size: 0.1, r: 1, g: 0.45, b: 0.1, a: 0, kind: 3 });
      }
      if (this.zone.id === 'toxic' && Math.random() < dt * 10) fx.spawn({ x: c.x + fx.rnd() * 45, y: 0.15, z: c.z + fx.rnd() * 45, max: 1.2, size: 0.15, grow: 1.2, r: 0.5, g: 1, b: 0.2, a: 0, kind: 2 });
      if (this.zone.id === 'candy') for (let i = 0; i < 10 * dt; i++) fx.spawn({ x: c.x + fx.rnd() * 40, y: c.y + 8, z: c.z + fx.rnd() * 40, vy: -1.2, vx: fx.rnd() * 0.5, max: 8, size: 0.12, r: [1, 0.4, 1][i % 3], g: [0.5, 1, 0.9][i % 3], b: [0.7, 0.5, 0.3][i % 3], a: 0.9, kind: 4 });
      if (env.eerie > 0.3 && Math.random() < dt * 10) {
        const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 50;
        fx.spawn({ x: c.x + Math.cos(a) * d, y: 1 + Math.random() * 8, z: c.z + Math.sin(a) * d, vx: fx.rnd() * 0.3, vy: 0.3, vz: fx.rnd() * 0.3, max: 6, size: 0.12, r: 0.3, g: 1, b: 0.5, a: 0, kind: 0 });
      }
      if (env.voidAmount > 0.3) for (let i = 0; i < 15 * dt; i++) fx.spawn({ x: c.x + fx.rnd() * 50, y: Math.random() * 20, z: c.z + fx.rnd() * 50, vy: 0.2, max: 4, size: 0.12, r: 0.7, g: 0.5, b: 1, a: 0, kind: 3 });
      // rain
      const rain = this.tw.rain;
      if (rain > 0.05) {
        for (let i = 0; i < 260 * dt * rain; i++) {
          fx.spawn({ x: c.x + fx.rnd() * 30, y: c.y + 8 + Math.random() * 8, z: c.z + fx.rnd() * 30, vx: 2 * this.tw.storm, vy: -22, max: 0.9, size: 0.02, r: 0.75, g: 0.8, b: 0.9, a: 0.5, kind: 6, stretch: 20 });
        }
      }
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
    for (const vt of this.scenery.volcanoTops) {
      if (vt.distanceXZ(c) < 2600 && Math.random() < dt * 5) fx.smoke(vt.x, vt.y, vt.z, 0.22, 10);
      if (vt.distanceXZ(c) < 2600 && Math.random() < dt * 8) fx.spawn({ x: vt.x + fx.rnd() * 8, y: vt.y, z: vt.z + fx.rnd() * 8, vx: fx.rnd() * 6, vy: 12 + Math.random() * 10, vz: fx.rnd() * 6, gravity: 9, max: 3, size: 1.2, r: 1, g: 0.4, b: 0.05, a: 0, kind: 0 });
    }
    this.realmFx(dt);
    const ft = this.scenery.factoryTop;
    if (ft && ft.distanceXZ(c) < 2500 && Math.random() < dt * 4) {
      const k = Math.floor(Math.random() * 3);
      fx.spawn({ x: ft.x - 9 + k * 9 + fx.rnd(), y: 38, z: ft.z + 4, vx: 2, vy: 5, max: 8, size: 4, grow: 2.5, r: 0.35, g: 0.55, b: 0.2, a: 0.55, drag: 0.1 });
    }
    fx.update(dt, this.water);
    this.spots.update(dt, this.time, c, fx);
  }

  private updateHud() {
    const f = this.fishing;
    const ui = this.ui;
    const s = this.stats;
    const coolerFull = this.save.cooler.length >= s.cooler;
    const inp = this.input;
    const look = inp.locked ? '' : inp.device === 'trackpad'
      ? '<br><small>Look: <kbd>2-finger swipe</kbd> or <kbd>Arrow keys</kbd> &nbsp; Zoom: pinch &nbsp; Items: <kbd>1</kbd>-<kbd>6</kbd></small>'
      : inp.lockFailed
        ? '<br><small>Look: <kbd>Right-drag</kbd> or <kbd>Arrow keys</kbd> &nbsp; Zoom: wheel &nbsp; Items: <kbd>1</kbd>-<kbd>6</kbd></small>'
        : '<br><small><kbd>Click</kbd> to capture the mouse for mouse look &nbsp; Zoom: wheel &nbsp; Items: <kbd>1</kbd>-<kbd>6</kbd></small>';
    if (f.state === 'idle') {
      let p = 'Hold <kbd>Click</kbd> or <kbd>Space</kbd> to cast';
      if (this.dock) p = `<kbd>E</kbd> ${this.dock.kind === 'harbor' ? this.scenery.baseName : this.dock.outpost.name} &nbsp; ` + p;
      else if (this.portalHint) {
        const next = REALMS[REALMS.findIndex((r) => r.id === activeRealm()) + 1];
        p = this.portalHint.kind === 'gate' ? 'Sail into the <b>Rift Gate</b> to travel between realms &nbsp; ' + p
          : next ? `Sail into the rift to reach <b>${next.name}</b>${this.stats.hull < next.hull ? ' (needs a stronger hull)' : ''} &nbsp; ` + p : p;
      }
      else if (coolerFull) p = 'Cooler full! Sell at a dock or outpost &nbsp; ' + p;
      ui.prompt(p + look);
    } else if (f.state === 'aim') ui.prompt('Release to cast! <kbd>Esc</kbd> cancel');
    else if (f.state === 'under') {
      if (f.fighting) ui.prompt(f.tension > 0.75 ? 'Let go! Line about to snap!' : `Hold <kbd>${f.fighting.pull > 0 ? 'A' : 'D'}</kbd> to counter the pull, pulse <kbd>Space</kbd> to reel`);
      else if (f.lineMaxed) ui.prompt('Line maxed out! Upgrade your rod for more line');
      else ui.prompt('<kbd>WASD</kbd> steer &nbsp; <kbd>Shift</kbd> dive &nbsp; <kbd>Space</kbd> / <kbd>Click</kbd> reel in' + look);
    } else ui.prompt('');
    ui.tutorial(this.save.tutorial < TUTORIAL.length ? TUTORIAL[this.save.tutorial] : null);
    ui.power(f.state === 'aim' ? f.power : null);
    const under = f.state === 'under';
    const depth = Math.max(0, -f.lure.y);
    if (under) this.save.stats.deepest = Math.max(this.save.stats.deepest, depth);
    ui.depth(under, depth, s.lineLength, -heightAt(f.lure.x, f.lure.z));
    ui.hooks(under || f.state === 'landing', f.hooked.map((h) => h.sp.colors[0]), Math.max(s.hooks, f.hooked.length));
    const fighting = under && f.fighting;
    ui.tension(!!fighting, f.tension, fighting ? f.fighting!.stamina : 1, fighting ? f.fighting!.sp.name : '', fighting ? f.fighting!.pull : 0, f.countering);
    ui.boss(under && f.boss && !f.boss.gone ? { name: f.boss.sp.name, hp: f.boss.hooked ? f.boss.stamina : 1, enrage: f.boss.enrage, surge: f.boss.surgeT >= 0 } : null);
    ui.clock(this.tw.clock(), this.tw.effective(), this.tw.isNight);
    const range = this.effects.sonarUntil > this.time ? 99999 : [0, 400, 1400, 99999][s.finder];
    ui.drawMinimap(this.boat.pos.x, this.boat.pos.z, this.boat.heading,
      this.spots.spots.filter((h) => h.pos.distanceXZ(this.boat.pos) < range).map((h) => ({ x: h.pos.x, z: h.pos.z })),
      [{ x: this.scenery.dockSpot.x, z: this.scenery.dockSpot.z }, ...this.scenery.outposts.filter((o) => this.save.outposts.includes(o.zone)).map((o) => ({ x: o.dock.x, z: o.dock.z }))],
      this.mapMarkers());
    if ((this.time | 0) !== ((this.time - 0.02) | 0)) ui.quest(this.questInfo());
    // sonar
    this.sonarT -= 1;
    const finder = Math.max(s.finder, this.effects.sonarUntil > this.time ? 3 : 0);
    if (finder >= 1 && this.sonarT <= 0) {
      this.sonarT = 4;
      if (under) {
        const blips = f.fish.filter((fi) => !fi.hooked && fi.pos.distanceXZ(f.lure) < 30).map((fi) => ({
          depth: -fi.pos.y, color: finder >= 2 ? RARITY_COLOR[fi.sp.rarity] : '#7fffb0', big: fi.length > 1.2,
        }));
        const legend = finder >= 3 ? f.nearestLegend() : null;
        ui.sonar(true, -heightAt(f.lure.x, f.lure.z), blips, legend ? 'LEGEND NEARBY! Follow the arrow' : `${blips.length} fish nearby`, Math.max(40, s.lineLength));
      } else {
        const hs = this.spots.strengthAt(this.boat.pos.x, this.boat.pos.z);
        const floor = -heightAt(this.boat.pos.x, this.boat.pos.z);
        const blips = Array.from({ length: Math.round(2 + hs * 6) }, () => ({ depth: Math.random() * floor, color: '#7fffb0', big: Math.random() < 0.1 }));
        ui.sonar(true, floor, Math.random() < 0.5 ? blips : [], hs > 0.3 ? 'HOT SPOT! Cast here!' : 'Scanning...', Math.max(60, Math.min(floor * 1.2, 800)));
      }
    } else if (finder < 1) ui.sonar(false);
    const legend = under && finder >= 3 ? f.nearestLegend() : null;
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
    if ((this.time * 2 | 0) !== ((this.time - 0.016) * 2 | 0)) ui.inventory(this.save.inventory, this.effectsList());
    ui.combo(this.combo.n >= 2 ? this.combo.n : 0, this.comboMult(), clamp((this.combo.until - this.time) / 50, 0, 1));
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
    this.env.apply(fr, camDepth, this.camUnder, this.tw);
    this.tw.lightDir(fr.sunDir);
    fr.oceanOffsetX = Math.round(c.pos.x / 8) * 8;
    fr.oceanOffsetZ = Math.round(c.pos.z / 8) * 8;
    fr.mapExtent = MAP_R;
    fr.mapPower = MAP_POWER;
    const planets = SKY_PLANETS[activeRealm()];
    const setPlanet = (dst: number[], dstC: number[], p?: SkyPlanet) => {
      if (!p) { dst[3] = 0; dstC[3] = 0; return; }
      const l = Math.hypot(p[0], p[1], p[2]);
      dst[0] = p[0] / l; dst[1] = p[1] / l; dst[2] = p[2] / l; dst[3] = p[3];
      dstC[0] = p[4]; dstC[1] = p[5]; dstC[2] = p[6]; dstC[3] = p[7];
    };
    setPlanet(fr.planetA, fr.planetAColor, planets[0]);
    setPlanet(fr.planetB, fr.planetBColor, planets[1]);
    fr.lowGravity = realmById(activeRealm()).gravity < 0.9 ? 1 : 0;
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
    } else if (!this.camUnder && fr.night > 0.3 && this.stats.lampRadius > 0) {
      // boat searchlight at night
      const fw = this.boat.forward;
      fr.lampPos.set(this.boat.pos.x + fw.x * 6, 3, this.boat.pos.z + fw.z * 6);
      fr.lampRadius = 22;
      fr.lampIntensity = 1.6 * fr.night;
      fr.lampColor = hex('#fff0c8');
    } else fr.lampRadius = 0;

    this.scenery.draw(c.pos, this.camUnder, this.time);
    this.boat.draw(r, this.a, this.time);
    f.draw(r, this.a, c.pos, this.time, this.boat.rodTip);
    const up = new Vec3(0, 1, 0);
    const drawFish = (actor: FishActor) => f.drawFish(r, this.a, actor, up);
    this.spots.draw(r, this.a, c.pos, this.time, drawFish);
    this.life.draw(r, this.a, c.pos, this.time, drawFish);
    if (activeRealm() === 'blue' && !this.camUnder && this.scenery.aquarium.pos.distanceXZ(c.pos) < 160) {
      for (const af of this.aquarium.fish) drawFish(af);
      this.aquarium.drawWater(r, this.time);
    }
    for (const fl of this.flyers) if (fl.t >= 0) drawFish(fl.actor);
    for (const d of this.debugActors) drawFish(d);
    this.events.draw(r, this.time);
    this.drawPortals();
    const tm = this.save.treasureMap;
    if (tm) {
      const d = Math.hypot(tm.x - c.pos.x, tm.z - c.pos.z);
      if (!this.camUnder && d < 1500) ribbon(r, new Vec3(tm.x, 0, tm.z), new Vec3(tm.x, 60, tm.z), c.pos, 3, [1.2, 0.3, 0.2], 0, 0.5);
      if (this.camUnder && d < 120) {
        const fy = heightAt(tm.x, tm.z);
        r.particle(tm.x, fy + 1.5, tm.z, 3 + Math.sin(this.time * 4) * 0.5, 1.4, 0.4, 0.2, 0, 3, this.time);
      }
    }
    if (f.state === 'under' && this.stats.lampRadius > 0) r.particle(f.lure.x, f.lure.y + 0.35, f.lure.z, 0.45 + Math.sin(this.time * 6) * 0.05, 0.8, 0.7, 0.45, 0, 3, this.time * 0.5);
    this.drawSkyEffects();
    this.fx.draw(r);

    const p = r.post;
    p.time = this.time;
    p.underwater = this.underwater;
    p.vignette = 0.3 + this.underwater * 0.35 + clamp(camDepth / 300, 0, 0.3) + (f.fighting ? f.tension * 0.3 : 0);
    p.flash[3] = Math.max(0, p.flash[3] - dt * 1.5);
    p.bloom = 0.5 + this.env.lavaStrength * 0.05 + this.env.voidAmount * 0.2 + fr.night * 0.25;
    p.saturation = 1.12 - this.env.eerie * 0.2 - this.tw.storm * 0.15 + (this.events.golden ? 0.25 : 0);
    r.render({ ocean: true });
  }

  /** Lightning bolts and the lighthouse beam, as unlit additive ribbons. */
  private drawSkyEffects() {
    if (this.camUnder) return;
    const r = this.r;
    const c = this.cam.pos;
    for (const b of this.tw.bolts) {
      const k = 1 - b.age / 0.5;
      const rr = rng(Math.floor(b.seed));
      let p = new Vec3(b.pos.x, 320, b.pos.z);
      while (p.y > 0) {
        const n = new Vec3(p.x + (rr() - 0.5) * 40, p.y - 20 - rr() * 30, p.z + (rr() - 0.5) * 40);
        if (n.y < 0) n.y = 0;
        ribbon(r, p, n, c, 1.6, [2 * k, 2.2 * k, 3 * k], 0);
        p = n;
      }
    }
    const night = this.r.frame.night;
    if (night > 0.2) {
      const top = this.scenery.lighthouseTop;
      if (top && top.distanceXZ(c) < 3000) {
        const a = this.time * 0.8;
        const end = new Vec3(top.x + Math.cos(a) * 220, top.y - 8, top.z + Math.sin(a) * 220);
        ribbon(r, top, end, c, 6, [0.6 * night, 0.55 * night, 0.35 * night], 0, 14);
      }
      for (const s of this.scenery.spires) if (s.distanceXZ(c) < 2500) r.particle(s.x, s.y, s.z, 3 + Math.sin(this.time * 7) * 0.5, 0.4, 0.8, 1, 0, 0);
    }
  }
}

/** Camera-facing quad strip between two points; widens to `w1` at the end. alpha 0 = additive. */
function ribbon(r: Renderer, a: Vec3, b: Vec3, cam: Vec3, w0: number, col: [number, number, number], alpha: number, w1 = w0) {
  const dir = b.clone().sub(a).normalize();
  const s0 = dir.clone().cross(cam.clone().sub(a).normalize()).normalize().scale(w0 * 0.5);
  const s1 = dir.clone().cross(cam.clone().sub(b).normalize()).normalize().scale(w1 * 0.5);
  const A = a.clone().add(s0), B = a.clone().sub(s0), C = b.clone().add(s1), D = b.clone().sub(s1);
  for (const q of [A, B, C, C, B, D]) r.vertex(q.x, q.y, q.z, col[0], col[1], col[2], alpha);
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
    case 'finder': return ['Watch for gulls and bubbles', 'Nearby hot spots + sonar', 'Far hot spots + fish colors', 'Every hot spot + legend tracker'][s.finder ?? 0];
    case 'engine': return `Top speed ${s.boatSpeed} m/s`;
    case 'hull': return NAMED_ZONES.filter((z) => z.hull === s.hull).map((z) => z.name).join(', ') || 'Starter waters';
    case 'cooler': return `Holds ${s.cooler} fish`;
  }
}

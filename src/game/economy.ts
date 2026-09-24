// Pure game rules (no rendering): stats, prices, catches, save data. Unit tested.
import { CATCHABLE, SPECIES, speciesById, type Species, type WeatherKind } from '../data/fish';
import { COSMETICS, cosmeticById, type CosmeticKind, DEFAULT_COSMETICS, ITEMS, type ItemId } from '../data/items';
import { TRACKS, trackById, type Stats, type TrackId } from '../data/upgrades';
import { ALL_ZONES, type RealmId, REALMS, type ZoneId } from '../data/zones';
import type { Contract } from './progress';

export interface CaughtFish {
  id: string;
  /** size multiplier (1 = average) */
  size: number;
  value: number;
}

export interface SaveStats {
  casts: number; caught: number; earned: number; deepest: number; snapped: number;
  legendaries: number; bosses: number; night: number; storm: number; rain: number;
  boots: number; bottles: number; ducks: number; treasures: number; contracts: number;
  upgrades: number; stolen: number; stung: number; maxHaul: number; bestCast: number; travels: number;
  itemsUsed: number; cosmetics: number; playTime: number;
  maps: number; fragments: number; perfect: number; events: number; realmJumps: number; bestCombo: number;
}

export interface SaveData {
  version: 2;
  money: number;
  pearls: number;
  upgrades: Record<TrackId, number>;
  cooler: CaughtFish[];
  dex: Record<string, { caught: number; best: number }>;
  stats: SaveStats;
  settings: { music: number; sfx: number; sensitivity: number; invertY: boolean; quality: number; shake: boolean; fps: boolean; graphics: number };
  boat: { x: number; z: number; heading: number } | null;
  seenZones: ZoneId[];
  tutorial: number;
  inventory: Record<ItemId, number>;
  cosmetics: { owned: string[]; equipped: Record<CosmeticKind, string> };
  contracts: Contract[];
  contractSerial: number;
  achievements: string[];
  outposts: ZoneId[];
  bosses: string[];
  luckyCasts: number;
  goldenHook: boolean;
  bossBait: boolean;
  dayTime: number;
  quest: { index: number; progress: number; intro: boolean };
  treasureMap: { x: number; z: number; zone: ZoneId } | null;
  /** Realm the boat is in, and the realms whose rift has been crossed. */
  realm: RealmId;
  realms: RealmId[];
}

const newStats = (): SaveStats => ({
  casts: 0, caught: 0, earned: 0, deepest: 0, snapped: 0, legendaries: 0, bosses: 0, night: 0, storm: 0, rain: 0,
  boots: 0, bottles: 0, ducks: 0, treasures: 0, contracts: 0, upgrades: 0, stolen: 0, stung: 0, maxHaul: 0, bestCast: 0,
  travels: 0, itemsUsed: 0, cosmetics: 0, playTime: 0, maps: 0, fragments: 0, perfect: 0, events: 0, realmJumps: 0, bestCombo: 0,
});

export function newSave(): SaveData {
  const upgrades = {} as Record<TrackId, number>;
  for (const t of TRACKS) upgrades[t.id] = 0;
  const inventory = {} as Record<ItemId, number>;
  for (const i of ITEMS) inventory[i.id] = 0;
  return {
    version: 2,
    money: 0,
    pearls: 0,
    upgrades,
    cooler: [],
    dex: {},
    stats: newStats(),
    settings: { music: 0.5, sfx: 0.8, sensitivity: 1, invertY: false, quality: 1, shake: true, fps: false, graphics: 2 },
    boat: null,
    seenZones: [],
    tutorial: 0,
    inventory,
    cosmetics: { owned: COSMETICS.filter((c) => c.pearls === 0 && !c.quest).map((c) => c.id), equipped: { ...DEFAULT_COSMETICS } },
    contracts: [],
    contractSerial: 0,
    achievements: [],
    outposts: [],
    bosses: [],
    luckyCasts: 0,
    goldenHook: false,
    bossBait: false,
    dayTime: 0.32,
    quest: { index: 0, progress: 0, intro: false },
    treasureMap: null,
    realm: 'blue',
    realms: ['blue'],
  };
}

/** Merge a possibly older/partial save over defaults so new fields always exist. */
export function migrateSave(raw: unknown): SaveData {
  const d = newSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  const upgrades = { ...d.upgrades, ...(r.upgrades ?? {}) };
  for (const t of TRACKS) upgrades[t.id] = Math.max(0, Math.min(upgrades[t.id] | 0, t.tiers.length - 1));
  const owned = new Set([...(d.cosmetics.owned), ...((r.cosmetics?.owned ?? []).filter((id) => cosmeticById.has(id)))]);
  const equipped = { ...d.cosmetics.equipped };
  for (const [k, v] of Object.entries(r.cosmetics?.equipped ?? {})) if (owned.has(v)) equipped[k as CosmeticKind] = v;
  return {
    ...d,
    ...r,
    version: 2,
    upgrades,
    stats: { ...d.stats, ...(r.stats ?? {}) },
    settings: { ...d.settings, ...(r.settings ?? {}) },
    dex: Object.fromEntries(Object.entries(r.dex ?? {}).filter(([id]) => speciesById.has(id))),
    cooler: Array.isArray(r.cooler) ? r.cooler.filter((f) => speciesById.has(f.id)) : [],
    seenZones: Array.isArray(r.seenZones) ? r.seenZones.filter((z) => ALL_ZONES.some((a) => a.id === z)) : [],
    inventory: { ...d.inventory, ...(r.inventory ?? {}) },
    cosmetics: { owned: [...owned], equipped },
    contracts: Array.isArray(r.contracts) ? r.contracts : [],
    achievements: Array.isArray(r.achievements) ? r.achievements : [],
    outposts: Array.isArray(r.outposts) ? r.outposts : [],
    bosses: Array.isArray(r.bosses) ? r.bosses : [],
    pearls: typeof r.pearls === 'number' ? r.pearls : 0,
    realms: Array.isArray(r.realms) ? ['blue' as RealmId, ...r.realms.filter((x) => x !== 'blue' && REALMS.some((z) => z.id === x))] : ['blue'],
    realm: REALMS.some((z) => z.id === r.realm) && (r.realm === 'blue' || r.realms?.includes(r.realm!)) ? r.realm! : 'blue',
    treasureMap: r.treasureMap && ALL_ZONES.some((z) => z.id === r.treasureMap!.zone) ? r.treasureMap : null,
  };
}

export function computeStats(upgrades: Record<TrackId, number>): Stats {
  const s = {} as Stats;
  for (const t of TRACKS) {
    const level = Math.min(upgrades[t.id] ?? 0, t.tiers.length - 1);
    for (let i = 0; i <= level; i++) Object.assign(s, t.tiers[i].stats);
  }
  return s;
}

/** Highest zone level the player can reach with their hull. */
export function progressLevel(save: SaveData) {
  const hull = save.upgrades.hull;
  return Math.max(...ALL_ZONES.filter((z) => z.hull <= hull).map((z) => z.level));
}

export function nextTier(save: SaveData, id: TrackId) {
  const t = trackById.get(id)!;
  const lvl = save.upgrades[id];
  return lvl + 1 < t.tiers.length ? t.tiers[lvl + 1] : null;
}

export function canBuy(save: SaveData, id: TrackId) {
  const n = nextTier(save, id);
  return !!n && save.money >= n.cost;
}

export function buy(save: SaveData, id: TrackId): boolean {
  const n = nextTier(save, id);
  if (!n || save.money < n.cost) return false;
  save.money -= n.cost;
  save.upgrades[id]++;
  save.stats.upgrades++;
  return true;
}

export function buyCosmetic(save: SaveData, id: string): boolean {
  const c = cosmeticById.get(id);
  if (!c || c.quest || save.cosmetics.owned.includes(id) || save.pearls < c.pearls) return false;
  save.pearls -= c.pearls;
  save.cosmetics.owned.push(id);
  save.cosmetics.equipped[c.kind] = id;
  save.stats.cosmetics++;
  return true;
}

export function equipCosmetic(save: SaveData, id: string): boolean {
  const c = cosmeticById.get(id);
  if (!c || !save.cosmetics.owned.includes(id)) return false;
  save.cosmetics.equipped[c.kind] = id;
  return true;
}

export function buyItem(save: SaveData, id: ItemId, price: number, n = 1): boolean {
  if (save.money < price * n) return false;
  save.money -= price * n;
  save.inventory[id] = (save.inventory[id] ?? 0) + n;
  return true;
}

export function useItem(save: SaveData, id: ItemId): boolean {
  if ((save.inventory[id] ?? 0) <= 0) return false;
  save.inventory[id]--;
  save.stats.itemsUsed++;
  return true;
}

/** Rolls a size multiplier; bigger fish are rarer. */
export function rollSize(r: () => number) {
  const u = r();
  return 0.7 + 0.8 * Math.pow(u, 2.2);
}

export function fishValue(sp: Species, size: number) {
  if (sp.junk) return sp.value;
  return Math.max(1, Math.round(sp.value * Math.pow(size, 1.6)));
}

export function catchFish(sp: Species, size: number, golden = false, bonus = 1): CaughtFish {
  return { id: sp.id, size, value: Math.round(fishValue(sp, size) * (golden ? 2 : 1) * bonus) };
}

/** Zones whose whole fish log is complete (bosses and junk excluded): their fish sell for more. */
export function masteredZones(save: SaveData): Set<ZoneId> {
  const out = new Set<ZoneId>();
  for (const z of ALL_ZONES) {
    const list = CATCHABLE.filter((s) => s.zone === z.id && !s.boss && !s.anywhere);
    if (list.length && list.every((s) => save.dex[s.id])) out.add(z.id);
  }
  return out;
}
export const MASTERY_BONUS = 1.2;

/** Grants a cosmetic (story rewards) and equips it. */
export function grantCosmetic(save: SaveData, id: string) {
  const c = cosmeticById.get(id);
  if (!c) return;
  if (!save.cosmetics.owned.includes(id)) save.cosmetics.owned.push(id);
  save.cosmetics.equipped[c.kind] = id;
}

export interface CatchContext {
  zone: ZoneId;
  depth: number;
  night: boolean;
  weather: WeatherKind;
}

export interface LandResult {
  kept: CaughtFish[];
  released: CaughtFish[];
  newSpecies: string[];
  records: string[];
  pearls: number;
  value: number;
}

/** Puts a cast's catch into the cooler, updating the fish log and lifetime stats. */
export function landCatch(save: SaveData, fish: CaughtFish[], coolerSize: number, ctx?: CatchContext): LandResult {
  const res: LandResult = { kept: [], released: [], newSpecies: [], records: [], pearls: 0, value: 0 };
  for (const f of fish) {
    const sp = speciesById.get(f.id);
    const e = save.dex[f.id] ?? { caught: 0, best: 0 };
    if (e.caught === 0) res.newSpecies.push(f.id);
    else if (f.size > e.best && !res.newSpecies.includes(f.id) && !res.records.includes(f.id)) res.records.push(f.id);
    e.caught++;
    e.best = Math.max(e.best, f.size);
    save.dex[f.id] = e;
    const st = save.stats;
    st.caught++;
    if (sp?.rarity === 'legendary') st.legendaries++;
    if (sp?.boss) { st.bosses++; if (!save.bosses.includes(sp.id)) save.bosses.push(sp.id); }
    if (f.id === 'boot') st.boots++;
    if (f.id === 'bottle') { st.bottles++; res.pearls += 2; }
    if (f.id === 'duck') st.ducks++;
    if (ctx?.night) st.night++;
    if (ctx?.weather === 'storm') st.storm++;
    if (ctx?.weather === 'rain') st.rain++;
    // bosses and trophies are never thrown back
    if (save.cooler.length < coolerSize || sp?.boss) {
      save.cooler.push(f);
      res.kept.push(f);
      res.value += f.value;
    } else res.released.push(f);
  }
  save.stats.maxHaul = Math.max(save.stats.maxHaul, fish.length);
  save.stats.bestCast = Math.max(save.stats.bestCast, res.value);
  save.pearls += res.pearls;
  return res;
}

export function coolerValue(save: SaveData) {
  return save.cooler.reduce((s, f) => s + f.value, 0);
}

export function sellAll(save: SaveData) {
  const v = coolerValue(save);
  save.money += v;
  save.stats.earned += v;
  save.cooler = [];
  return v;
}

export interface SpawnConditions { night: boolean; weather: WeatherKind }

/** Species that can bite right now (time of day, weather), excluding bosses. */
export function eligible(sp: Species, c?: SpawnConditions) {
  if (sp.boss) return false;
  if (!c) return !sp.time && !sp.weather;
  if (sp.time === 'night' && !c.night) return false;
  if (sp.time === 'day' && c.night) return false;
  if (sp.weather && sp.weather !== c.weather && !(sp.weather === 'rain' && c.weather === 'storm')) return false;
  return true;
}

/** Weighted pick of species eligible at this depth. `rareBoost` multiplies non-common weights. */
export function pickSpecies(pool: Species[], depth: number, r: () => number, rareBoost = 1, cond?: SpawnConditions): Species | null {
  let total = 0;
  const w: number[] = [];
  for (const s of pool) {
    const ok = depth >= s.depth[0] - 5 && depth <= s.depth[1] + 5 && (cond ? eligible(s, cond) : !s.boss);
    const ww = ok ? s.weight * (s.rarity === 'common' ? 1 : rareBoost) : 0;
    w.push(ww);
    total += ww;
  }
  if (total <= 0) return null;
  let x = r() * total;
  for (let i = 0; i < pool.length; i++) {
    x -= w[i];
    if (x <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Species pool for a zone, including junk that washes up everywhere. */
export function zonePool(zone: ZoneId): Species[] {
  return SPECIES.filter((s) => (s.zone === zone && !s.anywhere) || s.anywhere);
}

export function formatMoney(v: number) {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  if (v >= 1e4) return '$' + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '$' + Math.floor(v).toLocaleString('en-US');
}

export const DEX_TOTAL = CATCHABLE.length;

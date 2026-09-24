// Pure game rules (no rendering): stats, prices, catches, save data. Unit tested.
import { SPECIES, speciesById, type Species } from '../data/fish';
import { TRACKS, trackById, type Stats, type TrackId } from '../data/upgrades';
import type { ZoneId } from '../data/zones';

export interface CaughtFish {
  id: string;
  /** size multiplier (1 = average) */
  size: number;
  value: number;
}

export interface SaveData {
  version: 1;
  money: number;
  upgrades: Record<TrackId, number>;
  cooler: CaughtFish[];
  dex: Record<string, { caught: number; best: number }>;
  stats: { casts: number; caught: number; earned: number; deepest: number; snapped: number };
  settings: { music: number; sfx: number; sensitivity: number; invertY: boolean };
  boat: { x: number; z: number; heading: number } | null;
  seenZones: ZoneId[];
  tutorial: number;
}

export function newSave(): SaveData {
  const upgrades = {} as Record<TrackId, number>;
  for (const t of TRACKS) upgrades[t.id] = 0;
  return {
    version: 1,
    money: 0,
    upgrades,
    cooler: [],
    dex: {},
    stats: { casts: 0, caught: 0, earned: 0, deepest: 0, snapped: 0 },
    settings: { music: 0.5, sfx: 0.8, sensitivity: 1, invertY: false },
    boat: null,
    seenZones: [],
    tutorial: 0,
  };
}

/** Merge a possibly older/partial save over defaults so new fields always exist. */
export function migrateSave(raw: unknown): SaveData {
  const d = newSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  return {
    ...d,
    ...r,
    upgrades: { ...d.upgrades, ...(r.upgrades ?? {}) },
    stats: { ...d.stats, ...(r.stats ?? {}) },
    settings: { ...d.settings, ...(r.settings ?? {}) },
    dex: { ...(r.dex ?? {}) },
    cooler: Array.isArray(r.cooler) ? r.cooler.filter((f) => speciesById.has(f.id)) : [],
    seenZones: Array.isArray(r.seenZones) ? r.seenZones : [],
    version: 1,
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
  return true;
}

/** Rolls a size multiplier; bigger fish are rarer. */
export function rollSize(r: () => number) {
  const u = r();
  return 0.7 + 0.8 * Math.pow(u, 2.2);
}

export function fishValue(sp: Species, size: number) {
  return Math.max(1, Math.round(sp.value * Math.pow(size, 1.6)));
}

export function catchFish(sp: Species, size: number): CaughtFish {
  return { id: sp.id, size, value: fishValue(sp, size) };
}

export interface LandResult {
  kept: CaughtFish[];
  released: CaughtFish[];
  newSpecies: string[];
  records: string[];
}

/** Puts a cast's catch into the cooler, updating the fish log. */
export function landCatch(save: SaveData, fish: CaughtFish[], coolerSize: number): LandResult {
  const res: LandResult = { kept: [], released: [], newSpecies: [], records: [] };
  for (const f of fish) {
    const e = save.dex[f.id] ?? { caught: 0, best: 0 };
    if (e.caught === 0) res.newSpecies.push(f.id);
    else if (f.size > e.best) res.records.push(f.id);
    e.caught++;
    e.best = Math.max(e.best, f.size);
    save.dex[f.id] = e;
    save.stats.caught++;
    if (save.cooler.length < coolerSize) {
      save.cooler.push(f);
      res.kept.push(f);
    } else res.released.push(f);
  }
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

/** Weighted pick of species eligible at this depth. `rareBoost` multiplies non-common weights. */
export function pickSpecies(pool: Species[], depth: number, r: () => number, rareBoost = 1): Species | null {
  let total = 0;
  const w: number[] = [];
  for (const s of pool) {
    const ok = depth >= s.depth[0] - 5 && depth <= s.depth[1] + 5;
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

export function formatMoney(v: number) {
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M';
  if (v >= 1e4) return '$' + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return '$' + Math.floor(v).toLocaleString('en-US');
}

export const DEX_TOTAL = SPECIES.filter((s) => !s.hazard).length;

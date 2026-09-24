// Analytic model of the progression: expected income per minute at each stage of the game and how
// long the upgrades that unlock at the next level take to afford. Calibrated against the automated
// play-tester (tools/playtest-bot.js); used by balance.test.ts to keep the pace steady.
import { SPECIES } from '../src/data/fish';
import { ALL_ZONES } from '../src/data/zones';
import { LEVEL_VALUE, type Stats, TRACKS } from '../src/data/upgrades';

/** Minutes each stage should take for an efficient player (index = zone level being fished). */
export const STAGE_MINUTES = [3, 6, 9, 9, 10, 10, 11, 11, 12, 12, 13, 14, 14, 14, 15, 15, 15, 16, 16, 16, 17, 17, 17, 18, 18];

/** Expected size^1.6 value multiplier of a rolled fish (see economy.rollSize). */
export const E_SIZE = (() => {
  let s = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) s += Math.pow(0.7 + 0.8 * Math.pow((i + 0.5) / n, 2.2), 1.6);
  return s / n;
})();

/** What players really land: mostly schooling commons near the surface (measured by the bot). */
const CATCH_MIX: Record<string, number> = { common: 10, uncommon: 2.5, rare: 0.5, epic: 0.15, legendary: 0.02 };
/** Active play keeps the combo multiplier near its cap; depth orbs and contracts add a little more. */
const COMBO = 1.8;
const EXTRAS = 1.1;

/** Gear owned while fishing a zone level: every tier of that level or below. */
export function gearAt(level: number): Stats {
  const s = {} as Stats;
  for (const t of TRACKS) {
    let best = t.tiers[0];
    for (const tier of t.tiers) if (tier.level <= level) best = tier;
    Object.assign(s, best.stats);
  }
  return s;
}

export interface StageReport {
  level: number;
  zones: string[];
  avgFish: number;
  castSec: number;
  perMin: number;
  /** cost of everything that unlocks at the next level, and of just the hull + bait + rod */
  allCost: number;
  needCost: number;
  allMin: number;
  needMin: number;
}

export function stage(level: number): StageReport {
  const gear = gearAt(level);
  const zones = ALL_ZONES.filter((z) => z.level === level && z.id !== 'open');
  const ids = new Set(zones.map((z) => z.id));
  const pool = SPECIES.filter((sp) => ids.has(sp.zone) && !sp.hazard && !sp.junk && !sp.boss && !sp.anywhere && !sp.time && !sp.weather
    && sp.bait <= gear.baitTier && sp.depth[0] <= gear.lineLength);
  let w = 0, v = 0, d = 0;
  for (const sp of pool) {
    const ww = CATCH_MIX[sp.rarity] ?? 1;
    w += ww;
    v += ww * sp.value;
    d += ww * Math.min(sp.depth[0] + (sp.depth[1] - sp.depth[0]) * 0.35, gear.lineLength * 0.8);
  }
  const avgFish = w ? (v / w) * E_SIZE : 0;
  const depth = w ? d / w : 20;
  const hooks = gear.hooks;
  const castSec = 3 + depth / gear.diveSpeed + 4 + hooks * 1.8 + (depth + 20) / gear.reelSpeed + 3;
  const tripSec = 50 * hooks / gear.cooler;
  const perMin = (hooks * 0.85 * avgFish * 60 * COMBO * EXTRAS) / (castSec + tripSec);
  const next = level + 1;
  let allCost = 0, needCost = 0;
  for (const t of TRACKS) {
    for (const tier of t.tiers) {
      if (tier.level !== next || tier.cost === 0) continue;
      allCost += tier.cost;
      if (t.id === 'hull' || t.id === 'bait' || t.id === 'rod') needCost += tier.cost;
    }
  }
  return { level, zones: zones.map((z) => z.id), avgFish, castSec, perMin, allCost, needCost, allMin: allCost / perMin, needMin: needCost / perMin };
}

export function report() {
  const rows: StageReport[] = [];
  for (let l = 0; l < LEVEL_VALUE.length - 1; l++) rows.push(stage(l));
  return rows;
}

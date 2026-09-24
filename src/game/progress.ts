// Contracts (rotating fishing jobs) and achievements. Pure logic, unit tested.
import { BOSS_FOR_ZONE, CATCHABLE, RARITY_COLOR, SPECIES, speciesById, type Rarity, type WeatherKind } from '../data/fish';
import { TRACKS, LEVEL_VALUE, nicePrice } from '../data/upgrades';
import { ALL_ZONES, type ZoneId, ZONES } from '../data/zones';
import type { CaughtFish, SaveData } from './economy';

export type ContractKind = 'species' | 'rarity' | 'size' | 'zone' | 'depth' | 'haul' | 'night' | 'weather';

export interface Contract {
  id: number;
  kind: ContractKind;
  /** species id, rarity, zone id or '' */
  target: string;
  /** count needed, or meters for size/depth, or fish for haul */
  n: number;
  progress: number;
  money: number;
  pearls: number;
  level: number;
  title: string;
}

export interface CastInfo {
  zone: ZoneId;
  maxDepth: number;
  night: boolean;
  weather: WeatherKind;
}

const zoneName = (id: string) => ALL_ZONES.find((z) => z.id === id)?.name ?? id;

export function describe(c: Contract) {
  switch (c.kind) {
    case 'species': return `Catch ${c.n} ${speciesById.get(c.target)?.name ?? c.target}`;
    case 'rarity': return `Catch ${c.n} ${c.target} fish`;
    case 'size': return `Catch a fish over ${c.n}m long`;
    case 'zone': return `Catch ${c.n} fish in ${zoneName(c.target)}`;
    case 'depth': return `Catch a fish ${c.n}m deep or more`;
    case 'haul': return `Land ${c.n} fish in a single cast`;
    case 'night': return `Catch ${c.n} fish at night`;
    case 'weather': return `Catch ${c.n} fish in the rain`;
  }
}

export function contractColor(c: Contract) {
  return c.kind === 'rarity' ? RARITY_COLOR[c.target as Rarity] : '#ffd23a';
}

export function generateContract(save: SaveData, r: () => number, lineLength: number, hooks: number): Contract {
  const open = ALL_ZONES.filter((z) => z.hull <= save.upgrades.hull);
  const top = Math.max(...open.map((z) => z.level));
  const pickable = open.filter((z) => z.level >= top - 2);
  const zone = pickable[Math.floor(r() * pickable.length)];
  const lvl = zone.level;
  const kinds: [ContractKind, number][] = [['species', 4], ['zone', 3], ['rarity', 2], ['size', 2], ['depth', 2], ['haul', hooks >= 3 ? 1.5 : 0], ['night', 1], ['weather', 1]];
  let x = r() * kinds.reduce((s, k) => s + k[1], 0);
  let kind: ContractKind = 'species';
  for (const [k, w] of kinds) { x -= w; if (x <= 0) { kind = k; break; } }
  let target = '', n = 1, diff = 1;
  switch (kind) {
    case 'species': {
      const pool = CATCHABLE.filter((s) => s.zone === zone.id && !s.boss && !s.junk && s.rarity !== 'legendary' && !s.time && !s.weather);
      const sp = pool[Math.floor(r() * pool.length)] ?? CATCHABLE[0];
      target = sp.id;
      n = sp.rarity === 'common' ? 3 + Math.floor(r() * 3) : sp.rarity === 'uncommon' ? 2 + Math.floor(r() * 2) : 1;
      diff = sp.rarity === 'common' ? n * 1.2 : sp.rarity === 'uncommon' ? n * 2.5 : n * 6;
      break;
    }
    case 'zone': target = zone.id; n = 6 + Math.floor(r() * 7); diff = n * 1.2; break;
    case 'rarity': {
      const rr: Rarity = r() < 0.6 ? 'uncommon' : 'rare';
      target = rr; n = rr === 'uncommon' ? 3 : 1 + Math.floor(r() * 2); diff = rr === 'uncommon' ? 7 : n * 7;
      break;
    }
    case 'size': {
      const sizes = CATCHABLE.filter((s) => s.zone === zone.id && !s.boss && !s.junk).map((s) => s.size * 1.5).sort((a, b) => a - b);
      n = Math.max(0.6, Math.round((sizes[Math.floor(sizes.length * 0.5)] ?? 1) * 10) / 10);
      diff = 7;
      break;
    }
    case 'depth': n = Math.max(10, Math.round(Math.min(zone.floorDepth * 0.6, lineLength * 0.8) / 5) * 5); diff = 5; break;
    case 'haul': n = Math.min(hooks, 3 + Math.floor(r() * 3)); diff = n * 2; break;
    case 'night': n = 4 + Math.floor(r() * 4); diff = n * 1.8; break;
    case 'weather': n = 3 + Math.floor(r() * 3); diff = n * 2; break;
  }
  const c: Contract = {
    id: ++save.contractSerial, kind, target, n, progress: 0, level: lvl,
    money: nicePrice(LEVEL_VALUE[lvl] * (4 + diff * 2.2)), pearls: 1 + Math.min(4, Math.floor(diff / 5)), title: '',
  };
  c.title = describe(c);
  return c;
}

export function fillContracts(save: SaveData, r: () => number, lineLength: number, hooks: number) {
  let guard = 0;
  while (save.contracts.length < 3 && guard++ < 50) {
    const c = generateContract(save, r, lineLength, hooks);
    // no duplicate jobs on the board
    if (save.contracts.some((o) => o.kind === c.kind && (o.target === c.target || c.kind !== 'species'))) continue;
    save.contracts.push(c);
  }
}

/** Applies a landed cast to the active contracts; returns the ones completed (rewards already paid). */
export function progressContracts(save: SaveData, catches: CaughtFish[], cast: CastInfo): Contract[] {
  const done: Contract[] = [];
  for (const c of save.contracts) {
    for (const f of catches) {
      const sp = speciesById.get(f.id);
      if (!sp || sp.junk) continue;
      const len = sp.size * f.size * 1.5;
      switch (c.kind) {
        case 'species': if (f.id === c.target) c.progress++; break;
        case 'rarity': if (sp.rarity === c.target) c.progress++; break;
        case 'zone': if (cast.zone === c.target) c.progress++; break;
        case 'size': if (len >= c.n) c.progress = 1; break;
        case 'depth': if (cast.maxDepth >= c.n) c.progress = 1; break;
        case 'night': if (cast.night) c.progress++; break;
        case 'weather': if (cast.weather === 'rain' || cast.weather === 'storm') c.progress++; break;
        case 'haul': break;
      }
    }
    if (c.kind === 'haul' && catches.filter((f) => !speciesById.get(f.id)?.junk).length >= c.n) c.progress = c.n;
    const need = c.kind === 'size' || c.kind === 'depth' ? 1 : c.n;
    if (c.progress >= need) done.push(c);
  }
  for (const c of done) {
    save.money += c.money;
    save.stats.earned += c.money;
    save.pearls += c.pearls;
    save.stats.contracts++;
  }
  save.contracts = save.contracts.filter((c) => !done.includes(c));
  return done;
}

export function contractGoal(c: Contract) {
  return c.kind === 'size' || c.kind === 'depth' ? 1 : c.n;
}

// ------------------------------------------------------------------ achievements

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  pearls: number;
  check: (s: SaveData) => boolean;
}

const A = (id: string, name: string, desc: string, pearls: number, check: (s: SaveData) => boolean): Achievement => ({ id, name, desc, pearls, check });
const dexCount = (s: SaveData) => Object.keys(s.dex).length;
const zoneDone = (s: SaveData, z: ZoneId) => CATCHABLE.filter((f) => f.zone === z && !f.boss && !f.anywhere).every((f) => s.dex[f.id]);
const maxedTrack = (s: SaveData) => TRACKS.some((t) => s.upgrades[t.id] >= t.tiers.length - 1);

export const ACHIEVEMENTS: Achievement[] = [
  A('first', 'First Catch', 'Catch your very first fish.', 1, (s) => s.stats.caught >= 1),
  A('c10', 'Getting Hooked', 'Catch 10 fish.', 2, (s) => s.stats.caught >= 10),
  A('c50', 'Regular', 'Catch 50 fish.', 3, (s) => s.stats.caught >= 50),
  A('c100', 'Seasoned Angler', 'Catch 100 fish.', 4, (s) => s.stats.caught >= 100),
  A('c250', 'Fish Magnet', 'Catch 250 fish.', 6, (s) => s.stats.caught >= 250),
  A('c500', 'Ocean Menace', 'Catch 500 fish.', 8, (s) => s.stats.caught >= 500),
  A('c1000', 'The Fish Fear You', 'Catch 1,000 fish.', 15, (s) => s.stats.caught >= 1000),
  A('d10', 'Curious', 'Log 10 different species.', 2, (s) => dexCount(s) >= 10),
  A('d25', 'Naturalist', 'Log 25 different species.', 4, (s) => dexCount(s) >= 25),
  A('d50', 'Marine Biologist', 'Log 50 different species.', 6, (s) => dexCount(s) >= 50),
  A('d100', 'Walking Encyclopedia', 'Log 100 different species.', 12, (s) => dexCount(s) >= 100),
  A('dall', 'Gotta Catch Em All', 'Log every species in the game.', 50, (s) => dexCount(s) >= CATCHABLE.length),
  A('z3', 'Explorer', 'Discover 3 zones.', 2, (s) => s.seenZones.length >= 3),
  A('z6', 'Navigator', 'Discover 6 zones.', 4, (s) => s.seenZones.length >= 6),
  A('z9', 'Voyager', 'Discover 9 zones.', 6, (s) => s.seenZones.length >= 9),
  A('zall', 'Seen It All', 'Discover every zone.', 15, (s) => s.seenZones.length >= ZONES.length),
  A('void', 'Into the Void', 'Reach The Void.', 10, (s) => s.seenZones.includes('void')),
  A('leg1', 'Legendary!', 'Catch a legendary fish.', 5, (s) => s.stats.legendaries >= 1),
  A('leg5', 'Legend Hunter', 'Catch 5 legendary fish.', 10, (s) => s.stats.legendaries >= 5),
  A('legall', 'Living Legend', 'Log every legendary fish.', 30, (s) => SPECIES.filter((f) => f.rarity === 'legendary').every((f) => s.dex[f.id])),
  A('boss1', 'Boss Slayer', 'Defeat a zone boss.', 6, (s) => s.bosses.length >= 1),
  A('boss5', 'Boss Rush', 'Defeat 5 different bosses.', 12, (s) => s.bosses.length >= 5),
  A('bossall', 'King of the Sea', 'Defeat every boss.', 40, (s) => s.bosses.length >= BOSS_FOR_ZONE.size),
  A('m1k', 'Pocket Change', 'Earn $1,000 in total.', 2, (s) => s.stats.earned >= 1e3),
  A('m10k', 'Comfortable', 'Earn $10,000 in total.', 3, (s) => s.stats.earned >= 1e4),
  A('m100k', 'Wealthy Angler', 'Earn $100,000 in total.', 5, (s) => s.stats.earned >= 1e5),
  A('m1m', 'Millionaire', 'Earn $1,000,000 in total.', 8, (s) => s.stats.earned >= 1e6),
  A('m10m', 'Tycoon', 'Earn $10,000,000 in total.', 12, (s) => s.stats.earned >= 1e7),
  A('m100m', 'Fish Baron', 'Earn $100,000,000 in total.', 20, (s) => s.stats.earned >= 1e8),
  A('deep50', 'Snorkeler', 'Dive your lure to 50m.', 1, (s) => s.stats.deepest >= 50),
  A('deep150', 'Diver', 'Dive your lure to 150m.', 3, (s) => s.stats.deepest >= 150),
  A('deep400', 'Abyss Watcher', 'Dive your lure to 400m.', 5, (s) => s.stats.deepest >= 400),
  A('deep800', 'Pressure Proof', 'Dive your lure to 800m.', 8, (s) => s.stats.deepest >= 800),
  A('deep2000', 'Bottom of Everything', 'Dive your lure to 2,000m.', 15, (s) => s.stats.deepest >= 2000),
  A('haul5', 'Full House', 'Land 5 fish in one cast.', 3, (s) => s.stats.maxHaul >= 5),
  A('haul12', 'Net Worth', 'Land 12 fish in one cast.', 8, (s) => s.stats.maxHaul >= 12),
  A('night10', 'Night Owl', 'Catch 10 fish at night.', 3, (s) => s.stats.night >= 10),
  A('storm5', 'Storm Chaser', 'Catch 5 fish during a storm.', 4, (s) => s.stats.storm >= 5),
  A('rain10', 'Singing in the Rain', 'Catch 10 fish in the rain.', 3, (s) => s.stats.rain >= 10),
  A('boot5', 'Boot Collector', 'Fish up 5 old boots.', 2, (s) => s.stats.boots >= 5),
  A('duck', 'Squeak!', 'Catch a rubber duck.', 5, (s) => s.stats.ducks >= 1),
  A('bottle', 'Pen Pal', 'Find a message in a bottle.', 2, (s) => s.stats.bottles >= 1),
  A('treasure1', 'X Marks the Spot', 'Open a sunken treasure chest.', 2, (s) => s.stats.treasures >= 1),
  A('treasure10', 'Treasure Hunter', 'Open 10 treasure chests.', 6, (s) => s.stats.treasures >= 10),
  A('contract1', 'Hired Hand', 'Finish a contract.', 1, (s) => s.stats.contracts >= 1),
  A('contract10', 'Reliable', 'Finish 10 contracts.', 5, (s) => s.stats.contracts >= 10),
  A('contract50', 'Contractor of the Year', 'Finish 50 contracts.', 12, (s) => s.stats.contracts >= 50),
  A('up10', 'Tinkerer', 'Buy 10 upgrades.', 2, (s) => s.stats.upgrades >= 10),
  A('up50', 'Fully Loaded', 'Buy 50 upgrades.', 8, (s) => s.stats.upgrades >= 50),
  A('maxed', 'Maxed Out', 'Max out any upgrade track.', 6, maxedTrack),
  A('snap10', 'Snap Happy', 'Snap your line 10 times.', 2, (s) => s.stats.snapped >= 10),
  A('stolen', 'Robbed!', 'Have a fish stolen by a predator.', 1, (s) => s.stats.stolen >= 1),
  A('stung10', 'Ouch Ouch Ouch', 'Get stung 10 times.', 2, (s) => s.stats.stung >= 10),
  A('travel', 'Frequent Flyer', 'Fast travel between outposts.', 2, (s) => s.stats.travels >= 1),
  A('items10', 'Well Supplied', 'Use 10 supplies.', 3, (s) => s.stats.itemsUsed >= 10),
  A('style', 'Fashionista', 'Buy a cosmetic.', 2, (s) => s.stats.cosmetics >= 1),
  A('shallowsall', 'Shallows Scholar', 'Log every fish in the Sunny Shallows.', 4, (s) => zoneDone(s, 'shallows')),
  A('coralall', 'Reef Royalty', 'Log every fish in the Coral Kingdom.', 5, (s) => zoneDone(s, 'coral')),
  A('candyall', 'Sweet Tooth', 'Log every fish in the Candy Lagoon.', 8, (s) => zoneDone(s, 'candy')),
  A('pirateall', 'Pirate King', "Log every fish in the Pirate's Graveyard.", 12, (s) => zoneDone(s, 'pirate')),
];

/** Unlocks and pays out any newly met achievements. */
export function checkAchievements(save: SaveData): Achievement[] {
  const got: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id)) continue;
    if (a.check(save)) {
      save.achievements.push(a.id);
      save.pearls += a.pearls;
      got.push(a);
    }
  }
  return got;
}

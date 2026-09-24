// Consumable supplies (bought with money) and cosmetics (bought with pearls).
import { nicePrice, payUnit } from './upgrades';

export type ItemId = 'chum' | 'lucky' | 'energy' | 'sonar' | 'bossbait' | 'golden';

export interface Item {
  id: ItemId;
  name: string;
  desc: string;
  key: string;
  /** price multiplier on the player's progress level value */
  k: number;
  color: string;
  icon: string;
}

export const ITEMS: Item[] = [
  { id: 'chum', name: 'Chum Bucket', desc: 'Dump it in the water: twice the fish near your lure for 90 seconds.', key: '1', k: 3, color: '#c0603a', icon: 'CH' },
  { id: 'lucky', name: 'Lucky Charm', desc: 'Rare fish show up three times as often for your next 5 casts.', key: '2', k: 8, color: '#3ad060', icon: 'LC' },
  { id: 'energy', name: 'Energy Drink', desc: 'Reel, dive and steer 60% faster for 2 minutes.', key: '3', k: 2.5, color: '#ffd23a', icon: 'ED' },
  { id: 'sonar', name: 'Sonar Ping', desc: 'Reveals every hot spot on the map for 5 minutes and points to legends.', key: '4', k: 5, color: '#3ad0ff', icon: 'SP' },
  { id: 'bossbait', name: 'Boss Bait', desc: "Your next cast summons this zone's boss. Bring a strong line!", key: '5', k: 40, color: '#ff4a4a', icon: 'BB' },
  { id: 'golden', name: 'Golden Hook', desc: 'Doubles the value of everything on your next landed catch.', key: '6', k: 12, color: '#ffb020', icon: 'GH' },
];

export const itemById = new Map(ITEMS.map((i) => [i.id, i]));

export function itemPrice(it: Item, level: number) {
  return nicePrice(payUnit(level) * it.k);
}

export type CosmeticKind = 'paint' | 'hat' | 'flag' | 'lure' | 'line' | 'pet' | 'trail';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  pearls: number;
  /** paint/line: color; flag/lure: 3 colors + pattern; hat: mesh name */
  colors?: [string, string, string];
  color?: string;
  pattern?: number;
  glow?: number;
  mesh?: string;
  /** Only obtainable as a story reward. */
  quest?: boolean;
}

const P = (id: string, name: string, pearls: number, color: string): Cosmetic => ({ id, kind: 'paint', name, pearls, color });
const H = (id: string, name: string, pearls: number, mesh: string): Cosmetic => ({ id, kind: 'hat', name, pearls, mesh });
const F = (id: string, name: string, pearls: number, colors: [string, string, string], pattern = 0, glow = 0): Cosmetic =>
  ({ id, kind: 'flag', name, pearls, colors, pattern, glow });
const L = (id: string, name: string, pearls: number, colors: [string, string, string], pattern = 0, glow = 0): Cosmetic =>
  ({ id, kind: 'lure', name, pearls, colors, pattern, glow });
const N = (id: string, name: string, pearls: number, color: string): Cosmetic => ({ id, kind: 'line', name, pearls, color });

export const COSMETICS: Cosmetic[] = [
  P('paint-default', 'Hull Default', 0, ''),
  P('paint-cherry', 'Cherry Red', 4, '#c8303a'),
  P('paint-sun', 'Sunshine', 4, '#f0c020'),
  P('paint-mint', 'Mint', 4, '#50d0a0'),
  P('paint-lavender', 'Lavender', 6, '#9a7ae0'),
  P('paint-pink', 'Hot Pink', 6, '#ff5aa8'),
  P('paint-teal', 'Ocean Teal', 6, '#1a9aa8'),
  P('paint-midnight', 'Midnight', 10, '#141a30'),
  P('paint-white', 'Pure White', 10, '#f4f4f0'),
  P('paint-gold', 'Royal Gold', 35, '#d8a020'),

  H('hat-souwester', "Sou'wester", 0, 'HatSouwester'),
  H('hat-propeller', 'Propeller Cap', 6, 'HatPropeller'),
  H('hat-cowboy', 'Cowboy Hat', 8, 'HatCowboy'),
  H('hat-chef', 'Chef Hat', 8, 'HatChef'),
  H('hat-pirate', 'Pirate Tricorn', 10, 'HatPirate'),
  H('hat-top', 'Top Hat', 12, 'HatTop'),
  H('hat-viking', 'Viking Helmet', 15, 'HatViking'),
  H('hat-wizard', 'Wizard Hat', 20, 'HatWizard'),
  H('hat-fish', 'Fish Hat', 25, 'HatFish'),
  H('hat-crown', 'Crown', 40, 'HatCrown'),

  F('flag-yellow', 'Classic Pennant', 0, ['#ffd23a', '#ffd23a', '#ffd23a']),
  F('flag-red', 'Red Pennant', 2, ['#e0302a', '#e0302a', '#e0302a']),
  F('flag-blue', 'Blue Pennant', 2, ['#2a6adf', '#2a6adf', '#2a6adf']),
  F('flag-stripes', 'Candy Stripes', 6, ['#ff4a8a', '#ffffff', '#ffffff'], 1),
  F('flag-spots', 'Polka Dots', 6, ['#3ad0ff', '#3ad0ff', '#ffffff'], 2),
  F('flag-jolly', 'Jolly Roger', 12, ['#141414', '#141414', '#f0f0f0'], 6),
  F('flag-stars', 'Starry Night', 18, ['#1a1a5a', '#1a1a5a', '#ffffff'], 4, 0.4),
  F('flag-gold', 'Golden Banner', 30, ['#ffc020', '#ffc020', '#fff0a0'], 0, 1.2),

  L('lure-default', 'Bait Colors', 0, ['#e05a3a', '#f7e0b0', '#ffd23a']),
  L('lure-clown', 'Clownfish', 4, ['#ff7a1a', '#ff9a3c', '#ffffff'], 1),
  L('lure-bubblegum', 'Bubblegum', 4, ['#ff7ac8', '#ffd0ee', '#7ad0ff']),
  L('lure-zebra', 'Zebra', 6, ['#f0f0f0', '#f0f0f0', '#141414'], 1),
  L('lure-toxic', 'Toxic', 8, ['#8aff3a', '#203010', '#e0ff60'], 5, 0.6),
  L('lure-firecracker', 'Firecracker', 10, ['#ff3a1a', '#ffd040', '#ff8a10'], 5, 0.8),
  L('lure-galaxy', 'Galaxy', 18, ['#2a1a6a', '#6a4ad0', '#ffffff'], 4, 0.5),
  L('lure-gold', 'Solid Gold', 30, ['#ffc020', '#fff0a0', '#ffb010'], 0, 1.0),

  N('line-white', 'White Line', 0, '#f2f2ea'),
  N('line-green', 'Neon Green', 3, '#6aff4a'),
  N('line-pink', 'Hot Pink', 3, '#ff5ab0'),
  N('line-blue', 'Sky Blue', 3, '#5ac8ff'),
  N('line-gold', 'Gold Thread', 10, '#ffc93c'),

  { id: 'trail-none', kind: 'trail', name: 'Plain Wake', pearls: 0 },
  { id: 'trail-bubbles', kind: 'trail', name: 'Bubble Trail', pearls: 6, color: '#bfefff' },
  { id: 'trail-sparkle', kind: 'trail', name: 'Gold Sparkles', pearls: 10, color: '#ffd23a' },
  { id: 'trail-ghost', kind: 'trail', name: 'Ghost Wisps', pearls: 12, color: '#60ff9a' },
  { id: 'trail-rainbow', kind: 'trail', name: 'Rainbow Wake', pearls: 16, colors: ['#ff5a5a', '#5aff7a', '#5a8aff'] },
  { id: 'trail-stars', kind: 'trail', name: 'Stardust', pearls: 18, color: '#a0b8ff' },
  { id: 'trail-fire', kind: 'trail', name: 'Afterburner Flames', pearls: 22, color: '#ff7a1a' },

  { id: 'pet-none', kind: 'pet', name: 'No Pet', pearls: 0 },
  { id: 'pet-crab', kind: 'pet', name: 'Pinchy the Crab', pearls: 12, mesh: 'PetCrab' },
  { id: 'pet-cat', kind: 'pet', name: 'Mittens the Cat', pearls: 0, mesh: 'PetCat', quest: true },
  { id: 'pet-penguin', kind: 'pet', name: 'Sir Waddles', pearls: 0, mesh: 'PetPenguin', quest: true },
  { id: 'pet-parrot', kind: 'pet', name: 'Polly the Parrot', pearls: 0, mesh: 'PetParrot', quest: true },
  { id: 'pet-ghost', kind: 'pet', name: 'Boo', pearls: 0, mesh: 'PetGhost', quest: true },
  { id: 'pet-alien', kind: 'pet', name: 'Zorp', pearls: 0, mesh: 'PetAlien', quest: true },
];

export const cosmeticById = new Map(COSMETICS.map((c) => [c.id, c]));
export const DEFAULT_COSMETICS: Record<CosmeticKind, string> = {
  paint: 'paint-default', hat: 'hat-souwester', flag: 'flag-yellow', lure: 'lure-default', line: 'line-white', pet: 'pet-none', trail: 'trail-none',
};

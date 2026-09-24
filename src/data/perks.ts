// Angler perks: a small skill tree bought with pearls. Each perk has a few ranks; the effect of a
// rank is read through perkValue() so gameplay code never hard-codes the numbers.

export type PerkId = 'keeneye' | 'haggler' | 'combo' | 'lungs' | 'grip' | 'magnet' | 'nightowl' | 'stormborn' | 'kraken';

export interface Perk {
  id: PerkId;
  name: string;
  desc: (v: number) => string;
  icon: string;
  color: string;
  /** Effect per rank (index 0 = not bought). */
  values: number[];
  /** Pearl cost of each rank. */
  costs: number[];
  /** Perk that must have at least one rank first. */
  needs?: PerkId;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const PERKS: Perk[] = [
  { id: 'keeneye', name: 'Keen Eye', icon: '&#10022;', color: '#ff9af0', values: [1, 1.5, 2.2, 3.2], costs: [6, 14, 30],
    desc: (v) => `Shiny fish show up ${v.toFixed(1)}x as often.` },
  { id: 'haggler', name: 'Haggler', icon: '$', color: '#ffd23a', values: [0, 0.06, 0.12, 0.2], costs: [5, 12, 26],
    desc: (v) => `Fish sell for ${pct(v)} more.` },
  { id: 'combo', name: 'Hot Streak', icon: '&#10033;', color: '#ff8a3a', values: [0, 15, 30, 50], costs: [4, 10, 22], needs: 'haggler',
    desc: (v) => `Combos stay alive ${v} seconds longer.` },
  { id: 'lungs', name: 'Deep Lungs', icon: '&#9660;', color: '#3ad0ff', values: [0, 0.15, 0.3, 0.5], costs: [5, 12, 26],
    desc: (v) => `Dive ${pct(v)} faster.` },
  { id: 'magnet', name: 'Orb Magnet', icon: '&#9679;', color: '#7fe0ff', values: [0, 0.5, 1, 1.8], costs: [4, 10, 22], needs: 'lungs',
    desc: (v) => `Depth orbs are pulled in from ${pct(v)} further away.` },
  { id: 'grip', name: 'Iron Grip', icon: '&#9994;', color: '#c0c8d8', values: [0, 0.12, 0.25, 0.4], costs: [6, 14, 30],
    desc: (v) => `Line tension builds ${pct(v)} slower in fights.` },
  { id: 'nightowl', name: 'Night Owl', icon: '&#9790;', color: '#a08aff', values: [0, 0.15, 0.3, 0.5], costs: [5, 12, 26], needs: 'keeneye',
    desc: (v) => `Fish caught at night are worth ${pct(v)} more.` },
  { id: 'stormborn', name: 'Storm Born', icon: '&#9889;', color: '#8aa0c0', values: [0, 0.2, 0.4, 0.7], costs: [5, 12, 26], needs: 'grip',
    desc: (v) => `Fish caught in rain or storms are worth ${pct(v)} more.` },
  { id: 'kraken', name: 'Kraken Tamer', icon: '&#128025;', color: '#c060ff', values: [0, 1, 2], costs: [12, 30], needs: 'stormborn',
    desc: (v) => (v >= 2 ? 'Kraken fights are much easier and pay double.' : v >= 1 ? 'Kraken fights are easier and pay 50% more.' : 'Tame the terror of the deep.') },
];

export const perkById = new Map(PERKS.map((p) => [p.id, p]));

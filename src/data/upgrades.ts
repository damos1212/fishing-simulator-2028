export type TrackId = 'rod' | 'reel' | 'bait' | 'hooks' | 'sinker' | 'lamp' | 'finder' | 'engine' | 'hull' | 'cooler';

export interface Tier {
  name: string;
  cost: number;
  desc: string;
  /** Stat values this tier grants. */
  stats: Partial<Stats>;
}

export interface Track {
  id: TrackId;
  name: string;
  icon: string;
  blurb: string;
  tiers: Tier[];
}

export interface Stats {
  lineLength: number;
  lineStrength: number;
  reelSpeed: number;
  baitTier: number;
  attract: number;
  hooks: number;
  diveSpeed: number;
  swimSpeed: number;
  lampRadius: number;
  finder: number;
  boatSpeed: number;
  hull: number;
  cooler: number;
}

/** Base fish value per zone level; every price in the game scales from this curve. */
export const LEVEL_VALUE = [10, 30, 100, 260, 620, 1400, 3000, 6500, 14000, 30000, 65000, 140000];

/** Rounds to two significant digits so prices read nicely. */
export function nicePrice(v: number) {
  if (v < 100) return Math.round(v / 5) * 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}
const price = (level: number, k: number) => nicePrice(LEVEL_VALUE[Math.min(level, LEVEL_VALUE.length - 1)] * k);

type Row = [name: string, desc: string, stats: Partial<Stats>, level: number];
const track = (id: TrackId, name: string, icon: string, blurb: string, k: number, rows: Row[]): Track => ({
  id, name, icon, blurb,
  tiers: rows.map(([n, d, st, lvl], i) => ({ name: n, desc: d, stats: st, cost: i === 0 ? 0 : price(Math.max(lvl - 1, 0), k) })),
});

export const TRACKS: Track[] = [
  track('rod', 'Rods', 'rod', 'Longer line = deeper water. Stronger line = bigger fish.', 15, [
    ['Twig & String', 'Found it on the beach.', { lineLength: 45, lineStrength: 5 }, 0],
    ['Bamboo Rod', 'Bendy, but it works!', { lineLength: 85, lineStrength: 12 }, 1],
    ['Fiberglass Pro', "Now we're fishing.", { lineLength: 160, lineStrength: 30 }, 2],
    ['Carbon Striker', 'Light, strong, very shiny.', { lineLength: 270, lineStrength: 80 }, 3],
    ['Titanium Titan', "Could lift a car. Please don't.", { lineLength: 400, lineStrength: 200 }, 4],
    ['Rock Candy Rod', 'Crunchy, sweet, unbreakable.', { lineLength: 520, lineStrength: 450 }, 5],
    ['Magma-Forged Rod', 'Still warm from the forge.', { lineLength: 650, lineStrength: 900 }, 6],
    ['Storm Caller', 'Lightning likes it. A lot.', { lineLength: 800, lineStrength: 1800 }, 7],
    ['Ghost Bone Rod', 'Whispers when it bends.', { lineLength: 1000, lineStrength: 3500 }, 8],
    ['Trident of Atlantis', 'Pointy end goes in the water.', { lineLength: 1250, lineStrength: 7000 }, 9],
    ['Abyssal Spire', 'Forged from a sunken lighthouse.', { lineLength: 1700, lineStrength: 15000 }, 10],
    ['Cosmic String', 'One-dimensional. Infinitely strong.', { lineLength: 3000, lineStrength: 60000 }, 11],
  ]),
  track('reel', 'Reels', 'reel', 'Reel in faster and fight big fish longer.', 12, [
    ['Rusty Reel', 'Squeaks. Loudly.', { reelSpeed: 5 }, 0],
    ['Spinny 2000', 'State of the art (in 2000).', { reelSpeed: 7 }, 1],
    ['Turbo Reel', 'Has a racing stripe.', { reelSpeed: 10 }, 2],
    ['Hydro-Crank', 'Water-powered reeling.', { reelSpeed: 14 }, 3],
    ['Sugar Rush', 'Powered by pure candy.', { reelSpeed: 18 }, 5],
    ['Jet Reel', 'Please wear eye protection.', { reelSpeed: 23 }, 6],
    ['Thunder Spool', 'Charged by storms.', { reelSpeed: 28 }, 7],
    ['Poseidon Winch', 'Borrowed from a god.', { reelSpeed: 35 }, 9],
    ['Quantum Spool', 'Reels in before you cast.', { reelSpeed: 45 }, 10],
  ]),
  track('bait', 'Bait', 'bait', 'Each new sea needs fancier bait. Better bait attracts from farther.', 18, [
    ['Soggy Bread', 'The classic.', { baitTier: 0, attract: 3 }, 0],
    ['Wiggly Worm', 'Wiggles with enthusiasm. Kelp and coral fish love it.', { baitTier: 1, attract: 4.5 }, 1],
    ['Shiny Spoon', 'Deep Blue fish love shiny things.', { baitTier: 2, attract: 6 }, 2],
    ['Glow Shrimp', 'For the chilly fjord fish.', { baitTier: 3, attract: 7 }, 3],
    ['Gummy Worm', 'Candy Lagoon approved.', { baitTier: 4, attract: 8 }, 4],
    ['Mutant Maggot', 'Glows. Twitches. Toxic fish adore it.', { baitTier: 5, attract: 9 }, 5],
    ['Magma Grub', 'Spicy. Very spicy.', { baitTier: 6, attract: 10 }, 6],
    ['Thunder Fly', 'Buzzes with static.', { baitTier: 7, attract: 11 }, 7],
    ['Cursed Doubloon', 'Pirate ghosts cannot resist gold.', { baitTier: 8, attract: 12 }, 8],
    ['Golden Pearl', 'Fit for Atlantean royalty.', { baitTier: 9, attract: 13 }, 9],
    ['Elder Eye', 'It looks back.', { baitTier: 10, attract: 15 }, 10],
    ['Star Bait', 'A tiny captured star.', { baitTier: 11, attract: 18 }, 11],
  ]),
  track('hooks', 'Hooks', 'hook', 'More hooks = more fish per cast.', 10, [
    ['Bent Nail', 'One fish at a time.', { hooks: 1 }, 0],
    ['Rusty Hook', 'Two whole hooks.', { hooks: 2 }, 1],
    ['Double Hook', 'Double trouble.', { hooks: 3 }, 2],
    ['Treble Trouble', 'Triple trouble, plus one.', { hooks: 4 }, 3],
    ['Gang Hooks', 'A whole gang of hooks.', { hooks: 6 }, 4],
    ['Hook Hydra', 'Cut one off, two grow back.', { hooks: 8 }, 6],
    ['Grappling Array', 'Mostly hooks, some rope.', { hooks: 11 }, 8],
    ['Kraken Claws', 'Eight arms, eight hooks each.', { hooks: 14 }, 10],
    ['Singularity Snare', 'Everything nearby is on the hook.', { hooks: 20 }, 11],
  ]),
  track('sinker', 'Sinkers', 'sinker', 'Dive faster and steer your lure faster.', 10, [
    ['Pebble', 'A rock. On a string.', { diveSpeed: 6, swimSpeed: 5 }, 0],
    ['Lead Weight', 'Heavy metal!', { diveSpeed: 8, swimSpeed: 6 }, 1],
    ['Tungsten Drop', 'Dense and determined.', { diveSpeed: 11, swimSpeed: 7.5 }, 3],
    ['Prop Sinker', 'It has a propeller now.', { diveSpeed: 15, swimSpeed: 9 }, 4],
    ['Jet Sinker', 'Why is there a jet on a sinker?', { diveSpeed: 20, swimSpeed: 11 }, 6],
    ['Torpedo Weight', 'Not technically a weapon.', { diveSpeed: 27, swimSpeed: 13 }, 8],
    ['Gravity Well', 'Warps spacetime slightly downwards.', { diveSpeed: 36, swimSpeed: 16 }, 10],
    ['Black Hole Bob', 'Falls faster than light. Almost.', { diveSpeed: 50, swimSpeed: 20 }, 11],
  ]),
  track('lamp', 'Lamps', 'lamp', 'The deep is dark. Bring a light.', 14, [
    ['No Lamp', 'Good luck down there.', { lampRadius: 0 }, 0],
    ['Glowstick', 'Crack it and shake it!', { lampRadius: 12 }, 2],
    ['Dive Torch', 'A proper light.', { lampRadius: 20 }, 3],
    ['Halogen Beam', 'Bright enough to annoy fish.', { lampRadius: 30 }, 4],
    ['Anglerlight', 'Borrowed from an angler. Permanently.', { lampRadius: 42 }, 6],
    ['Lightning Jar', 'Storm in a bottle.', { lampRadius: 55 }, 8],
    ['Atlantean Orb', 'Ancient, golden, glowy.', { lampRadius: 70 }, 10],
    ['Mini Sun', 'Do not look directly at the lure.', { lampRadius: 95 }, 11],
  ]),
  {
    id: 'finder', name: 'Fish Finder', icon: 'finder', blurb: 'Find the good spots and the rare fish.',
    tiers: [
      { name: 'Your Eyeballs', cost: 0, desc: 'Look for birds and bubbles!', stats: { finder: 0 } },
      { name: 'Beep-o-Matic Sonar', cost: 400, desc: 'Shows nearby hot spots on the map and a depth sonar.', stats: { finder: 1 } },
      { name: 'Color Sonar', cost: 6000, desc: 'Shows far-away hot spots, plus fish colors on the sonar.', stats: { finder: 2 } },
      { name: 'Legend Tracker', cost: 90000, desc: "Every hot spot, and an arrow to legendary fish underwater.", stats: { finder: 3 } },
    ],
  },
  track('engine', 'Engines', 'engine', 'Go fast. Go far.', 14, [
    ['Putt-Putt', 'Putt... putt...', { boatSpeed: 13 }, 0],
    ['Outboard 40', 'Now with 40% more putt.', { boatSpeed: 18 }, 1],
    ['Twin Turbo', 'Twice the turbo.', { boatSpeed: 24 }, 2],
    ['Hydrojet', 'Whoosh!', { boatSpeed: 31 }, 3],
    ['Rocket Boat', 'Technically a rocket.', { boatSpeed: 40 }, 5],
    ['Afterburner', 'Leaves a trail of fire. And fish.', { boatSpeed: 52 }, 7],
    ['Warp Drive', 'Engage.', { boatSpeed: 66 }, 9],
    ['Ludicrous Speed', "They've gone to plaid!", { boatSpeed: 85 }, 11],
  ]),
  {
    id: 'hull', name: 'Hulls', icon: 'hull', blurb: 'Each hull unlocks a new, stranger part of the sea.',
    tiers: [
      ['Wooden Tub', 'Handles the Shallows, Kelp Coast, Coral Kingdom and Deep Blue.', 0],
      ['Ice Breaker', 'Unlocks Frostbite Fjord.', 3],
      ['Sugar-Glazed Hull', 'Unlocks the Candy Lagoon.', 4],
      ['Hazmat Hull', 'Unlocks Toxic Sludge Bay.', 5],
      ['Heat Shield', 'Unlocks the Magma Rift.', 6],
      ['Storm Keel', 'Unlocks Storm Reach.', 7],
      ['Ghost Lantern', "Unlocks the Pirate's Graveyard.", 8],
      ['Pressure Hull', 'Unlocks Sunken Atlantis.', 9],
      ['Elder Ward', 'Unlocks the Drowned Temple.', 10],
      ['Void Anchor', 'Unlocks The Void.', 11],
    ].map(([n, d, lvl], i) => ({ name: n as string, desc: d as string, stats: { hull: i }, cost: i === 0 ? 0 : price((lvl as number) - 1, 70) })),
  },
  track('cooler', 'Coolers', 'cooler', 'Carry more fish before heading home.', 12, [
    ['Bucket', "It's a bucket.", { cooler: 6 }, 0],
    ['Styro Box', 'Keeps fish cool-ish.', { cooler: 12 }, 1],
    ['Ice Chest', 'Now with ice!', { cooler: 20 }, 2],
    ['Fish Hold', 'A whole room for fish.', { cooler: 32 }, 4],
    ['Freezer Hold', 'Very cold. Very roomy.', { cooler: 50 }, 6],
    ['Cargo Bay', 'Room for a whale. Almost.', { cooler: 75 }, 8],
    ['Pocket Dimension', 'Bigger on the inside.', { cooler: 120 }, 10],
    ['Infinite Icebox', 'Where do they all go?', { cooler: 200 }, 11],
  ]),
];

export const trackById = new Map(TRACKS.map((t) => [t.id, t]));

export const HULL_COLORS = ['#2f5d8a', '#e8f2fa', '#ff8ad0', '#6a8a2a', '#3a3a40', '#4a5a70', '#2a4a40', '#c8a040', '#1f5a40', '#1a0a30'];
export const LURE_COLORS: [string, string, string][] = [
  ['#e05a3a', '#f7e0b0', '#ffd23a'],
  ['#d86aa0', '#ffd8e8', '#8a3a6a'],
  ['#c0c8d0', '#ffffff', '#ffd23a'],
  ['#3ad0ff', '#e0fbff', '#ff8a2a'],
  ['#ff70c0', '#fff0a0', '#70e0ff'],
  ['#8aff3a', '#203010', '#e0ff60'],
  ['#ff5a10', '#ffd07a', '#2a1a1a'],
  ['#8ab0ff', '#ffffff', '#ffe040'],
  ['#e0c040', '#3a2a10', '#50ffb0'],
  ['#ffd060', '#fffae0', '#40d0e0'],
  ['#3a6a4a', '#c0ff80', '#7aff5a'],
  ['#2a1a5a', '#ffffff', '#ffe07a'],
];

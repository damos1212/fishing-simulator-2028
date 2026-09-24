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

const T = (name: string, cost: number, desc: string, stats: Partial<Stats>): Tier => ({ name, cost, desc, stats });

export const TRACKS: Track[] = [
  {
    id: 'rod', name: 'Rods', icon: 'rod', blurb: 'Longer line = deeper water. Stronger line = bigger fish.',
    tiers: [
      T('Twig & String', 0, 'Found it on the beach.', { lineLength: 45, lineStrength: 5 }),
      T('Bamboo Rod', 150, 'Bendy, but it works!', { lineLength: 85, lineStrength: 12 }),
      T('Fiberglass Pro', 900, 'Now we\'re fishing.', { lineLength: 160, lineStrength: 30 }),
      T('Carbon Striker', 4500, 'Light, strong, very shiny.', { lineLength: 270, lineStrength: 80 }),
      T('Titanium Titan', 18000, 'Could lift a car. Please don\'t.', { lineLength: 450, lineStrength: 220 }),
      T('Abyssal Spire', 85000, 'Forged from a sunken lighthouse.', { lineLength: 700, lineStrength: 600 }),
      T('Cosmic String', 420000, 'One-dimensional. Infinitely strong.', { lineLength: 2500, lineStrength: 6000 }),
    ],
  },
  {
    id: 'reel', name: 'Reels', icon: 'reel', blurb: 'Reel in faster and fight big fish longer.',
    tiers: [
      T('Rusty Reel', 0, 'Squeaks. Loudly.', { reelSpeed: 5 }),
      T('Spinny 2000', 120, 'State of the art (in 2000).', { reelSpeed: 7 }),
      T('Turbo Reel', 700, 'Has a racing stripe.', { reelSpeed: 10 }),
      T('Hydro-Crank', 3800, 'Water-powered reeling.', { reelSpeed: 14 }),
      T('Jet Reel', 16000, 'Please wear eye protection.', { reelSpeed: 19 }),
      T('Quantum Spool', 70000, 'Reels in before you cast.', { reelSpeed: 26 }),
    ],
  },
  {
    id: 'bait', name: 'Bait', icon: 'bait', blurb: 'Fancier fish want fancier bait. Better bait attracts from farther.',
    tiers: [
      T('Soggy Bread', 0, 'The classic.', { baitTier: 0, attract: 3 }),
      T('Wiggly Worm', 100, 'Wiggles with enthusiasm.', { baitTier: 1, attract: 5 }),
      T('Shiny Spoon', 600, 'Fish love shiny things.', { baitTier: 2, attract: 7 }),
      T('Glow Shrimp', 3000, 'Glows in the deep. Smells amazing.', { baitTier: 3, attract: 9 }),
      T('Magma Grub', 14000, 'Spicy. Very spicy.', { baitTier: 4, attract: 11 }),
      T('Elder Eye', 60000, 'It looks back.', { baitTier: 5, attract: 13 }),
      T('Star Bait', 250000, 'A tiny captured star.', { baitTier: 6, attract: 16 }),
    ],
  },
  {
    id: 'hooks', name: 'Hooks', icon: 'hook', blurb: 'More hooks = more fish per cast.',
    tiers: [
      T('Bent Nail', 0, 'One fish at a time.', { hooks: 1 }),
      T('Rusty Hook', 80, 'Two whole hooks.', { hooks: 2 }),
      T('Double Hook', 450, 'Double trouble.', { hooks: 3 }),
      T('Treble Trouble', 2500, 'Triple trouble, plus two.', { hooks: 5 }),
      T('Gang Hooks', 12000, 'A whole gang of hooks.', { hooks: 8 }),
      T('Hook Hydra', 55000, 'Cut one off, two grow back.', { hooks: 12 }),
      T('Singularity Snare', 300000, 'Everything nearby is on the hook.', { hooks: 18 }),
    ],
  },
  {
    id: 'sinker', name: 'Sinkers', icon: 'sinker', blurb: 'Dive faster and steer your lure faster.',
    tiers: [
      T('Pebble', 0, 'A rock. On a string.', { diveSpeed: 6, swimSpeed: 5 }),
      T('Lead Weight', 90, 'Heavy metal!', { diveSpeed: 8, swimSpeed: 6 }),
      T('Tungsten Drop', 600, 'Dense and determined.', { diveSpeed: 11, swimSpeed: 7.5 }),
      T('Prop Sinker', 3500, 'It has a propeller now.', { diveSpeed: 15, swimSpeed: 9 }),
      T('Jet Sinker', 15000, 'Why is there a jet on a sinker?', { diveSpeed: 20, swimSpeed: 11 }),
      T('Gravity Well', 65000, 'Warps spacetime slightly downwards.', { diveSpeed: 28, swimSpeed: 14 }),
    ],
  },
  {
    id: 'lamp', name: 'Lamps', icon: 'lamp', blurb: 'The deep is dark. Bring a light.',
    tiers: [
      T('No Lamp', 0, 'Good luck down there.', { lampRadius: 0 }),
      T('Glowstick', 250, 'Crack it and shake it!', { lampRadius: 12 }),
      T('Dive Torch', 1500, 'A proper light.', { lampRadius: 20 }),
      T('Halogen Beam', 7000, 'Bright enough to annoy fish.', { lampRadius: 30 }),
      T('Anglerlight', 30000, 'Borrowed from an angler. Permanently.', { lampRadius: 45 }),
      T('Mini Sun', 140000, 'Do not look directly at the lure.', { lampRadius: 70 }),
    ],
  },
  {
    id: 'finder', name: 'Fish Finder', icon: 'finder', blurb: 'Find the good spots and the rare fish.',
    tiers: [
      T('Your Eyeballs', 0, 'Look for birds and bubbles!', { finder: 0 }),
      T('Beep-o-Matic Sonar', 400, 'Shows nearby hot spots on the map and a depth sonar.', { finder: 1 }),
      T('Color Sonar', 5000, 'Shows every hot spot in the zone, plus fish on the sonar.', { finder: 2 }),
      T('Legend Tracker', 50000, 'Points you to legendary fish while you\'re underwater.', { finder: 3 }),
    ],
  },
  {
    id: 'engine', name: 'Engines', icon: 'engine', blurb: 'Go fast. Go far.',
    tiers: [
      T('Putt-Putt', 0, 'Putt... putt...', { boatSpeed: 13 }),
      T('Outboard 40', 200, 'Now with 40% more putt.', { boatSpeed: 18 }),
      T('Twin Turbo', 1200, 'Twice the turbo.', { boatSpeed: 24 }),
      T('Hydrojet', 6000, 'Whoosh!', { boatSpeed: 31 }),
      T('Rocket Boat', 25000, 'Technically a rocket.', { boatSpeed: 40 }),
      T('Warp Drive', 120000, 'Engage.', { boatSpeed: 52 }),
    ],
  },
  {
    id: 'hull', name: 'Hulls', icon: 'hull', blurb: 'Each hull unlocks a new, stranger part of the sea.',
    tiers: [
      T('Wooden Tub', 0, 'Handles the Shallows, Kelp Coast and Deep Blue.', { hull: 0 }),
      T('Ice Breaker', 6000, 'Unlocks Frostbite Fjord.', { hull: 1 }),
      T('Heat Shield', 26000, 'Unlocks the Magma Rift.', { hull: 2 }),
      T('Elder Ward', 110000, 'Unlocks the Drowned Temple.', { hull: 3 }),
      T('Void Anchor', 500000, 'Unlocks The Void.', { hull: 4 }),
    ],
  },
  {
    id: 'cooler', name: 'Coolers', icon: 'cooler', blurb: 'Carry more fish before heading home.',
    tiers: [
      T('Bucket', 0, 'It\'s a bucket.', { cooler: 6 }),
      T('Styro Box', 150, 'Keeps fish cool-ish.', { cooler: 12 }),
      T('Ice Chest', 900, 'Now with ice!', { cooler: 20 }),
      T('Fish Hold', 5000, 'A whole room for fish.', { cooler: 35 }),
      T('Freezer Hold', 22000, 'Very cold. Very roomy.', { cooler: 60 }),
      T('Pocket Dimension', 100000, 'Bigger on the inside.', { cooler: 120 }),
    ],
  },
];

export const trackById = new Map(TRACKS.map((t) => [t.id, t]));

export const HULL_COLORS = ['#2f5d8a', '#e8f2fa', '#3a3a40', '#1f5a40', '#1a0a30'];
export const LURE_COLORS: [string, string, string][] = [
  ['#e05a3a', '#f7e0b0', '#ffd23a'],
  ['#d86aa0', '#ffd8e8', '#8a3a6a'],
  ['#c0c8d0', '#ffffff', '#ffd23a'],
  ['#3ad0ff', '#e0fbff', '#ff8a2a'],
  ['#ff5a10', '#ffd07a', '#2a1a1a'],
  ['#3a6a4a', '#c0ff80', '#7aff5a'],
  ['#2a1a5a', '#ffffff', '#ffe07a'],
];

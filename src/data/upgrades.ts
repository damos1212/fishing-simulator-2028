export type TrackId = 'rod' | 'reel' | 'bait' | 'hooks' | 'sinker' | 'lamp' | 'finder' | 'engine' | 'hull' | 'cooler';

export interface Tier {
  name: string;
  cost: number;
  /** Zone level this tier belongs to (it is bought while fishing the level below). */
  level: number;
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
export const LEVEL_VALUE = [10, 30, 100, 260, 620, 1400, 3000, 6500, 14000, 30000, 65000, 140000,
  // portal realms
  300000, 650000, 1.4e6, 3e6, 6.5e6, 1.4e7, 3e7, 6.5e7, 1.4e8, 3e8, 6.5e8, 1.4e9, 3e9, 6.5e9];

/** Rounds to two significant digits so prices read nicely. */
export function nicePrice(v: number) {
  if (v < 100) return Math.round(v / 5) * 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}
/**
 * Price scale per level, fitted so each stage of the game takes about as long as STAGE_MINUTES says
 * (see tools/balance.ts). Hooks, coolers and faster gear multiply income much faster than fish values
 * grow, so later tiers need a steeper price curve to keep the pace steady.
 */
export const COST_SCALE = [0.15, 0.44, 0.59, 0.65, 0.83, 1.08, 1.11, 1.48, 1.78, 2.01, 2.41, 3.09, 3.78, 4.38, 4.42, 4.78, 5.45, 5.45, 5.45, 6.15, 6.49, 6.49, 6.49, 6.49, 6.88, 7.22];
/** A price unit for a level: rewards and fees that should keep pace with upgrade prices use this. */
export const payUnit = (level: number) => {
  const l = Math.min(Math.max(level, 0), LEVEL_VALUE.length - 1);
  return LEVEL_VALUE[l] * COST_SCALE[l];
};
const price = (level: number, k: number) => {
  const l = Math.min(Math.max(level, 0), LEVEL_VALUE.length - 1);
  return nicePrice(LEVEL_VALUE[l] * k * COST_SCALE[l]);
};

type Row = [name: string, desc: string, stats: Partial<Stats>, level: number];
const track = (id: TrackId, name: string, icon: string, blurb: string, k: number, rows: Row[]): Track => ({
  id, name, icon, blurb,
  tiers: rows.map(([n, d, st, lvl], i) => ({ name: n, desc: d, stats: st, level: lvl, cost: i === 0 ? 0 : price(Math.max(lvl - 1, 0), k) })),
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
    ['Raptor Claw Rod', 'Carved from a very angry fossil.', { lineLength: 3200, lineStrength: 130000 }, 12],
    ['Amber Rod', 'Something is trapped inside. It blinks.', { lineLength: 3400, lineStrength: 280000 }, 13],
    ['Meteorite Rod', 'Fell from the sky. Still smoking.', { lineLength: 3600, lineStrength: 600000 }, 14],
    ['Fel-Forged Rod', 'Glows green. Whispers mean things.', { lineLength: 3800, lineStrength: 1.3e6 }, 15],
    ['Netherstrand', 'The line exists in two places at once.', { lineLength: 4000, lineStrength: 2.8e6 }, 16],
    ['Doomhammer Rod', "It's a hammer. It's a rod. It's both.", { lineLength: 4200, lineStrength: 6e6 }, 17],
    ['Moonbeam Rod', 'Lightweight. Literally.', { lineLength: 4400, lineStrength: 1.3e7 }, 18],
    ['Orbital Tether', 'Hooked to a satellite for extra oomph.', { lineLength: 4700, lineStrength: 2.8e7 }, 19],
    ['Dark Side Spear', "Forged where the sun doesn't shine.", { lineLength: 5000, lineStrength: 6e7 }, 20],
    ['Chrome Striker 3000', 'Radical. Tubular. Unbreakable.', { lineLength: 5300, lineStrength: 1.3e8 }, 21],
    ['Joystick of Power', 'Up, up, down, down, left, right...', { lineLength: 5600, lineStrength: 2.8e8 }, 22],
    ['Rod.exe', "It's not a bug, it's a feature.", { lineLength: 6000, lineStrength: 6e8 }, 23],
    ['Event Horizon Rod', 'The line goes in. Nothing comes out.', { lineLength: 6500, lineStrength: 1.3e9 }, 24],
    ['The Final Rod', 'Forged from the last star. Heavy.', { lineLength: 7200, lineStrength: 2.8e9 }, 25],
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
    ['Raptor Reel', 'Clicks like a velociraptor. Terrifying.', { reelSpeed: 55 }, 13],
    ['Fel Winch', 'Powered by questionable magic.', { reelSpeed: 68 }, 15],
    ['Zero-G Spool', 'Spins forever once you start it.', { reelSpeed: 82 }, 18],
    ['Turbo Arcade Reel', 'Mash the button! MASH IT!', { reelSpeed: 100 }, 21],
    ['Black Hole Winch', 'Pulls in fish, light and nearby boats.', { reelSpeed: 125 }, 24],
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
    ['Dino Nuggets', 'Shaped like dinosaurs. Prehistoric fish are offended but hungry.', { baitTier: 12, attract: 19 }, 12],
    ['Tar Taffy', 'Chewy. Sticky. Irresistible to tar dwellers.', { baitTier: 13, attract: 20 }, 13],
    ['Stardust Grub', 'Fell in with the meteor.', { baitTier: 14, attract: 21 }, 14],
    ['Fel Maggot', 'Wriggles in a threatening way.', { baitTier: 15, attract: 22 }, 15],
    ['Nether Wisp', 'Half here, half somewhere else.', { baitTier: 16, attract: 23 }, 16],
    ['Demon Heart', 'Still beating. Please do not ask.', { baitTier: 17, attract: 24 }, 17],
    ['Moon Cheese', 'Turns out it IS made of cheese.', { baitTier: 18, attract: 25 }, 18],
    ['Space Shrimp', 'Freeze-dried at the edge of the atmosphere.', { baitTier: 19, attract: 26 }, 19],
    ['Shadow Bait', 'You cannot see it. Neither can the fish, but they smell it.', { baitTier: 20, attract: 27 }, 20],
    ['Neon Noodle', 'Glows in six colors that do not exist.', { baitTier: 21, attract: 28 }, 21],
    ['Power Pellet', 'Wakka wakka.', { baitTier: 22, attract: 29 }, 22],
    ['Corrupted.dat', 'Fish find it strangely compelling.', { baitTier: 23, attract: 30 }, 23],
    ['Dark Matter Bait', '85% of the universe. 100% delicious.', { baitTier: 24, attract: 32 }, 24],
    ['Singularity Snack', 'Infinitely dense. Infinitely tasty.', { baitTier: 25, attract: 35 }, 25],
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
    ['Velociraptor Hooks', 'Clever girl.', { hooks: 24 }, 13],
    ['Demon Talons', 'Hooks with opinions.', { hooks: 28 }, 16],
    ['Orbital Grapnel', 'Catches fish and the occasional satellite.', { hooks: 32 }, 19],
    ['Infinite Hooks.exe', 'while (true) hooks++;', { hooks: 40 }, 23],
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
    ['Fossil Weight', 'A trilobite that really wants to go down.', { diveSpeed: 62, swimSpeed: 23 }, 12],
    ['Fel Anchor', 'Drags your lure straight to the depths. And your soul.', { diveSpeed: 76, swimSpeed: 26 }, 15],
    ['Meteor Sinker', 'Enters the water at re-entry speed.', { diveSpeed: 92, swimSpeed: 30 }, 18],
    ['Pixel Plummet', 'Falls one pixel at a time. Very fast pixels.', { diveSpeed: 110, swimSpeed: 34 }, 21],
    ['Singularity Sinker', 'Where it goes, everything follows.', { diveSpeed: 140, swimSpeed: 40 }, 24],
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
    ['Lava Lantern', 'Keeps your lure warm and visible.', { lampRadius: 110 }, 13],
    ['Fel Torch', 'Green light. Go!', { lampRadius: 130 }, 16],
    ['Moonlight Lamp', 'Bottled from the bright side.', { lampRadius: 150 }, 19],
    ['Quasar Lamp', 'Brighter than a galaxy. Batteries not included.', { lampRadius: 190 }, 23],
  ]),
  {
    id: 'finder', name: 'Fish Finder', icon: 'finder', blurb: 'Find the good spots and the rare fish.',
    tiers: [
      { name: 'Your Eyeballs', cost: 0, level: 0, desc: 'Look for birds and bubbles!', stats: { finder: 0 } },
      { name: 'Beep-o-Matic Sonar', cost: price(1, 4), level: 2, desc: 'Shows nearby hot spots on the map and a depth sonar.', stats: { finder: 1 } },
      { name: 'Color Sonar', cost: price(3, 8), level: 4, desc: 'Shows far-away hot spots, plus fish colors on the sonar.', stats: { finder: 2 } },
      { name: 'Legend Tracker', cost: price(6, 12), level: 7, desc: "Every hot spot, and an arrow to legendary fish underwater.", stats: { finder: 3 } },
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
    ['Raptor Engine', 'Screams like a dinosaur at full throttle.', { boatSpeed: 100 }, 13],
    ['Fel Thrusters', 'Green flames. Great mileage.', { boatSpeed: 118 }, 16],
    ['Ion Drive', 'Whisper quiet. Stupidly fast.', { boatSpeed: 136 }, 19],
    ['Hyperdrive', 'Punch it!', { boatSpeed: 160 }, 23],
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
      ['Chrono Hull', 'Opens the rift to Jurassic Tides and unlocks Fern Lagoon.', 12],
      ['Tar-Proof Hull', 'Unlocks The Tar Pits.', 13],
      ['Meteor Plating', 'Unlocks the Extinction Crater.', 14],
      ['Fel-Warded Hull', 'Opens the rift to the Shattered Expanse and unlocks Hellfire Shallows.', 15],
      ['Levitation Keel', 'Unlocks The Nether Drift.', 16],
      ['Demonsteel Hull', 'Unlocks The Black Gate.', 17],
      ['Vacuum-Sealed Hull', 'Opens the rift to Selene and unlocks the Sea of Tranquility.', 18],
      ['Crater Crawler', 'Unlocks the Crater Lakes.', 19],
      ['Lunar Night Hull', 'Unlocks The Dark Side.', 20],
      ['Chrome Chassis', 'Opens the rift to the Neon Dimension and unlocks Sunset Boulevard.', 21],
      ['8-Bit Hull', 'Unlocks Arcade Reef.', 22],
      ['Error-Correcting Hull', 'Unlocks The Glitch.', 23],
      ['Gravity Anchor', 'Opens the rift to the Cosmic Maw and unlocks the Accretion Rim.', 24],
      ['Event Horizon Hull', 'Unlocks The Maw. Good luck.', 25],
    ].map(([n, d, lvl], i) => ({ name: n as string, desc: d as string, stats: { hull: i }, level: lvl as number, cost: i === 0 ? 0 : price((lvl as number) - 1, 70) })),
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
    ['Amber Freezer', 'Preserves fish for 66 million years.', { cooler: 280 }, 13],
    ['Soul Jar', 'Holds fish. And their feelings.', { cooler: 380 }, 16],
    ['Cryo Pod', 'Space-grade fish storage.', { cooler: 500 }, 19],
    ['RAM Upgrade', 'Download more cooler.', { cooler: 650 }, 21],
    ['Black Hole Box', 'Everything fits. Nothing leaves.', { cooler: 900 }, 24],
  ]),
];

export const trackById = new Map(TRACKS.map((t) => [t.id, t]));

export const HULL_COLORS = ['#2f5d8a', '#e8f2fa', '#ff8ad0', '#6a8a2a', '#3a3a40', '#4a5a70', '#2a4a40', '#c8a040', '#1f5a40', '#1a0a30',
  '#6a4a2a', '#2a2420', '#8a3a20', '#3a1a10', '#2a3a6a', '#1a2a10', '#c8ccd8', '#8a8e98', '#20242e', '#e0e4f0', '#3a3aa0', '#10301a', '#5a3a1a', '#0a0610'];
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

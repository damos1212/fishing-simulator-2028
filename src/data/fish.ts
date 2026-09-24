import { LEVEL_VALUE, nicePrice, TRACKS } from './upgrades';
import { ALL_ZONES, type ZoneId } from './zones';

export type Archetype =
  | 'slim' | 'tall' | 'round' | 'eel' | 'shark' | 'ray' | 'jelly' | 'squid' | 'angler' | 'whale' | 'sword' | 'eyeball'
  | 'crab' | 'lobster' | 'turtle' | 'octopus' | 'seahorse' | 'starfish' | 'serpent' | 'dolphin' | 'boot' | 'bottle' | 'duck'
  | 'ammonite' | 'trilobite' | 'plesio' | 'mosasaur' | 'dunkle' | 'anomalo' | 'bonefish' | 'crystalfish' | 'drake' | 'robo' | 'pixel';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'boss';
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';

export const PATTERN = { none: 0, stripes: 1, spots: 2, lateral: 3, stars: 4, veins: 5, eyes: 6, pixel: 7, cracks: 8 } as const;

export interface Species {
  id: string;
  name: string;
  zone: ZoneId;
  model: Archetype;
  depth: [number, number];
  /** spawn weight */
  weight: number;
  value: number;
  /** body length in meters */
  size: number;
  kg: number;
  colors: [string, string, string];
  pattern?: number;
  glow?: number;
  bait: number;
  speed: number;
  rarity: Rarity;
  hazard?: 'sting' | 'thief';
  school?: number;
  flavor: string;
  /** Only bites at this time of day. */
  time?: 'day' | 'night';
  /** Only shows up in this weather. */
  weather?: WeatherKind;
  /** Zone boss: only appears when summoned with Boss Bait. */
  boss?: boolean;
  /** Stays on the seafloor. */
  bottom?: boolean;
  /** Keeps upright (jellies, seahorses). */
  upright?: boolean;
  /** Not a fish at all. */
  junk?: boolean;
  /** Can show up in any zone. */
  anywhere?: boolean;
}

export const ANIM: Record<Archetype, number> = {
  slim: 1, tall: 1, round: 1, shark: 1, sword: 1, angler: 1, eel: 2, whale: 3, ray: 4, jelly: 5, squid: 6, eyeball: 6,
  crab: 9, lobster: 9, turtle: 10, octopus: 6, seahorse: 11, starfish: 12, serpent: 2, dolphin: 3, boot: 0, bottle: 0, duck: 0,
  ammonite: 6, trilobite: 9, plesio: 13, mosasaur: 1, dunkle: 1, anomalo: 4, bonefish: 1, crystalfish: 1, drake: 2, robo: 1, pixel: 1,
};

const SPEED: Record<Archetype, number> = {
  slim: 4, tall: 2.8, round: 1.8, eel: 2.2, shark: 5, ray: 2.5, jelly: 0.6, squid: 3.2, angler: 2, whale: 2.5, sword: 6, eyeball: 1.5,
  crab: 1.3, lobster: 1.5, turtle: 1.8, octopus: 2, seahorse: 0.8, starfish: 0.3, serpent: 4.5, dolphin: 6, boot: 0.2, bottle: 0.3, duck: 0.4,
  ammonite: 1.6, trilobite: 1.1, plesio: 3.5, mosasaur: 5.5, dunkle: 4, anomalo: 2.6, bonefish: 3.4, crystalfish: 3.2, drake: 5, robo: 3, pixel: 3.6,
};
const RARITY_VALUE: Record<Rarity, number> = { common: 1, uncommon: 1.8, rare: 4, epic: 9, legendary: 35, boss: 150 };
const RARITY_WEIGHT: Record<Rarity, number> = { common: 8, uncommon: 4, rare: 1.5, epic: 0.7, legendary: 0.12, boss: 0 };
const RARITY_KG: Record<Rarity, number> = { common: 0.15, uncommon: 0.3, rare: 0.6, epic: 1.0, legendary: 1.7, boss: 7 };
const LINE_STRENGTH = TRACKS.find((t) => t.id === 'rod')!.tiers.map((t) => t.stats.lineStrength!);

interface Opt {
  pattern?: number; glow?: number; school?: number; hazard?: 'sting' | 'thief'; v?: number; bait?: number; speed?: number;
  time?: 'day' | 'night'; weather?: WeatherKind; bottom?: boolean; upright?: boolean; kg?: number; weight?: number;
  junk?: boolean; anywhere?: boolean;
}

const UPRIGHT: Archetype[] = ['jelly', 'seahorse'];
const BOTTOM: Archetype[] = ['crab', 'lobster', 'starfish', 'trilobite'];

function S(zone: ZoneId, id: string, name: string, model: Archetype, depth: [number, number], size: number,
  colors: [string, string, string], rarity: Rarity, flavor: string, o: Opt = {}): Species {
  const level = ALL_ZONES.find((z) => z.id === zone)!.level;
  const boss = rarity === 'boss';
  const bait = o.bait ?? (o.hazard ? 0 : Math.max(0, level - (rarity === 'common' ? 1 : 0)));
  return {
    id, name, zone, model, depth, size, colors, rarity, flavor,
    pattern: o.pattern, glow: o.glow, school: o.school, hazard: o.hazard,
    value: o.hazard ? 0 : o.junk ? Math.round(o.v ?? 1) : nicePrice(LEVEL_VALUE[level] * RARITY_VALUE[rarity] * (o.v ?? 1)),
    bait,
    speed: o.speed ?? SPEED[model],
    // stingers and thieves get bolder in the higher zones
    weight: o.weight ?? (o.hazard ? 2.5 * (1 + Math.min(level, 20) * 0.07) : RARITY_WEIGHT[rarity]),
    kg: o.kg ?? LINE_STRENGTH[Math.min(level, LINE_STRENGTH.length - 1)] * RARITY_KG[rarity] * (size > 2 ? 1.3 : 1),
    time: o.time, weather: o.weather, boss,
    bottom: o.bottom ?? BOTTOM.includes(model), upright: o.upright ?? UPRIGHT.includes(model),
    junk: o.junk, anywhere: o.anywhere,
  };
}

const P = PATTERN;

export const SPECIES: Species[] = [
  // ---------------------------------------------------------------- Open Sea (L0)
  S('open', 'sardine', 'Silver Sardine', 'slim', [0, 40], 0.35, ['#4a7fa8', '#e8f1f5', '#9cc3d9'], 'common', 'Comes in a can. Also, apparently, in the ocean.', { pattern: P.lateral, school: 7, v: 0.5 }),
  S('open', 'mackerel', 'Zippy Mackerel', 'slim', [5, 70], 0.5, ['#2d6f8e', '#e6eef0', '#3f8aa8'], 'common', 'Has never once been late to anything.', { pattern: P.stripes, school: 5 }),
  S('open', 'flyingfish', 'Flappy Flyingfish', 'slim', [0, 20], 0.45, ['#3a78c9', '#dfeaf7', '#7fb8f0'], 'uncommon', 'Thinks it is a bird. Nobody has the heart to tell it.', { bait: 1 }),
  S('open', 'barracuda', 'Bitey Barracuda', 'sword', [15, 110], 1.2, ['#6f8a96', '#dfe7ea', '#4f6a76'], 'uncommon', 'All teeth, no manners.', { pattern: P.spots, bait: 1, v: 2 }),
  S('open', 'moonjelly', 'Moon Jelly', 'jelly', [3, 80], 0.8, ['#cfe6ff', '#a7c8f0', '#e6f0ff'], 'common', 'Stings anything on your hook. Steer clear!', { glow: 0.35, hazard: 'sting' }),
  S('open', 'mola', 'Mola Mola', 'tall', [20, 140], 1.9, ['#8d9aa3', '#dcdfe0', '#77838c'], 'rare', 'A giant swimming head. Very chill. Very heavy.', { bait: 2, v: 3 }),
  S('open', 'bluecrab', 'Blue Crab', 'crab', [5, 140], 0.4, ['#3a6ad0', '#f0e0c0', '#d04030'], 'uncommon', 'Walks sideways out of every conversation.'),
  S('open', 'nightsquid', 'Night Squid', 'squid', [10, 120], 0.9, ['#5a2a6a', '#d0a0d0', '#ff70c0'], 'uncommon', 'Only comes out after bedtime.', { time: 'night', glow: 0.5, v: 1.5 }),
  S('open', 'raindrop', 'Raindrop Minnow', 'slim', [0, 30], 0.3, ['#7ab0e0', '#e8f4ff', '#a0d0ff'], 'uncommon', 'Falls from the sky during rain. Allegedly.', { weather: 'rain', school: 6, v: 1.5 }),
  S('open', 'oarfish', 'Oarfish', 'serpent', [60, 140], 3.5, ['#c0c8d0', '#f0f4f8', '#ff4a4a'], 'rare', "The ocean's longest noodle.", { bait: 1, v: 3 }),

  // ---------------------------------------------------------------- Sunny Shallows (L0)
  S('shallows', 'clown', 'Clown Buddy', 'tall', [0, 25], 0.3, ['#ff7a1a', '#ff9a3c', '#ff6a10'], 'common', 'Tells the same three jokes. Still funny.', { pattern: P.stripes }),
  S('shallows', 'snapper', 'Blushing Snapper', 'tall', [4, 38], 0.6, ['#e0485a', '#ffb3a7', '#d63a4a'], 'common', 'Embarrassed to be caught. Blushes permanently.', { v: 1.4 }),
  S('shallows', 'puffer', 'Puffy McPuff', 'round', [5, 40], 0.45, ['#e8c35a', '#fff4d6', '#c99a3a'], 'uncommon', 'Holds its breath when nervous. Always nervous.', { pattern: P.spots }),
  S('shallows', 'tang', 'Blue Tang', 'tall', [2, 30], 0.35, ['#2a5fd8', '#3a7fe8', '#ffd21a'], 'common', 'Forgot why it swam over here.'),
  S('shallows', 'stinger', 'Pink Stinger', 'jelly', [5, 40], 0.7, ['#ff8fc8', '#ff6ab0', '#ffc0e0'], 'common', 'Cute. Evil. Steals your fish with a zap.', { glow: 0.4, hazard: 'sting' }),
  S('shallows', 'grouper', 'Grumpy Grouper', 'tall', [18, 45], 1.3, ['#6b7f4a', '#c9c29a', '#55663a'], 'rare', 'Has been grumpy since 1987. Nobody knows why.', { pattern: P.spots, bait: 1 }),
  S('shallows', 'guppyking', 'Golden Guppy King', 'slim', [22, 45], 0.8, ['#ffcf3a', '#fff0a0', '#ffa81a'], 'legendary', 'Rules the shallows with a tiny golden fin.', { glow: 0.6, bait: 1 }),
  S('shallows', 'hermit', 'Hermit Crab', 'crab', [2, 40], 0.3, ['#e08a5a', '#f8e0c0', '#c05030'], 'common', 'Lives in a borrowed shell. Rent-free.'),
  S('shallows', 'starfish', 'Sunny Starfish', 'starfish', [1, 40], 0.4, ['#ff9a3a', '#ffd0a0', '#ff6a2a'], 'common', 'Has five arms and zero plans.', { pattern: P.spots, v: 0.8 }),
  S('shallows', 'seahorse', 'Tiny Seahorse', 'seahorse', [2, 30], 0.35, ['#ffb03a', '#fff0b0', '#ff8a2a'], 'uncommon', 'Dad carries the babies. Legend.', { v: 1.3 }),
  S('shallows', 'glowgoby', 'Glow Goby', 'slim', [2, 35], 0.3, ['#3affd0', '#d0fff0', '#80fff0'], 'uncommon', 'The night light of the shallows.', { time: 'night', glow: 1.2, school: 4 }),
  S('shallows', 'kinggrouper', 'King Grouper', 'tall', [15, 40], 4.5, ['#5a6f3a', '#c9c29a', '#ffd23a'], 'boss', 'Wears a crown of barnacles. Extremely grumpy.', { pattern: P.spots, glow: 0.2 }),

  // ---------------------------------------------------------------- Kelp Coast (L1)
  S('kelp', 'garibaldi', 'Garibaldi', 'tall', [0, 50], 0.35, ['#ff6a13', '#ff8a33', '#ff5a00'], 'common', 'The bright orange mayor of Kelp Town.'),
  S('kelp', 'kelpbass', 'Kelp Bass', 'slim', [5, 70], 0.6, ['#5e6b3a', '#d8d0a0', '#4a5528'], 'common', 'Camouflaged as a salad.', { pattern: P.spots, school: 4 }),
  S('kelp', 'wolfeel', 'Wolf Eel', 'eel', [30, 95], 1.8, ['#7a6a5a', '#b8a890', '#6a5a4a'], 'uncommon', 'Face only a mother could love. She does, a lot.', { pattern: P.spots }),
  S('kelp', 'seadragon', 'Leafy Seadragon', 'seahorse', [10, 60], 0.5, ['#d9b23a', '#f2d78a', '#a8c94a'], 'rare', 'A dragon made of salad. Majestic.'),
  S('kelp', 'kelpjelly', 'Tangle Jelly', 'jelly', [10, 90], 0.9, ['#b8e070', '#8ac040', '#d8f0a0'], 'common', 'Tangles lines, steals fish, feels nothing.', { glow: 0.4, hazard: 'sting' }),
  S('kelp', 'seabass', 'Giant Sea Bass', 'tall', [45, 95], 2.1, ['#3a3f48', '#8a8f98', '#2a2f38'], 'epic', 'The size of a sofa. The attitude of a sofa.', { pattern: P.spots }),
  S('kelp', 'emeraldmoray', 'Emerald Moray', 'eel', [60, 95], 2.2, ['#1fa860', '#7ff0a8', '#0f8040'], 'legendary', 'Glows like a gemstone. Bites like a gem thief.', { glow: 0.8, pattern: P.spots }),
  S('kelp', 'rockfish', 'Vermilion Rockfish', 'tall', [10, 80], 0.5, ['#e04a2a', '#ffb090', '#c03a1a'], 'common', 'Hides in rocks. Is not a rock.', { pattern: P.spots }),
  S('kelp', 'kelpcrab', 'Kelp Crab', 'crab', [5, 95], 0.4, ['#7a8a3a', '#e0d8a0', '#5a6a2a'], 'common', 'Wears seaweed as a hat. Fashion!'),
  S('kelp', 'sheephead', 'California Sheephead', 'tall', [15, 80], 0.8, ['#2a2a30', '#ff6a5a', '#f0f0f0'], 'uncommon', 'Has buck teeth and no regrets.'),
  S('kelp', 'kelpkraken', 'Kelp Kraken', 'octopus', [40, 95], 6, ['#5a7a2a', '#b0c070', '#ffd060'], 'boss', 'Eight arms. Eight salads. One appetite.', { pattern: P.spots }),

  // ---------------------------------------------------------------- Coral Kingdom (L1)
  S('coral', 'parrot', 'Parrotfish', 'tall', [0, 40], 0.6, ['#3ad0a0', '#a0f0e0', '#ff70b0'], 'common', "Poops sand. You're welcome, beaches."),
  S('coral', 'butterfly', 'Butterflyfish', 'tall', [0, 35], 0.3, ['#ffe040', '#fff8d0', '#2a2a30'], 'common', "Flutters. Doesn't fly.", { pattern: P.stripes }),
  S('coral', 'wrasse', 'Cleaner Wrasse', 'slim', [0, 40], 0.25, ['#3a8aff', '#e0f0ff', '#2a2a40'], 'common', 'Runs a very small car wash for sharks.', { pattern: P.lateral, school: 4 }),
  S('coral', 'angel', 'Queen Angelfish', 'tall', [5, 50], 0.5, ['#2a7aff', '#ffe040', '#ffb020'], 'uncommon', 'Royal blue. Royal attitude.'),
  S('coral', 'lionfish', 'Lionfish', 'round', [5, 50], 0.5, ['#c0402a', '#fff0e0', '#8a2a1a'], 'uncommon', 'Majestic mane. Venomous handshake.', { pattern: P.stripes }),
  S('coral', 'coralcrab', 'Royal Crab', 'crab', [3, 60], 0.45, ['#b040d0', '#ffd0f0', '#ffd23a'], 'uncommon', 'Demands to be called Your Crabness.'),
  S('coral', 'mantis', 'Mantis Shrimp', 'lobster', [5, 60], 0.35, ['#3ad060', '#ff5a8a', '#3a8aff'], 'rare', 'Punches harder than a bullet. Be nice.'),
  S('coral', 'reefturtle', 'Green Sea Turtle', 'turtle', [2, 55], 1.2, ['#5a8a3a', '#e0d0a0', '#7aaa5a'], 'rare', 'Older than your grandma. Cooler too.', { pattern: P.spots }),
  S('coral', 'reefshark', 'Reef Shark', 'shark', [10, 60], 1.8, ['#8a98a0', '#f0f4f4', '#2a2a30'], 'uncommon', 'Patrols the reef. Takes a cut of every catch.', { hazard: 'thief' }),
  S('coral', 'coraljelly', 'Box Jelly', 'jelly', [2, 50], 0.6, ['#e0f0ff', '#b0d0ff', '#ffffff'], 'common', 'Shaped like a box. Stings like a hornet.', { glow: 0.5, hazard: 'sting' }),
  S('coral', 'rainbowking', 'Rainbow Emperor', 'tall', [20, 60], 1.1, ['#ff4a8a', '#ffe040', '#3ad0ff'], 'legendary', 'Every color. All at once.', { glow: 0.7, pattern: P.stripes }),
  S('coral', 'coralcolossus', 'Coral Colossus', 'turtle', [20, 60], 7, ['#ff8ab0', '#ffe0c0', '#ff5a8a'], 'boss', 'A turtle so old it grew a reef on its back.', { pattern: P.spots }),

  // ---------------------------------------------------------------- Deep Blue (L2)
  S('deepblue', 'tuna', 'Yellowfin Tuna', 'slim', [15, 160], 1.5, ['#1f3e7a', '#e8e8f0', '#ffd23a'], 'common', 'Built like a torpedo. Tastes like... no, we release those. Mostly.', { school: 4, v: 1.3 }),
  S('deepblue', 'mahi', 'Mahi-Mahi', 'tall', [0, 90], 1.1, ['#2fb36b', '#f5e04a', '#3aa0e0'], 'common', 'So nice they named it twice.', { pattern: P.spots }),
  S('deepblue', 'lantern', 'Lanternfish', 'slim', [150, 340], 0.3, ['#1a2a4a', '#3a5a8a', '#6ad0ff'], 'common', 'Brings its own night light.', { glow: 1.2, pattern: P.lateral, school: 8, v: 0.7 }),
  S('deepblue', 'manta', 'Manta Ray', 'ray', [40, 250], 3.2, ['#20283a', '#f0f0f0', '#101828'], 'uncommon', 'Flies through water like a majestic bath towel.', { v: 1.5 }),
  S('deepblue', 'hammer', 'Hammerhead', 'shark', [30, 300], 3, ['#6f7f8f', '#e8eef0', '#5f6f7f'], 'uncommon', 'Steals fish right off your hook. Rude.', { hazard: 'thief' }),
  S('deepblue', 'swordfish', 'Swordfish', 'sword', [80, 320], 2.6, ['#3a4a6a', '#d0d8e0', '#2a3a5a'], 'rare', 'En garde!'),
  S('deepblue', 'marlin', 'Blue Marlin', 'sword', [150, 340], 3.4, ['#1a5ad8', '#e0ecff', '#3a8aff'], 'legendary', 'The old man and the sea wishes he had this one.', { glow: 0.5, pattern: P.stripes }),
  S('deepblue', 'wahoo', 'Wahoo', 'slim', [10, 120], 1.4, ['#2a4a8a', '#e0e8f0', '#4a7ad0'], 'uncommon', 'Named after what you yell when you catch it.', { pattern: P.stripes }),
  S('deepblue', 'devilray', 'Devil Ray', 'ray', [60, 300], 2, ['#2a2030', '#e0d0e0', '#4a3050'], 'uncommon', 'Not actually evil. Just misunderstood.'),
  S('deepblue', 'humboldt', 'Humboldt Squid', 'squid', [50, 300], 1.4, ['#c0302a', '#ffb0a0', '#ff5a3a'], 'rare', 'Red, angry, and hunts in packs.', { time: 'night', glow: 0.4 }),
  S('deepblue', 'megalodon', 'Megalodon', 'shark', [100, 340], 14, ['#4a5a6a', '#d0d8e0', '#2a3a4a'], 'boss', 'Supposedly extinct. Supposedly.'),

  // ---------------------------------------------------------------- Frostbite Fjord (L3)
  S('frost', 'cod', 'Arctic Cod', 'slim', [5, 150], 0.7, ['#8a9a7a', '#f0f0e8', '#7a8a6a'], 'common', 'Wears a tiny invisible scarf.', { pattern: P.spots, school: 5 }),
  S('frost', 'icefish', 'Glassy Icefish', 'slim', [20, 200], 0.6, ['#dff4ff', '#ffffff', '#b8e4ff'], 'uncommon', 'Has antifreeze for blood. Literally.', { glow: 0.5 }),
  S('frost', 'snowsquid', 'Snow Squid', 'squid', [60, 240], 1.2, ['#e8f4ff', '#ffffff', '#b8d8f0'], 'uncommon', 'Inks in white. Very confusing for everyone.', { glow: 0.3 }),
  S('frost', 'halibut', 'Glacier Halibut', 'ray', [120, 240], 1.8, ['#9aa0a8', '#f4f4f4', '#7a8088'], 'rare', 'Flat as a pancake, cold as a freezer.', { pattern: P.spots }),
  S('frost', 'frostjelly', 'Frost Jelly', 'jelly', [10, 200], 1, ['#aee8ff', '#7fd0ff', '#dff6ff'], 'common', 'Freezes your catch clean off the hook.', { glow: 0.8, hazard: 'sting' }),
  S('frost', 'narwhal', 'Narwhal Fish', 'sword', [80, 240], 2.4, ['#a8b8c8', '#e8eef4', '#8898a8'], 'epic', 'The unicorn of the sea. Might grant wishes. Probably not.', { pattern: P.spots }),
  S('frost', 'yetiwhale', 'Yeti Whale', 'whale', [180, 240], 6, ['#f0f4f8', '#ffffff', '#d0dce8'], 'legendary', 'Fluffy. Enormous. Sings sea shanties.', { glow: 0.3 }),
  S('frost', 'snowcrab', 'Snow Crab', 'crab', [20, 240], 0.5, ['#e07a5a', '#fff0e0', '#c05a3a'], 'common', 'Legs for days. Days of legs.'),
  S('frost', 'iceeel', 'Frozen Eel', 'eel', [40, 240], 1.5, ['#9ad0f0', '#e0f4ff', '#5aa0d0'], 'uncommon', 'Stiff as an icicle. Twice as wiggly.', { glow: 0.3 }),
  S('frost', 'auroraray', 'Aurora Ray', 'ray', [30, 200], 2.2, ['#3affc0', '#c070ff', '#70f0ff'], 'rare', 'Only glows when the sky does.', { time: 'night', glow: 1.2 }),
  S('frost', 'frostserpent', 'Frost Leviathan', 'serpent', [120, 240], 16, ['#9ad8ff', '#ffffff', '#3a8ad0'], 'boss', 'The frozen heart of the fjord. It wants its fjord back.', { glow: 0.5 }),

  // ---------------------------------------------------------------- Candy Lagoon (L4)
  S('candy', 'gummy', 'Gummy Minnow', 'slim', [0, 120], 0.35, ['#ff5aa0', '#a0ff70', '#ffd040'], 'common', "Chewy. Please don't chew.", { school: 6 }),
  S('candy', 'jellybean', 'Jellybean Puffer', 'round', [5, 150], 0.5, ['#ff8a3a', '#ffe0f0', '#7a3aff'], 'common', 'Every flavor. Even earwax.', { pattern: P.spots }),
  S('candy', 'sprinkle', 'Sprinkle Starfish', 'starfish', [5, 200], 0.45, ['#ffd0e8', '#fff0f8', '#3ad0ff'], 'common', 'Sprinkles on top. And bottom.', { pattern: P.spots }),
  S('candy', 'lollipopray', 'Lollipop Ray', 'ray', [20, 200], 1.6, ['#ff4a8a', '#fff0f0', '#ffd040'], 'uncommon', 'Licking is not recommended.', { pattern: P.stripes }),
  S('candy', 'candycane', 'Candy Cane Eel', 'eel', [20, 180], 1.4, ['#ff3a3a', '#ffffff', '#3ad060'], 'uncommon', 'Minty fresh.', { pattern: P.stripes }),
  S('candy', 'gumball', 'Gumball Crab', 'crab', [10, 200], 0.5, ['#3ad0ff', '#fff0f8', '#ff5aa0'], 'uncommon', 'Twenty-five cents a pinch.', { pattern: P.spots }),
  S('candy', 'cotton', 'Cotton Candy Jelly', 'jelly', [5, 180], 1, ['#ffb0e0', '#b0e0ff', '#ffffff'], 'common', 'Melts. Then stings. In that order.', { glow: 0.5, hazard: 'sting' }),
  S('candy', 'licorice', 'Licorice Shark', 'shark', [20, 200], 2.5, ['#1a1a1a', '#3a1a1a', '#ff2a2a'], 'uncommon', 'Nobody likes the black ones. It knows.', { hazard: 'thief' }),
  S('candy', 'choco', 'Chocolate Bass', 'tall', [40, 200], 1, ['#6a3a1a', '#c08a5a', '#3a1a0a'], 'rare', 'Solid chocolate. Hollow inside? Only one way to find out.'),
  S('candy', 'marshmallow', 'Marshmallow Mola', 'tall', [60, 200], 1.8, ['#fff8f0', '#ffffff', '#ffe0e8'], 'rare', "Squishy. Toasty if you've got a fire."),
  S('candy', 'sugarplum', 'Sugar Plum Fairyfish', 'slim', [100, 200], 0.9, ['#c060ff', '#ffe0ff', '#ffd040'], 'legendary', 'Dances to a very specific ballet.', { glow: 1.0, pattern: P.stars }),
  S('candy', 'gummyleviathan', 'Gummy Leviathan', 'serpent', [80, 200], 15, ['#ff5aa0', '#a0ff70', '#ffd040'], 'boss', 'A gummy worm that never stopped growing.', { pattern: P.stripes, glow: 0.3 }),

  // ---------------------------------------------------------------- Toxic Sludge Bay (L5)
  S('toxic', 'sludgeminnow', 'Sludge Minnow', 'slim', [0, 200], 0.35, ['#6a9a2a', '#d0ff80', '#a0ff30'], 'common', 'Three eyes. Great depth perception.', { glow: 0.6, school: 6 }),
  S('toxic', 'mutantbass', 'Mutant Bass', 'tall', [10, 250], 0.9, ['#5a6a3a', '#b0c080', '#a0ff30'], 'common', 'Has two heads. Both are grumpy.', { pattern: P.eyes }),
  S('toxic', 'barrelcrab', 'Barrel Crab', 'crab', [20, 320], 0.5, ['#e0c020', '#303020', '#a0ff30'], 'uncommon', "Lives in a toxic barrel. It's rent controlled."),
  S('toxic', 'glowpuffer', 'Radioactive Puffer', 'round', [30, 300], 0.7, ['#3a5a1a', '#8ad040', '#a0ff30'], 'uncommon', "Don't touch it. Don't even look at it.", { pattern: P.veins, glow: 0.4 }),
  S('toxic', 'sludgeeel', 'Sludge Eel', 'eel', [50, 320], 2, ['#3a4a1a', '#6a8a2a', '#c0ff40'], 'uncommon', 'Slimier than your average eel. Which is saying something.', { glow: 0.5, pattern: P.veins }),
  S('toxic', 'toxicjelly', 'Nuclear Jelly', 'jelly', [10, 300], 1.1, ['#a0ff30', '#60ff80', '#e0ff90'], 'common', 'Glows at 3,000 rads. Great night light, terrible friend.', { glow: 1.5, hazard: 'sting' }),
  S('toxic', 'mutantshark', 'Mutant Shark', 'shark', [30, 320], 3, ['#4a5a3a', '#a0b080', '#c0ff40'], 'uncommon', 'Six eyes, three fins, zero manners.', { hazard: 'thief', pattern: P.eyes }),
  S('toxic', 'geigerray', 'Geiger Ray', 'ray', [80, 320], 2, ['#2a3a1a', '#90b060', '#a0ff30'], 'rare', "Clicks when it's near. That's bad.", { glow: 0.6, pattern: P.spots }),
  S('toxic', 'oozeoctopus', 'Ooze Octopus', 'octopus', [60, 320], 1.4, ['#5aa02a', '#b0ff70', '#e0ff40'], 'rare', 'Mostly goo. Somewhat octopus.', { time: 'night', glow: 0.8 }),
  S('toxic', 'goldenmutant', 'Golden Mutant', 'tall', [150, 320], 1.4, ['#ffd030', '#fff0a0', '#a0ff30'], 'legendary', 'Mutated into... money? Somehow?', { glow: 1.0, pattern: P.eyes }),
  S('toxic', 'sludgemonster', 'Sludge Mutant', 'round', [100, 320], 7, ['#4a6a1a', '#90c040', '#c0ff40'], 'boss', "It ate a whole factory. Then the factory's fish.", { pattern: P.eyes, glow: 0.4 }),

  // ---------------------------------------------------------------- Magma Rift (L6)
  S('magma', 'ember', 'Ember Minnow', 'slim', [5, 200], 0.35, ['#ff5a1a', '#ffb04a', '#ff3a00'], 'common', 'Toasty. Handle with oven mitts.', { glow: 1.2, school: 8, v: 0.8 }),
  S('magma', 'magmapuffer', 'Magma Puffer', 'round', [30, 300], 0.8, ['#3a2a2a', '#5a3a2a', '#ff7a1a'], 'uncommon', 'Puffs up into a tiny volcano. Pop!', { pattern: P.veins }),
  S('magma', 'obsidian', 'Obsidian Bass', 'tall', [60, 380], 1, ['#1a1a24', '#3a3a48', '#ff4a1a'], 'uncommon', 'Sharp enough to cut glass. Is glass.', { pattern: P.veins }),
  S('magma', 'lavaeel', 'Lava Eel', 'eel', [150, 430], 2.4, ['#2a1a1a', '#4a2a1a', '#ff6a00'], 'rare', 'A river of lava that learned to wiggle.', { pattern: P.veins, glow: 0.2 }),
  S('magma', 'salamander', 'Salamander Shark', 'shark', [40, 400], 3.4, ['#6a2a1a', '#ffb04a', '#ff5a1a'], 'uncommon', 'Chomps fish off your hook, then chomps the hook.', { pattern: P.veins, hazard: 'thief' }),
  S('magma', 'firejelly', 'Fire Jelly', 'jelly', [10, 400], 1.1, ['#ff8a2a', '#ff5a10', '#ffd07a'], 'common', 'A floating campfire that hates you.', { glow: 1.4, hazard: 'sting' }),
  S('magma', 'phoenixkoi', 'Phoenix Koi', 'slim', [300, 430], 1.6, ['#ff3a1a', '#ffd23a', '#ff8a1a'], 'legendary', 'Reborn from its own ashes every Tuesday.', { glow: 1.6, pattern: P.veins }),
  S('magma', 'lavacrab', 'Lava Crab', 'crab', [10, 430], 0.5, ['#2a1a1a', '#ff8a3a', '#ff4a10'], 'common', 'Molten claws. Toasty hugs.', { pattern: P.veins }),
  S('magma', 'cinderray', 'Cinder Ray', 'ray', [60, 400], 2, ['#2a2020', '#6a3a2a', '#ff5a10'], 'uncommon', 'Leaves a trail of sparks. And smoke. And regret.', { pattern: P.veins }),
  S('magma', 'magmaturtle', 'Magma Turtle', 'turtle', [100, 430], 1.6, ['#3a2a24', '#ff9a4a', '#ff5a10'], 'rare', 'Its shell is a tiny volcano. Do not pet.', { pattern: P.veins, glow: 0.3 }),
  S('magma', 'magmawyrm', 'Magma Wyrm', 'serpent', [200, 430], 18, ['#2a1a1a', '#ff8a2a', '#ff3a00'], 'boss', 'It swims through lava like you swim through water.', { pattern: P.veins, glow: 0.6 }),

  // ---------------------------------------------------------------- Storm Reach (L7)
  S('storm', 'thunderfish', 'Thunder Minnow', 'slim', [0, 250], 0.4, ['#3a5a8a', '#e0f0ff', '#70e0ff'], 'common', 'Zaps anything it touches, including friends.', { glow: 1.0, school: 7 }),
  S('storm', 'stormbass', 'Squall Bass', 'tall', [10, 300], 0.9, ['#4a5a6a', '#c0d0e0', '#2a3a4a'], 'common', 'Always looks windswept. Very dramatic.'),
  S('storm', 'raincrab', 'Raincoat Crab', 'crab', [20, 480], 0.5, ['#ffd020', '#fff0a0', '#e0a010'], 'common', 'Always prepared.'),
  S('storm', 'surgeeel', 'Surge Eel', 'eel', [40, 400], 2.2, ['#2a3a5a', '#70a0ff', '#a0f0ff'], 'uncommon', "The electric eel's even angrier cousin.", { glow: 0.8 }),
  S('storm', 'galeray', 'Gale Ray', 'ray', [60, 480], 2.4, ['#5a6a7a', '#e0e8f0', '#3a4a5a'], 'uncommon', 'Flaps so hard it makes weather.'),
  S('storm', 'cloudjelly', 'Cloud Jelly', 'jelly', [5, 400], 1.2, ['#d0d8e0', '#a0b0c0', '#ffffff'], 'common', 'A thundercloud with tentacles. Charming.', { glow: 0.6, hazard: 'sting' }),
  S('storm', 'stormshark', 'Storm Shark', 'shark', [40, 480], 3.5, ['#3a4a5a', '#c0c8d0', '#70e0ff'], 'uncommon', 'Rides the lightning. Steals your fish.', { hazard: 'thief', glow: 0.3 }),
  S('storm', 'tempest', 'Tempest Swordfish', 'sword', [80, 480], 2.8, ['#2a4a7a', '#d0e0f0', '#70e0ff'], 'rare', 'Its sword is a lightning rod. It knows.', { glow: 0.5 }),
  S('storm', 'voltoctopus', 'Lightning Octopus', 'octopus', [60, 480], 1.5, ['#3a3a8a', '#a0a0ff', '#e0ff60'], 'rare', 'Eight arms, eight batteries.', { glow: 1.0, weather: 'storm' }),
  S('storm', 'eyeofstorm', 'Eye of the Storm', 'eyeball', [200, 480], 1.8, ['#f0f4ff', '#70e0ff', '#3a4a6a'], 'legendary', 'Calm in the middle. Very angry at the edges.', { glow: 1.0 }),
  S('storm', 'stormserpent', 'Storm Serpent', 'serpent', [150, 480], 20, ['#2a3a5a', '#a0c0ff', '#70e0ff'], 'boss', 'It IS the storm.', { glow: 0.8 }),

  // ---------------------------------------------------------------- Pirate's Graveyard (L8)
  S('pirate', 'bonefish', 'Bonefish', 'slim', [0, 300], 0.6, ['#e8e0d0', '#fffaf0', '#a09888'], 'common', 'All bones, no fish.', { pattern: P.stripes, school: 5 }),
  S('pirate', 'doubloon', 'Doubloon Fish', 'round', [20, 400], 0.4, ['#ffd030', '#fff0a0', '#c09010'], 'common', 'Worth its weight in gold. Literally.', { glow: 0.3, v: 1.2 }),
  S('pirate', 'piratefish', 'Pirate Parrotfish', 'tall', [10, 350], 0.8, ['#c02a2a', '#ffe0a0', '#1a1a1a'], 'uncommon', 'Arr! Squawk! Blub!'),
  S('pirate', 'cursedcrab', 'Cursed Crab', 'crab', [20, 520], 0.5, ['#2a4a3a', '#a0ffd0', '#50ffb0'], 'uncommon', 'Pinches for all eternity.', { glow: 0.6 }),
  S('pirate', 'anchoreel', 'Anchor Eel', 'eel', [80, 520], 2.2, ['#3a3a3a', '#8a8a8a', '#6a4a2a'], 'uncommon', 'Heavy. Rusty. Surprisingly affectionate.'),
  S('pirate', 'phantomjelly', 'Phantom Jelly', 'jelly', [10, 450], 1.2, ['#a0ffd0', '#50ffb0', '#e0fff0'], 'common', 'Boo. Also, zap.', { glow: 1.2, hazard: 'sting' }),
  S('pirate', 'skeletonshark', 'Skeleton Shark', 'shark', [40, 520], 3.5, ['#e8e0d0', '#fffaf0', '#50ffb0'], 'uncommon', 'Has no stomach. Steals your fish anyway.', { hazard: 'thief', pattern: P.stripes }),
  S('pirate', 'ghostray', 'Ghost Ray', 'ray', [100, 520], 2.4, ['#b0ffe0', '#e0fff8', '#50ffb0'], 'rare', 'Passes through walls. Not through nets.', { glow: 1.0, time: 'night' }),
  S('pirate', 'cannonpuffer', 'Cannonball Puffer', 'round', [60, 520], 0.8, ['#2a2a2a', '#5a5a5a', '#ff6a1a'], 'rare', 'Loaded and ready to fire.'),
  S('pirate', 'davyjones', "Davy Jones' Angler", 'angler', [250, 520], 1.8, ['#1a3a30', '#3a5a4a', '#50ffb0'], 'legendary', 'Keeps a locker. Nobody knows what is inside.', { glow: 0.6, weather: 'fog' }),
  S('pirate', 'ghostwhale', 'Ghost Whale', 'whale', [200, 520], 16, ['#a0ffd0', '#e0fff0', '#50ffb0'], 'boss', 'Captain of the graveyard. Still hungry after 300 years.', { glow: 1.0 }),

  // ---------------------------------------------------------------- Sunken Atlantis (L9)
  S('atlantis', 'goldfin', 'Goldfin', 'slim', [0, 400], 0.4, ['#ffd030', '#fff8d0', '#ffb010'], 'common', 'Pure gold scales. Literally rich.', { glow: 0.3, school: 6 }),
  S('atlantis', 'marbleray', 'Marble Ray', 'ray', [20, 500], 1.8, ['#f0ece0', '#ffffff', '#c0b8a0'], 'common', 'Carved by the finest Atlantean sculptors.', { pattern: P.veins }),
  S('atlantis', 'triton', 'Triton Snapper', 'tall', [10, 450], 0.9, ['#3ad0e0', '#e0fff8', '#ffd060'], 'common', 'Carries a tiny trident. Very proud of it.'),
  S('atlantis', 'hippocampus', 'Hippocampus', 'seahorse', [20, 500], 1.2, ['#40c0e0', '#e0f8ff', '#ffd060'], 'uncommon', 'Half horse, half fish, all business.', { glow: 0.3 }),
  S('atlantis', 'crowncrab', 'Crowned Crab', 'crab', [30, 650], 0.6, ['#ffd030', '#fff0c0', '#40c0e0'], 'uncommon', 'The crown is real. The crab is also real.', { glow: 0.3 }),
  S('atlantis', 'sirenjelly', 'Siren Jelly', 'jelly', [10, 600], 1.2, ['#ffe0a0', '#ffd060', '#ffffff'], 'common', 'Sings a beautiful song. Then stings.', { glow: 1.2, hazard: 'sting' }),
  S('atlantis', 'guardianturtle', 'Guardian Turtle', 'turtle', [100, 650], 2, ['#c8a040', '#fff0c0', '#40c0e0'], 'rare', 'Has guarded the gates for 10,000 years. Taking a break.', { glow: 0.5 }),
  S('atlantis', 'oracle', 'Oracle Octopus', 'octopus', [100, 650], 1.6, ['#6a40c0', '#e0d0ff', '#ffd060'], 'rare', 'Predicts the future. Mostly more fish.', { glow: 0.8 }),
  S('atlantis', 'tridentfish', 'Trident Swordfish', 'sword', [150, 650], 3, ['#ffd030', '#fff8e0', '#40c0e0'], 'epic', 'Three swords are better than one.', { glow: 0.5 }),
  S('atlantis', 'poseidonkoi', "Poseidon's Koi", 'slim', [300, 650], 1.8, ['#ffffff', '#ffd060', '#40e0ff'], 'legendary', 'The sea god\'s favorite pet. Do not tell him.', { glow: 1.5, pattern: P.spots }),
  S('atlantis', 'goldenhippo', 'Golden Hippocampus', 'seahorse', [200, 650], 12, ['#ffd030', '#fff8d0', '#40e0ff'], 'boss', "Poseidon's steed. He will want it back.", { glow: 1.0 }),

  // ---------------------------------------------------------------- Drowned Temple (L10)
  S('temple', 'whisper', 'Whispering Anchovy', 'slim', [5, 300], 0.3, ['#4a5a4a', '#8aa08a', '#90ff80'], 'common', 'Whispers your name. You never told it your name.', { glow: 0.6, pattern: P.lateral, school: 8 }),
  S('temple', 'manyeyed', 'Many-Eyed Grouper', 'round', [60, 450], 1.3, ['#3a4a3a', '#5a6a50', '#c0ff80'], 'uncommon', 'It sees you. It sees you from several angles.', { pattern: P.eyes }),
  S('temple', 'lurker', 'Lurking Angler', 'angler', [150, 650], 1.4, ['#1a2a24', '#2a3a30', '#7aff9a'], 'rare', 'Its little light says "trust me".', { glow: 0.2 }),
  S('temple', 'eye', 'Floating Eye', 'eyeball', [100, 600], 1.2, ['#f0e8d8', '#7aff5a', '#8a5a6a'], 'rare', 'Blinks when you are not looking.', { glow: 0.3 }),
  S('temple', 'deepsquid', 'Deep One Squid', 'squid', [200, 800], 2.4, ['#2a4a3a', '#4a7a5a', '#90ffb0'], 'rare', 'Knows a guy. The guy is very large and sleeps under a temple.', { glow: 0.5 }),
  S('temple', 'horror', 'Tentacle Horror', 'squid', [60, 800], 4, ['#3a1a3a', '#6a3a6a', '#c070ff'], 'uncommon', 'Grabs fish off your line with all eight hands.', { glow: 0.4, hazard: 'thief' }),
  S('temple', 'spawn', 'Spawn of Cthulhu', 'squid', [450, 900], 5, ['#2a6a4a', '#5aa07a', '#60ff90'], 'legendary', "Ph'nglui mglw'nafh... it's just a baby. A very big baby.", { glow: 1.2, pattern: P.eyes }),
  S('temple', 'cultistcrab', 'Cultist Crab', 'crab', [20, 900], 0.5, ['#3a2a4a', '#8a7a9a', '#90ff80'], 'common', 'Chants quietly at night. Mostly about clams.', { pattern: P.eyes }),
  S('temple', 'elderoct', 'Elder Octopus', 'octopus', [200, 900], 2, ['#2a3a5a', '#6a8aaa', '#80ffb0'], 'uncommon', 'Remembers when the temple was new.', { glow: 0.6 }),
  S('temple', 'dagon', 'Dagon Fish', 'tall', [300, 900], 2.2, ['#2a4a3a', '#6a9a7a', '#c0ff80'], 'epic', 'Worshipped by fish. Feared by fishermen.', { pattern: P.eyes, glow: 0.4 }),
  S('temple', 'cthulhucousin', "Cthulhu's Cousin", 'octopus', [400, 900], 12, ['#2a5a4a', '#6aa08a', '#60ff90'], 'boss', 'Not the famous one. The one who sends postcards.', { pattern: P.eyes, glow: 0.8 }),

  // ---------------------------------------------------------------- The Void (L11)
  S('void', 'stardust', 'Stardust Minnow', 'slim', [0, 800], 0.35, ['#5a3ad0', '#b8a0ff', '#ffffff'], 'common', 'Made of the same stuff as you. Mostly sparkles.', { pattern: P.stars, glow: 0.9, school: 9 }),
  S('void', 'comet', 'Comet Tetra', 'slim', [50, 1200], 0.5, ['#6ad0ff', '#ffffff', '#ffe07a'], 'uncommon', 'Leaves a tail. Makes wishes come true (unverified).', { glow: 1.8 }),
  S('void', 'nebjelly', 'Nebula Jelly', 'jelly', [100, 1500], 1.6, ['#c060ff', '#40c0ff', '#ff70d0'], 'rare', 'A whole galaxy, wobbling. Friendly, for once.', { glow: 1.5, pattern: P.stars }),
  S('void', 'moonray', 'Moon Ray', 'ray', [200, 1500], 3.5, ['#d8d8f0', '#ffffff', '#a0a0d0'], 'rare', 'Has craters. Controls a very small tide.', { glow: 0.6, pattern: P.spots }),
  S('void', 'holepuffer', 'Black Hole Puffer', 'round', [400, 2000], 1.5, ['#05050a', '#140a28', '#a060ff'], 'epic', 'Infinitely dense. Please lift with your legs.', { glow: 0.2, pattern: P.stars }),
  S('void', 'voidmaw', 'Void Maw', 'angler', [100, 2000], 3, ['#000000', '#140a28', '#ff3a8a'], 'uncommon', 'A mouth. In space. Eats your fish. Why not.', { glow: 0.5, hazard: 'thief' }),
  S('void', 'spacewhale', 'Cosmic Space Whale', 'whale', [800, 2400], 12, ['#1a0a4a', '#6a4ad0', '#ff70d0'], 'legendary', 'It has been waiting for you.', { glow: 0.8, pattern: P.stars }),
  S('void', 'astrocrab', 'Astro Crab', 'crab', [50, 2400], 0.6, ['#e0e0f0', '#ffffff', '#6a4ad0'], 'common', 'One small pinch for crab-kind.', { pattern: P.stars }),
  S('void', 'ringhorse', 'Ringed Seahorse', 'seahorse', [100, 2000], 1, ['#e0a060', '#fff0d0', '#a060ff'], 'uncommon', 'Wears Saturn as a hula hoop.', { pattern: P.stars, glow: 0.5 }),
  S('void', 'quasar', 'Quasar Squid', 'squid', [300, 2400], 2.2, ['#ffffff', '#a0e0ff', '#ff70d0'], 'rare', 'Brightest thing for a billion miles.', { glow: 2 }),
  S('void', 'worldeater', 'World Eater', 'whale', [500, 2400], 30, ['#0a0520', '#3a2a8a', '#ff70d0'], 'boss', 'It swallowed a galaxy once. Just a small one.', { glow: 1.0, pattern: P.stars }),

  // ================================================================ REALM II: JURASSIC TIDES
  // ---------------------------------------------------------------- Primordial Sea (L12)
  S('jopen', 'ammonite', 'Ammonite', 'ammonite', [5, 120], 0.55, ['#d89a50', '#f5e6c8', '#8a4a2a'], 'common', 'Spiral-shelled and very proud of it.', { pattern: P.stripes, school: 4 }),
  S('jopen', 'trilobite', 'Trilobite', 'trilobite', [20, 180], 0.45, ['#6a5a48', '#c8b090', '#3a2a1a'], 'common', 'Has been bottom-feeding for 500 million years. Loves it.'),
  S('jopen', 'coelacanth', 'Coelacanth', 'tall', [40, 180], 1.6, ['#2a4a8a', '#9ab0d0', '#dde6ff'], 'uncommon', 'Scientists said it was extinct. It said nothing.', { pattern: P.spots }),
  S('jopen', 'ichthyo', 'Ichthyosaur', 'dolphin', [0, 90], 2.8, ['#4a6a8a', '#d8e0e8', '#2a3a5a'], 'rare', 'A dolphin, but make it Jurassic.'),
  S('jopen', 'protojelly', 'Primordial Jelly', 'jelly', [5, 120], 0.9, ['#b0f0a0', '#80c080', '#e0ffd0'], 'common', 'Older than trees. Still stings.', { glow: 0.5, hazard: 'sting' }),
  S('jopen', 'helicoprion', 'Helicoprion', 'shark', [30, 180], 2.2, ['#5a6a70', '#d0d8d8', '#3a4448'], 'epic', 'Has a buzz saw for a mouth. Nobody knows why.'),
  S('jopen', 'xiphactinus', 'Xiphactinus', 'sword', [10, 150], 3.2, ['#6a8aa8', '#e8eef0', '#ffd23a'], 'legendary', 'Swallowed a whole fish once. The fish was also huge.', { pattern: P.lateral }),
  S('jopen', 'nautilus', 'Glowing Nautilus', 'ammonite', [20, 160], 0.7, ['#e0e0f0', '#ffffff', '#40e0ff'], 'uncommon', 'Lights up the prehistoric night.', { time: 'night', glow: 0.8 }),
  // ---------------------------------------------------------------- Fern Lagoon (L12)
  S('fern', 'fernguppy', 'Fern Guppy', 'slim', [0, 40], 0.25, ['#4ac060', '#e0ffd0', '#ffd040'], 'common', 'Photosynthesizes on weekends.', { pattern: P.lateral, school: 7 }),
  S('fern', 'cycadcarp', 'Cycad Carp', 'round', [5, 60], 0.7, ['#6a8a3a', '#e0e8a0', '#c0a030'], 'common', 'Munches ferns that fall in the water.', { pattern: P.spots }),
  S('fern', 'lungfish', 'Lungfish', 'eel', [10, 90], 1.4, ['#5a5a3a', '#c0b890', '#3a3a20'], 'uncommon', 'Can breathe air. Chooses not to.'),
  S('fern', 'raptorfish', 'Raptor Fish', 'shark', [10, 90], 1.2, ['#8a6a3a', '#f0e0c0', '#3a2a1a'], 'uncommon', 'Hunts in packs. Opens doors.', { pattern: P.stripes, school: 3 }),
  S('fern', 'eurypterid', 'Eurypterid', 'lobster', [10, 90], 1.2, ['#8a4a2a', '#e0c0a0', '#4a2010'], 'uncommon', 'A sea scorpion the size of a surfboard.'),
  S('fern', 'archelon', 'Archelon', 'turtle', [5, 80], 2.4, ['#4a5a3a', '#c0c8a0', '#2a3a20'], 'rare', 'A turtle the size of a car. Honks like one too.'),
  S('fern', 'fernray', 'Fernwing Ray', 'ray', [10, 90], 1.6, ['#3a8a5a', '#d0f0d0', '#80ff90'], 'rare', 'Glides between the ferns like a falling leaf.'),
  S('fern', 'babyplesio', 'Baby Plesiosaur', 'plesio', [0, 70], 2.2, ['#5a8a7a', '#d0e8e0', '#2a5a4a'], 'epic', 'Cute now. Give it ten years.'),
  S('fern', 'amberjack', 'Amberjack Prime', 'tall', [20, 90], 1.1, ['#ff9a20', '#ffe0a0', '#c06010'], 'epic', 'Carries a mosquito inside. Probably fine.', { glow: 0.2 }),
  S('fern', 'nessie', 'Nessie', 'plesio', [30, 90], 5.5, ['#3a6a5a', '#a0c0b0', '#1a3a30'], 'legendary', 'Blurry in every photo. Sharp in real life.'),
  S('fern', 'rexmaximus', 'Rex Maximus', 'mosasaur', [30, 90], 9, ['#4a6a3a', '#d8d0a0', '#ff4020'], 'boss', 'It has tiny fins. It is very, very angry about it.', { pattern: P.stripes }),
  // ---------------------------------------------------------------- The Tar Pits (L13)
  S('tarpit', 'tarblob', 'Tar Blob', 'round', [0, 80], 0.5, ['#1a1612', '#4a4030', '#ff9a30'], 'common', 'Sticky. Also sticky.', { school: 5, glow: 0.2 }),
  S('tarpit', 'tarbones', 'Tar Bones', 'bonefish', [10, 200], 0.8, ['#e8dcc0', '#fff6e0', '#a09070'], 'common', 'It lost its flesh. Kept the attitude.', { school: 4 }),
  S('tarpit', 'ambereel', 'Amber Eel', 'eel', [20, 260], 1.6, ['#ffa020', '#ffe0a0', '#8a4a00'], 'uncommon', 'Glows like honey. Tastes like regret.', { glow: 0.6 }),
  S('tarpit', 'sabresalmon', 'Sabre-Tooth Salmon', 'slim', [20, 200], 1.2, ['#8a5a3a', '#f0d0b0', '#e0e0e0'], 'uncommon', 'Fell in the tar pit 10,000 years ago. Still mad.'),
  S('tarpit', 'woollysun', 'Woolly Sunfish', 'tall', [30, 260], 2.0, ['#6a4a2a', '#c0a080', '#3a2010'], 'rare', 'Fluffy. Somehow.'),
  S('tarpit', 'tarjelly', 'Tar Jelly', 'jelly', [10, 200], 0.9, ['#2a2018', '#5a4a30', '#ffb040'], 'uncommon', 'Steals your catch and makes it sticky.', { glow: 0.3, hazard: 'thief' }),
  S('tarpit', 'dunkleosteus', 'Dunkleosteus', 'dunkle', [60, 260], 3.5, ['#5a5a60', '#b0b0b0', '#8a8a90'], 'epic', 'Armored head. Guillotine jaws. Zero chill.'),
  S('tarpit', 'livingfossil', 'Living Fossil', 'bonefish', [100, 260], 1.4, ['#c8b890', '#fff0d0', '#ffd060'], 'epic', 'Glows at night. Scientists are baffled.', { time: 'night', glow: 0.4 }),
  S('tarpit', 'tarkraken', 'Tar Pit Kraken', 'octopus', [120, 260], 4, ['#1a1410', '#4a3a2a', '#ff8a20'], 'legendary', 'Pulled a mammoth under once. Wants a sequel.', { glow: 0.3 }),
  S('tarpit', 'sabreshark', 'The Sabre Shark', 'shark', [80, 260], 10, ['#2a2018', '#8a7050', '#ffb040'], 'boss', 'Sabre teeth, shark body, tar-black soul.', { glow: 0.3 }),
  // ---------------------------------------------------------------- Extinction Crater (L14)
  S('crater', 'meteorminnow', 'Meteor Minnow', 'slim', [0, 200], 0.35, ['#ff6a20', '#ffd0a0', '#ffff60'], 'common', 'Fell from space. Stayed for the fishing.', { school: 6, glow: 0.5 }),
  S('crater', 'horseshoe', 'Magma Horseshoe Crab', 'crab', [50, 900], 0.7, ['#6a2a1a', '#e0a080', '#ff6010'], 'common', 'Four hundred million years old. Still hot.', { glow: 0.3 }),
  S('crater', 'anomalocaris', 'Anomalocaris', 'anomalo', [40, 700], 1.8, ['#c04a3a', '#f0c0a0', '#ffd040'], 'uncommon', 'Weird shrimp. Great grip.'),
  S('crater', 'ashray', 'Ash Ray', 'ray', [100, 900], 2.4, ['#3a3030', '#8a7a70', '#ff5010'], 'uncommon', 'Glides through falling ash.', { glow: 0.3 }),
  S('crater', 'mosasaur', 'Mosasaur', 'mosasaur', [20, 600], 6, ['#3a5a4a', '#c0d0c0', '#1a2a20'], 'rare', 'The real apex predator of the Cretaceous.'),
  S('crater', 'impactgrouper', 'Impact Grouper', 'round', [200, 1200], 2.2, ['#8a3a2a', '#e0a080', '#ffb040'], 'rare', 'Survived the meteor. Absorbed the meteor.', { pattern: P.cracks, glow: 0.3 }),
  S('crater', 'tektite', 'Tektite Eel', 'eel', [300, 1400], 2.5, ['#1a2a1a', '#6a8a6a', '#80ff60'], 'epic', 'Made of glass from the impact. Handle with care.', { glow: 0.7 }),
  S('crater', 'cretashark', 'Cretoxyrhina Rex', 'shark', [100, 1200], 14, ['#5a6a70', '#e0e4e8', '#3a4448'], 'legendary', 'The biggest shark ever. Ever ever.'),
  S('crater', 'lastdino', 'The Last Dinosaur', 'plesio', [200, 1400], 7, ['#6a4a3a', '#e0c0a0', '#ff8030'], 'legendary', 'It refused to go extinct. Respect.', { time: 'night', glow: 0.2 }),
  S('crater', 'chicxulub', 'Chicxulub', 'whale', [300, 1400], 22, ['#3a1a10', '#aa5a30', '#ff6010'], 'boss', 'The meteor that killed the dinosaurs? It had a passenger.', { pattern: P.cracks, glow: 0.6 }),

  // ================================================================ REALM III: THE SHATTERED EXPANSE
  // ---------------------------------------------------------------- The Twisting Nether (L15)
  S('sopen', 'felfry', 'Fel Fry', 'slim', [0, 120], 0.3, ['#60ff40', '#d0ffc0', '#205010'], 'common', 'Tiny, green and full of bad ideas.', { school: 7, glow: 0.6 }),
  S('sopen', 'netherjelly', 'Nether Jelly', 'jelly', [10, 300], 1.0, ['#8a4aff', '#c0a0ff', '#ff70ff'], 'common', 'Stings in two dimensions at once.', { glow: 0.7, hazard: 'sting' }),
  S('sopen', 'shardsnapper', 'Shard Snapper', 'crystalfish', [20, 300], 0.8, ['#a060ff', '#e0c0ff', '#60ffa0'], 'common', 'Chipped off a broken world.', { glow: 0.3 }),
  S('sopen', 'netherling', 'Netherling', 'eyeball', [30, 400], 1.0, ['#3a1a5a', '#a080c0', '#60ff40'], 'uncommon', 'It watches. It judges.', { pattern: P.eyes }),
  S('sopen', 'riftray', 'Rift Ray', 'ray', [40, 400], 2.6, ['#2a1a4a', '#8a6ac0', '#60ff80'], 'rare', 'Swims through tears in reality.', { glow: 0.5, pattern: P.stars }),
  S('sopen', 'felserpent', 'Fel Serpent', 'drake', [60, 400], 4.5, ['#1a3a1a', '#60a060', '#80ff40'], 'epic', 'Wings, fangs and fire. Why is it in the water?', { glow: 0.5 }),
  S('sopen', 'worldshard', 'World Fragment', 'crystalfish', [200, 400], 1.6, ['#40ffa0', '#e0fff0', '#ffffff'], 'legendary', 'A piece of the old world. Still humming.', { glow: 1.0 }),
  // ---------------------------------------------------------------- Hellfire Shallows (L15)
  S('hellfire', 'impfish', 'Imp Fish', 'slim', [0, 60], 0.3, ['#c03a1a', '#ffb080', '#60ff30'], 'common', 'Giggles. Constantly.', { school: 6 }),
  S('hellfire', 'brimcrab', 'Brimstone Crab', 'crab', [20, 150], 0.6, ['#8a2a10', '#ffa060', '#60ff30'], 'common', 'Smells of sulfur. Proudly.', { glow: 0.3 }),
  S('hellfire', 'hellpike', 'Hellhound Pike', 'sword', [10, 150], 1.4, ['#6a1a0a', '#e08060', '#70ff40'], 'uncommon', 'Fetches. Burns what it fetches.', { pattern: P.cracks, glow: 0.4 }),
  S('hellfire', 'infernal', 'Infernal Grouper', 'round', [30, 150], 1.6, ['#aa3a1a', '#ffc080', '#ff6010'], 'uncommon', 'It swam out of a volcano. On purpose.', { pattern: P.cracks, glow: 0.5 }),
  S('hellfire', 'emberhorse', 'Ember Seahorse', 'seahorse', [0, 80], 0.4, ['#ff6a20', '#ffd0a0', '#ffff60'], 'uncommon', 'A little flame that swims.', { time: 'night', glow: 0.8 }),
  S('hellfire', 'pitsiren', 'Siren of the Pit', 'seahorse', [10, 120], 0.8, ['#ff4a8a', '#ffc0e0', '#70ff40'], 'rare', 'Sings beautifully. Bites harder.', { glow: 0.4 }),
  S('hellfire', 'felmanta', 'Fel Manta', 'ray', [20, 150], 2.8, ['#2a0a0a', '#c04020', '#70ff40'], 'rare', 'Has wings. Uses them to swim. Why not.'),
  S('hellfire', 'pitpup', 'Pit Lord Pup', 'dunkle', [40, 150], 2.4, ['#4a1a10', '#c06040', '#60ff30'], 'epic', "The pit lord's pet. It's a good boy.", { glow: 0.3 }),
  S('hellfire', 'doomgill', 'Doomgill', 'shark', [30, 150], 3.4, ['#3a0a0a', '#a03020', '#80ff40'], 'legendary', 'Guards the fire. Eats the unworthy.', { pattern: P.cracks, glow: 0.6 }),
  S('hellfire', 'pitlord', 'The Pit Lord', 'dunkle', [60, 150], 11, ['#3a0a05', '#c04020', '#70ff30'], 'boss', 'Chained beneath the shallows for ten thousand years. Hungry.', { pattern: P.cracks, glow: 0.8 }),
  // ---------------------------------------------------------------- The Nether Drift (L16)
  S('nether', 'skyfish', 'Drifting Skyfish', 'slim', [0, 200], 0.4, ['#6ab0ff', '#e0f0ff', '#ffffff'], 'common', "Swims in the sky and the sea. Can't decide.", { school: 6 }),
  S('nether', 'warpeel', 'Warp Eel', 'eel', [30, 600], 2.0, ['#3a2a8a', '#a0a0ff', '#40e0ff'], 'uncommon', 'Teleports randomly. Mostly into your net.', { glow: 0.5 }),
  S('nether', 'aurorajelly', 'Aurora Jelly', 'jelly', [10, 400], 1.2, ['#40ffc0', '#a0fff0', '#ff80ff'], 'uncommon', 'Glows every color of the aurora.', { glow: 0.9 }),
  S('nether', 'voidwalker', 'Voidwalker', 'octopus', [100, 900], 2.5, ['#1a1a4a', '#6a6ab0', '#a0e0ff'], 'rare', 'Walks between worlds. Swims too.', { glow: 0.4, pattern: P.stars }),
  S('nether', 'etherray', 'Ether Ray', 'ray', [50, 700], 3, ['#8ab0ff', '#ffffff', '#ffd0ff'], 'rare', 'Made of starlight and bad decisions.', { glow: 0.6 }),
  S('nether', 'manawyrm', 'Mana Wyrm', 'drake', [100, 1000], 3.8, ['#3a60ff', '#c0d0ff', '#ff60ff'], 'epic', 'Feeds on magic. Your bait is magic now.', { glow: 0.8 }),
  S('nether', 'islandturtle', 'Island Turtle', 'turtle', [0, 500], 8, ['#5a5a4a', '#a0a080', '#40ff80'], 'epic', 'There is a tiny island on its back. With a tiny tree.'),
  S('nether', 'netherdragon', 'Nether Dragon', 'drake', [300, 1100], 9, ['#1a0a3a', '#8a60c0', '#60ffa0'], 'legendary', 'Once burned a world. Now it just wants a nap.', { glow: 0.8 }),
  S('nether', 'netherwyrm', 'The Nether Wyrm', 'drake', [300, 1100], 18, ['#0a0a30', '#6a40c0', '#40ffc0'], 'boss', 'Coils around the floating islands. Sometimes it eats one.', { glow: 1.0, pattern: P.stars }),
  // ---------------------------------------------------------------- The Black Gate (L17)
  S('blackgate', 'gateminnow', 'Gatekeeper Minnow', 'slim', [0, 300], 0.35, ['#1a2a1a', '#6a8a6a', '#80ff40'], 'common', 'Checks your ticket. You do not have a ticket.', { school: 6, glow: 0.4 }),
  S('blackgate', 'skullfish', 'Skull Fish', 'bonefish', [50, 1200], 0.9, ['#d0d0c0', '#ffffff', '#60ff40'], 'common', 'Huge death metal fan.', { glow: 0.3 }),
  S('blackgate', 'felguard', 'Felguard Grouper', 'round', [100, 1500], 2, ['#2a3a1a', '#8aa060', '#80ff40'], 'uncommon', 'Stands guard. Floats guard, technically.', { pattern: P.cracks, glow: 0.5 }),
  S('blackgate', 'doomjelly', 'Doom Jelly', 'jelly', [50, 1500], 1.4, ['#40ff40', '#a0ffa0', '#000000'], 'common', 'Doom, but squishy.', { glow: 1, hazard: 'sting' }),
  S('blackgate', 'demonray', 'Demon Ray', 'ray', [200, 1800], 3.2, ['#1a0a0a', '#6a2a2a', '#80ff40'], 'rare', 'Horns on a ray. Unfair, frankly.', { glow: 0.5 }),
  S('blackgate', 'annihilan', 'Annihilan Shark', 'shark', [300, 2000], 5, ['#2a1a0a', '#8a6a4a', '#80ff40'], 'rare', 'Annihilates. It is right there in the name.', { pattern: P.cracks, glow: 0.6 }),
  S('blackgate', 'gateeye', 'Eye of the Gate', 'eyeball', [500, 2100], 2, ['#0a0a0a', '#3a3a3a', '#80ff40'], 'epic', 'It opened. It saw you.', { pattern: P.eyes, glow: 0.9 }),
  S('blackgate', 'legion', 'Legion Serpent', 'serpent', [600, 2100], 12, ['#1a2a0a', '#5a8a3a', '#a0ff40'], 'legendary', 'There are many of it. All of it is hungry.', { glow: 0.7 }),
  S('blackgate', 'gatelord', 'Lord of the Black Gate', 'dunkle', [600, 2100], 16, ['#0a0a05', '#3a4a2a', '#80ff30'], 'boss', 'It opened the gate. It would like to close it on you.', { pattern: P.cracks, glow: 1.0 }),

  // ================================================================ REALM IV: SELENE
  // ---------------------------------------------------------------- Mare Serenitatis (L18)
  S('lopen', 'moonfish', 'Moonfish', 'round', [0, 200], 0.6, ['#d0d0e0', '#ffffff', '#a0b0ff'], 'common', 'Waxes and wanes.', { school: 5 }),
  S('lopen', 'cheesepuffer', 'Cheese Puffer', 'round', [10, 300], 0.5, ['#ffe070', '#fff4c0', '#ffb020'], 'common', 'The moon IS made of cheese. This proves it.', { pattern: P.spots }),
  S('lopen', 'astrojelly', 'Astro Jelly', 'jelly', [0, 400], 1, ['#a0c0ff', '#e0f0ff', '#ffffff'], 'uncommon', 'Floats right out of the water in low gravity.', { glow: 0.7 }),
  S('lopen', 'lunarray', 'Lunar Ray', 'ray', [50, 500], 3, ['#b0b8c8', '#ffffff', '#80c0ff'], 'uncommon', 'Glides in slow motion. Everything does here.'),
  S('lopen', 'regolith', 'Regolith Crab', 'crab', [20, 500], 0.7, ['#8a8a90', '#d0d0d8', '#40c0ff'], 'common', 'Made of moon dust and determination.'),
  S('lopen', 'selenite', 'Selenite Fish', 'crystalfish', [100, 700], 1.2, ['#e0f0ff', '#ffffff', '#a0e0ff'], 'rare', 'Pure crystal. Rings like a bell.', { glow: 0.5 }),
  S('lopen', 'lunarwhale', 'Lunar Whale', 'whale', [0, 500], 16, ['#2a3a6a', '#a0b0e0', '#ffffff'], 'epic', 'Swims between the moon and the stars.', { pattern: P.stars, glow: 0.3 }),
  S('lopen', 'earthrise', 'Earthrise Angelfish', 'tall', [30, 400], 0.9, ['#3a86ff', '#ffffff', '#40c060'], 'legendary', 'Carries a tiny map of Earth on its side.'),
  // ---------------------------------------------------------------- Sea of Tranquility (L18)
  S('tranquil', 'apollo', 'Apollo Anchovy', 'slim', [0, 120], 0.3, ['#c0c8d0', '#ffffff', '#ff3030'], 'common', 'One small fish, one giant school.', { pattern: P.stripes, school: 8 }),
  S('tranquil', 'rovercrab', 'Rover Crab', 'robo', [20, 300], 0.8, ['#c0c0c0', '#f0f0f0', '#ffd040'], 'common', 'Collecting samples. Mostly your bait.'),
  S('tranquil', 'tranquilcarp', 'Tranquil Carp', 'round', [10, 200], 1, ['#a0b8d0', '#f0f4ff', '#ffffff'], 'common', 'Very calm. Suspiciously calm.'),
  S('tranquil', 'dustray', 'Moondust Ray', 'ray', [30, 300], 2, ['#9a9aa0', '#e0e0e8', '#6ab0ff'], 'uncommon', 'Kicks up little clouds of moondust.'),
  S('tranquil', 'leaper', 'Low-G Leaper', 'dolphin', [0, 200], 2, ['#8ab0ff', '#ffffff', '#3a60c0'], 'rare', 'Jumps 40 meters in moon gravity. Show-off.'),
  S('tranquil', 'astrofish', 'Astronaut Fish', 'slim', [0, 300], 0.8, ['#ffffff', '#e0e0e0', '#ff8a20'], 'rare', 'Wears a tiny helmet. Nobody knows how.'),
  S('tranquil', 'eagleray', 'Lunar Eagle Ray', 'ray', [50, 300], 3.6, ['#d8d8e0', '#ffffff', '#ffd040'], 'epic', 'The Eagle has landed. In your cooler.'),
  S('tranquil', 'tranquilkoi', 'Tranquility Koi', 'tall', [100, 300], 1.4, ['#ffffff', '#ffe0e0', '#ff4040'], 'legendary', 'So peaceful it makes other fish nap.', { glow: 0.3, pattern: P.spots }),
  S('tranquil', 'moonkraken', 'The Moon Kraken', 'octopus', [150, 300], 12, ['#6a7080', '#c0c8d8', '#80c0ff'], 'boss', 'It thinks your boat is a moon lander. It collects those.', { glow: 0.3 }),
  // ---------------------------------------------------------------- Crater Lakes (L19)
  S('craters', 'craterguppy', 'Crater Guppy', 'slim', [0, 300], 0.3, ['#60e0ff', '#e0ffff', '#ffffff'], 'common', 'Lives in a crater. Likes it there.', { school: 7, glow: 0.3 }),
  S('craters', 'ejectaeel', 'Ejecta Eel', 'eel', [100, 1200], 1.8, ['#6a6a70', '#c0c0c8', '#60e0ff'], 'uncommon', 'Got launched here by an impact. Stayed.', { glow: 0.4 }),
  S('craters', 'geodegrouper', 'Geode Grouper', 'round', [200, 1500], 1.6, ['#5a4a6a', '#c0a0e0', '#a060ff'], 'uncommon', 'Rough outside. Sparkly inside.', { pattern: P.stars }),
  S('craters', 'quartzpike', 'Quartz Pike', 'crystalfish', [100, 1400], 1.8, ['#e0e0ff', '#ffffff', '#80d0ff'], 'rare', 'Tell time with it. Probably.', { glow: 0.5 }),
  S('craters', 'craterlobster', 'Crater Lobster', 'lobster', [300, 1800], 1.4, ['#4a5a8a', '#b0c0e0', '#60e0ff'], 'rare', 'Pinches with the force of a small meteor.', { glow: 0.3 }),
  S('craters', 'cosmicammonite', 'Cosmic Ammonite', 'ammonite', [100, 1200], 1.2, ['#a0c0ff', '#ffffff', '#ff80ff'], 'epic', 'Its spiral is a tiny galaxy.', { glow: 0.6, pattern: P.stars }),
  S('craters', 'impactor', 'Impactor Shark', 'shark', [200, 1800], 4, ['#3a3a44', '#a0a0b0', '#60e0ff'], 'epic', 'Hits like a meteor. Usually on purpose.'),
  S('craters', 'craterserpent', 'Crater Serpent', 'serpent', [400, 1800], 9, ['#2a3a5a', '#a0c0e0', '#60e0ff'], 'legendary', 'Coils around entire craters.', { glow: 0.5 }),
  S('craters', 'cratermaker', 'The Crater Maker', 'dunkle', [400, 1800], 14, ['#4a4a54', '#b0b0c0', '#60e0ff'], 'boss', 'Made most of these craters. With its face.', { glow: 0.4 }),
  // ---------------------------------------------------------------- The Dark Side (L20)
  S('darkside', 'shadowfin', 'Shadowfin', 'slim', [0, 800], 0.4, ['#1a1a2a', '#4a4a6a', '#a080ff'], 'common', 'You can only see its fins glowing.', { school: 6, glow: 0.4 }),
  S('darkside', 'moonangler', 'Moon Angler', 'angler', [200, 2500], 1.2, ['#1a1a24', '#3a3a4a', '#a0ffff'], 'uncommon', 'Its lure is a tiny moon.', { glow: 1 }),
  S('darkside', 'monolithfish', 'Monolith Fish', 'robo', [300, 2500], 2, ['#000000', '#1a1a1a', '#ffffff'], 'rare', "It's black, it's a rectangle, and it hums.", { glow: 0.2 }),
  S('darkside', 'eclipseray', 'Eclipse Ray', 'ray', [100, 2000], 3.4, ['#0a0a10', '#ff9a40', '#ffd060'], 'rare', 'A ring of fire around a dark body.', { glow: 0.5 }),
  S('darkside', 'greyfish', 'Grey Alien Fish', 'eyeball', [500, 2500], 1.2, ['#8a9a8a', '#c0d0c0', '#000000'], 'epic', 'Take me to your fisherman.', { pattern: P.eyes }),
  S('darkside', 'farjelly', 'Far Side Jelly', 'jelly', [100, 2500], 1.2, ['#6a60ff', '#c0c0ff', '#ffffff'], 'uncommon', 'Nobody has seen it from the front.', { glow: 1, hazard: 'thief' }),
  S('darkside', 'lunarsquid', 'Lunar Squid', 'squid', [300, 2500], 3, ['#2a2a50', '#8080c0', '#a0ffff'], 'epic', 'Inks moonlight.', { glow: 0.7 }),
  S('darkside', 'darkstar', 'Dark Star', 'crystalfish', [1000, 2500], 2.5, ['#0a0a1a', '#3a3a6a', '#ffffff'], 'legendary', 'A star that stopped shining. Now it swims.', { pattern: P.stars, glow: 1 }),
  S('darkside', 'darksidething', 'The Thing on the Dark Side', 'octopus', [1000, 2500], 18, ['#0a0a14', '#2a2a44', '#a080ff'], 'boss', 'Something rises when the Earth sets.', { pattern: P.eyes, glow: 0.8 }),

  // ================================================================ REALM V: THE NEON DIMENSION
  // ---------------------------------------------------------------- The Grid (L21)
  S('nopen', 'pixelfry', 'Pixel Fry', 'pixel', [0, 150], 0.3, ['#ff40c0', '#ffc0f0', '#40ffff'], 'common', '8 bits of pure fish.', { pattern: P.pixel, school: 8 }),
  S('nopen', 'synthray', 'Synth Ray', 'ray', [20, 300], 2, ['#8a2aff', '#ff80ff', '#40ffff'], 'uncommon', 'Plays a chord when it flaps.', { glow: 0.6 }),
  S('nopen', 'vhseel', 'VHS Eel', 'eel', [30, 300], 1.6, ['#1a1a1a', '#3a3a3a', '#ff4040'], 'uncommon', 'Be kind, rewind.'),
  S('nopen', 'neonjelly', 'Neon Jelly', 'jelly', [10, 300], 1, ['#ff40ff', '#ffa0ff', '#40ffff'], 'common', 'Zaps in six colors.', { glow: 1, hazard: 'sting' }),
  S('nopen', 'robocrab', 'Robo Crab', 'robo', [50, 300], 0.9, ['#a0a0b0', '#e0e0e8', '#40ffff'], 'common', 'Batteries included.'),
  S('nopen', 'chromedolphin', 'Chrome Dolphin', 'dolphin', [0, 120], 2.4, ['#c0c8e0', '#ffffff', '#ff5ab0'], 'rare', 'Reflects everything. Mostly your face.'),
  S('nopen', 'vaporkoi', 'Vaporwave Koi', 'tall', [20, 300], 1.2, ['#ff9ad5', '#a0f0ff', '#ffffff'], 'epic', 'A E S T H E T I C'),
  S('nopen', 'mixtape', 'Mixtape Marlin', 'sword', [30, 300], 3, ['#2a2a3a', '#ff5ab0', '#40ffff'], 'legendary', 'Plays the sickest 80s hits when you reel it in.', { glow: 0.5 }),
  // ---------------------------------------------------------------- Sunset Boulevard (L21)
  S('sunset', 'palmfish', 'Chrome Palm Fish', 'slim', [0, 100], 0.35, ['#ff8ad0', '#ffe0f0', '#ffd040'], 'common', 'Chills under the chrome palms.', { school: 6 }),
  S('sunset', 'coolgrouper', 'Cool Guy Grouper', 'round', [10, 150], 1, ['#ff5ab0', '#ffc0e0', '#000000'], 'common', 'Wears sunglasses. At night.'),
  S('sunset', 'sunsetray', 'Sunset Ray', 'ray', [10, 200], 2.2, ['#ff7a40', '#ffd0a0', '#ff40a0'], 'uncommon', 'Only swims at golden hour. It is always golden hour.', { glow: 0.3 }),
  S('sunset', 'remora', 'Rollerblade Remora', 'slim', [0, 200], 0.6, ['#40ffff', '#ffffff', '#ff40ff'], 'uncommon', 'Hitches rides on chrome dolphins.'),
  S('sunset', 'flamingofish', 'Flamingo Fish', 'seahorse', [0, 150], 0.9, ['#ff80b0', '#ffd0e0', '#ff4080'], 'rare', 'Stands on one fin.'),
  S('sunset', 'discopuffer', 'Disco Puffer', 'round', [20, 200], 0.8, ['#e0e0f0', '#ffffff', '#ff40ff'], 'rare', 'Staying alive, staying alive.', { pattern: P.stars, glow: 0.4 }),
  S('sunset', 'hotrod', 'Hot Rod Barracuda', 'sword', [20, 200], 2.4, ['#ff2a2a', '#ffd040', '#ffffff'], 'epic', 'Goes 0 to 60 in 0.8 seconds.', { pattern: P.stripes }),
  S('sunset', 'outrun', 'Outrun Shark', 'shark', [50, 200], 4, ['#2a0a4a', '#ff5ab0', '#40ffff'], 'legendary', 'Races the sunset every evening. Always wins.', { pattern: P.pixel, glow: 0.6 }),
  S('sunset', 'miamimeg', 'Miami Megalodon', 'shark', [80, 200], 16, ['#ffc0e0', '#ffffff', '#40ffff'], 'boss', 'Pastel suit. Loafers. Teeth.', { pattern: P.stripes, glow: 0.3 }),
  // ---------------------------------------------------------------- Arcade Reef (L22)
  S('arcade', 'chompfish', 'Chomp Fish', 'round', [0, 200], 0.4, ['#ffe020', '#fff0a0', '#000000'], 'common', 'Wakka wakka wakka.', { school: 5 }),
  S('arcade', 'arcadeghost', 'Arcade Ghost', 'jelly', [20, 400], 0.9, ['#ff3030', '#ffa0a0', '#ffffff'], 'uncommon', 'Chases you around the maze. Steals your fish.', { glow: 0.6, hazard: 'thief' }),
  S('arcade', 'blockfish', 'Block Fish', 'pixel', [20, 500], 0.8, ['#40a0ff', '#a0d0ff', '#ff4040'], 'common', 'Fits perfectly in any gap.', { pattern: P.pixel }),
  S('arcade', 'invader', 'Space Invader Squid', 'squid', [50, 600], 1, ['#40ff40', '#a0ffa0', '#ffffff'], 'uncommon', 'Moves left, moves right, moves down.', { pattern: P.pixel, glow: 0.4 }),
  S('arcade', 'highscore', 'High Score Salmon', 'slim', [30, 500], 1.2, ['#ffd040', '#fff0c0', '#ff4040'], 'uncommon', 'Always one point ahead of you.'),
  S('arcade', 'joystickray', 'Joystick Ray', 'ray', [50, 600], 2.4, ['#2a2a2a', '#ff3030', '#ffffff'], 'rare', 'Up, down, left, right, swim.'),
  S('arcade', 'midboss', 'Mid-Boss Bass', 'dunkle', [100, 600], 2.6, ['#6a2aff', '#c0a0ff', '#ffd040'], 'rare', 'Has a health bar. You can see it.'),
  S('arcade', 'pixeldragon', 'Pixel Dragon', 'drake', [200, 600], 6, ['#40ff80', '#c0ffd0', '#ff40ff'], 'epic', 'Breathes 8-bit fire.', { pattern: P.pixel, glow: 0.4 }),
  S('arcade', 'extralife', 'Extra Life Eel', 'eel', [300, 600], 2, ['#40ff40', '#ffffff', '#ff4040'], 'legendary', '1UP!', { glow: 0.8 }),
  S('arcade', 'kongcrab', 'Kong Crab', 'crab', [300, 600], 10, ['#8a4a1a', '#e0b080', '#ff3030'], 'boss', 'Throws barrels. Classic.'),
  // ---------------------------------------------------------------- The Glitch (L23)
  S('glitch', 'missingno', 'MissingNo.', 'pixel', [0, 800], 1, ['#6a6a6a', '#c0c0c0', '#ff40ff'], 'common', 'Do not catch. Seriously. (Catch it.)', { pattern: P.pixel, school: 3 }),
  S('glitch', 'nullpointer', 'Null Pointer', 'slim', [100, 1200], 0.5, ['#000000', '#40ff40', '#40ff40'], 'common', 'It references nothing. Deeply.', { glow: 0.5 }),
  S('glitch', 'bitflipper', 'Bit Flipper', 'ray', [100, 1500], 2, ['#40ff40', '#000000', '#ffffff'], 'uncommon', '01001000 01101001', { glow: 0.5 }),
  S('glitch', 'lagspike', 'Lag Spike', 'shark', [200, 1500], 2.8, ['#ff4040', '#000000', '#ffffff'], 'uncommon', "Teleports around. It's your connection."),
  S('glitch', 'corrupted', 'Corrupted Grouper', 'round', [300, 1500], 2, ['#ff00ff', '#00ff00', '#000000'], 'rare', 'Its save file got corrupted.', { pattern: P.pixel, glow: 0.5 }),
  S('glitch', 'wireframe', 'Wireframe Whale', 'whale', [200, 1500], 12, ['#000000', '#40ff40', '#40ff40'], 'epic', 'Textures failed to load.', { glow: 0.8 }),
  S('glitch', 'bluescreen', 'Blue Screen Ray', 'ray', [500, 1700], 3, ['#1a3aff', '#ffffff', '#ffffff'], 'epic', 'A fatal exception has occurred.'),
  S('glitch', 'rootkit', 'The Root', 'serpent', [700, 1700], 10, ['#000000', '#1a1a1a', '#40ff40'], 'legendary', 'sudo catch fish', { glow: 1 }),
  S('glitch', 'kernelpanic', 'KERNEL PANIC', 'robo', [700, 1700], 14, ['#101010', '#40ff40', '#ff4040'], 'boss', 'Crashes everything it touches.', { pattern: P.pixel, glow: 0.8 }),

  // ================================================================ REALM VI: THE COSMIC MAW
  // ---------------------------------------------------------------- Event Horizon Sea (L24)
  S('mopen', 'cometfish', 'Comet Fish', 'slim', [0, 400], 0.5, ['#a0e0ff', '#ffffff', '#ffd040'], 'common', 'Leaves a sparkly tail.', { school: 6, glow: 0.6 }),
  S('mopen', 'asteroidcrab', 'Asteroid Crab', 'crab', [50, 1500], 1, ['#3a3440', '#8a8090', '#ff9a40'], 'common', 'Hard shell. Harder attitude.', { glow: 0.3 }),
  S('mopen', 'nebulajelly', 'Nebula Bloom', 'jelly', [20, 1000], 1.6, ['#ff60ff', '#60a0ff', '#ffffff'], 'uncommon', 'Where new stars are born. Wobbly.', { glow: 1 }),
  S('mopen', 'quasarray', 'Quasar Ray', 'ray', [100, 1500], 3.5, ['#1a0a3a', '#8060ff', '#ffffff'], 'rare', 'Outshines a thousand galaxies.', { glow: 0.8, pattern: P.stars }),
  S('mopen', 'pulsareel', 'Pulsar Eel', 'eel', [200, 1500], 2.4, ['#ffffff', '#a0c0ff', '#40c0ff'], 'rare', 'Blinks 700 times per second.', { glow: 1 }),
  S('mopen', 'darkmatter', 'Dark Matter Grouper', 'round', [300, 1500], 2.2, ['#050508', '#1a1a2a', '#6a40ff'], 'epic', "You can't see it. It's heavy anyway."),
  S('mopen', 'starwhale', 'Star Whale', 'whale', [0, 1500], 26, ['#0a1040', '#6080ff', '#ffffff'], 'legendary', 'Carries whole solar systems on its back.', { pattern: P.stars, glow: 0.6 }),
  // ---------------------------------------------------------------- The Accretion Rim (L24)
  S('rim', 'plasmaminnow', 'Plasma Minnow', 'slim', [0, 600], 0.35, ['#ffa040', '#fff0c0', '#ffffff'], 'common', 'Hotter than the sun. Literally.', { school: 8, glow: 0.8 }),
  S('rim', 'solarflare', 'Solar Flare Ray', 'ray', [100, 2000], 3, ['#ff6010', '#ffd080', '#ffff60'], 'uncommon', 'Disrupts your radio when it jumps.', { glow: 0.8 }),
  S('rim', 'spaghetti', 'Spaghettified Eel', 'eel', [300, 3000], 6, ['#ff8a40', '#ffd0a0', '#ff4040'], 'uncommon', 'Stretched by tidal forces. Very long now.'),
  S('rim', 'accretioncrab', 'Accretion Crab', 'crab', [500, 3000], 1.4, ['#8a4a1a', '#ffc080', '#ffa040'], 'rare', 'Collects space debris. Mostly your hooks.', { glow: 0.5 }),
  S('rim', 'redgiant', 'Red Giant Grouper', 'round', [600, 3000], 3.4, ['#aa2a10', '#ff9060', '#ffd040'], 'rare', 'In a few billion years it will be a white dwarf.', { pattern: P.cracks, glow: 0.4 }),
  S('rim', 'neutronstar', 'Neutron Starfish', 'starfish', [1000, 3000], 1, ['#ffffff', '#c0e0ff', '#40c0ff'], 'epic', 'A teaspoon of it weighs a billion tons.', { glow: 1 }),
  S('rim', 'hawkingray', 'Hawking Ray', 'ray', [1500, 3300], 4, ['#000000', '#ff9a40', '#ffffff'], 'epic', 'Radiates slowly. Evaporates eventually.', { glow: 0.6 }),
  S('rim', 'supernova', 'Supernova Sailfish', 'sword', [800, 3000], 5, ['#ff4010', '#ffd040', '#ffffff'], 'legendary', 'Explodes with joy when caught. Mostly joy.', { glow: 1 }),
  S('rim', 'suneater', 'The Sun Eater', 'whale', [1500, 3300], 30, ['#3a0a05', '#ff6020', '#ffd040'], 'boss', 'Swallowed a star. Burps plasma.', { pattern: P.cracks, glow: 1 }),
  // ---------------------------------------------------------------- The Maw (L25)
  S('maw', 'wormminnow', 'Wormhole Minnow', 'slim', [0, 1000], 0.4, ['#a060ff', '#ffffff', '#40ffff'], 'common', 'Enters one side of your net, exits the other.', { school: 6, glow: 0.8 }),
  S('maw', 'entropyeel', 'Entropy Eel', 'eel', [500, 5000], 3, ['#2a0a4a', '#8a40ff', '#ffffff'], 'uncommon', 'Things get a little more random around it.', { glow: 0.6 }),
  S('maw', 'eventfish', 'Event Fish', 'eyeball', [1000, 6000], 2, ['#000000', '#ff9a40', '#ffffff'], 'rare', 'The last thing light ever sees.', { pattern: P.eyes, glow: 0.6 }),
  S('maw', 'mawwhale', 'Maw Whale', 'whale', [500, 5000], 20, ['#050010', '#3a1a6a', '#c060ff'], 'epic', 'Lives in the throat of the universe. Cozy.', { glow: 0.5 }),
  S('maw', 'timefish', 'Time Fish', 'crystalfish', [2000, 6000], 1.8, ['#ffe0a0', '#ffffff', '#ffd040'], 'epic', 'Caught it yesterday. Or tomorrow.', { glow: 0.8 }),
  S('maw', 'bigbang', 'Big Bang Bass', 'round', [3000, 6000], 4, ['#ffffff', '#ffd0ff', '#40ffff'], 'legendary', 'Contains the start of a whole new universe.', { pattern: P.stars, glow: 1 }),
  S('maw', 'singularity', 'The Singularity', 'eyeball', [5000, 6000], 3, ['#000000', '#000000', '#ffffff'], 'legendary', 'Infinitely small. Infinitely hungry.', { glow: 1 }),
  S('maw', 'devourer', 'THE DEVOURER', 'serpent', [4000, 6000], 60, ['#050010', '#6a20c0', '#ff60ff'], 'boss', 'The ocean ends in its mouth. So does this story.', { pattern: P.eyes, glow: 1.2 }),

  // ---------------------------------------------------------------- Junk (anywhere)
  S('open', 'boot', 'Old Boot', 'boot', [0, 3000], 0.45, ['#5a3a1a', '#3a2a1a', '#8a6a4a'], 'common', 'Size 11. Left foot. Still looking for the right one.', { junk: true, anywhere: true, v: 2, weight: 0.8, bottom: true }),
  S('open', 'bottle', 'Message in a Bottle', 'bottle', [0, 3000], 0.4, ['#6ad0a0', '#e0fff0', '#f0e0b0'], 'uncommon', "It says 'Help! I'm stuck in a fishing game!' There are pearls inside.", { junk: true, anywhere: true, v: 5, weight: 0.4 }),
  S('open', 'duck', 'Rubber Duck', 'duck', [0, 3000], 0.35, ['#ffd020', '#ffe060', '#ff8a10'], 'rare', 'Squeak. Collectors pay a fortune for these.', { junk: true, anywhere: true, v: 300, weight: 0.12 }),
];

export const speciesById = new Map(SPECIES.map((s) => [s.id, s]));

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8c4cc', uncommon: '#5fd068', rare: '#4aa8ff', epic: '#c070ff', legendary: '#ffb020', boss: '#ff4a4a',
};

export const BOSS_FOR_ZONE = new Map(SPECIES.filter((s) => s.boss).map((s) => [s.zone, s]));

/** Catchable species (the fish log): no hazards. */
export const CATCHABLE = SPECIES.filter((s) => !s.hazard);

import type { ZoneId } from './zones';

export type Archetype = 'slim' | 'tall' | 'round' | 'eel' | 'shark' | 'ray' | 'jelly' | 'squid' | 'angler' | 'whale' | 'sword' | 'eyeball';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const PATTERN = { none: 0, stripes: 1, spots: 2, lateral: 3, stars: 4, veins: 5, eyes: 6 } as const;

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
}

export const ANIM: Record<Archetype, number> = {
  slim: 1, tall: 1, round: 1, shark: 1, sword: 1, angler: 1, eel: 2, whale: 3, ray: 4, jelly: 5, squid: 6, eyeball: 6,
};

const S = (s: Species) => s;

export const SPECIES: Species[] = [
  // ---------------------------------------------------------------- Open Sea
  S({ id: 'sardine', name: 'Silver Sardine', zone: 'open', model: 'slim', depth: [0, 40], weight: 10, value: 4, size: 0.35, kg: 0.2,
    colors: ['#4a7fa8', '#e8f1f5', '#9cc3d9'], pattern: PATTERN.lateral, bait: 0, speed: 3, rarity: 'common', school: 7,
    flavor: 'Comes in a can. Also, apparently, in the ocean.' }),
  S({ id: 'mackerel', name: 'Zippy Mackerel', zone: 'open', model: 'slim', depth: [5, 70], weight: 7, value: 12, size: 0.5, kg: 0.8,
    colors: ['#2d6f8e', '#e6eef0', '#3f8aa8'], pattern: PATTERN.stripes, bait: 0, speed: 4, rarity: 'common', school: 5,
    flavor: 'Has never once been late to anything.' }),
  S({ id: 'flyingfish', name: 'Flappy Flyingfish', zone: 'open', model: 'slim', depth: [0, 20], weight: 4, value: 22, size: 0.45, kg: 0.5,
    colors: ['#3a78c9', '#dfeaf7', '#7fb8f0'], bait: 1, speed: 5, rarity: 'uncommon',
    flavor: 'Thinks it is a bird. Nobody has the heart to tell it.' }),
  S({ id: 'barracuda', name: 'Bitey Barracuda', zone: 'open', model: 'sword', depth: [15, 110], weight: 3, value: 55, size: 1.2, kg: 8,
    colors: ['#6f8a96', '#dfe7ea', '#4f6a76'], pattern: PATTERN.spots, bait: 1, speed: 5, rarity: 'uncommon',
    flavor: 'All teeth, no manners.' }),
  S({ id: 'moonjelly', name: 'Moon Jelly', zone: 'open', model: 'jelly', depth: [3, 80], weight: 3, value: 0, size: 0.8, kg: 0.3,
    colors: ['#cfe6ff', '#a7c8f0', '#e6f0ff'], glow: 0.35, bait: 0, speed: 0.6, rarity: 'common', hazard: 'sting',
    flavor: 'Stings anything on your hook. Steer clear!' }),
  S({ id: 'mola', name: 'Mola Mola', zone: 'open', model: 'tall', depth: [20, 140], weight: 0.6, value: 380, size: 1.9, kg: 60,
    colors: ['#8d9aa3', '#dcdfe0', '#77838c'], bait: 2, speed: 1.5, rarity: 'rare',
    flavor: 'A giant swimming head. Very chill. Very heavy.' }),

  // ---------------------------------------------------------------- Sunny Shallows
  S({ id: 'clown', name: 'Clown Buddy', zone: 'shallows', model: 'tall', depth: [0, 25], weight: 8, value: 9, size: 0.3, kg: 0.2,
    colors: ['#ff7a1a', '#ff9a3c', '#ff6a10'], pattern: PATTERN.stripes, bait: 0, speed: 2.5, rarity: 'common',
    flavor: 'Tells the same three jokes. Still funny.' }),
  S({ id: 'snapper', name: 'Blushing Snapper', zone: 'shallows', model: 'tall', depth: [4, 38], weight: 6, value: 16, size: 0.6, kg: 2,
    colors: ['#e0485a', '#ffb3a7', '#d63a4a'], bait: 0, speed: 3, rarity: 'common',
    flavor: 'Embarrassed to be caught. Blushes permanently.' }),
  S({ id: 'puffer', name: 'Puffy McPuff', zone: 'shallows', model: 'round', depth: [5, 40], weight: 4, value: 24, size: 0.45, kg: 1.5,
    colors: ['#e8c35a', '#fff4d6', '#c99a3a'], pattern: PATTERN.spots, bait: 0, speed: 1.8, rarity: 'uncommon',
    flavor: 'Holds its breath when nervous. Always nervous.' }),
  S({ id: 'tang', name: 'Blue Tang', zone: 'shallows', model: 'tall', depth: [2, 30], weight: 5, value: 14, size: 0.35, kg: 0.4,
    colors: ['#2a5fd8', '#3a7fe8', '#ffd21a'], bait: 0, speed: 3, rarity: 'common',
    flavor: 'Forgot why it swam over here.' }),
  S({ id: 'stinger', name: 'Pink Stinger', zone: 'shallows', model: 'jelly', depth: [5, 40], weight: 2.5, value: 0, size: 0.7, kg: 0.3,
    colors: ['#ff8fc8', '#ff6ab0', '#ffc0e0'], glow: 0.4, bait: 0, speed: 0.5, rarity: 'common', hazard: 'sting',
    flavor: 'Cute. Evil. Steals your fish with a zap.' }),
  S({ id: 'grouper', name: 'Grumpy Grouper', zone: 'shallows', model: 'tall', depth: [18, 45], weight: 1.2, value: 85, size: 1.3, kg: 18,
    colors: ['#6b7f4a', '#c9c29a', '#55663a'], pattern: PATTERN.spots, bait: 1, speed: 2, rarity: 'rare',
    flavor: 'Has been grumpy since 1987. Nobody knows why.' }),
  S({ id: 'guppyking', name: 'Golden Guppy King', zone: 'shallows', model: 'slim', depth: [22, 45], weight: 0.15, value: 450, size: 0.8, kg: 3,
    colors: ['#ffcf3a', '#fff0a0', '#ffa81a'], glow: 0.6, bait: 1, speed: 4, rarity: 'legendary',
    flavor: 'Rules the shallows with a tiny golden fin.' }),

  // ---------------------------------------------------------------- Kelp Coast
  S({ id: 'garibaldi', name: 'Garibaldi', zone: 'kelp', model: 'tall', depth: [0, 50], weight: 7, value: 28, size: 0.35, kg: 0.6,
    colors: ['#ff6a13', '#ff8a33', '#ff5a00'], bait: 1, speed: 2.5, rarity: 'common',
    flavor: 'The bright orange mayor of Kelp Town.' }),
  S({ id: 'kelpbass', name: 'Kelp Bass', zone: 'kelp', model: 'slim', depth: [5, 70], weight: 7, value: 36, size: 0.6, kg: 2,
    colors: ['#5e6b3a', '#d8d0a0', '#4a5528'], pattern: PATTERN.spots, bait: 1, speed: 3, rarity: 'common', school: 4,
    flavor: 'Camouflaged as a salad.' }),
  S({ id: 'wolfeel', name: 'Wolf Eel', zone: 'kelp', model: 'eel', depth: [30, 95], weight: 3, value: 95, size: 1.8, kg: 6,
    colors: ['#7a6a5a', '#b8a890', '#6a5a4a'], pattern: PATTERN.spots, bait: 1, speed: 2, rarity: 'uncommon',
    flavor: 'Face only a mother could love. She does, a lot.' }),
  S({ id: 'seadragon', name: 'Leafy Seadragon', zone: 'kelp', model: 'eel', depth: [10, 60], weight: 1, value: 260, size: 0.5, kg: 0.3,
    colors: ['#d9b23a', '#f2d78a', '#a8c94a'], bait: 2, speed: 1.2, rarity: 'rare',
    flavor: 'A dragon made of salad. Majestic.' }),
  S({ id: 'kelpjelly', name: 'Tangle Jelly', zone: 'kelp', model: 'jelly', depth: [10, 90], weight: 2.5, value: 0, size: 0.9, kg: 0.4,
    colors: ['#b8e070', '#8ac040', '#d8f0a0'], glow: 0.4, bait: 0, speed: 0.5, rarity: 'common', hazard: 'sting',
    flavor: 'Tangles lines, steals fish, feels nothing.' }),
  S({ id: 'seabass', name: 'Giant Sea Bass', zone: 'kelp', model: 'tall', depth: [45, 95], weight: 0.8, value: 520, size: 2.1, kg: 90,
    colors: ['#3a3f48', '#8a8f98', '#2a2f38'], pattern: PATTERN.spots, bait: 2, speed: 1.6, rarity: 'epic',
    flavor: 'The size of a sofa. The attitude of a sofa.' }),
  S({ id: 'emeraldmoray', name: 'Emerald Moray', zone: 'kelp', model: 'eel', depth: [60, 95], weight: 0.15, value: 1600, size: 2.2, kg: 20,
    colors: ['#1fa860', '#7ff0a8', '#0f8040'], glow: 0.8, pattern: PATTERN.spots, bait: 2, speed: 2.5, rarity: 'legendary',
    flavor: 'Glows like a gemstone. Bites like a gem thief.' }),

  // ---------------------------------------------------------------- Deep Blue
  S({ id: 'tuna', name: 'Yellowfin Tuna', zone: 'deepblue', model: 'slim', depth: [15, 160], weight: 7, value: 140, size: 1.5, kg: 25,
    colors: ['#1f3e7a', '#e8e8f0', '#ffd23a'], bait: 2, speed: 5, rarity: 'common', school: 4,
    flavor: 'Built like a torpedo. Tastes like... no, we release those. Mostly.' }),
  S({ id: 'mahi', name: 'Mahi-Mahi', zone: 'deepblue', model: 'tall', depth: [0, 90], weight: 6, value: 120, size: 1.1, kg: 12,
    colors: ['#2fb36b', '#f5e04a', '#3aa0e0'], pattern: PATTERN.spots, bait: 2, speed: 4.5, rarity: 'common',
    flavor: 'So nice they named it twice.' }),
  S({ id: 'lantern', name: 'Lanternfish', zone: 'deepblue', model: 'slim', depth: [150, 340], weight: 7, value: 70, size: 0.3, kg: 0.1,
    colors: ['#1a2a4a', '#3a5a8a', '#6ad0ff'], glow: 1.2, pattern: PATTERN.lateral, bait: 2, speed: 3, rarity: 'common', school: 8,
    flavor: 'Brings its own night light.' }),
  S({ id: 'manta', name: 'Manta Ray', zone: 'deepblue', model: 'ray', depth: [40, 250], weight: 2, value: 420, size: 3.2, kg: 70,
    colors: ['#20283a', '#f0f0f0', '#101828'], bait: 2, speed: 2.5, rarity: 'uncommon',
    flavor: 'Flies through water like a majestic bath towel.' }),
  S({ id: 'hammer', name: 'Hammerhead', zone: 'deepblue', model: 'shark', depth: [30, 300], weight: 1.5, value: 0, size: 3, kg: 150,
    colors: ['#6f7f8f', '#e8eef0', '#5f6f7f'], bait: 0, speed: 5, rarity: 'uncommon', hazard: 'thief',
    flavor: 'Steals fish right off your hook. Rude.' }),
  S({ id: 'swordfish', name: 'Swordfish', zone: 'deepblue', model: 'sword', depth: [80, 320], weight: 1.4, value: 680, size: 2.6, kg: 65,
    colors: ['#3a4a6a', '#d0d8e0', '#2a3a5a'], bait: 3, speed: 6, rarity: 'rare',
    flavor: 'En garde!' }),
  S({ id: 'marlin', name: 'Blue Marlin', zone: 'deepblue', model: 'sword', depth: [150, 340], weight: 0.12, value: 4200, size: 3.4, kg: 150,
    colors: ['#1a5ad8', '#e0ecff', '#3a8aff'], glow: 0.5, pattern: PATTERN.stripes, bait: 3, speed: 7, rarity: 'legendary',
    flavor: 'The old man and the sea wishes he had this one.' }),

  // ---------------------------------------------------------------- Frostbite Fjord
  S({ id: 'cod', name: 'Arctic Cod', zone: 'frost', model: 'slim', depth: [5, 150], weight: 8, value: 190, size: 0.7, kg: 3,
    colors: ['#8a9a7a', '#f0f0e8', '#7a8a6a'], pattern: PATTERN.spots, bait: 3, speed: 3, rarity: 'common', school: 5,
    flavor: 'Wears a tiny invisible scarf.' }),
  S({ id: 'icefish', name: 'Glassy Icefish', zone: 'frost', model: 'slim', depth: [20, 200], weight: 5, value: 340, size: 0.6, kg: 1,
    colors: ['#dff4ff', '#ffffff', '#b8e4ff'], glow: 0.5, bait: 3, speed: 3, rarity: 'uncommon',
    flavor: 'Has antifreeze for blood. Literally.' }),
  S({ id: 'snowsquid', name: 'Snow Squid', zone: 'frost', model: 'squid', depth: [60, 240], weight: 3, value: 520, size: 1.2, kg: 8,
    colors: ['#e8f4ff', '#ffffff', '#b8d8f0'], glow: 0.3, bait: 3, speed: 3.5, rarity: 'uncommon',
    flavor: 'Inks in white. Very confusing for everyone.' }),
  S({ id: 'halibut', name: 'Glacier Halibut', zone: 'frost', model: 'ray', depth: [120, 240], weight: 2, value: 820, size: 1.8, kg: 40,
    colors: ['#9aa0a8', '#f4f4f4', '#7a8088'], pattern: PATTERN.spots, bait: 3, speed: 2, rarity: 'rare',
    flavor: 'Flat as a pancake, cold as a freezer.' }),
  S({ id: 'frostjelly', name: 'Frost Jelly', zone: 'frost', model: 'jelly', depth: [10, 200], weight: 2.5, value: 0, size: 1, kg: 0.5,
    colors: ['#aee8ff', '#7fd0ff', '#dff6ff'], glow: 0.8, bait: 0, speed: 0.5, rarity: 'common', hazard: 'sting',
    flavor: 'Freezes your catch clean off the hook.' }),
  S({ id: 'narwhal', name: 'Narwhal Fish', zone: 'frost', model: 'sword', depth: [80, 240], weight: 1, value: 1500, size: 2.4, kg: 60,
    colors: ['#a8b8c8', '#e8eef4', '#8898a8'], pattern: PATTERN.spots, bait: 4, speed: 4, rarity: 'epic',
    flavor: 'The unicorn of the sea. Might grant wishes. Probably not.' }),
  S({ id: 'yetiwhale', name: 'Yeti Whale', zone: 'frost', model: 'whale', depth: [180, 240], weight: 0.12, value: 13000, size: 6, kg: 900,
    colors: ['#f0f4f8', '#ffffff', '#d0dce8'], glow: 0.3, bait: 4, speed: 2.5, rarity: 'legendary',
    flavor: 'Fluffy. Enormous. Sings sea shanties.' }),

  // ---------------------------------------------------------------- Magma Rift
  S({ id: 'ember', name: 'Ember Minnow', zone: 'magma', model: 'slim', depth: [5, 200], weight: 8, value: 420, size: 0.35, kg: 0.3,
    colors: ['#ff5a1a', '#ffb04a', '#ff3a00'], glow: 1.2, bait: 4, speed: 4, rarity: 'common', school: 8,
    flavor: 'Toasty. Handle with oven mitts.' }),
  S({ id: 'magmapuffer', name: 'Magma Puffer', zone: 'magma', model: 'round', depth: [30, 300], weight: 4, value: 1200, size: 0.8, kg: 5,
    colors: ['#3a2a2a', '#5a3a2a', '#ff7a1a'], pattern: PATTERN.veins, bait: 4, speed: 1.8, rarity: 'uncommon',
    flavor: 'Puffs up into a tiny volcano. Pop!' }),
  S({ id: 'obsidian', name: 'Obsidian Bass', zone: 'magma', model: 'tall', depth: [60, 380], weight: 4, value: 1800, size: 1, kg: 15,
    colors: ['#1a1a24', '#3a3a48', '#ff4a1a'], pattern: PATTERN.veins, bait: 4, speed: 3, rarity: 'uncommon',
    flavor: 'Sharp enough to cut glass. Is glass.' }),
  S({ id: 'lavaeel', name: 'Lava Eel', zone: 'magma', model: 'eel', depth: [150, 430], weight: 2.5, value: 2600, size: 2.4, kg: 25,
    colors: ['#2a1a1a', '#4a2a1a', '#ff6a00'], pattern: PATTERN.veins, glow: 0.2, bait: 4, speed: 3, rarity: 'rare',
    flavor: 'A river of lava that learned to wiggle.' }),
  S({ id: 'salamander', name: 'Salamander Shark', zone: 'magma', model: 'shark', depth: [40, 400], weight: 1.4, value: 0, size: 3.4, kg: 200,
    colors: ['#6a2a1a', '#ffb04a', '#ff5a1a'], pattern: PATTERN.veins, bait: 0, speed: 5.5, rarity: 'uncommon', hazard: 'thief',
    flavor: 'Chomps fish off your hook, then chomps the hook.' }),
  S({ id: 'firejelly', name: 'Fire Jelly', zone: 'magma', model: 'jelly', depth: [10, 400], weight: 2.5, value: 0, size: 1.1, kg: 0.5,
    colors: ['#ff8a2a', '#ff5a10', '#ffd07a'], glow: 1.4, bait: 0, speed: 0.6, rarity: 'common', hazard: 'sting',
    flavor: 'A floating campfire that hates you.' }),
  S({ id: 'phoenixkoi', name: 'Phoenix Koi', zone: 'magma', model: 'slim', depth: [300, 430], weight: 0.1, value: 32000, size: 1.6, kg: 30,
    colors: ['#ff3a1a', '#ffd23a', '#ff8a1a'], glow: 1.6, pattern: PATTERN.veins, bait: 5, speed: 5, rarity: 'legendary',
    flavor: 'Reborn from its own ashes every Tuesday.' }),

  // ---------------------------------------------------------------- Drowned Temple
  S({ id: 'whisper', name: 'Whispering Anchovy', zone: 'temple', model: 'slim', depth: [5, 300], weight: 8, value: 1500, size: 0.3, kg: 0.2,
    colors: ['#4a5a4a', '#8aa08a', '#90ff80'], glow: 0.6, pattern: PATTERN.lateral, bait: 5, speed: 3.5, rarity: 'common', school: 8,
    flavor: 'Whispers your name. You never told it your name.' }),
  S({ id: 'manyeyed', name: 'Many-Eyed Grouper', zone: 'temple', model: 'round', depth: [60, 450], weight: 4, value: 5200, size: 1.3, kg: 30,
    colors: ['#3a4a3a', '#5a6a50', '#c0ff80'], pattern: PATTERN.eyes, bait: 5, speed: 1.8, rarity: 'uncommon',
    flavor: 'It sees you. It sees you from several angles.' }),
  S({ id: 'lurker', name: 'Lurking Angler', zone: 'temple', model: 'angler', depth: [150, 650], weight: 3, value: 8200, size: 1.4, kg: 35,
    colors: ['#1a2a24', '#2a3a30', '#7aff9a'], glow: 0.2, bait: 5, speed: 2, rarity: 'rare',
    flavor: 'Its little light says "trust me".' }),
  S({ id: 'eye', name: 'Floating Eye', zone: 'temple', model: 'eyeball', depth: [100, 600], weight: 2, value: 12000, size: 1.2, kg: 20,
    colors: ['#f0e8d8', '#7aff5a', '#8a5a6a'], glow: 0.3, bait: 5, speed: 1.5, rarity: 'rare',
    flavor: 'Blinks when you are not looking.' }),
  S({ id: 'deepsquid', name: 'Deep One Squid', zone: 'temple', model: 'squid', depth: [200, 650], weight: 2, value: 9500, size: 2.4, kg: 50,
    colors: ['#2a4a3a', '#4a7a5a', '#90ffb0'], glow: 0.5, bait: 5, speed: 3, rarity: 'rare',
    flavor: 'Knows a guy. The guy is very large and sleeps under a temple.' }),
  S({ id: 'horror', name: 'Tentacle Horror', zone: 'temple', model: 'squid', depth: [60, 650], weight: 1.8, value: 0, size: 4, kg: 300,
    colors: ['#3a1a3a', '#6a3a6a', '#c070ff'], glow: 0.4, bait: 0, speed: 4.5, rarity: 'uncommon', hazard: 'thief',
    flavor: 'Grabs fish off your line with all eight hands.' }),
  S({ id: 'spawn', name: 'Spawn of Cthulhu', zone: 'temple', model: 'squid', depth: [450, 650], weight: 0.08, value: 125000, size: 5, kg: 700,
    colors: ['#2a6a4a', '#5aa07a', '#60ff90'], glow: 1.2, pattern: PATTERN.eyes, bait: 6, speed: 3, rarity: 'legendary',
    flavor: 'Ph\'nglui mglw\'nafh... it\'s just a baby. A very big baby.' }),

  // ---------------------------------------------------------------- The Void
  S({ id: 'stardust', name: 'Stardust Minnow', zone: 'void', model: 'slim', depth: [0, 800], weight: 8, value: 5200, size: 0.35, kg: 0.1,
    colors: ['#5a3ad0', '#b8a0ff', '#ffffff'], pattern: PATTERN.stars, glow: 0.9, bait: 6, speed: 4, rarity: 'common', school: 9,
    flavor: 'Made of the same stuff as you. Mostly sparkles.' }),
  S({ id: 'comet', name: 'Comet Tetra', zone: 'void', model: 'slim', depth: [50, 1200], weight: 5, value: 9000, size: 0.5, kg: 0.3,
    colors: ['#6ad0ff', '#ffffff', '#ffe07a'], glow: 1.8, bait: 6, speed: 7, rarity: 'uncommon',
    flavor: 'Leaves a tail. Makes wishes come true (unverified).' }),
  S({ id: 'nebjelly', name: 'Nebula Jelly', zone: 'void', model: 'jelly', depth: [100, 1500], weight: 3, value: 16000, size: 1.6, kg: 2,
    colors: ['#c060ff', '#40c0ff', '#ff70d0'], glow: 1.5, pattern: PATTERN.stars, bait: 6, speed: 0.8, rarity: 'rare',
    flavor: 'A whole galaxy, wobbling. Friendly, for once.' }),
  S({ id: 'moonray', name: 'Moon Ray', zone: 'void', model: 'ray', depth: [200, 1500], weight: 2, value: 31000, size: 3.5, kg: 80,
    colors: ['#d8d8f0', '#ffffff', '#a0a0d0'], glow: 0.6, pattern: PATTERN.spots, bait: 6, speed: 3, rarity: 'rare',
    flavor: 'Has craters. Controls a very small tide.' }),
  S({ id: 'holepuffer', name: 'Black Hole Puffer', zone: 'void', model: 'round', depth: [400, 2000], weight: 1.2, value: 52000, size: 1.5, kg: 999,
    colors: ['#05050a', '#140a28', '#a060ff'], glow: 0.2, pattern: PATTERN.stars, bait: 6, speed: 1.5, rarity: 'epic',
    flavor: 'Infinitely dense. Please lift with your legs.' }),
  S({ id: 'voidmaw', name: 'Void Maw', zone: 'void', model: 'angler', depth: [100, 2000], weight: 1.6, value: 0, size: 3, kg: 500,
    colors: ['#000000', '#140a28', '#ff3a8a'], glow: 0.5, bait: 0, speed: 5, rarity: 'uncommon', hazard: 'thief',
    flavor: 'A mouth. In space. Eats your fish. Why not.' }),
  S({ id: 'spacewhale', name: 'Cosmic Space Whale', zone: 'void', model: 'whale', depth: [800, 2400], weight: 0.08, value: 780000, size: 12, kg: 5000,
    colors: ['#1a0a4a', '#6a4ad0', '#ff70d0'], glow: 0.8, pattern: PATTERN.stars, bait: 6, speed: 3, rarity: 'legendary',
    flavor: 'The end of the journey. It has been waiting for you.' }),
];

export const speciesById = new Map(SPECIES.map((s) => [s.id, s]));

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8c4cc', uncommon: '#5fd068', rare: '#4aa8ff', epic: '#c070ff', legendary: '#ffb020',
};

/** Which species can appear at a point: zone list plus a trickle of open-sea fish at zone edges. */
export function speciesForZone(zone: ZoneId): Species[] {
  return SPECIES.filter((s) => s.zone === zone);
}

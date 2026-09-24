import { smoothstep } from '../engine/math';

export type RealmId = 'blue' | 'jurassic' | 'shattered' | 'selene' | 'neon' | 'maw';
export type ZoneId = 'open' | 'shallows' | 'kelp' | 'coral' | 'deepblue' | 'frost' | 'candy' | 'toxic' | 'magma' | 'storm' | 'pirate' | 'atlantis' | 'temple' | 'void'
  | 'jopen' | 'fern' | 'tarpit' | 'crater'
  | 'sopen' | 'hellfire' | 'nether' | 'blackgate'
  | 'lopen' | 'tranquil' | 'craters' | 'darkside'
  | 'nopen' | 'sunset' | 'arcade' | 'glitch'
  | 'mopen' | 'rim' | 'maw';

export interface ZoneEnv {
  skyTop: string; skyHorizon: string; fog: string; fogDensity: number;
  sun: string; sunIntensity: number; cloud: string; cloudCover: number; stars: number; nebula: number;
  waterShallow: string; waterDeep: string; sparkle: number;
  uw: string; uwDeep: string; uwDensity: number; darkDepth: number; lightFalloff: number; caustics: number;
  ambient: string; ground: string; ambientIntensity: number; waves: number;
  lava: string; lavaStrength: number; voidAmount: number; frost: number; eerie: number;
  /** 1 = permanent storm, pushes the weather */
  storm: number;
  /** underwater floor tint */
  floor: string;
  /** light absorption of the water per meter (low = crystal clear) */
  clarity: number;
  /** sky effects: aurora curtains, synthwave neon, cosmic vortex */
  aurora: number; neon: number; vortex: number;
  /** cloud layer base height (m) and density multiplier */
  cloudBase: number; cloudDensity: number;
}

export interface Zone {
  id: ZoneId;
  realm: RealmId;
  name: string;
  tagline: string;
  x: number;
  z: number;
  radius: number;
  floorDepth: number;
  /** Hull tier needed to enter. */
  hull: number;
  /** Difficulty level; drives fish value, bait requirements and prices. */
  level: number;
  lockedMessage: string;
  env: ZoneEnv;
  mapColor: string;
}

export const BLEND = 110;

const base: ZoneEnv = {
  skyTop: '#3d8fe0', skyHorizon: '#bfe3f7', fog: '#cde9f7', fogDensity: 0.00055,
  sun: '#fff3dc', sunIntensity: 2.4, cloud: '#ffffff', cloudCover: 0.42, stars: 0, nebula: 0,
  waterShallow: '#3fd0d4', waterDeep: '#0f4f8f', sparkle: 1,
  uw: '#1a7fa0', uwDeep: '#031a33', uwDensity: 0.022, darkDepth: 160, lightFalloff: 0.012, caustics: 0.7,
  ambient: '#bcdcff', ground: '#6c8a70', ambientIntensity: 0.75, waves: 1,
  lava: '#ff5a10', lavaStrength: 0, voidAmount: 0, frost: 0, eerie: 0, storm: 0,
  floor: '#b9a57a',
  clarity: 0.075, aurora: 0, neon: 0, vortex: 0, cloudBase: 900, cloudDensity: 1,
};

export const OPEN_SEA: Zone = {
  id: 'open', realm: 'blue', name: 'Open Sea', tagline: 'Endless blue in every direction',
  x: 0, z: 0, radius: 0, floorDepth: 140, hull: 0, level: 0, lockedMessage: '', env: base, mapColor: '#2f78b8',
};

export const ZONES: Zone[] = [
  {
    id: 'shallows', realm: 'blue', name: 'Sunny Shallows', tagline: 'Warm water, happy fish', x: 0, z: 0, radius: 380,
    floorDepth: 38, hull: 0, level: 0, lockedMessage: '', mapColor: '#49d3c9',
    env: { ...base, skyTop: '#4aa3ec', skyHorizon: '#d4f0fa', fog: '#d8f1f8', waterShallow: '#4ee6d0', waterDeep: '#1377a8',
      uw: '#1f93b0', uwDeep: '#0a3f5c', uwDensity: 0.019, darkDepth: 120, waves: 0.7, cloudCover: 0.35, floor: '#e3cf98', caustics: 0.9, clarity: 0.045 },
  },
  {
    id: 'kelp', realm: 'blue', name: 'Kelp Coast', tagline: 'A swaying jungle beneath the waves', x: 720, z: -120, radius: 300,
    floorDepth: 95, hull: 0, level: 1, lockedMessage: '', mapColor: '#3fa66b',
    env: { ...base, skyTop: '#5a9fcf', skyHorizon: '#d8ecd9', fog: '#d3e6d2', waterShallow: '#3cc9a0', waterDeep: '#135f5c',
      uw: '#2f8f78', uwDeep: '#06281f', uwDensity: 0.03, darkDepth: 110, cloudCover: 0.5, floor: '#7f7a52', ground: '#5a7a4a', clarity: 0.1 },
  },
  {
    id: 'coral', realm: 'blue', name: 'Coral Kingdom', tagline: 'A rainbow reef full of royalty', x: 480, z: -700, radius: 270,
    floorDepth: 60, hull: 0, level: 1, lockedMessage: '', mapColor: '#ff8ab0',
    env: { ...base, skyTop: '#3fb0f0', skyHorizon: '#dff6ff', fog: '#e0f6fb', waterShallow: '#3ff0e0', waterDeep: '#1690c0',
      uw: '#22b8c8', uwDeep: '#0a5070', uwDensity: 0.017, darkDepth: 110, floor: '#f0dcb0', caustics: 1.0, waves: 0.6, cloudCover: 0.25, clarity: 0.035 },
  },
  {
    id: 'deepblue', realm: 'blue', name: 'The Deep Blue', tagline: 'Big water. Bigger fish.', x: 260, z: 820, radius: 360,
    floorDepth: 340, hull: 0, level: 2, lockedMessage: '', mapColor: '#1c4fa0',
    env: { ...base, skyTop: '#2f7de0', skyHorizon: '#b8dcf5', fog: '#c4e2f5', waterShallow: '#2aa8d8', waterDeep: '#07306e',
      uw: '#1060a8', uwDeep: '#010a24', uwDensity: 0.016, darkDepth: 200, waves: 1.35, cloudCover: 0.3, lightFalloff: 0.01, floor: '#4f6a8a', clarity: 0.06 },
  },
  {
    id: 'frost', realm: 'blue', name: 'Frostbite Fjord', tagline: 'Brr. The fish here are chill.', x: -280, z: -900, radius: 380,
    floorDepth: 240, hull: 1, level: 3, lockedMessage: 'Thick ice ahead! You need an Ice Breaker hull.', mapColor: '#bfe6f5',
    env: { ...base, skyTop: '#8fb6d8', skyHorizon: '#eaf4fb', fog: '#e6f0f7', fogDensity: 0.0009, sun: '#fff8f0', sunIntensity: 1.9,
      cloud: '#f4f7fa', cloudCover: 0.62, waterShallow: '#7fd6e6', waterDeep: '#2a5f80', uw: '#5aa8c0', uwDeep: '#0a2030',
      uwDensity: 0.025, darkDepth: 150, waves: 0.9, frost: 1, ambient: '#dfeaf5', ground: '#a0b0c0', floor: '#7a8a98', clarity: 0.07, aurora: 1 },
  },
  {
    id: 'candy', realm: 'blue', name: 'Candy Lagoon', tagline: 'Sweet water. Sweeter fish.', x: 1450, z: -900, radius: 360,
    floorDepth: 200, hull: 2, level: 4, lockedMessage: 'The water is too sticky! You need a Sugar-Glazed hull.', mapColor: '#ff9ad5',
    env: { ...base, skyTop: '#ff9ad5', skyHorizon: '#ffe0f0', fog: '#ffd6ec', sun: '#fff0f8', cloud: '#ffffff', cloudCover: 0.55,
      waterShallow: '#ff9ee0', waterDeep: '#b04ab0', uw: '#e070c8', uwDeep: '#4a1050', uwDensity: 0.022, darkDepth: 130,
      ambient: '#ffd0f0', ground: '#c080b0', floor: '#ffd8f0', lava: '#ff60c0', lavaStrength: 0.6, waves: 0.7, clarity: 0.16, cloudBase: 700 },
  },
  {
    id: 'toxic', realm: 'blue', name: 'Toxic Sludge Bay', tagline: 'Glows in the dark. So do the fish.', x: 1900, z: 300, radius: 380,
    floorDepth: 320, hull: 3, level: 5, lockedMessage: 'The sludge eats wood! You need a Hazmat hull.', mapColor: '#8ad030',
    env: { ...base, skyTop: '#6a7a2a', skyHorizon: '#c8d880', fog: '#a8b860', fogDensity: 0.0013, sun: '#e8ff9a', sunIntensity: 1.8,
      cloud: '#8a9a4a', cloudCover: 0.6, waterShallow: '#9aff3a', waterDeep: '#2a4a0a', sparkle: 0.5, uw: '#4a7a1a', uwDeep: '#0a1a02',
      uwDensity: 0.035, darkDepth: 100, ambient: '#c0e080', ground: '#3a4a1a', lava: '#a0ff30', lavaStrength: 1.5, floor: '#3a4020', waves: 0.6, clarity: 0.35, cloudDensity: 1.3 },
  },
  {
    id: 'magma', realm: 'blue', name: 'Magma Rift', tagline: 'The sea boils. The fish are spicy.', x: -960, z: 120, radius: 380,
    floorDepth: 430, hull: 4, level: 6, lockedMessage: 'The water is boiling! You need a Heat Shield hull.', mapColor: '#e0582a',
    env: { ...base, skyTop: '#3a1a1a', skyHorizon: '#c8603a', fog: '#8a4a3a', fogDensity: 0.0012, sun: '#ffb070', sunIntensity: 1.7,
      cloud: '#4a3a3a', cloudCover: 0.68, waterShallow: '#8a4a2a', waterDeep: '#1a1418', sparkle: 0.3, uw: '#4a2418', uwDeep: '#120404',
      uwDensity: 0.03, darkDepth: 150, ambient: '#d08060', ground: '#402020', ambientIntensity: 0.8, waves: 0.8,
      lava: '#ff5a10', lavaStrength: 3, floor: '#2e2422', caustics: 0.35, clarity: 0.3, cloudBase: 1300, cloudDensity: 1.5 },
  },
  {
    id: 'storm', realm: 'blue', name: 'Storm Reach', tagline: 'It never stops raining here. Ever.', x: -500, z: -2000, radius: 460,
    floorDepth: 480, hull: 5, level: 7, lockedMessage: 'The waves would flip you! You need a Storm Keel hull.', mapColor: '#5a6a80',
    env: { ...base, skyTop: '#2a3040', skyHorizon: '#6a7888', fog: '#5a6878', fogDensity: 0.0015, sun: '#c8d0e0', sunIntensity: 1.2,
      cloud: '#3a4250', cloudCover: 0.92, waterShallow: '#3a6070', waterDeep: '#0a1a2a', uw: '#1a3a4a', uwDeep: '#020810',
      uwDensity: 0.028, darkDepth: 120, ambient: '#8a9aaa', ground: '#2a3038', waves: 2.4, storm: 1, floor: '#4a5058', clarity: 0.12, cloudBase: 450, cloudDensity: 2.2 },
  },
  {
    id: 'pirate', realm: 'blue', name: "Pirate's Graveyard", tagline: 'Dead men tell no tales. Dead fish do.', x: -2000, z: -700, radius: 420,
    floorDepth: 520, hull: 6, level: 8, lockedMessage: 'Ghostly fog blocks the way. You need a Ghost Lantern hull.', mapColor: '#4a7a6a',
    env: { ...base, skyTop: '#1a2030', skyHorizon: '#4a5a50', fog: '#3a4a44', fogDensity: 0.0022, sun: '#b0ffd0', sunIntensity: 1.0,
      cloud: '#2a3030', cloudCover: 0.7, waterShallow: '#2a5048', waterDeep: '#081a18', sparkle: 0.3, uw: '#143a34', uwDeep: '#010604',
      uwDensity: 0.032, darkDepth: 100, ambient: '#6a8a7a', ground: '#1a2420', lava: '#50ffb0', lavaStrength: 1.0, eerie: 0.5,
      floor: '#3a3a30', waves: 1.1, caustics: 0.3, clarity: 0.16 },
  },
  {
    id: 'atlantis', realm: 'blue', name: 'Sunken Atlantis', tagline: 'A golden city lost beneath the waves', x: 500, z: 2100, radius: 430,
    floorDepth: 650, hull: 7, level: 9, lockedMessage: 'The pressure down here is huge. You need a Pressure hull.', mapColor: '#e0c060',
    env: { ...base, skyTop: '#3a70c0', skyHorizon: '#c0e0f0', fog: '#b0d8f0', sun: '#fff4d0', waterShallow: '#40d0e0', waterDeep: '#0a3a7a',
      uw: '#1a70a0', uwDeep: '#020a2a', uwDensity: 0.014, darkDepth: 250, floor: '#d8c89a', lava: '#ffd060', lavaStrength: 1.2,
      caustics: 1.0, waves: 0.9, clarity: 0.04 },
  },
  {
    id: 'temple', realm: 'blue', name: 'Drowned Temple', tagline: 'Something ancient stirs below...', x: -1500, z: 1500, radius: 430,
    floorDepth: 900, hull: 8, level: 10, lockedMessage: 'Whispers push you back. You need an Elder Ward hull.', mapColor: '#3f7a5a',
    env: { ...base, skyTop: '#1a2a24', skyHorizon: '#5a7a5a', fog: '#3f5a4a', fogDensity: 0.0016, sun: '#c8ffb0', sunIntensity: 1.2,
      cloud: '#2a3a30', cloudCover: 0.75, waterShallow: '#2a6a50', waterDeep: '#0a1f1a', sparkle: 0.2, uw: '#1a4a38', uwDeep: '#020806',
      uwDensity: 0.034, darkDepth: 90, ambient: '#6a9a7a', ground: '#1a2a20', ambientIntensity: 0.7, waves: 1.2, eerie: 1,
      lava: '#60ff90', lavaStrength: 1.2, floor: '#34423a', caustics: 0.25, lightFalloff: 0.02, clarity: 0.14 },
  },
  {
    id: 'void', realm: 'blue', name: 'The Void', tagline: 'Where the ocean meets the stars', x: 2100, z: 1950, radius: 540,
    floorDepth: 2400, hull: 9, level: 11, lockedMessage: 'Reality thins... You need a Void Anchor hull.', mapColor: '#6a3ad0',
    env: { ...base, skyTop: '#05030f', skyHorizon: '#2a1450', fog: '#140a28', fogDensity: 0.0004, sun: '#d0c0ff', sunIntensity: 1.1,
      cloud: '#1a1030', cloudCover: 0, stars: 1, nebula: 1, waterShallow: '#2a1a5a', waterDeep: '#05020f', sparkle: 2,
      uw: '#1a0a3a', uwDeep: '#000000', uwDensity: 0.012, darkDepth: 220, ambient: '#6a5aa0', ground: '#100820', waves: 0.5,
      voidAmount: 1, lava: '#a060ff', lavaStrength: 1.4, floor: '#150c28', caustics: 0.2, clarity: 0.03 },
  },
];

/** A zone in one of the portal realms. */
const Z = (realm: RealmId, id: ZoneId, name: string, tagline: string, x: number, z: number, radius: number, floorDepth: number,
  hull: number, level: number, lockedMessage: string, mapColor: string, env: Partial<ZoneEnv>): Zone =>
  ({ id, realm, name, tagline, x, z, radius, floorDepth, hull, level, lockedMessage, mapColor, env: { ...base, ...env } });

// ---------------------------------------------------------------- Realm II: Jurassic Tides
const JURASSIC: Partial<ZoneEnv> = {
  skyTop: '#5f9ec8', skyHorizon: '#e8e0b0', fog: '#d8d4a8', fogDensity: 0.0009, sun: '#fff0c8', sunIntensity: 2.5,
  cloud: '#fff8e8', cloudCover: 0.5, waterShallow: '#3fd0b0', waterDeep: '#0f5a60', uw: '#1f8a80', uwDeep: '#04201e',
  ambient: '#d8e8b0', ground: '#6a8a40', floor: '#a89a60', clarity: 0.07, cloudBase: 1100, cloudDensity: 1.2,
};
// ---------------------------------------------------------------- Realm III: The Shattered Expanse
const SHATTERED: Partial<ZoneEnv> = {
  skyTop: '#1a0a2a', skyHorizon: '#5a2a6a', fog: '#3a1a48', fogDensity: 0.0008, sun: '#c8ffa0', sunIntensity: 1.6,
  cloud: '#4a2a5a', cloudCover: 0.35, stars: 0.8, nebula: 0.8, waterShallow: '#4a2a8a', waterDeep: '#0a0418', sparkle: 1.2,
  uw: '#2a1450', uwDeep: '#04010a', uwDensity: 0.022, ambient: '#8a6aa0', ground: '#2a1a30', lava: '#60ff40', lavaStrength: 1.4,
  floor: '#2a2030', aurora: 0.8, clarity: 0.09, cloudBase: 1400, eerie: 0.3,
};
// ---------------------------------------------------------------- Realm IV: Selene
const SELENE: Partial<ZoneEnv> = {
  skyTop: '#000000', skyHorizon: '#141a2a', fog: '#10141e', fogDensity: 0.0003, sun: '#ffffff', sunIntensity: 2.8,
  cloud: '#202430', cloudCover: 0, stars: 1, nebula: 0.25, waterShallow: '#9ab0c8', waterDeep: '#1a2230', sparkle: 2.2,
  uw: '#3a4a60', uwDeep: '#02040a', uwDensity: 0.012, darkDepth: 260, ambient: '#8a96b0', ground: '#3a3e48',
  floor: '#8a8a90', waves: 0.45, clarity: 0.05, caustics: 0.5,
};
// ---------------------------------------------------------------- Realm V: The Neon Dimension
const NEON: Partial<ZoneEnv> = {
  skyTop: '#1a0540', skyHorizon: '#ff5ab0', fog: '#6a1a7a', fogDensity: 0.0006, sun: '#ffb070', sunIntensity: 1.8,
  cloud: '#8a3aa0', cloudCover: 0.2, stars: 0.6, waterShallow: '#5a1a9a', waterDeep: '#0a0220', sparkle: 1.5,
  uw: '#3a0a6a', uwDeep: '#05010f', ambient: '#c080ff', ground: '#3a1050', lava: '#20f0ff', lavaStrength: 1.2,
  floor: '#2a1040', neon: 1, clarity: 0.07, caustics: 0.6, cloudBase: 1600,
};
// ---------------------------------------------------------------- Realm VI: The Cosmic Maw
const MAW: Partial<ZoneEnv> = {
  skyTop: '#02010a', skyHorizon: '#1a0a2a', fog: '#0a0514', fogDensity: 0.00035, sun: '#ffd0a0', sunIntensity: 1.6,
  cloud: '#100818', cloudCover: 0, stars: 1, nebula: 1, waterShallow: '#1a1030', waterDeep: '#000000', sparkle: 2.5,
  uw: '#140a28', uwDeep: '#000000', uwDensity: 0.012, darkDepth: 300, ambient: '#6a5a90', ground: '#0a0610',
  voidAmount: 0.8, lava: '#ff8a30', lavaStrength: 1.3, floor: '#120a1a', vortex: 1, clarity: 0.03, waves: 0.6, caustics: 0.2,
};

export const REALM_ZONES: Zone[] = [
  Z('jurassic', 'fern', 'Fern Lagoon', 'Ferns taller than houses. Fish older than time.', 760, -380, 440, 90, 10, 12,
    'The timeline is unstable here! You need a Chrono Hull.', '#5ac070',
    { ...JURASSIC, waterShallow: '#48e0b0', waterDeep: '#0f6a60', clarity: 0.05, ground: '#5a8a3a', floor: '#b8aa70', caustics: 0.9 }),
  Z('jurassic', 'tarpit', 'The Tar Pits', 'Sticky, stinky, and full of bones.', -860, 520, 440, 260, 11, 13,
    'The tar would swallow your boat! You need a Tar-Proof Hull.', '#4a3a2a',
    { ...JURASSIC, skyTop: '#8a6a4a', skyHorizon: '#e0a060', fog: '#a07850', fogDensity: 0.0013, sun: '#ffc080', cloud: '#a08060',
      cloudCover: 0.7, waterShallow: '#3a3020', waterDeep: '#080604', sparkle: 2.5, uw: '#2a2010', uwDeep: '#020100', uwDensity: 0.04,
      darkDepth: 90, ground: '#3a2a1a', floor: '#2a2018', lava: '#ffa030', lavaStrength: 0.8, clarity: 0.4, waves: 0.4 }),
  Z('jurassic', 'crater', 'Extinction Crater', 'Where the sky fell. It is still falling.', 220, 1350, 540, 900, 12, 14,
    'Meteors are raining down! You need Meteor Plating.', '#d0503a',
    { ...JURASSIC, skyTop: '#4a1a18', skyHorizon: '#ff7040', fog: '#a04a30', fogDensity: 0.0011, sun: '#ffb070', sunIntensity: 2.0,
      cloud: '#6a3a30', cloudCover: 0.6, waterShallow: '#8a4a2a', waterDeep: '#1a0a08', uw: '#4a2014', uwDeep: '#0a0202',
      ground: '#4a2a1a', floor: '#3a2622', lava: '#ff6a10', lavaStrength: 2.4, clarity: 0.22, cloudDensity: 1.4 }),
  Z('shattered', 'hellfire', 'Hellfire Shallows', 'Red earth, green flames, angry fish.', -760, -560, 460, 150, 13, 15,
    'Fel fire scorches the hull! You need a Fel-Warded Hull.', '#e0503a',
    { ...SHATTERED, skyTop: '#3a0a0a', skyHorizon: '#c0502a', fog: '#6a2a20', sun: '#ffd080', sunIntensity: 2.0, cloud: '#6a2a20',
      cloudCover: 0.45, stars: 0.2, nebula: 0.2, waterShallow: '#8a3a1a', waterDeep: '#200604', uw: '#4a1a0a', uwDeep: '#0a0200',
      ground: '#5a2a1a', floor: '#6a3020', lava: '#70ff30', lavaStrength: 2.2, aurora: 0.3, clarity: 0.12 }),
  Z('shattered', 'nether', 'The Nether Drift', 'Islands float. Fish fly. Nothing makes sense.', 960, -220, 500, 700, 14, 16,
    'Gravity flips out here! You need a Levitation Keel.', '#6a4ad0',
    { ...SHATTERED, skyTop: '#0a1a3a', skyHorizon: '#3a6a9a', fog: '#1a3050', waterShallow: '#2a6aa0', waterDeep: '#040a20',
      uw: '#143a6a', uwDeep: '#01030a', ambient: '#7a9ac0', aurora: 1.3, lava: '#40c0ff', floor: '#1a2440', clarity: 0.05 }),
  Z('shattered', 'blackgate', 'The Black Gate', 'A doorway to something that should stay closed.', 60, 1250, 520, 1400, 15, 17,
    'The gate repels the living! You need a Demonsteel Hull.', '#2a3a1a',
    { ...SHATTERED, skyTop: '#050805', skyHorizon: '#1a3a10', fog: '#0a1a08', fogDensity: 0.0012, sun: '#a0ff70', sunIntensity: 1.2,
      waterShallow: '#1a3a10', waterDeep: '#010401', uw: '#0a200a', uwDeep: '#000200', ambient: '#5a8a4a', lava: '#60ff30',
      lavaStrength: 2.6, eerie: 1, floor: '#141a10', aurora: 0.5, clarity: 0.1 }),
  Z('selene', 'tranquil', 'Sea of Tranquility', 'One small cast for a fisher...', 640, 420, 460, 300, 16, 18,
    'No air out here! You need a Vacuum-Sealed Hull.', '#b0b8c8',
    { ...SELENE, waterShallow: '#b0c8e0', waterDeep: '#2a3448' }),
  Z('selene', 'craters', 'Crater Lakes', 'Ancient impacts, now brimming with moon-water.', -860, -320, 500, 1200, 17, 19,
    'The crater walls are too steep! You need a Crater Crawler hull.', '#8a90a0',
    { ...SELENE, waterShallow: '#8adaff', waterDeep: '#0a2440', uw: '#1a4a7a', lava: '#60e0ff', lavaStrength: 1.0, floor: '#707078' }),
  Z('selene', 'darkside', 'The Dark Side', 'The sun never rises here. Something else does.', 180, -1320, 540, 2500, 18, 20,
    'It is too cold and too dark! You need a Lunar Night Hull.', '#20263a',
    { ...SELENE, sunIntensity: 0.6, ambient: '#3a4260', ambientIntensity: 0.45, waterShallow: '#20283a', waterDeep: '#000000',
      uw: '#0a1020', uwDeep: '#000000', darkDepth: 120, lava: '#a080ff', lavaStrength: 1.4, eerie: 0.6, sparkle: 3 }),
  Z('neon', 'sunset', 'Sunset Boulevard', 'Chrome palms. Pink sand. Perfect vibes.', -640, 440, 460, 200, 19, 21,
    'This beach is members only! You need a Chrome Chassis.', '#ff7ab0',
    { ...NEON, skyTop: '#2a0a5a', skyHorizon: '#ff8a70', fog: '#c05a8a', waterShallow: '#ff5ab0', waterDeep: '#2a0a4a', uw: '#8a1a7a',
      floor: '#ff9ad0', clarity: 0.05, lava: '#ff5ae0' }),
  Z('neon', 'arcade', 'Arcade Reef', 'Insert coin. Catch fish. Get high score.', 860, 320, 460, 600, 20, 22,
    'GAME OVER! You need an 8-Bit Hull to continue.', '#3ae0ff',
    { ...NEON, skyTop: '#05051a', skyHorizon: '#3a3aa0', fog: '#1a1a5a', waterShallow: '#1a3aa0', waterDeep: '#02041a', uw: '#1a1a6a',
      lava: '#40ffa0', lavaStrength: 1.6, floor: '#101030' }),
  Z('neon', 'glitch', 'The Glitch', 'ERR0R: fish.exe has stopped responding.', 0, -1240, 520, 1500, 21, 23,
    'SEGMENTATION FAULT. You need an Error-Correcting Hull.', '#40ff60',
    { ...NEON, skyTop: '#000000', skyHorizon: '#0a3a0a', fog: '#0a1a0a', waterShallow: '#0a3a1a', waterDeep: '#000400', uw: '#0a2a0a',
      uwDeep: '#000000', ambient: '#60ff80', lava: '#40ff40', lavaStrength: 2, eerie: 0.8, neon: 0.6, floor: '#0a140a' }),
  Z('maw', 'rim', 'The Accretion Rim', 'Stars get torn apart here. Fish surf the debris.', 760, 0, 520, 3000, 22, 24,
    'Tidal forces would shred you! You need a Gravity Anchor.', '#ff9a40',
    { ...MAW, skyHorizon: '#5a2a10', fog: '#2a1008', lava: '#ffa040', lavaStrength: 2.2, waterShallow: '#3a1a0a', floor: '#2a140a' }),
  Z('maw', 'maw', 'The Maw', 'The mouth at the end of everything.', -640, 640, 560, 6000, 23, 25,
    'Nothing escapes the Maw... unless you have an Event Horizon Hull.', '#8a2ad0',
    { ...MAW, skyTop: '#000000', skyHorizon: '#2a0a40', lava: '#c060ff', lavaStrength: 2.6, eerie: 1, voidAmount: 1 }),
];

export const REALM_OPEN: Record<RealmId, Zone> = {
  blue: OPEN_SEA,
  jurassic: Z('jurassic', 'jopen', 'Primordial Sea', 'The ocean, 66 million years ago', 0, 0, 0, 180, 10, 12, '', '#3a9a8a', JURASSIC),
  shattered: Z('shattered', 'sopen', 'The Twisting Nether', 'Between worlds, beneath broken skies', 0, 0, 0, 400, 13, 15, '', '#4a2a6a', SHATTERED),
  selene: Z('selene', 'lopen', 'Mare Serenitatis', 'A silver sea on a lonely moon', 0, 0, 0, 500, 16, 18, '', '#6a7080', SELENE),
  neon: Z('neon', 'nopen', 'The Grid', 'Everything is purple and it is beautiful', 0, 0, 0, 300, 19, 21, '', '#5a1a8a', NEON),
  maw: Z('maw', 'mopen', 'Event Horizon Sea', 'Swim too far and time stops', 0, 0, 0, 1500, 22, 24, '', '#1a0a2a', MAW),
};

export interface Realm {
  id: RealmId;
  name: string;
  numeral: string;
  tagline: string;
  /** playable radius and terrain extent */
  worldR: number;
  mapR: number;
  /** hull needed to open the rift into this realm */
  hull: number;
  /** 1 = Earth gravity */
  gravity: number;
  color: string;
  /** where the rift tear to the NEXT realm sits in this realm */
  tear: { x: number; z: number } | null;
}

export const REALMS: Realm[] = [
  { id: 'blue', name: 'The Blue Planet', numeral: 'I', tagline: 'Where every fisher starts', worldR: 3450, mapR: 3900, hull: 0, gravity: 1, color: '#3a86ff', tear: { x: 1880, z: 1760 } },
  { id: 'jurassic', name: 'Jurassic Tides', numeral: 'II', tagline: '66 million years ago...', worldR: 2250, mapR: 2650, hull: 10, gravity: 1, color: '#5ac070', tear: { x: 320, z: 1480 } },
  { id: 'shattered', name: 'The Shattered Expanse', numeral: 'III', tagline: 'A world torn apart by fel magic', worldR: 2250, mapR: 2650, hull: 13, gravity: 0.85, color: '#70ff40', tear: { x: 60, z: 1420 } },
  { id: 'selene', name: 'Selene', numeral: 'IV', tagline: 'The fishing moon', worldR: 2250, mapR: 2650, hull: 16, gravity: 0.35, color: '#c8d0e0', tear: { x: 180, z: -1500 } },
  { id: 'neon', name: 'The Neon Dimension', numeral: 'V', tagline: 'Welcome to the grid', worldR: 2250, mapR: 2650, hull: 19, gravity: 1, color: '#ff5ab0', tear: { x: 0, z: -1420 } },
  { id: 'maw', name: 'The Cosmic Maw', numeral: 'VI', tagline: 'The end of the ocean. The end of everything.', worldR: 2250, mapR: 2650, hull: 22, gravity: 0.6, color: '#a060ff', tear: null },
];
export const realmById = (id: RealmId) => REALMS.find((r) => r.id === id)!;

export const ALL_ZONES: Zone[] = [OPEN_SEA, ...ZONES, ...Object.values(REALM_OPEN).filter((z) => z !== OPEN_SEA), ...REALM_ZONES];
/** Every named (non open-sea) zone, across all realms. Indexes match zoneWeights. */
export const NAMED_ZONES: Zone[] = [...ZONES, ...REALM_ZONES];
export const zoneById = (id: ZoneId) => ALL_ZONES.find((z) => z.id === id)!;

// ---------------------------------------------------------------- active realm
let active: RealmId = 'blue';
let activeIdx: number[] = [];
const recompute = () => { activeIdx = NAMED_ZONES.map((z, i) => (z.realm === active ? i : -1)).filter((i) => i >= 0); };
recompute();
export const activeRealm = () => active;
export const activeRealmInfo = () => realmById(active);
export const activeOpen = () => REALM_OPEN[active];
/** Named zones of the active realm. */
export const realmZones = () => activeIdx.map((i) => NAMED_ZONES[i]);
/** Indexes (into NAMED_ZONES) of the active realm's zones. */
export const realmZoneIdx = () => activeIdx;
export function setActiveRealm(id: RealmId) { active = id; recompute(); }

/** Influence of each zone at a point (0..1), in NAMED_ZONES order; only the active realm's zones are non-zero.
 * The last entry is the active realm's open sea. */
export function zoneWeights(x: number, z: number, out: number[] = []): number[] {
  const n = NAMED_ZONES.length;
  for (let i = 0; i < n; i++) out[i] = 0;
  let sum = 0;
  for (const i of activeIdx) {
    const zn = NAMED_ZONES[i];
    const d = Math.hypot(x - zn.x, z - zn.z);
    const w = 1 - smoothstep(zn.radius - BLEND, zn.radius + BLEND, d);
    out[i] = w;
    sum += w;
  }
  if (sum > 1) for (const i of activeIdx) out[i] /= sum;
  out[n] = Math.max(0, 1 - sum);
  return out;
}

/** The zone the player is "in" (dominant weight). */
export function zoneAt(x: number, z: number): Zone {
  const w = zoneWeights(x, z);
  let best = -1, bw = 0.5;
  for (const i of activeIdx) if (w[i] > bw) { bw = w[i]; best = i; }
  return best >= 0 ? NAMED_ZONES[best] : activeOpen();
}

export function blendedFloorDepth(x: number, z: number) {
  const w = zoneWeights(x, z);
  let d = activeOpen().floorDepth * w[NAMED_ZONES.length];
  for (const i of activeIdx) d += NAMED_ZONES[i].floorDepth * w[i];
  return d;
}

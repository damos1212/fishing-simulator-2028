import { smoothstep } from '../engine/math';

export type ZoneId = 'open' | 'shallows' | 'kelp' | 'deepblue' | 'frost' | 'magma' | 'temple' | 'void';

export interface ZoneEnv {
  skyTop: string; skyHorizon: string; fog: string; fogDensity: number;
  sun: string; sunIntensity: number; cloud: string; cloudCover: number; stars: number; nebula: number;
  waterShallow: string; waterDeep: string; sparkle: number;
  uw: string; uwDeep: string; uwDensity: number; darkDepth: number; lightFalloff: number; caustics: number;
  ambient: string; ground: string; ambientIntensity: number; waves: number;
  lava: string; lavaStrength: number; voidAmount: number; frost: number; eerie: number;
  /** underwater floor tint */
  floor: string;
}

export interface Zone {
  id: ZoneId;
  name: string;
  tagline: string;
  x: number;
  z: number;
  radius: number;
  floorDepth: number;
  /** Hull tier needed to enter. */
  hull: number;
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
  lava: '#ff5a10', lavaStrength: 0, voidAmount: 0, frost: 0, eerie: 0,
  floor: '#b9a57a',
};

export const OPEN_SEA: Zone = {
  id: 'open', name: 'Open Sea', tagline: 'Endless blue in every direction',
  x: 0, z: 0, radius: 0, floorDepth: 140, hull: 0, lockedMessage: '', env: base, mapColor: '#2f78b8',
};

export const ZONES: Zone[] = [
  {
    id: 'shallows', name: 'Sunny Shallows', tagline: 'Warm water, happy fish', x: 0, z: 0, radius: 380,
    floorDepth: 38, hull: 0, lockedMessage: '', mapColor: '#49d3c9',
    env: { ...base, skyTop: '#4aa3ec', skyHorizon: '#d4f0fa', fog: '#d8f1f8', waterShallow: '#4ee6d0', waterDeep: '#1377a8',
      uw: '#1f93b0', uwDeep: '#0a3f5c', uwDensity: 0.019, darkDepth: 120, waves: 0.7, cloudCover: 0.35, floor: '#e3cf98', caustics: 0.9 },
  },
  {
    id: 'kelp', name: 'Kelp Coast', tagline: 'A swaying jungle beneath the waves', x: 720, z: -120, radius: 300,
    floorDepth: 95, hull: 0, lockedMessage: '', mapColor: '#3fa66b',
    env: { ...base, skyTop: '#5a9fcf', skyHorizon: '#d8ecd9', fog: '#d3e6d2', waterShallow: '#3cc9a0', waterDeep: '#135f5c',
      uw: '#2f8f78', uwDeep: '#06281f', uwDensity: 0.03, darkDepth: 110, cloudCover: 0.5, floor: '#7f7a52', ground: '#5a7a4a' },
  },
  {
    id: 'deepblue', name: 'The Deep Blue', tagline: 'Big water. Bigger fish.', x: 260, z: 820, radius: 360,
    floorDepth: 340, hull: 0, lockedMessage: '', mapColor: '#1c4fa0',
    env: { ...base, skyTop: '#2f7de0', skyHorizon: '#b8dcf5', fog: '#c4e2f5', waterShallow: '#2aa8d8', waterDeep: '#07306e',
      uw: '#1060a8', uwDeep: '#010a24', uwDensity: 0.016, darkDepth: 200, waves: 1.35, cloudCover: 0.3, lightFalloff: 0.01, floor: '#4f6a8a' },
  },
  {
    id: 'frost', name: 'Frostbite Fjord', tagline: 'Brr. The fish here are chill.', x: -280, z: -900, radius: 380,
    floorDepth: 240, hull: 1, lockedMessage: 'Thick ice ahead! You need an Ice Breaker hull.', mapColor: '#bfe6f5',
    env: { ...base, skyTop: '#8fb6d8', skyHorizon: '#eaf4fb', fog: '#e6f0f7', fogDensity: 0.0009, sun: '#fff8f0', sunIntensity: 1.9,
      cloud: '#f4f7fa', cloudCover: 0.62, waterShallow: '#7fd6e6', waterDeep: '#2a5f80', uw: '#5aa8c0', uwDeep: '#0a2030',
      uwDensity: 0.025, darkDepth: 150, waves: 0.9, frost: 1, ambient: '#dfeaf5', ground: '#a0b0c0', floor: '#7a8a98' },
  },
  {
    id: 'magma', name: 'Magma Rift', tagline: 'The sea boils. The fish are spicy.', x: -960, z: 120, radius: 380,
    floorDepth: 430, hull: 2, lockedMessage: 'The water is boiling! You need a Heat Shield hull.', mapColor: '#e0582a',
    env: { ...base, skyTop: '#3a1a1a', skyHorizon: '#c8603a', fog: '#8a4a3a', fogDensity: 0.0012, sun: '#ffb070', sunIntensity: 1.7,
      cloud: '#4a3a3a', cloudCover: 0.68, waterShallow: '#8a4a2a', waterDeep: '#1a1418', sparkle: 0.3, uw: '#4a2418', uwDeep: '#120404',
      uwDensity: 0.03, darkDepth: 150, ambient: '#d08060', ground: '#402020', ambientIntensity: 0.8, waves: 0.8,
      lava: '#ff5a10', lavaStrength: 3, floor: '#2e2422', caustics: 0.35 },
  },
  {
    id: 'temple', name: 'Drowned Temple', tagline: 'Something ancient stirs below...', x: -760, z: 980, radius: 380,
    floorDepth: 650, hull: 3, lockedMessage: 'Whispers push you back. You need an Elder Ward hull.', mapColor: '#3f7a5a',
    env: { ...base, skyTop: '#1a2a24', skyHorizon: '#5a7a5a', fog: '#3f5a4a', fogDensity: 0.0016, sun: '#c8ffb0', sunIntensity: 1.2,
      cloud: '#2a3a30', cloudCover: 0.75, waterShallow: '#2a6a50', waterDeep: '#0a1f1a', sparkle: 0.2, uw: '#1a4a38', uwDeep: '#020806',
      uwDensity: 0.034, darkDepth: 90, ambient: '#6a9a7a', ground: '#1a2a20', ambientIntensity: 0.7, waves: 1.2, eerie: 1,
      lava: '#60ff90', lavaStrength: 1.2, floor: '#34423a', caustics: 0.25, lightFalloff: 0.02 },
  },
  {
    id: 'void', name: 'The Void', tagline: 'Where the ocean meets the stars', x: 1180, z: 1150, radius: 460,
    floorDepth: 2400, hull: 4, lockedMessage: 'Reality thins... You need a Void Anchor hull.', mapColor: '#6a3ad0',
    env: { ...base, skyTop: '#05030f', skyHorizon: '#2a1450', fog: '#140a28', fogDensity: 0.0004, sun: '#d0c0ff', sunIntensity: 1.1,
      cloud: '#1a1030', cloudCover: 0, stars: 1, nebula: 1, waterShallow: '#2a1a5a', waterDeep: '#05020f', sparkle: 2,
      uw: '#1a0a3a', uwDeep: '#000000', uwDensity: 0.012, darkDepth: 220, ambient: '#6a5aa0', ground: '#100820', waves: 0.5,
      voidAmount: 1, lava: '#a060ff', lavaStrength: 1.4, floor: '#150c28', caustics: 0.2 },
  },
];

export const ALL_ZONES: Zone[] = [OPEN_SEA, ...ZONES];
export const zoneById = (id: ZoneId) => ALL_ZONES.find((z) => z.id === id)!;

/** Influence of each zone at a point (0..1), in ZONES order. The open sea gets the remainder. */
export function zoneWeights(x: number, z: number, out: number[] = []): number[] {
  let sum = 0;
  for (let i = 0; i < ZONES.length; i++) {
    const zn = ZONES[i];
    const d = Math.hypot(x - zn.x, z - zn.z);
    const w = 1 - smoothstep(zn.radius - BLEND, zn.radius + BLEND, d);
    out[i] = w;
    sum += w;
  }
  if (sum > 1) for (let i = 0; i < ZONES.length; i++) out[i] /= sum;
  out[ZONES.length] = Math.max(0, 1 - sum);
  return out;
}

/** The zone the player is "in" (dominant weight). */
export function zoneAt(x: number, z: number): Zone {
  const w = zoneWeights(x, z);
  let best = -1, bw = 0.5;
  for (let i = 0; i < ZONES.length; i++) if (w[i] > bw) { bw = w[i]; best = i; }
  return best >= 0 ? ZONES[best] : OPEN_SEA;
}

export function blendedFloorDepth(x: number, z: number) {
  const w = zoneWeights(x, z);
  let d = OPEN_SEA.floorDepth * w[ZONES.length];
  for (let i = 0; i < ZONES.length; i++) d += ZONES[i].floorDepth * w[i];
  return d;
}

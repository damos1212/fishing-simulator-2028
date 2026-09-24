// Analytic world height function (shared by rendering, collisions and spawning),
// plus generation of the terrain mesh and the ocean's height map texture.
// Every realm has its own islands and seabed features; the active realm decides which apply.
import { activeOpen, activeRealm, activeRealmInfo, NAMED_ZONES, type RealmId, realmZoneIdx, zoneWeights } from '../data/zones';
import { clamp, fbm2, hex, lerp, noise2, type RGB, smoothstep } from '../engine/math';
import type { MeshData } from '../engine/glb';
import { toHalf } from '../engine/renderer';

/** Terrain extent and playable radius of the active realm (live bindings, updated by syncRealm). */
export let MAP_R = 3900;
export let WORLD_R = 3450;
const MESH_P = 1.8;
const MAP_P = 1.6;

export type IslandKind = 'grass' | 'sand' | 'rock' | 'snow' | 'volcano' | 'basalt' | 'ruins' | 'candy' | 'toxic' | 'dark'
  | 'jungle' | 'tar' | 'bone' | 'hellfire' | 'fel' | 'ash' | 'moon' | 'crater' | 'neon' | 'chrome' | 'asteroid';
export interface Island { x: number; z: number; r: number; top: number; kind: IslandKind; seed: number }

export const HARBOR = { x: 0, z: 0, plateau: 3.5 };

const I = (x: number, z: number, r: number, top: number, kind: IslandKind, seed: number): Island => ({ x, z, r, top, kind, seed });

const BLUE_ISLANDS: Island[] = [
  I(0, 0, 60, 3.5, 'grass', 1), I(170, -140, 28, 2.5, 'sand', 2), I(-190, -60, 36, 6, 'grass', 3), I(120, 210, 22, 2.2, 'sand', 4),
  I(-130, 210, 30, 4.5, 'grass', 5), I(770, -270, 70, 22, 'rock', 6), I(640, 70, 45, 14, 'rock', 7), I(880, 10, 34, 10, 'rock', 8),
  I(310, 900, 14, 6, 'rock', 9), I(-430, -990, 110, 40, 'snow', 10), I(-120, -1060, 70, 28, 'snow', 11), I(-300, -760, 40, 14, 'snow', 12),
  I(-1030, 150, 240, 165, 'volcano', 13), I(-800, 320, 30, 8, 'basalt', 14), I(-850, -70, 26, 6, 'basalt', 15),
  I(-1500, 1480, 55, 6, 'ruins', 16), I(-1350, 1640, 30, 4, 'ruins', 17), I(-1650, 1610, 26, 3, 'ruins', 18),
  I(440, -760, 26, 2.5, 'sand', 19), I(560, -640, 20, 2, 'sand', 20), I(380, -610, 16, 2, 'sand', 21),
  I(1450, -900, 70, 8, 'candy', 22), I(1600, -1060, 40, 5, 'candy', 23), I(1290, -760, 30, 4, 'candy', 24),
  I(1900, 250, 80, 7, 'toxic', 25), I(2080, 430, 30, 3, 'toxic', 26),
  I(-520, -2060, 50, 18, 'dark', 27), I(-300, -1850, 30, 12, 'dark', 28), I(-700, -1880, 24, 9, 'dark', 29),
  I(-2000, -700, 70, 6, 'sand', 30), I(-1850, -830, 24, 3, 'sand', 31), I(500, 1980, 40, 4, 'ruins', 32),
];

export const REALM_ISLANDS: Record<RealmId, Island[]> = {
  blue: BLUE_ISLANDS,
  jurassic: [
    I(0, 0, 65, 4, 'jungle', 101), I(-190, -130, 42, 12, 'jungle', 102), I(160, 180, 30, 6, 'jungle', 103), I(-260, 220, 26, 3, 'sand', 104),
    I(700, -520, 125, 30, 'jungle', 105), I(930, -250, 72, 18, 'jungle', 106), I(560, -280, 40, 3, 'sand', 107), I(980, -580, 50, 14, 'jungle', 108),
    I(-900, 470, 95, 2, 'tar', 109), I(-700, 690, 60, 1.8, 'tar', 110), I(-1060, 660, 42, 5, 'bone', 111), I(-690, 360, 34, 3, 'bone', 112),
    I(-140, 1190, 75, 70, 'volcano', 113), I(560, 1170, 95, 120, 'volcano', 114), I(300, 1760, 62, 48, 'volcano', 115), I(20, 1580, 30, 10, 'basalt', 116),
  ],
  shattered: [
    I(0, 0, 62, 4, 'ash', 201), I(200, -160, 30, 12, 'fel', 202), I(-180, 170, 34, 16, 'fel', 203),
    I(-800, -620, 115, 46, 'hellfire', 204), I(-590, -380, 62, 26, 'hellfire', 205), I(-1010, -420, 52, 30, 'hellfire', 206), I(-560, -770, 40, 18, 'hellfire', 207),
    I(1010, -90, 52, 22, 'fel', 208), I(820, -430, 32, 14, 'fel', 209), I(1120, -380, 26, 16, 'fel', 210),
    I(60, 1080, 85, 32, 'fel', 211), I(-210, 1340, 42, 26, 'fel', 212), I(320, 1380, 46, 28, 'fel', 213),
  ],
  selene: [
    I(0, 0, 72, 3, 'moon', 301), I(-200, -150, 45, 6, 'crater', 302), I(210, 140, 30, 2.5, 'moon', 303),
    I(640, 420, 62, 3, 'moon', 304), I(820, 610, 36, 2, 'moon', 305), I(480, 620, 70, 10, 'crater', 306),
    I(-860, -320, 190, 24, 'crater', 307), I(-1120, -80, 92, 15, 'crater', 308), I(-630, -580, 72, 12, 'crater', 309),
    I(180, -1320, 52, 40, 'moon', 310), I(-110, -1150, 32, 10, 'moon', 311), I(430, -1180, 60, 12, 'crater', 312),
  ],
  neon: [
    I(0, 0, 62, 3, 'neon', 401), I(-190, 150, 30, 20, 'chrome', 402), I(200, -150, 26, 16, 'chrome', 403),
    I(-640, 440, 92, 4, 'neon', 404), I(-830, 300, 52, 3, 'neon', 405), I(-470, 630, 42, 3, 'neon', 406),
    I(860, 320, 72, 62, 'chrome', 407), I(1010, 530, 42, 36, 'chrome', 408), I(700, 140, 36, 30, 'chrome', 409),
    I(0, -1100, 64, 48, 'chrome', 410), I(-230, -1320, 36, 20, 'chrome', 411), I(250, -1380, 40, 24, 'chrome', 412),
  ],
  maw: [
    I(0, 0, 62, 4, 'asteroid', 501), I(170, 160, 28, 14, 'asteroid', 502), I(-200, -140, 34, 18, 'asteroid', 503),
    I(760, 0, 72, 32, 'asteroid', 504), I(910, -210, 42, 22, 'asteroid', 505), I(620, 250, 46, 26, 'asteroid', 506),
    I(-380, 390, 42, 26, 'asteroid', 507), I(-900, 520, 32, 18, 'asteroid', 508),
  ],
};

/** Islands of the active realm (live binding). */
export let ISLANDS: Island[] = BLUE_ISLANDS;

const zi = (id: string) => NAMED_ZONES.findIndex((z) => z.id === id);
const MAGMA_I = zi('magma'), TOXIC_I = zi('toxic'), STORM_I = zi('storm'), ATLANTIS_I = zi('atlantis'), CANDY_I = zi('candy');
const TEMPLE_I = zi('temple'), VOID_I = zi('void');
const TAR_I = zi('tarpit'), CRATER_I = zi('crater'), FERN_I = zi('fern');
const HELL_I = zi('hellfire'), NETHER_I = zi('nether'), GATE_I = zi('blackgate');
const CRATERS_I = zi('craters'), DARK_I = zi('darkside');
const SUNSET_I = zi('sunset'), ARCADE_I = zi('arcade'), GLITCH_I = zi('glitch');
const RIM_I = zi('rim'), MAWZ_I = zi('maw');
const VOID = NAMED_ZONES[VOID_I];
const CRATER = NAMED_ZONES[CRATER_I];
const GATE = NAMED_ZONES[GATE_I];
const MAWZ = NAMED_ZONES[MAWZ_I];

/** Switches terrain generation to the active realm (call after setActiveRealm). */
export function syncRealm() {
  const r = activeRealmInfo();
  MAP_R = r.mapR;
  WORLD_R = r.worldR;
  ISLANDS = REALM_ISLANDS[r.id];
  floorColors = NAMED_ZONES.map((z) => hex(z.env.floor));
  openFloor = hex(activeOpen().env.floor);
}

const wTmp: number[] = [];

const hash2 = (x: number, z: number, k: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Moon-style crater field: bowls with raised rims, on a jittered grid. */
function craterField(x: number, z: number, cell: number, k: number) {
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  let h = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gz = cz + j;
    if (hash2(gx, gz, 3) > 0.7) continue;
    const px = (gx + 0.2 + 0.6 * hash2(gx, gz, 1)) * cell, pz = (gz + 0.2 + 0.6 * hash2(gx, gz, 2)) * cell;
    const r = cell * (0.18 + 0.26 * hash2(gx, gz, 4));
    const d = Math.hypot(x - px, z - pz) / r;
    if (d < 1) h += (d * d - 1) * 0.55 * r * k;
    else if (d < 1.8) h += 0.18 * Math.exp(-(((d - 1) / 0.28) ** 2)) * r * k;
  }
  return h;
}

function islandHeight(isl: Island, x: number, z: number, base: number): number {
  const dx = x - isl.x, dz = z - isl.z;
  const d = Math.hypot(dx, dz);
  if (d > isl.r * 2.6) return base;
  const wob = 1 + 0.2 * noise2(dx / isl.r * 1.3 + isl.seed * 7.1, dz / isl.r * 1.3 - isl.seed * 3.3);
  const r = isl.r * wob;
  const t = d / r;
  let h: number;
  if (isl.kind === 'volcano') {
    const cone = isl.top * Math.pow(clamp(1 - t, 0, 1), 1.25);
    const crater = t < 0.14 ? 28 * (isl.top / 165) * (1 - Math.pow(t / 0.14, 2)) : 0;
    h = t < 1 ? cone - crater + 4 * fbm2(x * 0.02, z * 0.02) : lerp(-0.6, base, smoothstep(1, 2.2, t));
    if (t >= 1) h = Math.min(h, -0.6);
    return Math.max(base, h);
  }
  if (isl.kind === 'crater') {
    // an atoll: a ring of rock around a sunken lagoon
    const ring = Math.exp(-(((t - 0.78) / 0.2) ** 2));
    h = t < 1.15 ? lerp(-12 - isl.top * 0.4, isl.top * (0.7 + 0.3 * fbm2(x * 0.03, z * 0.03)), ring) : lerp(-0.6, base, smoothstep(1.15, 2.4, t));
    return t < 0.78 ? h : Math.max(base, h);
  }
  if (isl.kind === 'chrome') {
    // square pyramids with stepped sides
    const m = Math.max(Math.abs(dx), Math.abs(dz)) / isl.r;
    if (m < 1) {
      const raw = isl.top * (1 - m);
      h = Math.max(0.8, Math.floor(raw / 4) * 4 + 0.8);
    } else h = lerp(-0.6, base, smoothstep(1, 1.8, m));
    return Math.max(base, h);
  }
  const steep = isl.kind === 'rock' || isl.kind === 'snow' || isl.kind === 'dark' || isl.kind === 'hellfire' || isl.kind === 'fel' || isl.kind === 'asteroid';
  if (t < 1) {
    const shoulder = steep ? smoothstep(0.7, 0.97, t) : smoothstep(0.45, 0.95, t);
    let top = isl.top;
    if (isl.kind === 'grass' || isl.kind === 'jungle') top += (isl.kind === 'jungle' ? 5 : 2.5) * smoothstep(0.1, -0.3, noise2(x * 0.03, z * 0.03)) * (isl === ISLANDS[0] ? 0 : 1);
    if (steep) top += isl.top * 0.35 * fbm2(x * 0.018 + isl.seed, z * 0.018);
    if (isl.kind === 'hellfire' || isl.kind === 'fel') top += isl.top * 0.5 * Math.max(0, noise2(x * 0.09 + isl.seed, z * 0.09) - 0.2);
    if (isl.kind === 'asteroid') top += isl.top * 0.4 * Math.abs(noise2(x * 0.05, z * 0.05 + isl.seed));
    h = lerp(top, 0.7, shoulder);
    h = lerp(h, -0.6, smoothstep(steep ? 0.96 : 0.92, 1, t));
  } else h = lerp(-0.6, base, smoothstep(1, 2.4, t));
  return Math.max(base, h);
}

/** Terrain height (negative = seafloor depth). */
export function heightAt(x: number, z: number): number {
  const w = zoneWeights(x, z, wTmp);
  const n = NAMED_ZONES.length;
  const idx = realmZoneIdx();
  let depth = activeOpen().floorDepth * w[n];
  for (const i of idx) depth += NAMED_ZONES[i].floorDepth * w[i];
  const nz = fbm2(x * 0.0028, z * 0.0028, 3);
  let h = -depth * (1 + 0.3 * nz) - 5 * noise2(x * 0.021, z * 0.021) - 1.5 * noise2(x * 0.09, z * 0.09);
  switch (activeRealm()) {
    case 'blue': {
      // sandbars near the harbor
      h += 6 * smoothstep(0.25, 0.6, noise2(x * 0.006 + 3, z * 0.006)) * w[0];
      // magma trenches, temple pits
      if (w[MAGMA_I] > 0) h -= 90 * w[MAGMA_I] * smoothstep(0.35, 0.7, Math.abs(noise2(x * 0.004, z * 0.004)));
      if (w[TEMPLE_I] > 0) h -= 120 * w[TEMPLE_I] * smoothstep(0.2, 0.7, noise2(x * 0.005 + 9, z * 0.005));
      if (w[STORM_I] > 0) h -= 70 * w[STORM_I] * Math.abs(noise2(x * 0.008 + 4, z * 0.008));
      if (w[ATLANTIS_I] > 0.05) {
        // terraced plazas of the sunken city
        const terr = Math.round(h / 45) * 45 + 3 * noise2(x * 0.05, z * 0.05);
        h = lerp(h, terr, w[ATLANTIS_I] * 0.85);
      }
      break;
    }
    case 'jurassic': {
      if (w[FERN_I] > 0) h += 10 * smoothstep(0.2, 0.6, noise2(x * 0.007 + 5, z * 0.007)) * w[FERN_I];
      if (w[TAR_I] > 0) h = lerp(h, Math.max(h, -18 - 20 * Math.abs(noise2(x * 0.01, z * 0.01))), w[TAR_I] * 0.7);
      if (w[CRATER_I] > 0) {
        const dc = Math.hypot(x - CRATER.x, z - CRATER.z) / CRATER.radius;
        h -= 500 * smoothstep(0.75, 0.1, dc) * w[CRATER_I];
      }
      break;
    }
    case 'shattered': {
      if (w[HELL_I] > 0) h -= 50 * w[HELL_I] * (1 - Math.abs(noise2(x * 0.006, z * 0.006))) ** 3;
      if (w[NETHER_I] > 0) h -= 420 * w[NETHER_I] * smoothstep(0.1, 0.02, Math.abs(noise2(x * 0.003 + 2, z * 0.003)));
      if (w[GATE_I] > 0) h -= 700 * w[GATE_I] * smoothstep(0.9, 0.2, Math.hypot(x - GATE.x, z - GATE.z - 150) / GATE.radius);
      break;
    }
    case 'selene': {
      h += craterField(x, z, 260, 1) + craterField(x + 91, z - 57, 90, 0.7);
      if (w[CRATERS_I] > 0) h += craterField(x - 33, z + 17, 420, 1.6) * w[CRATERS_I];
      break;
    }
    case 'neon': {
      const q = 14;
      const stepped = Math.round(h / q) * q;
      h = lerp(h, stepped, 0.9);
      if (w[GLITCH_I] > 0) {
        const bx = Math.floor(x / 40), bz = Math.floor(z / 40);
        h -= w[GLITCH_I] * (hash2(bx, bz, 9) > 0.8 ? 180 * hash2(bx, bz, 10) : 0);
      }
      if (w[ARCADE_I] > 0) h -= 60 * w[ARCADE_I] * (Math.abs(Math.sin(x * 0.012)) > 0.9 ? 1 : 0);
      break;
    }
    case 'maw': {
      if (w[RIM_I] > 0) h -= 300 * w[RIM_I] * Math.abs(Math.sin(Math.hypot(x - 760, z) * 0.02 + noise2(x * 0.004, z * 0.004) * 2));
      break;
    }
  }
  h = Math.min(h, -2.5);
  const edge = Math.hypot(x, z);
  if (edge > WORLD_R) h = lerp(h, -1200, smoothstep(WORLD_R, MAP_R, edge));
  for (const isl of ISLANDS) h = islandHeight(isl, x, z, h);
  if (activeRealm() === 'blue' && w[VOID_I] > 0) {
    const dv = Math.hypot(x - VOID.x, z - VOID.z);
    h = lerp(h, -3000, smoothstep(VOID.radius + 60, VOID.radius - 160, dv));
  }
  if (activeRealm() === 'maw' && w[MAWZ_I] > 0) {
    const dv = Math.hypot(x - MAWZ.x, z - MAWZ.z);
    h = lerp(h, -6000, smoothstep(MAWZ.radius + 40, MAWZ.radius - 200, dv));
  }
  return h;
}

/** Emissive mask (lava cracks / runes / crystals / neon lines) for coloring. */
function glowMask(x: number, z: number, h: number, w: number[]): number {
  let g = 0;
  for (const isl of ISLANDS) {
    if (isl.kind !== 'volcano') continue;
    const dv = Math.hypot(x - isl.x, z - isl.z) / isl.r;
    if (dv > 1) continue;
    if (dv < 0.16 && h > isl.top * 0.55) g = 1;
    const river = 1 - smoothstep(0.0, 0.05, Math.abs(noise2(Math.atan2(z - isl.z, x - isl.x) * 2.2, dv * 2)));
    if (dv < 0.85 && h > 2) g = Math.max(g, river * smoothstep(0.85, 0.3, dv));
  }
  const realm = activeRealm();
  if (realm === 'blue') {
    if (w[MAGMA_I] > 0.05 && h < -15) g = Math.max(g, (1 - smoothstep(0, 0.04, Math.abs(noise2(x * 0.025, z * 0.025)))) * w[MAGMA_I]);
    if (w[TEMPLE_I] > 0.05 && h < -10) g = Math.max(g, step(0.82, noise2(x * 0.05, z * 0.05)) * w[TEMPLE_I] * 0.7);
    if (w[VOID_I] > 0.05 && h < -5) g = Math.max(g, step(0.75, noise2(x * 0.08, z * 0.08)) * w[VOID_I]);
    if (w[TOXIC_I] > 0.05 && h < 1) g = Math.max(g, smoothstep(0.35, 0.6, noise2(x * 0.03 + 7, z * 0.03)) * w[TOXIC_I]);
    if (w[ATLANTIS_I] > 0.05 && h < -10) {
      const road = Math.max(step(0.93, Math.abs(Math.sin(x * 0.07))), step(0.93, Math.abs(Math.sin(z * 0.07))));
      g = Math.max(g, road * w[ATLANTIS_I] * 0.8);
    }
    if (w[CANDY_I] > 0.05 && h < -3) g = Math.max(g, step(0.9, noise2(x * 0.2, z * 0.2)) * w[CANDY_I] * 0.6);
  } else if (realm === 'jurassic') {
    if (w[CRATER_I] > 0.05 && h < -12) g = Math.max(g, (1 - smoothstep(0, 0.045, Math.abs(noise2(x * 0.02, z * 0.02)))) * w[CRATER_I]);
    if (w[TAR_I] > 0.05 && h < -2) g = Math.max(g, step(0.88, noise2(x * 0.09, z * 0.09)) * w[TAR_I] * 0.5);
  } else if (realm === 'shattered') {
    const crack = 1 - smoothstep(0, 0.05, Math.abs(noise2(x * 0.03 + 1, z * 0.03)));
    const nearIsl = nearestIsland(x, z);
    if (nearIsl && (nearIsl.kind === 'hellfire' || nearIsl.kind === 'fel') && h > 1) g = Math.max(g, crack * 0.9);
    if (h < -8) g = Math.max(g, crack * 0.6 * (w[GATE_I] + w[HELL_I] * 0.7 + 0.3));
  } else if (realm === 'selene') {
    if (h < -6) g = Math.max(g, step(0.84, noise2(x * 0.07, z * 0.07)) * (0.4 + w[CRATERS_I] * 0.6 + w[DARK_I]));
  } else if (realm === 'neon') {
    const gx = Math.abs(((x / 24) % 1 + 1) % 1 - 0.5), gz = Math.abs(((z / 24) % 1 + 1) % 1 - 0.5);
    if (h < -2) g = Math.max(g, step(0.46, Math.max(gx, gz)) * 0.9);
    const nearIsl = nearestIsland(x, z);
    if (nearIsl?.kind === 'chrome' && h > 1) g = Math.max(g, step(0.8, ((h / 4) % 1)) * 0.8);
    if (w[GLITCH_I] > 0.05) g = Math.max(g, step(0.9, hash2(Math.floor(x / 8), Math.floor(z / 8), 11)) * w[GLITCH_I]);
    if (w[SUNSET_I] > 0.05 && h < -2) g *= 1 - w[SUNSET_I] * 0.5;
  } else if (realm === 'maw') {
    if (h < -5) g = Math.max(g, step(0.78, noise2(x * 0.05, z * 0.05)) * (0.6 + w[RIM_I]));
    const nearIsl = nearestIsland(x, z);
    if (nearIsl?.kind === 'asteroid' && h > 1) g = Math.max(g, (1 - smoothstep(0, 0.06, Math.abs(noise2(x * 0.06, z * 0.06)))) * 0.8);
  }
  return g;
}
const step = (e: number, x: number) => (x >= e ? 1 : 0);

const C = {
  sand: hex('#f0d9a0'), grass: hex('#7dc85a'), grass2: hex('#5ea845'), rock: hex('#9a8f82'), cliff: hex('#7f7468'),
  snow: hex('#f5f9ff'), iceRock: hex('#9fb3c4'), basalt: hex('#3b3533'), blackSand: hex('#4a4240'), ruins: hex('#6f7f68'),
  moss: hex('#4f6a4a'), wetSand: hex('#d9c08a'),
  candySand: hex('#ffc8e4'), candyGrass: hex('#9af0c8'), candyRock: hex('#c08ae0'),
  sludge: hex('#6a6a48'), sludgeRock: hex('#4a4a3a'), darkRock: hex('#3a3e46'), darkGrass: hex('#4a5a4a'),
  jungle: hex('#3f9a3a'), jungle2: hex('#2f7a30'), jungleRock: hex('#6a6a50'), tar: hex('#1e1a16'), tarSand: hex('#5a4a36'),
  bone: hex('#e8dcc0'), hell: hex('#8a3a24'), hellRock: hex('#5a2418'), fel: hex('#3a3040'), felRock: hex('#241c2a'), ash: hex('#5a5060'),
  moon: hex('#b8b8bc'), moonDark: hex('#8a8a90'), neonSand: hex('#ff9ad0'), neonGrass: hex('#7a3ad0'), chrome: hex('#c0c8e0'),
  asteroid: hex('#3a3440'), asteroidRock: hex('#241e2a'),
};
let floorColors: RGB[] = NAMED_ZONES.map((z) => hex(z.env.floor));
let openFloor = hex(activeOpen().env.floor);

function nearestIsland(x: number, z: number): Island | null {
  let best: Island | null = null, bd = Infinity;
  for (const i of ISLANDS) {
    const d = Math.hypot(x - i.x, z - i.z) / i.r;
    if (d < bd) { bd = d; best = i; }
  }
  return bd < 2.6 ? best : null;
}

const BEACH: Partial<Record<IslandKind, RGB>> = {
  basalt: C.blackSand, volcano: C.blackSand, snow: C.iceRock, candy: C.candySand, toxic: C.sludge, dark: C.darkRock,
  tar: C.tarSand, bone: C.bone, hellfire: C.hellRock, fel: C.felRock, ash: C.ash, moon: C.moonDark, crater: C.moonDark,
  neon: C.neonSand, chrome: C.chrome, asteroid: C.asteroidRock,
};

function colorAt(x: number, z: number, h: number, slope: number, out: number[]) {
  const w = zoneWeights(x, z, wTmp);
  const n = NAMED_ZONES.length;
  let r = openFloor[0] * w[n], g = openFloor[1] * w[n], b = openFloor[2] * w[n];
  for (const i of realmZoneIdx()) { r += floorColors[i][0] * w[i]; g += floorColors[i][1] * w[i]; b += floorColors[i][2] * w[i]; }
  let c: RGB = [r, g, b];
  const isl = nearestIsland(x, z);
  const kind = isl?.kind;
  const beach: RGB = (kind && BEACH[kind]) || C.sand;
  // underwater: blend from beach sand to zone floor with depth
  if (h < 0.4) {
    const t = smoothstep(0, 30, -h);
    c = [lerp(beach[0] * 0.85, c[0], t), lerp(beach[1] * 0.85, c[1], t), lerp(beach[2] * 0.85, c[2], t)];
    const v = 0.9 + 0.1 * noise2(x * 0.15, z * 0.15);
    c = [c[0] * v, c[1] * v, c[2] * v];
  } else {
    let land: RGB = C.grass;
    switch (kind) {
      case 'sand': land = C.sand; break;
      case 'rock': land = slope > 0.35 ? C.cliff : C.grass2; break;
      case 'snow': land = slope > 0.45 ? C.iceRock : C.snow; break;
      case 'volcano': case 'basalt': land = C.basalt; break;
      case 'ruins': land = slope > 0.3 ? C.ruins : C.moss; break;
      case 'candy': land = slope > 0.4 ? C.candyRock : C.candyGrass; break;
      case 'toxic': land = slope > 0.4 ? C.sludgeRock : C.sludge; break;
      case 'dark': land = slope > 0.35 ? C.darkRock : C.darkGrass; break;
      case 'jungle': land = slope > 0.45 ? C.jungleRock : noise2(x * 0.04, z * 0.04) > 0.1 ? C.jungle2 : C.jungle; break;
      case 'tar': land = C.tar; break;
      case 'bone': land = C.bone; break;
      case 'hellfire': land = slope > 0.4 ? C.hellRock : C.hell; break;
      case 'fel': land = slope > 0.4 ? C.felRock : C.fel; break;
      case 'ash': land = C.ash; break;
      case 'moon': case 'crater': land = slope > 0.35 ? C.moonDark : C.moon; break;
      case 'neon': land = h > 2.2 ? C.neonGrass : C.neonSand; break;
      case 'chrome': land = C.chrome; break;
      case 'asteroid': land = slope > 0.35 ? C.asteroidRock : C.asteroid; break;
      default: land = slope > 0.4 ? C.rock : noise2(x * 0.05, z * 0.05) > 0.2 ? C.grass2 : C.grass;
    }
    c = h < 1.4 ? beach : land;
  }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  out[3] = glowMask(x, z, h, w);
}

const warp = (u: number, R: number, P: number) => Math.sign(u) * Math.pow(Math.abs(u), P) * R;

/** Builds the terrain mesh on a warped grid (dense around the harbor). */
export function buildTerrainMesh(N = Math.round(600 * Math.sqrt(MAP_R / 3900))): MeshData {
  const V = N + 1;
  const pos = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const x = warp((i / N) * 2 - 1, MAP_R, MESH_P), z = warp((j / N) * 2 - 1, MAP_R, MESH_P);
    const k = (j * V + i) * 3;
    pos[k] = x; pos[k + 1] = heightAt(x, z); pos[k + 2] = z;
  }
  // ambient occlusion from the horizon angle in 8 directions (stored as the normal's length)
  const ao = new Float32Array(V * V);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  const STEPS = [1, 2, 4, 8, 14];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = (j * V + i) * 3;
    const x0 = pos[k], y0 = pos[k + 1], z0 = pos[k + 2];
    let occ = 0;
    for (let d = 0; d < 8; d++) {
      const di = DIRS[d][0], dj = DIRS[d][1];
      let best = 0;
      for (let s = 0; s < 5; s++) {
        const ii = i + di * STEPS[s], jj = j + dj * STEPS[s];
        if (ii < 0 || jj < 0 || ii > N || jj > N) break;
        const q = (jj * V + ii) * 3;
        const dx = pos[q] - x0, dz = pos[q + 2] - z0;
        const dh = pos[q + 1] - y0;
        if (dh <= 0) continue;
        const slope = dh / Math.sqrt(dx * dx + dz * dz + 1e-4);
        if (slope > best) best = slope;
      }
      // sine of the horizon angle
      occ += best / Math.sqrt(1 + best * best);
    }
    ao[j * V + i] = clamp(1 - (occ / 8) * 1.3, 0.3, 1);
  }
  const verts = new Float32Array(V * V * 10);
  const col: number[] = [0, 0, 0, 0];
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = (j * V + i) * 3;
    const il = Math.max(0, i - 1), ir = Math.min(N, i + 1), jd = Math.max(0, j - 1), ju = Math.min(N, j + 1);
    const ax = pos[(j * V + ir) * 3] - pos[(j * V + il) * 3], ay = pos[(j * V + ir) * 3 + 1] - pos[(j * V + il) * 3 + 1];
    const bz = pos[(ju * V + i) * 3 + 2] - pos[(jd * V + i) * 3 + 2], by = pos[(ju * V + i) * 3 + 1] - pos[(jd * V + i) * 3 + 1];
    // n = (b x a) with a = (ax, ay, 0), b = (0, by, bz)
    let nx = -ay * bz, ny = ax * bz, nz = -ax * by;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    colorAt(pos[k], pos[k + 2], pos[k + 1], 1 - ny, col);
    const o = (j * V + i) * 10;
    verts[o] = pos[k]; verts[o + 1] = pos[k + 1]; verts[o + 2] = pos[k + 2];
    const occl = ao[j * V + i];
    verts[o + 3] = nx * occl; verts[o + 4] = ny * occl; verts[o + 5] = nz * occl;
    verts[o + 6] = col[0]; verts[o + 7] = col[1]; verts[o + 8] = col[2]; verts[o + 9] = col[3];
  }
  const idx = new Uint32Array(N * N * 6);
  for (let j = 0, q = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1;
  return { name: 'terrain', vertices: verts, indices: idx, matrix: m, boundsMin: [-MAP_R, -3000, -MAP_R], boundsMax: [MAP_R, 200, MAP_R] };
}

/** Half-float height map in the ocean shader's warped layout (frame.mapInfo). */
export function buildHeightMap(size = 800): Uint16Array {
  const out = new Uint16Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = warp(((i + 0.5) / size) * 2 - 1, MAP_R, MAP_P), z = warp(((j + 0.5) / size) * 2 - 1, MAP_R, MAP_P);
    out[j * size + i] = toHalf(clamp(heightAt(x, z), -3000, 400));
  }
  return out;
}

export const MAP_POWER = MAP_P;

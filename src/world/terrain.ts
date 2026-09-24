// Analytic world height function (shared by rendering, collisions and spawning),
// plus generation of the terrain mesh and the ocean's height map texture.
import { OPEN_SEA, ZONES, zoneWeights } from '../data/zones';
import { clamp, fbm2, hex, lerp, noise2, type RGB, smoothstep } from '../engine/math';
import type { MeshData } from '../engine/glb';
import { toHalf } from '../engine/renderer';

export const MAP_R = 3900;
export const WORLD_R = 3450;
const MESH_P = 1.8;
const MAP_P = 1.6;

export type IslandKind = 'grass' | 'sand' | 'rock' | 'snow' | 'volcano' | 'basalt' | 'ruins' | 'candy' | 'toxic' | 'dark';
export interface Island { x: number; z: number; r: number; top: number; kind: IslandKind; seed: number }

export const HARBOR = { x: 0, z: 0, plateau: 3.5 };

export const ISLANDS: Island[] = [
  { x: 0, z: 0, r: 60, top: 3.5, kind: 'grass', seed: 1 },
  { x: 170, z: -140, r: 28, top: 2.5, kind: 'sand', seed: 2 },
  { x: -190, z: -60, r: 36, top: 6, kind: 'grass', seed: 3 },
  { x: 120, z: 210, r: 22, top: 2.2, kind: 'sand', seed: 4 },
  { x: -130, z: 210, r: 30, top: 4.5, kind: 'grass', seed: 5 },
  { x: 770, z: -270, r: 70, top: 22, kind: 'rock', seed: 6 },
  { x: 640, z: 70, r: 45, top: 14, kind: 'rock', seed: 7 },
  { x: 880, z: 10, r: 34, top: 10, kind: 'rock', seed: 8 },
  { x: 310, z: 900, r: 14, top: 6, kind: 'rock', seed: 9 },
  { x: -430, z: -990, r: 110, top: 40, kind: 'snow', seed: 10 },
  { x: -120, z: -1060, r: 70, top: 28, kind: 'snow', seed: 11 },
  { x: -300, z: -760, r: 40, top: 14, kind: 'snow', seed: 12 },
  { x: -1030, z: 150, r: 240, top: 165, kind: 'volcano', seed: 13 },
  { x: -800, z: 320, r: 30, top: 8, kind: 'basalt', seed: 14 },
  { x: -850, z: -70, r: 26, top: 6, kind: 'basalt', seed: 15 },
  { x: -1500, z: 1480, r: 55, top: 6, kind: 'ruins', seed: 16 },
  { x: -1350, z: 1640, r: 30, top: 4, kind: 'ruins', seed: 17 },
  { x: -1650, z: 1610, r: 26, top: 3, kind: 'ruins', seed: 18 },
  { x: 440, z: -760, r: 26, top: 2.5, kind: 'sand', seed: 19 },
  { x: 560, z: -640, r: 20, top: 2, kind: 'sand', seed: 20 },
  { x: 380, z: -610, r: 16, top: 2, kind: 'sand', seed: 21 },
  { x: 1450, z: -900, r: 70, top: 8, kind: 'candy', seed: 22 },
  { x: 1600, z: -1060, r: 40, top: 5, kind: 'candy', seed: 23 },
  { x: 1290, z: -760, r: 30, top: 4, kind: 'candy', seed: 24 },
  { x: 1900, z: 250, r: 80, top: 7, kind: 'toxic', seed: 25 },
  { x: 2080, z: 430, r: 30, top: 3, kind: 'toxic', seed: 26 },
  { x: -520, z: -2060, r: 50, top: 18, kind: 'dark', seed: 27 },
  { x: -300, z: -1850, r: 30, top: 12, kind: 'dark', seed: 28 },
  { x: -700, z: -1880, r: 24, top: 9, kind: 'dark', seed: 29 },
  { x: -2000, z: -700, r: 70, top: 6, kind: 'sand', seed: 30 },
  { x: -1850, z: -830, r: 24, top: 3, kind: 'sand', seed: 31 },
  { x: 500, z: 1980, r: 40, top: 4, kind: 'ruins', seed: 32 },
];

const VOLCANO = ISLANDS.find((i) => i.kind === 'volcano')!;
const VOID = ZONES.find((z) => z.id === 'void')!;
const MAGMA_I = ZONES.findIndex((z) => z.id === 'magma');
const TOXIC_I = ZONES.findIndex((z) => z.id === 'toxic');
const STORM_I = ZONES.findIndex((z) => z.id === 'storm');
const ATLANTIS_I = ZONES.findIndex((z) => z.id === 'atlantis');
const CANDY_I = ZONES.findIndex((z) => z.id === 'candy');
const TEMPLE_I = ZONES.findIndex((z) => z.id === 'temple');
const VOID_I = ZONES.findIndex((z) => z.id === 'void');

const wTmp: number[] = [];

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
    const crater = t < 0.14 ? 28 * (1 - Math.pow(t / 0.14, 2)) : 0;
    h = t < 1 ? cone - crater + 4 * fbm2(x * 0.02, z * 0.02) : lerp(-0.6, base, smoothstep(1, 2.2, t));
    if (t >= 1) h = Math.min(h, -0.6);
    return Math.max(base, h);
  }
  const steep = isl.kind === 'rock' || isl.kind === 'snow' || isl.kind === 'dark';
  if (t < 1) {
    const shoulder = steep ? smoothstep(0.7, 0.97, t) : smoothstep(0.45, 0.95, t);
    let top = isl.top;
    if (isl.kind === 'grass') top += 2.5 * smoothstep(0.1, -0.3, noise2(x * 0.03, z * 0.03)) * (isl === ISLANDS[0] ? 0 : 1);
    if (steep) top += isl.top * 0.35 * fbm2(x * 0.018 + isl.seed, z * 0.018);
    h = lerp(top, 0.7, shoulder);
    h = lerp(h, -0.6, smoothstep(steep ? 0.96 : 0.92, 1, t));
  } else h = lerp(-0.6, base, smoothstep(1, 2.4, t));
  return Math.max(base, h);
}

/** Terrain height (negative = seafloor depth). */
export function heightAt(x: number, z: number): number {
  const w = zoneWeights(x, z, wTmp);
  let depth = OPEN_SEA.floorDepth * w[ZONES.length];
  for (let i = 0; i < ZONES.length; i++) depth += ZONES[i].floorDepth * w[i];
  const n = fbm2(x * 0.0028, z * 0.0028, 3);
  let h = -depth * (1 + 0.3 * n) - 5 * noise2(x * 0.021, z * 0.021) - 1.5 * noise2(x * 0.09, z * 0.09);
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
  h = Math.min(h, -2.5);
  const edge = Math.hypot(x, z);
  if (edge > WORLD_R) h = lerp(h, -1200, smoothstep(WORLD_R, MAP_R, edge));
  for (const isl of ISLANDS) h = islandHeight(isl, x, z, h);
  if (w[VOID_I] > 0) {
    const dv = Math.hypot(x - VOID.x, z - VOID.z);
    h = lerp(h, -3000, smoothstep(VOID.radius + 60, VOID.radius - 160, dv));
  }
  return h;
}

/** Emissive mask (lava cracks / runes / void crystals) for coloring. */
function glowMask(x: number, z: number, h: number, w: number[]): number {
  let g = 0;
  if (w[MAGMA_I] > 0.05) {
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z) / VOLCANO.r;
    if (dv < 0.16 && h > 90) g = 1;
    const river = 1 - smoothstep(0.0, 0.05, Math.abs(noise2(Math.atan2(z - VOLCANO.z, x - VOLCANO.x) * 2.2, dv * 2)));
    if (dv < 0.85 && h > 2) g = Math.max(g, river * smoothstep(0.85, 0.3, dv));
    if (h < -15) g = Math.max(g, (1 - smoothstep(0, 0.04, Math.abs(noise2(x * 0.025, z * 0.025)))) * w[MAGMA_I]);
  }
  if (w[TEMPLE_I] > 0.05 && h < -10) g = Math.max(g, step(0.82, noise2(x * 0.05, z * 0.05)) * w[TEMPLE_I] * 0.7);
  if (w[VOID_I] > 0.05 && h < -5) g = Math.max(g, step(0.75, noise2(x * 0.08, z * 0.08)) * w[VOID_I]);
  if (w[TOXIC_I] > 0.05 && h < 1) g = Math.max(g, smoothstep(0.35, 0.6, noise2(x * 0.03 + 7, z * 0.03)) * w[TOXIC_I]);
  if (w[ATLANTIS_I] > 0.05 && h < -10) {
    const road = Math.max(step(0.93, Math.abs(Math.sin(x * 0.07))), step(0.93, Math.abs(Math.sin(z * 0.07))));
    g = Math.max(g, road * w[ATLANTIS_I] * 0.8);
  }
  if (w[CANDY_I] > 0.05 && h < -3) g = Math.max(g, step(0.9, noise2(x * 0.2, z * 0.2)) * w[CANDY_I] * 0.6);
  return g;
}
const step = (e: number, x: number) => (x >= e ? 1 : 0);

const C = {
  sand: hex('#f0d9a0'), grass: hex('#7dc85a'), grass2: hex('#5ea845'), rock: hex('#9a8f82'), cliff: hex('#7f7468'),
  snow: hex('#f5f9ff'), iceRock: hex('#9fb3c4'), basalt: hex('#3b3533'), blackSand: hex('#4a4240'), ruins: hex('#6f7f68'),
  moss: hex('#4f6a4a'), wetSand: hex('#d9c08a'),
  candySand: hex('#ffc8e4'), candyGrass: hex('#9af0c8'), candyRock: hex('#c08ae0'),
  sludge: hex('#6a6a48'), sludgeRock: hex('#4a4a3a'), darkRock: hex('#3a3e46'), darkGrass: hex('#4a5a4a'),
};
const floorColors: RGB[] = ZONES.map((z) => hex(z.env.floor));
const openFloor = hex(OPEN_SEA.env.floor);

function nearestIsland(x: number, z: number): Island | null {
  let best: Island | null = null, bd = Infinity;
  for (const i of ISLANDS) {
    const d = Math.hypot(x - i.x, z - i.z) / i.r;
    if (d < bd) { bd = d; best = i; }
  }
  return bd < 2.6 ? best : null;
}

function colorAt(x: number, z: number, h: number, slope: number, out: number[]) {
  const w = zoneWeights(x, z, wTmp);
  let r = openFloor[0] * w[ZONES.length], g = openFloor[1] * w[ZONES.length], b = openFloor[2] * w[ZONES.length];
  for (let i = 0; i < ZONES.length; i++) { r += floorColors[i][0] * w[i]; g += floorColors[i][1] * w[i]; b += floorColors[i][2] * w[i]; }
  let c: RGB = [r, g, b];
  const isl = nearestIsland(x, z);
  const kind = isl?.kind;
  const beach: RGB = kind === 'basalt' || kind === 'volcano' ? C.blackSand : kind === 'snow' ? C.iceRock : kind === 'candy' ? C.candySand
    : kind === 'toxic' ? C.sludge : kind === 'dark' ? C.darkRock : C.sand;
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
      default: land = slope > 0.4 ? C.rock : noise2(x * 0.05, z * 0.05) > 0.2 ? C.grass2 : C.grass;
    }
    c = h < 1.4 ? beach : land;
  }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  out[3] = glowMask(x, z, h, w);
}

const warp = (u: number, R: number, P: number) => Math.sign(u) * Math.pow(Math.abs(u), P) * R;

/** Builds the terrain mesh on a warped grid (dense around the harbor). */
export function buildTerrainMesh(N = 600): MeshData {
  const V = N + 1;
  const pos = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const x = warp((i / N) * 2 - 1, MAP_R, MESH_P), z = warp((j / N) * 2 - 1, MAP_R, MESH_P);
    const k = (j * V + i) * 3;
    pos[k] = x; pos[k + 1] = heightAt(x, z); pos[k + 2] = z;
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
    verts[o + 3] = nx; verts[o + 4] = ny; verts[o + 5] = nz;
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

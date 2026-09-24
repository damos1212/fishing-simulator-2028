import type { Archetype } from '../data/fish';
import { loadGLB } from '../engine/glb';
import { buoyMesh, flagMesh, kelpMesh, palmMesh, planetMesh, reelMesh, rodSegmentMesh, seagrassMesh } from '../engine/procgen';
import type { GpuMesh, GpuModel, Renderer } from '../engine/renderer';

const ARCHETYPES: Archetype[] = ['slim', 'tall', 'round', 'eel', 'shark', 'ray', 'jelly', 'squid', 'angler', 'whale', 'sword', 'eyeball',
  'crab', 'lobster', 'turtle', 'octopus', 'seahorse', 'starfish', 'serpent', 'dolphin', 'boot', 'bottle', 'duck',
  'ammonite', 'trilobite', 'plesio', 'mosasaur', 'dunkle', 'anomalo', 'bonefish', 'crystalfish', 'drake', 'robo', 'pixel'];
const MODELS = ['boat', 'fisher', 'lure', 'pier', 'shop', 'lighthouse', 'rock', 'coral', 'iceberg', 'pillar', 'tentacle', 'crystal', 'gull', 'chest',
  'shipwreck', 'ghostship', 'skullrock', 'barrel', 'factory', 'lollipop', 'candycane', 'gumdrop', 'icecream', 'dome', 'statue', 'arch', 'spire',
  'outpost', 'aquarium', 'shell', 'anchor', 'hats', 'pets', 'portal', 'fern', 'brachio', 'ptero', 'bones', 'floatrock', 'moonbase',
  'neonprops'] as const;
export type ModelName = (typeof MODELS)[number];

export interface Assets {
  models: Record<ModelName, GpuModel>;
  fish: Record<Archetype, GpuModel>;
  kelp: GpuMesh;
  palm: GpuMesh;
  planets: GpuMesh[];
  buoy: GpuMesh;
  rodSeg: GpuMesh;
  reel: GpuMesh;
  flag: GpuMesh;
  seagrass: GpuMesh;
}

export async function loadAssets(r: Renderer, progress: (p: number) => void): Promise<Assets> {
  const base = import.meta.env.BASE_URL + 'models/';
  const names = [...MODELS.map((m) => m as string), ...ARCHETYPES.map((a) => 'fish_' + a)];
  let done = 0;
  const loaded = await Promise.all(names.map(async (n) => {
    const m = await loadGLB(base + n + '.glb');
    progress(++done / names.length);
    return [n, r.registerModel(m)] as const;
  }));
  const map = new Map(loaded);
  const models = Object.fromEntries(MODELS.map((m) => [m, map.get(m)!])) as Record<ModelName, GpuModel>;
  const fish = Object.fromEntries(ARCHETYPES.map((a) => [a, map.get('fish_' + a)!])) as Record<Archetype, GpuModel>;
  return {
    models,
    fish,
    kelp: r.registerMesh(kelpMesh()),
    palm: r.registerMesh(palmMesh()),
    planets: [0, 1, 2].map((k) => r.registerMesh(planetMesh(k))),
    buoy: r.registerMesh(buoyMesh()),
    rodSeg: r.registerMesh(rodSegmentMesh()),
    reel: r.registerMesh(reelMesh()),
    flag: r.registerMesh(flagMesh()),
    seagrass: r.registerMesh(seagrassMesh()),
  };
}

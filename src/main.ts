import { initGPU } from './engine/gpu';
import { Renderer } from './engine/renderer';
import { loadAssets } from './game/assets';
import { Game } from './game/game';
import { loadSave } from './game/save';
import { UI } from './ui/ui';
import { setActiveRealm } from './data/zones';
import { buildHeightMap, buildTerrainMesh, syncRealm } from './world/terrain';

// Yield so the loading bar can paint; falls back to a timer when the tab is hidden (no rAF).
const nextFrame = () => new Promise<void>((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 60);
});

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = new UI(document.getElementById('ui')!);
  const { save, existed } = loadSave();
  let game: Game | null = null;
  ui.showTitle(() => {
    if (!game) return;
    ui.hideTitle();
    game.start();
  }, existed);

  let gpu;
  try {
    gpu = await initGPU(canvas);
  } catch (e) {
    ui.error((e as Error).message);
    return;
  }
  const r = new Renderer(gpu);
  r.renderScale = save.settings.quality ?? 1;
  r.setQuality(save.settings.graphics ?? 2);
  r.settings.taa = save.settings.taa;
  r.settings.motionBlur = save.settings.motionBlur ? 0.5 : 0;
  r.settings.autoExposure = save.settings.autoExposure;
  window.addEventListener('resize', () => r.resize());

  let assetP = 0, worldP = 0;
  const progress = (label = '') => ui.setLoading(Math.min(0.99, assetP * 0.4 + worldP * 0.6), label);
  const assetsPromise = loadAssets(r, (p) => { assetP = p; progress(); });
  await nextFrame();
  const t0 = performance.now();
  progress('Filling the ocean...');
  await nextFrame();
  setActiveRealm(save.realm);
  syncRealm();
  const heightmap = buildHeightMap();
  r.setHeightMap(heightmap, 800);
  worldP = 0.4; progress('Raising islands...');
  await nextFrame();
  const terrain = r.registerMesh(buildTerrainMesh());
  worldP = 0.8; progress('Drawing sea charts...');
  await nextFrame();
  ui.prepareMap();
  worldP = 1; progress('Waking up the fish...');
  console.info(`world generated in ${Math.round(performance.now() - t0)}ms`);
  const assets = await assetsPromise;

  game = new Game(r, assets, { terrain, heightmap }, ui, save, canvas);
  const loop = (t: number) => {
    game!.frame(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // debug helper: advance the simulation manually (e.g. in a background tab where rAF is paused)
  let simT = performance.now();
  (window as unknown as { __step: (n: number, dt?: number) => void }).__step = (n, dt = 16.7) => {
    for (let i = 0; i < n; i++) { simT = Math.max(simT + dt, performance.now()); game!.frame(simT); }
  };
  ui.setLoading(1);
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:10px;left:10px;color:#fff;z-index:9">${String(e)}</pre>`);
});

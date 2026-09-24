import { initGPU } from './engine/gpu';
import { Renderer } from './engine/renderer';
import { loadAssets } from './game/assets';
import { Game } from './game/game';
import { loadSave } from './game/save';
import { UI } from './ui/ui';
import { buildHeightMap, buildTerrainMesh } from './world/terrain';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

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
  window.addEventListener('resize', () => r.resize());

  let assetP = 0, worldP = 0;
  const progress = () => ui.setLoading(Math.min(0.99, assetP * 0.5 + worldP * 0.5));
  const assetsPromise = loadAssets(r, (p) => { assetP = p; progress(); });
  await nextFrame();
  const hm = buildHeightMap(640);
  r.setHeightMap(hm, 640);
  worldP = 0.4; progress();
  await nextFrame();
  const terrain = r.registerMesh(buildTerrainMesh(480));
  worldP = 1; progress();
  const assets = await assetsPromise;

  game = new Game(r, assets, terrain, ui, save, canvas);
  const loop = (t: number) => {
    game!.frame(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  ui.setLoading(1);
}

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:10px;left:10px;color:#fff;z-index:9">${String(e)}</pre>`);
});

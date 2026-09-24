// DOM overlay: title, HUD, popups, catch summary, shop, map and pause menu.
import { BOSS_FOR_ZONE, CATCHABLE, RARITY_COLOR, speciesById, type WeatherKind } from '../data/fish';
import { COSMETICS, type CosmeticKind, ITEMS, type ItemId } from '../data/items';
import { TRACKS, type TrackId } from '../data/upgrades';
import { ALL_ZONES, ZONES } from '../data/zones';
import { clamp } from '../engine/math';
import { coolerValue, DEX_TOTAL, formatMoney, type LandResult, nextTier, type SaveData } from '../game/economy';
import { ACHIEVEMENTS, type Contract, contractGoal } from '../game/progress';
import { heightAt, WORLD_R } from '../world/terrain';
import { WEATHER_LABEL } from '../world/timeweather';

const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const TRACK_ICON: Record<TrackId, string> = {
  rod: 'R', reel: '@', bait: 'B', hooks: 'J', sinker: 'S', lamp: 'L', finder: 'F', engine: 'E', hull: 'H', cooler: 'C',
};
const HAT_ICON: Record<string, string> = {
  'hat-souwester': '&#9730;', 'hat-propeller': '&#127744;', 'hat-cowboy': '&#129312;', 'hat-chef': '&#127859;', 'hat-pirate': '&#9760;',
  'hat-top': '&#127913;', 'hat-viking': '&#9876;', 'hat-wizard': '&#10024;', 'hat-fish': '&#128031;', 'hat-crown': '&#128081;',
};
const WEATHER_ICON: Record<WeatherKind, string> = { clear: '&#9728;', cloudy: '&#9729;', rain: '&#9730;', storm: '&#9889;', fog: '&#8776;' };

export interface Destination { name: string; zone: string; cost: number; here: boolean }

export interface ShopHandlers {
  title: string;
  harbor: boolean;
  sell: () => void;
  buy: (id: TrackId) => void;
  buyItem: (id: ItemId, n: number) => void;
  buyCosmetic: (id: string) => void;
  itemPrice: (id: ItemId) => number;
  reroll: () => void;
  rerollCost: () => number;
  destinations: () => Destination[];
  travel: (i: number) => void;
  close: () => void;
  statText: (id: TrackId, tier: number) => string;
}

export interface PauseHandlers {
  resume: () => void;
  reset: () => void;
  change: (s: SaveData['settings']) => void;
}

type ShopTab = TrackId | 'sell' | 'dex' | 'supplies' | 'style' | 'contracts' | 'travel' | 'trophies';

export class UI {
  private el: Record<string, HTMLElement> = {};
  private mapImage: HTMLCanvasElement | null = null;
  private mini: CanvasRenderingContext2D;
  private sonarCtx: CanvasRenderingContext2D;
  private bannerTimer = 0;
  private shopTab: ShopTab = 'sell';
  private styleKind: CosmeticKind = 'hat';
  private dexZone = 'all';
  modal: 'none' | 'catch' | 'shop' | 'map' | 'pause' | 'title' = 'title';
  onClick: () => void = () => {};

  constructor(private root: HTMLElement) {
    const hud = h(`<div id="hud" class="hidden">
      <div id="money" class="chip"><div class="coin">$</div><span>$0</span></div>
      <div id="pearls" class="chip"><div class="pearl"></div><span>0</span></div>
      <div id="cooler" class="chip"><span>Cooler 0/6</span></div>
      <div id="contracts"></div>
      <div id="zoneName" class="chip"><span></span></div>
      <div id="clock" class="chip"><span class="w"></span><span class="t">06:00</span></div>
      <div id="minimap"><canvas width="380" height="380"></canvas></div>
      <div id="bossbar" class="hidden"><div class="name display outlined"></div><div class="bar"><i></i></div></div>
      <div id="banner"><div class="t1 display outlined"></div><div class="t2 display outlined"></div><div class="t3 outlined"></div></div>
      <div id="toasts"></div>
      <div id="tutorial" class="hidden"></div>
      <div id="prompt" class="display outlined"></div>
      <div id="power" class="hidden"><i></i><b>POWER</b></div>
      <div id="depth" class="hidden"><div class="cap display outlined">DEPTH</div><div class="bar"><div class="lim"></div><div class="pin"></div></div><div class="val display outlined">0m</div></div>
      <div id="hooks" class="hidden"></div>
      <div id="tension" class="hidden"><div class="label display outlined">FIGHT!</div><div class="pull display outlined"></div><div class="track"><div class="needle"></div></div><div class="stam"><i></i></div></div>
      <div id="sonar" class="hidden"><div class="h"><span>SONAR</span><span class="d"></span></div><canvas width="420" height="160"></canvas><div class="info"></div></div>
      <div id="items"></div>
      <div id="legend" class="hidden"><div class="arrow">&#9650;</div></div>
      <div id="fps" class="hidden"></div>
    </div>`);
    root.appendChild(hud);
    for (const id of ['hud', 'money', 'pearls', 'cooler', 'contracts', 'zoneName', 'clock', 'minimap', 'bossbar', 'banner', 'toasts', 'tutorial', 'prompt', 'power', 'depth',
      'hooks', 'tension', 'sonar', 'items', 'legend', 'fps']) {
      this.el[id] = hud.id === id ? hud : hud.querySelector('#' + id)!;
    }
    this.mini = (this.el.minimap.querySelector('canvas') as HTMLCanvasElement).getContext('2d')!;
    this.sonarCtx = (this.el.sonar.querySelector('canvas') as HTMLCanvasElement).getContext('2d')!;
    root.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.btn,.tab')) this.onClick(); });
  }

  // ------------------------------------------------------------------ title
  showTitle(onPlay: () => void, hasSave: boolean) {
    const t = h(`<div id="title">
      <div class="logo display outlined">FISHING<span>SIMULATOR 2028</span></div>
      <div class="sub display outlined">Cast. Catch. Upgrade. Go deeper.</div>
      <div class="load"><i></i></div>
      <button class="btn green hidden">${hasSave ? 'CONTINUE' : 'PLAY'}</button>
      <div class="controls">
        <b>W A S D</b><span>Sail the boat / steer the lure</span>
        <b>Mouse / 2-finger swipe / Arrows</b><span>Look around (pinch to zoom)</span>
        <b>Hold Click or Space</b><span>Cast power, reel in underwater</span>
        <b>Hold Shift or Right Click</b><span>Dive the lure deeper</span>
        <b>A / D while fighting</b><span>Counter the fish's pull</span>
        <b>1 - 6</b><span>Use supplies (chum, charms, boss bait...)</span>
        <b>E</b><span>Shop at the dock or an outpost</span>
        <b>M / Esc</b><span>Map / Pause</span>
      </div>
    </div>`);
    this.root.appendChild(t);
    this.el.title = t;
    t.querySelector('.btn')!.addEventListener('click', () => onPlay());
  }
  setLoading(p: number, label = '') {
    const bar = this.el.title?.querySelector('.load i') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    if (label && this.el.title) this.el.title.querySelector('.sub')!.textContent = label;
    if (p >= 1 && this.el.title) {
      this.el.title.querySelector('.load')!.classList.add('hidden');
      this.el.title.querySelector('.btn')!.classList.remove('hidden');
      this.el.title.querySelector('.sub')!.textContent = 'Cast. Catch. Upgrade. Go deeper.';
    }
  }
  hideTitle() { this.el.title?.remove(); this.modal = 'none'; this.el.hud.classList.remove('hidden'); }
  error(msg: string) { this.root.appendChild(h(`<div id="err"><div><div class="display" style="font-size:40px">Oh no!</div>${esc(msg)}<br><br>This game needs a browser with WebGPU (current Chrome, Edge or Safari).</div></div>`)); }

  // ------------------------------------------------------------------ HUD
  setMoney(v: number) { (this.el.money.querySelector('span') as HTMLElement).textContent = formatMoney(v); }
  setPearls(v: number) { (this.el.pearls.querySelector('span') as HTMLElement).textContent = String(v); }
  setCooler(n: number, max: number) {
    (this.el.cooler.querySelector('span') as HTMLElement).textContent = `Cooler ${n}/${max}`;
    this.el.cooler.classList.toggle('full', n >= max);
  }
  setZone(name: string) {
    const s = this.el.zoneName.querySelector('span')!;
    if (s.textContent !== name) s.textContent = name;
  }
  clock(time: string, weather: WeatherKind, night: boolean) {
    const key = time + weather + night;
    if (this.el.clock.dataset.k === key) return;
    this.el.clock.dataset.k = key;
    this.el.clock.querySelector('.w')!.innerHTML = night && weather === 'clear' ? '&#9790;' : WEATHER_ICON[weather];
    this.el.clock.querySelector('.t')!.textContent = `${time} ${WEATHER_LABEL[weather]}`;
    this.el.clock.classList.toggle('night', night);
  }
  fps(v: number | null) {
    this.el.fps.classList.toggle('hidden', v === null);
    if (v !== null) this.el.fps.textContent = `${Math.round(v)} fps`;
  }
  banner(t1: string, t2: string, t3: string, warn = false, ms = 3200) {
    const b = this.el.banner;
    b.querySelector('.t1')!.textContent = t1;
    b.querySelector('.t2')!.textContent = t2;
    b.querySelector('.t3')!.textContent = t3;
    b.classList.toggle('warn', warn);
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.remove('show'), ms);
  }
  prompt(html: string) { if (this.el.prompt.innerHTML !== html) this.el.prompt.innerHTML = html; }
  tutorial(html: string | null) {
    const el = this.el.tutorial;
    el.classList.toggle('hidden', !html);
    const full = html ? `<b>TIP</b> ${html}` : '';
    if (html && el.innerHTML !== full) el.innerHTML = full;
  }
  power(p: number | null) {
    this.el.power.classList.toggle('hidden', p === null);
    if (p !== null) (this.el.power.querySelector('i') as HTMLElement).style.width = `${p * 100}%`;
  }
  depth(show: boolean, depth = 0, max = 1, floor = 1) {
    this.el.depth.classList.toggle('hidden', !show);
    if (!show) return;
    const scale = Math.max(Math.min(max, floor * 1.3), 10);
    (this.el.depth.querySelector('.pin') as HTMLElement).style.top = `${clamp(depth / scale, 0, 1) * 100}%`;
    (this.el.depth.querySelector('.lim') as HTMLElement).style.top = `${clamp(floor / scale, 0, 1) * 100}%`;
    (this.el.depth.querySelector('.val') as HTMLElement).textContent = `${Math.round(depth)}m`;
    (this.el.depth.querySelector('.cap') as HTMLElement).textContent = `LINE ${Math.round(max)}m`;
  }
  hooks(show: boolean, colors: string[] = [], cap = 1) {
    this.el.hooks.classList.toggle('hidden', !show);
    if (!show) return;
    const key = colors.join(',') + '|' + cap;
    if (this.el.hooks.dataset.key === key) return;
    this.el.hooks.dataset.key = key;
    if (cap > 8) {
      this.el.hooks.innerHTML = `<div class="slot on wide">${colors.slice(-5).map((c) => `<i style="background:${c}"></i>`).join('')}<b>${colors.length}/${cap}</b></div>`;
      return;
    }
    this.el.hooks.innerHTML = Array.from({ length: cap }, (_, i) =>
      colors[i] ? `<div class="slot on" style="background:${colors[i]}">&#10003;</div>` : `<div class="slot">&#8226;</div>`).join('');
  }
  tension(show: boolean, t = 0, stamina = 1, name = '', pull = 0, counter = 0) {
    const el = this.el.tension;
    el.classList.toggle('hidden', !show);
    if (!show) return;
    (el.querySelector('.needle') as HTMLElement).style.left = `calc(${clamp(t, 0, 1) * 100}% - 4px)`;
    (el.querySelector('.stam i') as HTMLElement).style.width = `${stamina * 100}%`;
    el.querySelector('.label')!.textContent = t > 0.8 ? 'EASE OFF!' : `FIGHT! ${name}`;
    const pl = el.querySelector('.pull') as HTMLElement;
    pl.innerHTML = pull < 0 ? `&#11013; PULLING LEFT - hold <kbd>D</kbd>` : pull > 0 ? `PULLING RIGHT - hold <kbd>A</kbd> &#10145;` : '';
    pl.classList.toggle('good', counter > 0);
    pl.classList.toggle('bad', counter < 0);
    el.classList.toggle('danger', t > 0.8);
  }
  boss(b: { name: string; hp: number; enrage: number; surge: boolean } | null) {
    const el = this.el.bossbar;
    el.classList.toggle('hidden', !b);
    if (!b) return;
    el.querySelector('.name')!.textContent = `${b.name}${b.enrage ? ' - ENRAGED' + '!'.repeat(b.enrage) : ''}`;
    (el.querySelector('.bar i') as HTMLElement).style.width = `${b.hp * 100}%`;
    el.classList.toggle('surge', b.surge);
  }
  sonar(show: boolean, depthUnder = 0, blips: { depth: number; color: string; big: boolean }[] = [], info = '', maxDepth = 100) {
    const el = this.el.sonar;
    el.classList.toggle('hidden', !show);
    if (!show) return;
    (el.querySelector('.d') as HTMLElement).textContent = `${Math.round(depthUnder)}m`;
    const infoEl = el.querySelector('.info') as HTMLElement;
    if (infoEl.textContent !== info) infoEl.textContent = info;
    const c = this.sonarCtx, W = 420, H = 160;
    const img = c.getImageData(4, 0, W - 4, H);
    c.putImageData(img, 0, 0);
    c.fillStyle = '#041a18';
    c.fillRect(W - 4, 0, 4, H);
    const fy = clamp(depthUnder / maxDepth, 0, 1) * (H - 4);
    c.fillStyle = '#c08a3a';
    c.fillRect(W - 4, fy, 4, H - fy);
    for (const b of blips) {
      c.fillStyle = b.color;
      c.fillRect(W - 4, clamp(b.depth / maxDepth, 0, 1) * (H - 6), 4, b.big ? 6 : 3);
    }
  }
  inventory(inv: Record<ItemId, number>, effects: { label: string; color: string }[]) {
    const html = ITEMS.map((it) => `<div class="item ${inv[it.id] ? '' : 'empty'}" style="--c:${it.color}" title="${esc(it.name)}: ${esc(it.desc)}">
        <span class="k">${it.key}</span><span class="ic">${it.icon}</span><span class="n">${inv[it.id] ?? 0}</span></div>`).join('')
      + (effects.length ? `<div class="effects">${effects.map((e) => `<span style="background:${e.color}">${esc(e.label)}</span>`).join('')}</div>` : '');
    if (this.el.items.innerHTML !== html) this.el.items.innerHTML = html;
  }
  contracts(list: Contract[]) {
    const html = `<div class="ch display outlined">CONTRACTS</div>` + list.map((c) => {
      const goal = contractGoal(c);
      return `<div class="ct"><div>${esc(c.title)}</div><div class="cp"><i style="width:${Math.min(1, c.progress / goal) * 100}%"></i></div>
        <small>${Math.min(c.progress, goal)}/${goal} &middot; ${formatMoney(c.money)} + ${c.pearls} pearl${c.pearls > 1 ? 's' : ''}</small></div>`;
    }).join('');
    if (this.el.contracts.innerHTML !== html) this.el.contracts.innerHTML = html;
  }
  contractDone(c: Contract) {
    this.toast('CONTRACT COMPLETE!', '#7fff8a', true, `${c.title}: +${formatMoney(c.money)} +${c.pearls} pearls`);
  }
  achievement(name: string, desc: string, pearls: number) {
    const a = h(`<div class="achv"><div class="trophy">&#127942;</div><div><b class="display">${esc(name)}</b><div>${esc(desc)}</div><small>+${pearls} pearls</small></div></div>`);
    this.el.hud.appendChild(a);
    setTimeout(() => a.remove(), 4200);
  }
  legend(pos: { x: number; y: number; angle: number } | null) {
    const el = this.el.legend;
    el.classList.toggle('hidden', !pos);
    if (!pos) return;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    (el.querySelector('.arrow') as HTMLElement).style.transform = `rotate(${pos.angle}rad)`;
  }
  toast(text: string, color = '#fff', big = false, sub = '') {
    const t = h(`<div class="toast display outlined ${big ? 'big' : ''}" style="color:${color}">${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`);
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstElementChild!.remove();
    setTimeout(() => t.remove(), 2600);
  }
  floater(x: number, y: number, text: string, color = '#ffd23a') {
    const f = h(`<div class="floater display outlined" style="left:${x}px;top:${y}px;color:${color}">${esc(text)}</div>`);
    this.el.hud.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  // ------------------------------------------------------------------ maps
  prepareMap() { if (!this.mapImage) this.buildMapImage(); }

  private buildMapImage() {
    const N = 460;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(N, N);
    const zc = ZONES.map((z) => hexRGB(z.mapColor));
    const open = hexRGB('#2f78b8');
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N - 0.5) * 2 * WORLD_R, z = (j / N - 0.5) * 2 * WORLD_R;
      const hgt = heightAt(x, z);
      let c = open;
      let best = Infinity;
      for (let k = 0; k < ZONES.length; k++) {
        const d = Math.hypot(x - ZONES[k].x, z - ZONES[k].z) / ZONES[k].radius;
        if (d < 1 && d < best) { best = d; c = zc[k]; }
      }
      let r = c[0], g = c[1], b = c[2];
      if (hgt > 0.3) {
        [r, g, b] = hgt > 60 ? [120, 90, 80] : hgt > 20 ? [150, 150, 140] : [240, 220, 160];
        if (hgt > 3 && hgt < 20) [r, g, b] = [120, 200, 90];
      } else {
        const dk = clamp(1 - Math.min(-hgt, 800) / 1600, 0.55, 1);
        r *= dk; g *= dk; b *= dk;
        if (hgt > -4) { r = r * 0.5 + 128; g = g * 0.5 + 128; b = b * 0.5 + 128; }
      }
      if (Math.hypot(x, z) > WORLD_R - 20) { r *= 0.4; g *= 0.4; b *= 0.5; }
      const o = (j * N + i) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mapImage = cv;
  }

  drawMinimap(bx: number, bz: number, heading: number, spots: { x: number; z: number }[], docks: { x: number; z: number }[]) {
    if (!this.mapImage) this.buildMapImage();
    const c = this.mini, S = 380, range = 480;
    const img = this.mapImage!;
    const px = (bx / (2 * WORLD_R) + 0.5) * img.width, pz = (bz / (2 * WORLD_R) + 0.5) * img.height;
    const pr = (range / (2 * WORLD_R)) * img.width;
    c.imageSmoothingEnabled = true;
    c.fillStyle = '#1a3a5a';
    c.fillRect(0, 0, S, S);
    c.drawImage(img, px - pr, pz - pr, pr * 2, pr * 2, 0, 0, S, S);
    const toS = (x: number, z: number) => [S / 2 + ((x - bx) / range) * (S / 2), S / 2 + ((z - bz) / range) * (S / 2)];
    for (const s of spots) {
      const [x, y] = toS(s.x, s.z);
      if (x < -20 || x > S + 20 || y < -20 || y > S + 20) continue;
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.strokeStyle = '#1b1530';
      c.lineWidth = 4;
      c.beginPath(); c.arc(x, y, 12, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#ff8a2a'; c.font = 'bold 18px Lilita One'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', x, y + 1);
    }
    docks.forEach((d, i) => {
      const [dx, dy] = toS(d.x, d.z);
      const far = dx < 24 || dx > S - 24 || dy < 24 || dy > S - 24;
      if (far && i > 0) return;
      const ddx = clamp(dx, 24, S - 24), ddy = clamp(dy, 24, S - 24);
      c.fillStyle = i === 0 ? '#ffd23a' : '#7fe0ff'; c.strokeStyle = '#1b1530'; c.lineWidth = 4;
      c.beginPath(); c.arc(ddx, ddy, 13, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#1b1530'; c.font = '18px Lilita One'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(i === 0 ? '$' : 'O', ddx, ddy + 1);
    });
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(Math.PI - heading);
    c.fillStyle = '#fff'; c.strokeStyle = '#1b1530'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(0, -20); c.lineTo(13, 14); c.lineTo(0, 7); c.lineTo(-13, 14); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = '#fff'; c.font = '26px Lilita One'; c.textAlign = 'center'; c.strokeStyle = '#1b1530'; c.lineWidth = 6;
    c.strokeText('N', S / 2, 30); c.fillText('N', S / 2, 30);
  }

  openMap(bx: number, bz: number, heading: number, hull: number, spots: { x: number; z: number }[], seen: string[], outposts: { x: number; z: number; name: string }[] = []) {
    if (!this.mapImage) this.buildMapImage();
    const m = h(`<div id="map" class="modal"><div class="panel"><h2>Sea Chart</h2><canvas width="1000" height="1000"></canvas>
      <div style="text-align:center;margin-top:8px;font-weight:900">Press M to close &middot; <span style="color:#c08a00">$</span> harbor &middot; <span style="color:#1a8ab0">O</span> outposts (fast travel)</div></div></div>`);
    this.root.appendChild(m);
    this.el.map = m;
    this.modal = 'map';
    const cv = m.querySelector('canvas') as HTMLCanvasElement;
    const c = cv.getContext('2d')!;
    const S = 1000;
    c.drawImage(this.mapImage!, 0, 0, S, S);
    const toS = (x: number, z: number) => [(x / (2 * WORLD_R) + 0.5) * S, (z / (2 * WORLD_R) + 0.5) * S];
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const z of ZONES) {
      const [x, y] = toS(z.x, z.z);
      const known = seen.includes(z.id) || z.hull <= hull;
      c.lineWidth = 7; c.strokeStyle = '#1b1530'; c.fillStyle = '#fff'; c.font = '28px Lilita One';
      c.strokeText(known ? z.name : '???', x, y);
      c.fillText(known ? z.name : '???', x, y);
      c.font = '16px Nunito';
      if (z.hull > hull) {
        c.fillStyle = '#ffb0a0';
        const need = TRACKS.find((t) => t.id === 'hull')!.tiers[z.hull].name;
        c.strokeText(`Needs ${need}`, x, y + 28); c.fillText(`Needs ${need}`, x, y + 28);
      } else {
        c.fillStyle = '#d8f0ff';
        c.strokeText(`Level ${z.level}`, x, y + 28); c.fillText(`Level ${z.level}`, x, y + 28);
      }
    }
    for (const s of spots) {
      const [x, y] = toS(s.x, s.z);
      c.fillStyle = '#fff'; c.lineWidth = 4; c.strokeStyle = '#1b1530';
      c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    for (const o of outposts) {
      const [x, y] = toS(o.x, o.z);
      c.fillStyle = '#7fe0ff'; c.lineWidth = 4; c.strokeStyle = '#1b1530';
      c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#1b1530'; c.font = '16px Lilita One'; c.fillText('O', x, y + 1);
    }
    const [hx, hy] = toS(0, 60);
    c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(hx, hy, 13, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#1b1530'; c.font = '18px Lilita One'; c.fillText('$', hx, hy + 1);
    const [bx2, by2] = toS(bx, bz);
    c.save(); c.translate(bx2, by2); c.rotate(Math.PI - heading);
    c.fillStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, -18); c.lineTo(12, 12); c.lineTo(0, 6); c.lineTo(-12, 12); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  closeMap() { this.el.map?.remove(); this.modal = 'none'; }

  // ------------------------------------------------------------------ catch summary
  showCatch(res: LandResult, cast: number, onClose: () => void) {
    const rows = [...res.kept.map((f) => ({ f, kept: true })), ...res.released.map((f) => ({ f, kept: false }))];
    const list = rows.map(({ f, kept }, i) => {
      const sp = speciesById.get(f.id)!;
      const isNew = res.newSpecies.includes(f.id);
      const rec = res.records.includes(f.id);
      return `<div class="fishrow" style="animation-delay:${i * 0.12}s">
        <div class="sw" style="background:linear-gradient(${sp.colors[0]} 50%, ${sp.colors[1]} 50%)"></div>
        <div class="nm">${esc(sp.name)}${isNew ? '<span class="badge new">NEW!</span>' : ''}${rec ? '<span class="badge rec">RECORD</span>' : ''}${sp.boss ? '<span class="badge boss">BOSS</span>' : ''}
          <small style="color:${RARITY_COLOR[sp.rarity]}">${sp.rarity.toUpperCase()} &middot; ${(sp.size * f.size * (sp.boss ? 1 : 1.5)).toFixed(2)}m${kept ? '' : ' &middot; released (cooler full)'}</small></div>
        <div class="v">${kept ? formatMoney(f.value) : '-'}</div></div>`;
    }).join('');
    const total = res.kept.reduce((s, f) => s + f.value, 0);
    const m = h(`<div id="catch" class="modal"><div class="panel">
      <h2 class="display">${rows.length ? (rows.length > 3 ? 'WHAT A HAUL!' : 'NICE CATCH!') : 'Nothing...'}</h2>
      <div class="list">${list}</div>
      ${res.released.length ? '<div class="note">Your cooler is full! Sell at a dock or upgrade your cooler.</div>' : ''}
      ${res.pearls ? `<div class="note" style="color:#2a8ab0">+${res.pearls} pearls from the bottle!</div>` : ''}
      <div class="total"><span>Cooler value: ${formatMoney(cast)}</span><span style="color:#1f8a3a">+${formatMoney(total)}</span></div>
      <button class="btn green" style="margin-top:12px">KEEP FISHING</button></div></div>`);
    this.root.appendChild(m);
    this.el.catch = m;
    this.modal = 'catch';
    const close = () => { m.remove(); this.modal = 'none'; window.removeEventListener('keydown', key); onClose(); };
    const key = (e: KeyboardEvent) => { if (['Space', 'Enter', 'KeyE', 'Escape'].includes(e.code)) close(); };
    setTimeout(() => window.addEventListener('keydown', key), 400);
    m.querySelector('.btn')!.addEventListener('click', close);
  }

  // ------------------------------------------------------------------ shop
  openShop(save: SaveData, hs: ShopHandlers) {
    const m = h(`<div id="shop" class="modal"><div class="panel"><div class="side"></div><div class="main"></div></div></div>`);
    this.root.appendChild(m);
    this.el.shop = m;
    this.modal = 'shop';
    this.renderShop(save, hs);
  }

  renderShop(save: SaveData, hs: ShopHandlers) {
    const m = this.el.shop;
    if (!m) return;
    const side = m.querySelector('.side') as HTMLElement;
    const main = m.querySelector('.main') as HTMLElement;
    const scroll = main.scrollTop;
    const tabs: [ShopTab, string, boolean][] = [
      ['sell', 'Sell Fish', save.cooler.length > 0],
      ['contracts', 'Contracts', false],
      ['supplies', 'Supplies', false],
      ...TRACKS.map((t) => { const n = nextTier(save, t.id); return [t.id, t.name, !!n && save.money >= n.cost] as [ShopTab, string, boolean]; }),
      ['style', 'Style Shop', COSMETICS.some((c) => !save.cosmetics.owned.includes(c.id) && c.pearls <= save.pearls)],
      ['travel', 'Fast Travel', false],
      ['trophies', 'Trophies', false],
      ['dex', 'Fish Log', false],
    ];
    side.innerHTML = `<h2 class="display">${esc(hs.title)}</h2>` + tabs.map(([id, name, dot]) =>
      `<div class="tab ${this.shopTab === id ? 'on' : ''}" data-tab="${id}">${name}${dot ? '<span class="dot"></span>' : ''}</div>`).join('') +
      `<div style="flex:1"></div><button class="btn small blue" data-close>Leave (E)</button>`;
    side.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { this.shopTab = (t as HTMLElement).dataset.tab as ShopTab; main.scrollTop = 0; this.renderShop(save, hs); }));
    side.querySelector('[data-close]')!.addEventListener('click', () => hs.close());

    const wallet = `<div class="wallet"><div class="chip" style="position:static"><div class="coin" style="width:30px;height:30px"></div>${formatMoney(save.money)}</div>
      <div class="chip" style="position:static"><div class="pearl"></div>${save.pearls}</div></div>`;
    const head = (title: string, blurb: string) => `<div class="head"><h3>${esc(title)}</h3>${wallet}</div><div class="blurb">${esc(blurb)}</div>`;
    const tab = this.shopTab;
    if (tab === 'sell') {
      const v = coolerValue(save);
      const rows = save.cooler.slice(0, 80).map((f) => {
        const sp = speciesById.get(f.id)!;
        return `<div class="fishrow"><div class="sw" style="background:linear-gradient(${sp.colors[0]} 50%, ${sp.colors[1]} 50%)"></div><div class="nm">${esc(sp.name)}<small style="color:${RARITY_COLOR[sp.rarity]}">${sp.rarity}</small></div><div class="v">${formatMoney(f.value)}</div></div>`;
      }).join('');
      main.innerHTML = head('Sell Fish', hs.harbor ? 'Old Marta pays top dollar. Well, dollar.' : 'Outposts pay the same as the harbor. Handy!') +
        `<div class="sellbox"><div class="big">${formatMoney(v)}</div>
        <button class="btn green" ${save.cooler.length ? '' : 'disabled'} data-sell>SELL ${save.cooler.length} FISH</button>
        <div style="display:flex;flex-direction:column;gap:6px">${rows || '<div style="text-align:center;font-weight:800">Your cooler is empty. Go catch something!</div>'}</div></div>`;
      main.querySelector('[data-sell]')?.addEventListener('click', () => hs.sell());
    } else if (tab === 'contracts') {
      main.innerHTML = head('Contracts', 'Finish jobs for cash and pearls. They progress automatically when you land fish.') +
        save.contracts.map((c) => {
          const goal = contractGoal(c);
          return `<div class="tier next"><div class="ic" style="background:linear-gradient(#ffd23a,#ff9a1a)">!</div><div class="info"><b>${esc(c.title)}</b>
            <div class="cp big"><i style="width:${Math.min(1, c.progress / goal) * 100}%"></i></div><div class="stat">${Math.min(c.progress, goal)} / ${goal} &middot; Level ${c.level}</div></div>
            <div style="text-align:right;font-weight:900">${formatMoney(c.money)}<br><span style="color:#2a8ab0">+${c.pearls} pearls</span></div></div>`;
        }).join('') +
        `<button class="btn small ${save.money >= hs.rerollCost() ? '' : 'gray'}" data-reroll>New contracts (${formatMoney(hs.rerollCost())})</button>`;
      main.querySelector('[data-reroll]')?.addEventListener('click', () => hs.reroll());
    } else if (tab === 'supplies') {
      main.innerHTML = head('Supplies', 'Consumables. Press 1-6 (or click) to use them while fishing.') + ITEMS.map((it) => {
        const p = hs.itemPrice(it.id);
        return `<div class="tier"><div class="ic" style="background:${it.color}">${it.icon}</div><div class="info"><b>${esc(it.name)}</b> <span class="kbdk">${it.key}</span>
          <div>${esc(it.desc)}</div><div class="stat">You have ${save.inventory[it.id] ?? 0}</div></div>
          <div class="buyrow"><button class="btn small ${save.money >= p ? 'green' : 'gray'}" data-item="${it.id}" data-n="1">${formatMoney(p)}</button>
          <button class="btn small ${save.money >= p * 5 ? 'green' : 'gray'}" data-item="${it.id}" data-n="5">x5 ${formatMoney(p * 5)}</button></div></div>`;
      }).join('');
      main.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => hs.buyItem((b as HTMLElement).dataset.item as ItemId, +(b as HTMLElement).dataset.n!)));
    } else if (tab === 'style') {
      const kinds: [CosmeticKind, string][] = [['hat', 'Hats'], ['paint', 'Boat Paint'], ['flag', 'Flags'], ['lure', 'Lure Skins'], ['line', 'Fishing Line']];
      main.innerHTML = head('Style Shop', 'Spend pearls from contracts, achievements, treasure and bottles.') +
        `<div class="subtabs">${kinds.map(([k, n]) => `<div class="tab ${this.styleKind === k ? 'on' : ''}" data-kind="${k}">${n}</div>`).join('')}</div>
        <div class="grid">${COSMETICS.filter((c) => c.kind === this.styleKind).map((c) => {
          const owned = save.cosmetics.owned.includes(c.id);
          const eq = save.cosmetics.equipped[c.kind] === c.id;
          const sw = c.color ? `background:${c.color || '#2f5d8a'}` : c.colors ? `background:linear-gradient(135deg, ${c.colors[0]} 40%, ${c.colors[1]} 40% 70%, ${c.colors[2]} 70%)` : 'background:#ffd23a';
          return `<div class="card ${eq ? 'eq' : ''}"><div class="sw" style="${sw}">${c.kind === 'hat' ? (HAT_ICON[c.id] ?? '&#127913;') : ''}</div><b>${esc(c.name)}</b>
            <button class="btn small ${eq ? 'gray' : owned ? 'blue' : save.pearls >= c.pearls ? 'green' : 'gray'}" data-cos="${c.id}" ${eq ? 'disabled' : ''}>
            ${eq ? 'EQUIPPED' : owned ? 'EQUIP' : `${c.pearls} pearls`}</button></div>`;
        }).join('')}</div>`;
      main.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { this.styleKind = (b as HTMLElement).dataset.kind as CosmeticKind; this.renderShop(save, hs); }));
      main.querySelectorAll('[data-cos]').forEach((b) => b.addEventListener('click', () => hs.buyCosmetic((b as HTMLElement).dataset.cos!)));
    } else if (tab === 'travel') {
      const d = hs.destinations();
      main.innerHTML = head('Fast Travel', 'Hop to any harbor or outpost you have discovered. Sail near new outposts to add them.') + d.map((x, i) =>
        `<div class="tier ${x.here ? 'owned' : ''}"><div class="ic" style="background:linear-gradient(#7fe0ff,#2a8ab0)">${i === 0 ? '$' : 'O'}</div>
          <div class="info"><b>${esc(x.name)}</b><div>${esc(x.zone)}</div></div>
          ${x.here ? '<span style="font-weight:900">YOU ARE HERE</span>' : `<button class="btn small ${save.money >= x.cost ? 'green' : 'gray'}" data-go="${i}">${x.cost ? formatMoney(x.cost) : 'FREE'}</button>`}</div>`).join('') +
        (d.length < 2 ? '<div style="font-weight:800;text-align:center">No outposts discovered yet. Each zone has one floating outpost.</div>' : '');
      main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => hs.travel(+(b as HTMLElement).dataset.go!)));
    } else if (tab === 'trophies') {
      const bosses = [...BOSS_FOR_ZONE.values()];
      main.innerHTML = head('Trophies', `${save.achievements.filter((a) => ACHIEVEMENTS.some((x) => x.id === a)).length} / ${ACHIEVEMENTS.length} achievements`) +
        `<h4 class="display">Boss Trophies</h4><div class="grid">${bosses.map((b) => {
          const got = save.bosses.includes(b.id);
          const zone = ALL_ZONES.find((z) => z.id === b.zone)!.name;
          return `<div class="card ${got ? 'eq' : 'unknown'}"><div class="sw" style="background:${got ? `linear-gradient(${b.colors[0]} 50%, ${b.colors[1]} 50%)` : '#444'}"></div><b>${got ? esc(b.name) : '???'}</b><small>${esc(zone)}</small></div>`;
        }).join('')}</div><h4 class="display">Achievements</h4><div class="achlist">${ACHIEVEMENTS.map((a) => {
          const got = save.achievements.includes(a.id);
          return `<div class="ach ${got ? 'got' : ''}"><span>${got ? '&#127942;' : '&#128274;'}</span><div><b>${esc(a.name)}</b><div>${esc(a.desc)}</div></div><small>${a.pearls}p</small></div>`;
        }).join('')}</div>
        <h4 class="display">Records</h4><div class="stats">Fish caught: <b>${save.stats.caught}</b> &middot; Earned: <b>${formatMoney(save.stats.earned)}</b> &middot; Deepest: <b>${Math.round(save.stats.deepest)}m</b>
        &middot; Biggest haul: <b>${save.stats.maxHaul}</b> &middot; Best cast: <b>${formatMoney(save.stats.bestCast)}</b> &middot; Treasure: <b>${save.stats.treasures}</b></div>`;
    } else if (tab === 'dex') {
      const zones = [{ id: 'all', name: 'All' }, ...ALL_ZONES.map((z) => ({ id: z.id, name: z.name }))];
      let html = `<div class="head"><h3>Fish Log</h3><div class="chip" style="position:static">${Object.keys(save.dex).length}/${DEX_TOTAL}</div></div>
        <div class="subtabs">${zones.map((z) => `<div class="tab ${this.dexZone === z.id ? 'on' : ''}" data-dz="${z.id}">${esc(z.name)}</div>`).join('')}</div><div class="dex">`;
      for (const z of ALL_ZONES) {
        if (this.dexZone !== 'all' && this.dexZone !== z.id) continue;
        const list = CATCHABLE.filter((s) => s.zone === z.id);
        html += `<div class="zonehead">${esc(z.name)} <small>${list.filter((s) => save.dex[s.id]).length}/${list.length}</small></div>`;
        for (const s of list) {
          const e = save.dex[s.id];
          const cond = [s.time === 'night' ? 'night only' : '', s.weather ? `${s.weather} only` : '', s.boss ? 'BOSS: use Boss Bait' : '', s.junk ? 'junk, anywhere' : ''].filter(Boolean).join(', ');
          html += e ? `<div class="card"><div class="sw" style="background:linear-gradient(${s.colors[0]} 50%, ${s.colors[1]} 50%)"></div><b>${esc(s.name)}</b><span style="color:${RARITY_COLOR[s.rarity]}">${s.rarity}</span><br>x${e.caught} &middot; best ${(s.size * e.best * (s.boss ? 1 : 1.5)).toFixed(2)}m<br><i style="opacity:.7">${esc(s.flavor)}</i></div>`
            : `<div class="card unknown"><div class="sw"></div><b>???</b>${s.depth[0]}-${s.depth[1]}m &middot; bait ${s.bait}${cond ? `<br><small>${cond}</small>` : ''}</div>`;
        }
      }
      main.innerHTML = html + '</div>';
      main.querySelectorAll('[data-dz]').forEach((b) => b.addEventListener('click', () => { this.dexZone = (b as HTMLElement).dataset.dz!; this.renderShop(save, hs); }));
    } else {
      const t = TRACKS.find((x) => x.id === tab)!;
      const lvl = save.upgrades[t.id];
      main.innerHTML = head(t.name, t.blurb) + t.tiers.map((tier, i) => {
        const owned = i <= lvl, next = i === lvl + 1;
        const cls = owned ? 'owned' : next ? 'next' : 'locked';
        const btn = owned ? (i === lvl ? '<button class="btn small gray" disabled>EQUIPPED</button>' : '<span style="font-weight:900">OWNED</span>')
          : next ? `<button class="btn small ${save.money >= tier.cost ? 'green' : 'gray'}" data-buy ${save.money >= tier.cost ? '' : 'disabled'}>${formatMoney(tier.cost)}</button>`
          : `<span style="font-weight:900">${formatMoney(tier.cost)}</span>`;
        return `<div class="tier ${cls}"><div class="ic">${TRACK_ICON[t.id]}${i}</div><div class="info"><b>${esc(tier.name)}</b><div>${esc(tier.desc)}</div><div class="stat">${esc(hs.statText(t.id, i))}</div></div>${btn}</div>`;
      }).join('');
      main.querySelector('[data-buy]')?.addEventListener('click', () => hs.buy(t.id));
    }
    main.scrollTop = scroll;
  }
  closeShop() { this.el.shop?.remove(); this.modal = 'none'; }

  // ------------------------------------------------------------------ pause
  openPause(save: SaveData, hs: PauseHandlers) {
    const s = save.settings;
    const m = h(`<div id="pause" class="modal"><div class="panel">
      <h2 class="display">Paused</h2>
      <label>Music <input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></label>
      <label>Sound FX <input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx"></label>
      <label>Mouse sensitivity <input type="range" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}" data-k="sensitivity"></label>
      <label>Render quality <input type="range" min="0.5" max="1" step="0.25" value="${s.quality}" data-k="quality"></label>
      <label>Invert mouse Y <input type="checkbox" ${s.invertY ? 'checked' : ''} data-k="invertY"></label>
      <label>Screen shake <input type="checkbox" ${s.shake ? 'checked' : ''} data-k="shake"></label>
      <label>Show FPS <input type="checkbox" ${s.fps ? 'checked' : ''} data-k="fps"></label>
      <div class="keys"><b>WASD</b><span>Sail / steer lure</span><b>Mouse, 2-finger swipe, Arrows</b><span>Look (pinch = zoom)</span><b>Hold Click / Space</b><span>Cast power / reel in</span>
        <b>Hold Shift / RMB</b><span>Dive</span><b>A / D in a fight</b><span>Counter the pull</span><b>1 - 6</b><span>Use supplies</span><b>E</b><span>Shop at docks & outposts</span><b>M</b><span>Map</span><b>H</b><span>Horn</span></div>
      <div style="font-weight:800;font-size:13px;text-align:center">Caught ${save.stats.caught} fish &middot; earned ${formatMoney(save.stats.earned)} &middot; deepest ${Math.round(save.stats.deepest)}m &middot; ${Math.round(save.stats.playTime / 60)} min played</div>
      <div class="row"><button class="btn green" data-resume>RESUME</button><button class="btn small gray" data-reset style="background:linear-gradient(#ff8a8a,#d04a4a)">Reset save</button></div>
    </div></div>`);
    this.root.appendChild(m);
    this.el.pause = m;
    this.modal = 'pause';
    m.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => {
      const k = (inp as HTMLInputElement).dataset.k as keyof SaveData['settings'];
      const v = inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
      (s as unknown as Record<string, number | boolean>)[k] = v;
      hs.change(s);
    }));
    m.querySelector('[data-resume]')!.addEventListener('click', () => hs.resume());
    const reset = m.querySelector('[data-reset]') as HTMLButtonElement;
    reset.addEventListener('click', () => {
      if (reset.dataset.armed) hs.reset();
      else { reset.dataset.armed = '1'; reset.textContent = 'Click again to erase!'; }
    });
  }
  closePause() { this.el.pause?.remove(); this.modal = 'none'; }
}

function hexRGB(hx: string): [number, number, number] {
  const n = parseInt(hx.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

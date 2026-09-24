// DOM overlay: title, HUD, popups, catch summary, shop, map and pause menu.
import { RARITY_COLOR, SPECIES, speciesById } from '../data/fish';
import { TRACKS, type TrackId } from '../data/upgrades';
import { ZONES } from '../data/zones';
import { clamp } from '../engine/math';
import { coolerValue, DEX_TOTAL, formatMoney, type LandResult, nextTier, type SaveData } from '../game/economy';
import { heightAt, WORLD_R } from '../world/terrain';

const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const TRACK_ICON: Record<TrackId, string> = {
  rod: 'R', reel: '@', bait: 'B', hooks: 'J', sinker: 'S', lamp: 'L', finder: 'F', engine: 'E', hull: 'H', cooler: 'C',
};

export interface ShopHandlers {
  sell: () => void;
  buy: (id: TrackId) => void;
  close: () => void;
  statText: (id: TrackId, tier: number) => string;
}

export interface PauseHandlers {
  resume: () => void;
  reset: () => void;
  change: (s: SaveData['settings']) => void;
}

export class UI {
  private el: Record<string, HTMLElement> = {};
  private mapImage: HTMLCanvasElement | null = null;
  private mini: CanvasRenderingContext2D;
  private sonarCtx: CanvasRenderingContext2D;
  private bannerTimer = 0;
  private shopTab: TrackId | 'sell' | 'dex' = 'sell';
  modal: 'none' | 'catch' | 'shop' | 'map' | 'pause' | 'title' = 'title';
  onClick: () => void = () => {};

  constructor(private root: HTMLElement) {
    const hud = h(`<div id="hud" class="hidden">
      <div id="money" class="chip"><div class="coin">$</div><span>$0</span></div>
      <div id="cooler" class="chip"><span>Cooler 0/6</span></div>
      <div id="zoneName" class="chip"><span></span></div>
      <div id="minimap"><canvas width="380" height="380"></canvas></div>
      <div id="banner"><div class="t1 display outlined"></div><div class="t2 display outlined"></div><div class="t3 outlined"></div></div>
      <div id="toasts"></div>
      <div id="prompt" class="display outlined"></div>
      <div id="power" class="hidden"><i></i><b>POWER</b></div>
      <div id="depth" class="hidden"><div class="cap display outlined">DEPTH</div><div class="bar"><div class="lim"></div><div class="pin"></div></div><div class="val display outlined">0m</div></div>
      <div id="hooks" class="hidden"></div>
      <div id="tension" class="hidden"><div class="label display outlined">FIGHT!</div><div class="track"><div class="needle"></div></div><div class="stam"><i></i></div></div>
      <div id="sonar" class="hidden"><div class="h"><span>SONAR</span><span class="d"></span></div><canvas width="420" height="160"></canvas><div class="info"></div></div>
      <div id="legend" class="hidden"><div class="arrow">&#9650;</div></div>
    </div>`);
    root.appendChild(hud);
    for (const id of ['hud', 'money', 'cooler', 'zoneName', 'minimap', 'banner', 'toasts', 'prompt', 'power', 'depth', 'hooks', 'tension', 'sonar', 'legend']) {
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
        <b>E</b><span>Tackle shop (at the dock)</span>
        <b>M / Esc</b><span>Map / Pause</span>
      </div>
    </div>`);
    this.root.appendChild(t);
    this.el.title = t;
    t.querySelector('.btn')!.addEventListener('click', () => onPlay());
  }
  setLoading(p: number) {
    const bar = this.el.title?.querySelector('.load i') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    if (p >= 1 && this.el.title) {
      this.el.title.querySelector('.load')!.classList.add('hidden');
      this.el.title.querySelector('.btn')!.classList.remove('hidden');
    }
  }
  hideTitle() { this.el.title?.remove(); this.modal = 'none'; this.el.hud.classList.remove('hidden'); }
  error(msg: string) { this.root.appendChild(h(`<div id="err"><div><div class="display" style="font-size:40px">Oh no!</div>${esc(msg)}<br><br>This game needs a browser with WebGPU (current Chrome, Edge or Safari).</div></div>`)); }

  // ------------------------------------------------------------------ HUD
  setMoney(v: number) { (this.el.money.querySelector('span') as HTMLElement).textContent = formatMoney(v); }
  setCooler(n: number, max: number) {
    (this.el.cooler.querySelector('span') as HTMLElement).textContent = `Cooler ${n}/${max}`;
    this.el.cooler.classList.toggle('full', n >= max);
  }
  setZone(name: string, locked = false) {
    this.el.zoneName.querySelector('span')!.innerHTML = `${esc(name)}${locked ? ' <small>(locked)</small>' : ''}`;
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
  power(p: number | null) {
    this.el.power.classList.toggle('hidden', p === null);
    if (p !== null) (this.el.power.querySelector('i') as HTMLElement).style.width = `${p * 100}%`;
  }
  depth(show: boolean, depth = 0, max = 1, floor = 1) {
    this.el.depth.classList.toggle('hidden', !show);
    if (!show) return;
    const scale = Math.max(max, 10);
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
    this.el.hooks.innerHTML = Array.from({ length: cap }, (_, i) =>
      colors[i] ? `<div class="slot on" style="background:${colors[i]}">&#10003;</div>` : `<div class="slot">&#8226;</div>`).join('');
  }
  tension(show: boolean, t = 0, stamina = 1, name = '') {
    const el = this.el.tension;
    el.classList.toggle('hidden', !show);
    if (!show) return;
    (el.querySelector('.needle') as HTMLElement).style.left = `calc(${clamp(t, 0, 1) * 100}% - 4px)`;
    (el.querySelector('.stam i') as HTMLElement).style.width = `${stamina * 100}%`;
    el.querySelector('.label')!.textContent = t > 0.8 ? 'EASE OFF!' : `FIGHT! ${name}`;
    el.classList.toggle('danger', t > 0.8);
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
    setTimeout(() => t.remove(), 2300);
  }
  floater(x: number, y: number, text: string, color = '#ffd23a') {
    const f = h(`<div class="floater display outlined" style="left:${x}px;top:${y}px;color:${color}">${esc(text)}</div>`);
    this.el.hud.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  // ------------------------------------------------------------------ maps
  private buildMapImage() {
    const N = 360;
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

  drawMinimap(bx: number, bz: number, heading: number, spots: { x: number; z: number }[], dock: { x: number; z: number }) {
    if (!this.mapImage) this.buildMapImage();
    const c = this.mini, S = 380, range = 420;
    const img = this.mapImage!;
    const px = (bx / (2 * WORLD_R) + 0.5) * img.width, pz = (bz / (2 * WORLD_R) + 0.5) * img.height;
    const pr = (range / (2 * WORLD_R)) * img.width;
    c.imageSmoothingEnabled = true;
    c.drawImage(img, px - pr, pz - pr, pr * 2, pr * 2, 0, 0, S, S);
    const toS = (x: number, z: number) => [S / 2 + ((x - bx) / range) * (S / 2), S / 2 + ((z - bz) / range) * (S / 2)];
    for (const s of spots) {
      const [x, y] = toS(s.x, s.z);
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.strokeStyle = '#1b1530';
      c.lineWidth = 4;
      c.beginPath(); c.arc(x, y, 12, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#ff8a2a'; c.font = 'bold 18px Lilita One'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', x, y + 1);
    }
    const [dx, dy] = toS(dock.x, dock.z);
    const ddx = clamp(dx, 24, S - 24), ddy = clamp(dy, 24, S - 24);
    c.fillStyle = '#ffd23a'; c.strokeStyle = '#1b1530'; c.lineWidth = 4;
    c.beginPath(); c.arc(ddx, ddy, 13, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#1b1530'; c.font = '18px Lilita One'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', ddx, ddy + 1);
    // boat arrow
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(Math.PI - heading);
    c.fillStyle = '#fff'; c.strokeStyle = '#1b1530'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(0, -20); c.lineTo(13, 14); c.lineTo(0, 7); c.lineTo(-13, 14); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = '#fff'; c.font = '26px Lilita One'; c.textAlign = 'center'; c.strokeStyle = '#1b1530'; c.lineWidth = 6;
    c.strokeText('N', S / 2, 30); c.fillText('N', S / 2, 30);
  }

  openMap(bx: number, bz: number, heading: number, hull: number, spots: { x: number; z: number }[], seen: string[]) {
    if (!this.mapImage) this.buildMapImage();
    const m = h(`<div id="map" class="modal"><div class="panel"><h2>Sea Chart</h2><canvas width="900" height="900"></canvas>
      <div style="text-align:center;margin-top:8px;font-weight:900">Press M to close</div></div></div>`);
    this.root.appendChild(m);
    this.el.map = m;
    this.modal = 'map';
    const cv = m.querySelector('canvas') as HTMLCanvasElement;
    const c = cv.getContext('2d')!;
    const S = 900;
    c.drawImage(this.mapImage!, 0, 0, S, S);
    const toS = (x: number, z: number) => [(x / (2 * WORLD_R) + 0.5) * S, (z / (2 * WORLD_R) + 0.5) * S];
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const z of ZONES) {
      const [x, y] = toS(z.x, z.z);
      const known = seen.includes(z.id);
      c.lineWidth = 7; c.strokeStyle = '#1b1530'; c.fillStyle = '#fff'; c.font = '30px Lilita One';
      c.strokeText(known || z.hull <= hull ? z.name : '???', x, y);
      c.fillText(known || z.hull <= hull ? z.name : '???', x, y);
      if (z.hull > hull) {
        c.font = '18px Nunito'; c.fillStyle = '#ffb0a0';
        const need = TRACKS.find((t) => t.id === 'hull')!.tiers[z.hull].name;
        c.strokeText(`Needs ${need}`, x, y + 30); c.fillText(`Needs ${need}`, x, y + 30);
      }
    }
    for (const s of spots) {
      const [x, y] = toS(s.x, s.z);
      c.fillStyle = '#fff'; c.lineWidth = 4; c.strokeStyle = '#1b1530';
      c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    const [hx, hy] = toS(0, 60);
    c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(hx, hy, 14, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#1b1530'; c.font = '20px Lilita One'; c.fillText('$', hx, hy + 1);
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
        <div class="nm">${esc(sp.name)}${isNew ? '<span class="badge new">NEW!</span>' : ''}${rec ? '<span class="badge rec">RECORD</span>' : ''}
          <small style="color:${RARITY_COLOR[sp.rarity]}">${sp.rarity.toUpperCase()} &middot; ${(sp.size * f.size).toFixed(2)}m${kept ? '' : ' &middot; released (cooler full)'}</small></div>
        <div class="v">${kept ? formatMoney(f.value) : '-'}</div></div>`;
    }).join('');
    const total = res.kept.reduce((s, f) => s + f.value, 0);
    const m = h(`<div id="catch" class="modal"><div class="panel">
      <h2 class="display">${rows.length ? (rows.length > 3 ? 'WHAT A HAUL!' : 'NICE CATCH!') : 'Nothing...'}</h2>
      <div class="list">${list || '<div style="text-align:center;font-weight:800">The fish got away this time. Try steering into them!</div>'}</div>
      ${res.released.length ? '<div class="note">Your cooler is full! Sell at the dock or upgrade your cooler.</div>' : ''}
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
    const tabs: [string, string, boolean][] = [
      ['sell', 'Sell Fish', save.cooler.length > 0],
      ...TRACKS.map((t) => { const n = nextTier(save, t.id); return [t.id, t.name, !!n && save.money >= n.cost] as [string, string, boolean]; }),
      ['dex', 'Fish Log', false],
    ];
    side.innerHTML = `<h2 class="display">Tackle Shop</h2>` + tabs.map(([id, name, dot]) =>
      `<div class="tab ${this.shopTab === id ? 'on' : ''}" data-tab="${id}">${name}${dot ? '<span class="dot"></span>' : ''}</div>`).join('') +
      `<div style="flex:1"></div><button class="btn small blue" data-close>Leave (E)</button>`;
    side.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { this.shopTab = (t as HTMLElement).dataset.tab as TrackId; this.renderShop(save, hs); }));
    side.querySelector('[data-close]')!.addEventListener('click', () => hs.close());

    const money = `<div class="chip" style="position:static">${'<div class="coin" style="width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff3a0,#ffc93c 45%,#e09000);border:3px solid #1b1530"></div>'}${formatMoney(save.money)}</div>`;
    if (this.shopTab === 'sell') {
      const v = coolerValue(save);
      const rows = save.cooler.slice(0, 60).map((f) => {
        const sp = speciesById.get(f.id)!;
        return `<div class="fishrow"><div class="sw" style="background:linear-gradient(${sp.colors[0]} 50%, ${sp.colors[1]} 50%)"></div><div class="nm">${esc(sp.name)}<small style="color:${RARITY_COLOR[sp.rarity]}">${sp.rarity}</small></div><div class="v">${formatMoney(f.value)}</div></div>`;
      }).join('');
      main.innerHTML = `<div class="head"><h3>Sell Fish</h3>${money}</div><div class="blurb">Old Marta pays top dollar. Well, dollar.</div>
        <div class="sellbox"><div class="big">${formatMoney(v)}</div>
        <button class="btn green" ${save.cooler.length ? '' : 'disabled'} data-sell>SELL ${save.cooler.length} FISH</button>
        <div style="display:flex;flex-direction:column;gap:6px">${rows || '<div style="text-align:center;font-weight:800">Your cooler is empty. Go catch something!</div>'}</div></div>`;
      main.querySelector('[data-sell]')?.addEventListener('click', () => hs.sell());
    } else if (this.shopTab === 'dex') {
      let html = `<div class="head"><h3>Fish Log</h3><div class="chip" style="position:static">${Object.keys(save.dex).length}/${DEX_TOTAL}</div></div><div class="dex">`;
      for (const z of [{ id: 'open', name: 'Open Sea' }, ...ZONES]) {
        const list = SPECIES.filter((s) => s.zone === z.id && !s.hazard);
        html += `<div class="zonehead">${esc(z.name)}</div>`;
        for (const s of list) {
          const e = save.dex[s.id];
          html += e ? `<div class="card"><div class="sw" style="background:linear-gradient(${s.colors[0]} 50%, ${s.colors[1]} 50%)"></div><b>${esc(s.name)}</b><span style="color:${RARITY_COLOR[s.rarity]}">${s.rarity}</span><br>x${e.caught} &middot; best ${(s.size * e.best).toFixed(2)}m<br><i style="opacity:.7">${esc(s.flavor)}</i></div>`
            : `<div class="card unknown"><div class="sw"></div><b>???</b>${s.depth[0]}-${s.depth[1]}m &middot; bait ${s.bait}</div>`;
        }
      }
      main.innerHTML = html + '</div>';
    } else {
      const t = TRACKS.find((x) => x.id === this.shopTab)!;
      const lvl = save.upgrades[t.id];
      main.innerHTML = `<div class="head"><h3>${t.name}</h3>${money}</div><div class="blurb">${esc(t.blurb)}</div>` + t.tiers.map((tier, i) => {
        const owned = i <= lvl, next = i === lvl + 1;
        const cls = owned ? 'owned' : next ? 'next' : 'locked';
        const btn = owned ? (i === lvl ? '<button class="btn small gray" disabled>EQUIPPED</button>' : '<span style="font-weight:900">OWNED</span>')
          : next ? `<button class="btn small ${save.money >= tier.cost ? 'green' : 'gray'}" data-buy ${save.money >= tier.cost ? '' : 'disabled'}>${formatMoney(tier.cost)}</button>`
          : `<span style="font-weight:900">${formatMoney(tier.cost)}</span>`;
        return `<div class="tier ${cls}"><div class="ic">${TRACK_ICON[t.id]}${i}</div><div class="info"><b>${esc(tier.name)}</b><div>${esc(tier.desc)}</div><div class="stat">${esc(hs.statText(t.id, i))}</div></div>${btn}</div>`;
      }).join('');
      main.querySelector('[data-buy]')?.addEventListener('click', () => hs.buy(t.id));
    }
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
      <label>Invert mouse Y <input type="checkbox" ${s.invertY ? 'checked' : ''} data-k="invertY"></label>
      <div class="keys"><b>WASD</b><span>Sail / steer lure</span><b>Mouse, 2-finger swipe, Arrows</b><span>Look (pinch = zoom)</span><b>Hold Click / Space</b><span>Cast power / reel in</span><b>Hold Shift / RMB</b><span>Dive</span><b>E</b><span>Shop at dock</span><b>M</b><span>Map</span><b>H</b><span>Horn</span></div>
      <div style="font-weight:800;font-size:13px;text-align:center">Caught ${save.stats.caught} fish &middot; earned ${formatMoney(save.stats.earned)} &middot; deepest ${Math.round(save.stats.deepest)}m</div>
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

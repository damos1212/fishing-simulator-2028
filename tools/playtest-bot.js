// Automated play-tester: sails, casts, dives, steers to fish, fights, sells and upgrades.
// Runs inside the game page (dev build) using window.__game and window.__mods: import it from the
// browser console and call startBot({ maxMinutes }) on a fresh save; progress lands in window.__bot.log.
export function startBot(opts = {}) {
  const g = window.__game, M = window.__mods;
  const { heightAt } = M.terrain;
  const Z = M.zones, E = M.economy, U = M.upgrades;
  const inp = g.input;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const bot = window.__bot = {
    log: [], events: [], errors: [], running: true, phase: 'start', frames: 0, casts: 0, underT: 0, stuckT: 0,
    target: null, dock: null, lastLogMin: -1, milestones: {}, idleT: 0, noFishT: 0, depthGoal: 20, lastEarned: 0, aimT: 0,
    maxMinutes: opts.maxMinutes ?? 60, dt: opts.dt ?? 50, chunk: opts.chunk ?? 25, realms: opts.realms ?? false,
  };
  const keys = new Set();
  const hold = (k, on) => {
    if (on && !keys.has(k)) { inp.press(k); keys.add(k); } else if (!on && keys.has(k)) { inp.release(k); keys.delete(k); }
  };
  const tap = (k) => { inp.press(k); inp.release(k); };
  const releaseAll = () => [...keys].forEach((k) => hold(k, false));
  const origErr = console.error;
  console.error = (...a) => { bot.errors.push({ t: g.time, msg: a.map(String).join(' ').slice(0, 300) }); origErr(...a); };
  window.addEventListener('error', (e) => bot.errors.push({ t: g.time, msg: 'window: ' + e.message }));
  window.addEventListener('unhandledrejection', (e) => bot.errors.push({ t: g.time, msg: 'promise: ' + String(e.reason).slice(0, 200) }));

  const stats = () => g.stats;
  const minutes = () => g.save.stats.playTime / 60;

  // ---------------------------------------------------------------- planning
  function zoneChoice() {
    const s = stats();
    const realm = Z.activeRealm();
    const open = Z.NAMED_ZONES.filter((z) => z.realm === realm && z.hull <= s.hull && z.level <= s.baitTier + 1);
    if (!open.length) return null;
    // the most valuable zone we can fish properly, but prefer ones close by when levels tie
    open.sort((a, b) => b.level - a.level || Math.hypot(a.x - g.boat.pos.x, a.z - g.boat.pos.z) - Math.hypot(b.x - g.boat.pos.x, b.z - g.boat.pos.z));
    return open[0];
  }
  function fishingSpot(zone) {
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * zone.radius * 0.6;
      const x = zone.x + Math.cos(a) * d, z = zone.z + Math.sin(a) * d;
      const h = heightAt(x, z);
      if (h > -25) continue;
      const score = Math.min(-h, stats().lineLength) - Math.hypot(x - g.boat.pos.x, z - g.boat.pos.z) * 0.02;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    return best ?? { x: zone.x, z: zone.z };
  }
  function nearestDock() {
    const docks = [{ x: g.scenery.dockSpot.x, z: g.scenery.dockSpot.z, name: 'harbor' }, ...g.scenery.outposts.map((o) => ({ x: o.dock.x, z: o.dock.z, name: o.name }))];
    const b = g.boat.pos;
    docks.sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
    return docks[0];
  }
  function wantsShop() {
    const s = stats();
    if (g.save.cooler.length >= s.cooler - Math.max(1, Math.floor(s.hooks / 2))) return true;
    // enough cash for something meaningful and the cooler has value
    return false;
  }
  function depthGoal() {
    const s = stats();
    const zone = g.zone;
    const pool = E.zonePool(zone.id).filter((sp) => !sp.hazard && !sp.junk && !sp.boss && sp.bait <= s.baitTier);
    if (!pool.length) return 15;
    let wsum = 0, dsum = 0;
    for (const sp of pool) {
      const mid = (sp.depth[0] + sp.depth[1]) / 2;
      if (sp.depth[0] > s.lineLength * 0.9) continue;
      const w = sp.weight * sp.value;
      wsum += w; dsum += w * Math.min(mid, s.lineLength * 0.85);
    }
    return wsum ? dsum / wsum : 15;
  }

  // ---------------------------------------------------------------- driving
  const blocked = (x, z) => {
    if (heightAt(x, z) > -2) return true;
    // the harbor pier and floating outposts
    if (Z.activeRealm() === 'blue' && Math.abs(x) < 6.5 && z > 50 && z < 96) return true;
    return g.scenery.outposts.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < 11);
  };
  function clearPath(x, z, ang, len) {
    for (let d = 4; d <= len; d += 4) if (blocked(x + Math.sin(ang) * d, z + Math.cos(ang) * d)) return d - 4;
    return len;
  }
  function steerTo(tx, tz, stopDist) {
    const b = g.boat;
    const dx = tx - b.pos.x, dz = tz - b.pos.z;
    const dist = Math.hypot(dx, dz);
    const direct = Math.atan2(dx, dz);
    // pick the heading that makes the most progress along a clear path (re-planned every tick)
    let bestA = direct, bestS = -Infinity;
    const look = Math.min(90, dist);
    for (let k = 0; k < 24; k++) {
      const a = direct + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 12;
      const free = clearPath(b.pos.x, b.pos.z, a, look);
      const prog = Math.cos(wrap(a - direct)) * free + (free >= look ? 40 : 0) - Math.abs(wrap(a - b.heading)) * 3;
      if (prog > bestS) { bestS = prog; bestA = a; }
    }
    const err = wrap(bestA - b.heading);
    hold('KeyA', err > 0.06);
    hold('KeyD', err < -0.06);
    const slow = dist < stopDist + 25;
    hold('KeyW', dist > stopDist && (!slow || Math.abs(b.speed) < 6) && Math.abs(err) < 2.2);
    hold('KeyS', dist <= stopDist && b.speed > 1.5);
    // stuck = no progress towards the target for a while: back off, turn, and try a new spot
    const now = g.time;
    if (!bot.prog || dist < bot.prog.d - 4) bot.prog = { d: dist, t: now };
    if (bot.escape > 0) {
      bot.escape -= bot.dt / 1000;
      hold('KeyW', false); hold('KeyS', true); hold(bot.escapeDir, true);
      if (bot.escape <= 0) { hold('KeyS', false); hold('KeyA', false); hold('KeyD', false); bot.prog = null; }
      return dist;
    }
    if (dist > stopDist + 5 && now - bot.prog.t > 6) {
      bot.escape = 2.5; bot.escapeDir = Math.random() < 0.5 ? 'KeyA' : 'KeyD'; bot.prog = null;
      bot.stuckCount = (bot.stuckCount ?? 0) + 1;
      if (bot.stuckCount % 3 === 0) { bot.target = null; bot.dock = null; }
    }
    return dist;
  }

  // ---------------------------------------------------------------- shop
  function shopRound() {
    const q = (sel) => document.querySelector(sel);
    q('[data-tab="sell"]')?.click();
    const sell = q('[data-sell]');
    if (sell && !sell.disabled) sell.click();
    // buy upgrades: cheapest weighted next tier first, repeat
    for (let n = 0; n < 40; n++) {
      const s = g.save;
      let best = null;
      for (const t of U.TRACKS) {
        const nt = E.nextTier(s, t.id);
        if (!nt || nt.cost > s.money) continue;
        const w = { hull: 0.7, bait: 0.8, rod: 0.9, hooks: 0.9, cooler: 1, reel: 1.2, sinker: 1.2, lamp: 1.6, engine: 1.4, finder: 1.8 }[t.id] ?? 1.5;
        // a hull is only worth it once our bait can handle the zone it opens
        if (t.id === 'hull') {
          const z = Z.NAMED_ZONES.find((zz) => zz.hull === s.upgrades.hull + 1);
          if (z && z.level > stats().baitTier + 1) continue;
          if (z && z.realm !== 'blue' && !bot.realms) continue;
        }
        const score = nt.cost * w;
        if (!best || score < best.score) best = { id: t.id, score, cost: nt.cost };
      }
      if (!best) break;
      q(`[data-tab="${best.id}"]`)?.click();
      const b = q('[data-buy]');
      if (!b || b.disabled) break;
      b.click();
      bot.events.push({ t: minutes(), type: 'buy', id: best.id, tier: g.save.upgrades[best.id], cost: best.cost });
      if (best.id === 'hull') bot.milestones['hull' + g.save.upgrades.hull] = +minutes().toFixed(1);
    }
    // perks with spare pearls
    q('[data-tab="perks"]')?.click();
    for (let n = 0; n < 5; n++) { const p = q('[data-perk]:not([disabled])'); if (!p) break; p.click(); }
    q('[data-close]')?.click();
  }

  // ---------------------------------------------------------------- fishing
  function fishStep() {
    const f = g.fishing, s = stats();
    const lure = f.lure;
    // pick a target fish
    let target = null, td = Infinity;
    let danger = null, dd = Infinity;
    for (const fish of f.fish) {
      if (fish.gone || fish.hooked) continue;
      const d = fish.pos.distanceTo(lure);
      if (fish.sp.hazard) { if (d < dd) { dd = d; danger = fish; } continue; }
      if (fish.sp.junk || fish.sp.bait > s.baitTier || fish.flee > 0) continue;
      const score = d / (1 + Math.log2(1 + fish.sp.value / (g.zone.level + 1)));
      if (score < td) { td = score; target = fish; }
    }
    const full = f.hooked.length >= s.hooks;
    bot.underT += bot.dt / 1000;
    const giveUp = bot.underT > 70 || (bot.underT > 35 && f.hooked.length > 0 && !target);
    let mx = 0, mz = 0, dive = false, reel = false;
    if (full || giveUp || f.fighting) {
      reel = true;
      if (f.tension > 0.78) reel = false;
      if (f.fighting) {
        // steer against the pull: pull +1 (right) -> press A
        mx = -f.fighting.pull;
      }
    } else {
      const aim = target ? target.pos : null;
      let want = null;
      if (aim) want = { x: aim.x - lure.x, y: aim.y - lure.y, z: aim.z - lure.z };
      else if (-lure.y < bot.depthGoal) want = { x: 0, y: -1, z: 0 };
      if (danger && dd < 6) want = { x: lure.x - danger.pos.x, y: 0, z: lure.z - danger.pos.z };
      if (want) {
        const fw = g.cam.forwardXZ, rt = g.cam.rightXZ;
        const len = Math.hypot(want.x, want.z) || 1;
        const pf = (want.x * fw.x + want.z * fw.z) / len, pr = (want.x * rt.x + want.z * rt.z) / len;
        if (Math.hypot(want.x, want.z) > 1.2) { mz = Math.abs(pf) > 0.3 ? Math.sign(pf) : 0; mx = Math.abs(pr) > 0.3 ? Math.sign(pr) : 0; }
        dive = want.y < -1.5 && !f.lineMaxed;
      }
    }
    hold('KeyW', mz > 0); hold('KeyS', mz < 0); hold('KeyD', mx > 0); hold('KeyA', mx < 0);
    hold('ShiftLeft', dive); hold('Space', reel);
  }

  function faceOpenWater() {
    const b = g.boat.pos;
    let best = 0, bestH = Infinity;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const h = heightAt(b.x + Math.sin(a) * 30, b.z + Math.cos(a) * 30) + heightAt(b.x + Math.sin(a) * 15, b.z + Math.cos(a) * 15);
      if (h < bestH) { bestH = h; best = a; }
    }
    // camera forward is (-sin yaw, -cos yaw); point it along (sin a, cos a)
    g.cam.yaw = best + Math.PI;
  }

  // ---------------------------------------------------------------- main tick
  function tick() {
    const ui = g.ui, f = g.fishing;
    // modals
    if (ui.modal === 'catch') { document.querySelector('#catch .btn')?.click(); return; }
    if (ui.modal === 'dialog') { releaseAll(); if (bot.frames % 6 === 0) tap('Space'); return; }
    if (ui.modal === 'shop') { releaseAll(); shopRound(); return; }
    if (ui.modal === 'ending' || ui.modal === 'realms' || ui.modal === 'pause' || ui.modal === 'map') {
      releaseAll();
      const b = document.querySelector('.modal .btn.green, .modal .btn');
      if (b) b.click(); else tap('Escape');
      bot.events.push({ t: minutes(), type: 'modal', modal: ui.modal });
      return;
    }
    if (ui.modal !== 'none') { releaseAll(); return; }
    if (g.kraken?.active) { releaseAll(); if (bot.frames % 3 === 0) tap('Space'); return; }

    if (f.state === 'under') { bot.phase = 'fish'; fishStep(); return; }
    if (f.state === 'landing' || f.state === 'retrieve' || f.state === 'flight') { releaseAll(); return; }
    bot.underT = 0;
    if (f.state === 'aim') {
      faceOpenWater();
      bot.aimT += bot.dt / 1000;
      const p = f.power;
      if ((p > 0.87 && p < 0.95 && f.powerDir > 0) || bot.aimT > 4) { hold('Space', false); bot.casts++; bot.aimT = 0; }
      return;
    }
    // idle: sell/upgrade, travel, or cast
    if (wantsShop() || bot.phase === 'toDock') {
      bot.phase = 'toDock';
      if (!bot.dock) bot.dock = nearestDock();
      const d = steerTo(bot.dock.x, bot.dock.z, 10);
      if (d < 20 && Math.abs(g.boat.speed) < 6) { releaseAll(); tap('KeyE'); bot.phase = 'shopped'; bot.dock = null; bot.target = null; }
      return;
    }
    const zone = zoneChoice();
    if (!zone) return;
    if (!bot.target || bot.target.zone !== zone.id) { const sp = fishingSpot(zone); bot.target = { ...sp, zone: zone.id }; }
    const d = steerTo(bot.target.x, bot.target.z, 30);
    if (d > 60) { bot.phase = 'sail'; return; }
    if (Math.abs(g.boat.speed) > 2) { hold('KeyW', false); hold('KeyS', true); return; }
    releaseAll();
    bot.phase = 'cast';
    bot.depthGoal = depthGoal() * (0.7 + Math.random() * 0.6);
    faceOpenWater();
    hold('Space', true);
    bot.aimT = 0;
    // re-roll the spot now and then to find new water
    if (Math.random() < 0.15) bot.target = null;
  }

  function logMinute() {
    const s = g.save, st = stats();
    const m = Math.floor(minutes());
    if (m === bot.lastLogMin) return;
    bot.lastLogMin = m;
    bot.log.push({ m, money: Math.round(s.money), earned: Math.round(s.stats.earned), lvl: E.progressLevel(s), zone: g.zone.id, hull: s.upgrades.hull,
      bait: s.upgrades.bait, rod: s.upgrades.rod, hooks: s.upgrades.hooks, cooler: s.upgrades.cooler, casts: s.stats.casts, caught: s.stats.caught,
      snapped: s.stats.snapped, pearls: s.pearls, quest: s.quest.index, phase: bot.phase });
  }

  function loop() {
    if (!bot.running) { releaseAll(); return; }
    try {
      for (let i = 0; i < bot.chunk; i++) {
        tick();
        window.__step(1, bot.dt);
        bot.frames++;
      }
      logMinute();
      if (minutes() >= bot.maxMinutes) { bot.running = false; bot.phase = 'done'; releaseAll(); return; }
    } catch (e) {
      bot.errors.push({ t: g.time, msg: 'bot: ' + (e && e.stack ? e.stack.slice(0, 400) : String(e)) });
      if (bot.errors.length > 50) { bot.running = false; return; }
    }
    setTimeout(loop, 0);
  }
  loop();
  return bot;
}

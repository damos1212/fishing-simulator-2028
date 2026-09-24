// World dressing for the portal realms: vegetation and rocks on their islands, landmarks,
// floating islands, sea life props and treasure.
import { NAMED_ZONES, type RealmId } from '../data/zones';
import { rng, Vec3 } from '../engine/math';
import { Inst } from '../engine/renderer';
import type { Scenery } from './scenery';
import { heightAt, type Island, ISLANDS } from './terrain';

const zi = (id: string) => NAMED_ZONES.findIndex((z) => z.id === id);

function glowInst(r: number, g: number, b: number, k: number) {
  const i = Inst.solid(2);
  i.a.set([r, g, b, k]);
  return i;
}

/** Scatters points over an island's dry land. */
function onIsland(isl: Island, count: number, seed: number, minH: number, fn: (x: number, z: number, h: number, r: () => number) => void) {
  const r = rng(seed);
  let placed = 0;
  for (let t = 0; t < count * 6 && placed < count; t++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * isl.r * 0.9;
    const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
    const h = heightAt(x, z);
    if (h < minH) continue;
    if (Math.hypot(x, z) < 90 && Math.abs(x) < 30 && z > 40) continue;
    fn(x, z, h, r);
    placed++;
  }
}

function chests(sc: Scenery, zones: string[], n: number, seed: number) {
  for (const id of zones) {
    const i = zi(id);
    sc.scatter(i, n, seed + i, (x, z, h) => {
      if (h > -6) return;
      sc.chests.push({ pos: new Vec3(x, h + 0.2, z), zone: i, taken: 0 });
    });
  }
}

function seabedRocks(sc: Scenery, zones: string[], n: number, color: string, seed: number) {
  const inst = sc.tint(color, 0.04);
  for (const id of zones) {
    sc.scatter(zi(id), n, seed + zi(id), (x, z, h, r) => {
      if (h > -3) return;
      sc.add(sc.a.models.rock, x, h, z, r() * 6.28, 1.5 + r() * 5, inst, 220, true);
    });
  }
}

function crystals(sc: Scenery, zones: string[], n: number, color: string, glow: number, seed: number, above = false) {
  const inst = sc.tint(color, 0.04, glow);
  for (const id of zones) {
    sc.scatter(zi(id), n, seed + zi(id), (x, z, h, r) => {
      if (above) {
        if (h < 1) return;
        sc.add(sc.a.models.crystal, x, h - 0.5, z, r() * 6.28, 2 + r() * 4, inst, 2200, false, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
      } else {
        if (h > -4) return;
        sc.add(sc.a.models.crystal, x, h, z, r() * 6.28, 1.5 + r() * 3, inst, 220, true);
      }
    });
  }
}

function floatingRocks(sc: Scenery, zones: string[], n: number, seed: number, glow: Inst, tint: string, hMin = 30, hMax = 90) {
  const rock = sc.tint(tint, 0.08);
  for (const id of zones) {
    sc.scatter(zi(id), n, seed + zi(id), (x, z, _h, r) => {
      const y = hMin + r() * (hMax - hMin);
      const s = 0.6 + r() * 1.6;
      const inst = Inst.solid(0, 0.08);
      inst.a.set(rock.a);
      inst.c[3] = 14;
      inst.amp = 2 + r() * 2;
      inst.phase = r() * 10;
      const p = sc.add(sc.a.models.floatrock, x, y, z, r() * 6.28, s, inst, 5000);
      p.skip = (m) => m.name === 'Glow';
      p.phaseSpeed = 0.3 + r() * 0.3;
      const g = Inst.solid(2);
      g.a.set(glow.a);
      g.c[3] = 14;
      g.amp = inst.amp;
      g.phase = inst.phase;
      sc.twin(p, sc.a.models.floatrock.byName.get('Glow')!, g);
    });
  }
}

function jurassic(sc: Scenery) {
  const { models } = sc.a;
  const fern = Inst.solid(0, 0.04);
  fern.c[3] = 7;
  fern.amp = 0.4;
  const bones = sc.tint('#e8dcc0', 0.06);
  const rock = sc.tint('#6a6a50', 0.06);
  for (const isl of ISLANDS) {
    if (isl.kind === 'jungle') {
      onIsland(isl, Math.round(isl.r / 5), isl.seed, 1.2, (x, z, h, r) => {
        const p = sc.add(models.fern, x, h - 0.3, z, r() * 6.28, 0.7 + r() * 0.8, fern, 2200);
        p.phaseSpeed = 0.5;
      });
      onIsland(isl, Math.round(isl.r / 14), isl.seed + 50, 3, (x, z, h, r) => sc.add(models.rock, x, h - 0.5, z, r() * 6.28, 1.5 + r() * 3, rock, 1800));
    } else if (isl.kind === 'bone' || isl.kind === 'tar') {
      onIsland(isl, 1, isl.seed, 0.6, (x, z, h, r) => sc.add(models.bones, x, h - 1.2, z, r() * 6.28, 0.6 + r() * 0.4, bones, 2500));
    } else if (isl.kind === 'volcano' || isl.kind === 'basalt') {
      onIsland(isl, Math.round(isl.r / 12), isl.seed, 2, (x, z, h, r) => sc.add(models.rock, x, h - 1, z, r() * 6.28, 2 + r() * 5, sc.tint('#3a3434', 0.06), 2500));
    }
  }
  // brachiosaurs wading in the shallows
  const brachio = Inst.solid(0, 0.06);
  brachio.c[3] = 7;
  brachio.amp = 0.12;
  let placed = 0;
  const r = rng(77);
  for (let t = 0; t < 400 && placed < 7; t++) {
    const x = (r() - 0.5) * 2600, z = (r() - 0.5) * 2600;
    const h = heightAt(x, z);
    if (h > -3 || h < -9 || Math.hypot(x, z) < 160) continue;
    const p = sc.add(models.brachio, x, h, z, r() * 6.28, 0.8 + r() * 0.3, brachio, 4000);
    p.phaseSpeed = 0.25;
    placed++;
  }
  // bones on the seabed of the tar pits, fossils in the crater
  sc.scatter(zi('tarpit'), 14, 311, (x, z, h, rr) => {
    if (h > -6) return;
    sc.add(models.bones, x, h - 1, z, rr() * 6.28, 0.5 + rr() * 0.6, bones, 260, true);
  });
  const shells = sc.tint('#d89a50', 0.03);
  sc.scatter(zi('fern'), 120, 312, (x, z, h, rr) => {
    if (h > -2) return;
    sc.add(models.shell, x, h, z, rr() * 6.28, 1 + rr() * 2, shells, 110, true, 1.4, rr());
  });
  const grassInst = Inst.solid(0, 0);
  grassInst.c[3] = 7;
  grassInst.amp = 1.5;
  for (const id of ['fern', 'tarpit']) {
    sc.scatter(zi(id), 300, 313 + zi(id), (x, z, h, rr) => {
      if (h > -1.5 || h < -60) return;
      const p = sc.add(sc.a.seagrass, x, h - 0.1, z, rr() * 6.28, 1 + rr() * 1.4, grassInst, 120, true);
      p.phaseSpeed = 1.2;
    });
  }
  sc.scatter(zi('fern'), 320, 314, (x, z, h, rr) => {
    if (h > -8) return;
    const inst = Inst.solid(0, 0);
    inst.c[3] = 7;
    inst.amp = 0.12 + rr() * 0.08;
    inst.phase = rr() * 10;
    const p = sc.add(sc.a.kelp, x, h - 0.5, z, rr() * 6.28, Math.min((-h + 4) / 40, 0.6 + rr() * 1.6), inst, 190, true);
    p.phaseSpeed = 0.6;
  });
  seabedRocks(sc, ['crater', 'tarpit', 'fern'], 60, '#4a3a30', 320);
  crystals(sc, ['crater'], 40, '#ff7a30', 1.2, 330);
  chests(sc, ['fern', 'tarpit', 'crater'], 6, 340);
}

function shattered(sc: Scenery) {
  const { models } = sc.a;
  const felGlow = glowInst(0.5, 1.4, 0.3, 2.5);
  floatingRocks(sc, ['nether'], 26, 401, felGlow, '#5a4a6a', 30, 110);
  floatingRocks(sc, ['hellfire', 'blackgate'], 6, 402, felGlow, '#5a2a1a', 40, 90);
  const hellRock = sc.tint('#6a2a1a', 0.07);
  const felRock = sc.tint('#3a2a44', 0.07);
  const spire = Inst.solid(0, 0.08);
  spire.a.set([0.5, 0.25, 0.25, 0]);
  for (const isl of ISLANDS) {
    const k = isl.kind;
    if (k !== 'hellfire' && k !== 'fel' && k !== 'ash') continue;
    onIsland(isl, Math.round(isl.r / 9), isl.seed, 1.2, (x, z, h, r) => {
      sc.add(models.rock, x, h - 0.6, z, r() * 6.28, 2 + r() * 4, k === 'hellfire' ? hellRock : felRock, 2400);
    });
    onIsland(isl, Math.round(isl.r / 18), isl.seed + 9, 3, (x, z, h, r) => {
      sc.add(models.crystal, x, h - 0.5, z, r() * 6.28, 3 + r() * 4, sc.tint('#70ff40', 0.04, 1.3), 2800, false, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4);
    });
  }
  // jagged spires rising from the hellfire shallows
  sc.scatter(zi('hellfire'), 18, 420, (x, z, h, r) => {
    if (h > -6) return;
    const s = 0.6 + r() * 0.9;
    const p = sc.add(models.spire, x, h * 0.3 - 4, z, r() * 6.28, s, spire, 3200);
    p.skip = (m) => m.name === 'Glow';
    sc.twin(p, models.spire.byName.get('Glow')!, glowInst(0.5, 1.4, 0.3, 3));
  });
  // the Black Gate itself: a colossal dark portal on its island
  const gateIsl = ISLANDS.find((i) => i.seed === 211);
  if (gateIsl) {
    const g = sc.add(models.portal, gateIsl.x, heightAt(gateIsl.x, gateIsl.z) - 6, gateIsl.z, 0.3, 3.2, sc.tint('#2a2a24', 0.1), 6000);
    g.skip = (m) => m.name === 'Glow';
    sc.twin(g, models.portal.byName.get('Glow')!, glowInst(0.4, 1.5, 0.2, 4));
  }
  seabedRocks(sc, ['hellfire', 'nether', 'blackgate'], 70, '#3a2a30', 430);
  crystals(sc, ['nether', 'blackgate', 'hellfire'], 50, '#70ff40', 1.2, 440);
  const bones = sc.tint('#c8c0b0', 0.05);
  sc.scatter(zi('blackgate'), 16, 450, (x, z, h, r) => {
    if (h > -10) return;
    sc.add(models.bones, x, h - 1, z, r() * 6.28, 0.7 + r() * 0.6, bones, 300, true);
  });
  chests(sc, ['hellfire', 'nether', 'blackgate'], 6, 460);
}

function selene(sc: Scenery) {
  const { models } = sc.a;
  const moonRock = sc.tint('#b0b0b4', 0.06);
  for (const isl of ISLANDS) {
    if (isl.kind !== 'moon' && isl.kind !== 'crater') continue;
    onIsland(isl, Math.round(isl.r / 7), isl.seed, 0.8, (x, z, h, r) => sc.add(models.rock, x, h - 0.4, z, r() * 6.28, 0.8 + r() * 2.5, moonRock, 2000));
  }
  const byseed = (s: number) => ISLANDS.find((i) => i.seed === s);
  const place = (isl: Island | undefined, mesh: string, dx: number, dz: number, yaw: number, s: number, inst: Inst, dist = 3500) => {
    if (!isl) return;
    const x = isl.x + dx, z = isl.z + dz;
    sc.add(models.moonbase.byName.get(mesh)!, x, heightAt(x, z) - 0.2, z, yaw, s, inst, dist);
  };
  const plain = Inst.solid(0, 0.05);
  place(byseed(304), 'Lander', 0, 0, 0.6, 1, plain);
  place(byseed(304), 'MoonFlag', 9, 4, 1.2, 1, plain);
  place(byseed(301), 'Dish', -30, -20, 2.4, 1.3, plain);
  place(byseed(301), 'MoonFlag', -22, 18, 0.2, 0.8, plain);
  place(byseed(310), 'Monolith', 0, 0, 0.9, 2.2, Inst.solid(0, 0.03), 5000);
  place(byseed(307), 'Dish', 150, 30, 0.8, 1.6, plain);
  crystals(sc, ['craters', 'darkside', 'tranquil'], 55, '#80e0ff', 1.3, 510);
  crystals(sc, ['craters'], 14, '#a0f0ff', 0.8, 511, true);
  seabedRocks(sc, ['tranquil', 'craters', 'darkside'], 70, '#8a8a90', 520);
  const shells = sc.tint('#e0e8ff', 0.03);
  sc.scatter(zi('tranquil'), 60, 530, (x, z, h, r) => {
    if (h > -2) return;
    sc.add(models.shell, x, h, z, r() * 6.28, 1 + r() * 1.5, shells, 110, true, 1.4, r());
  });
  chests(sc, ['tranquil', 'craters', 'darkside'], 6, 540);
}

function neon(sc: Scenery) {
  const { models } = sc.a;
  const chrome = Inst.solid(0, 0.05);
  const palmGlows = [glowInst(1.4, 0.3, 1.1, 3), glowInst(0.2, 1.3, 1.5, 3), glowInst(1.5, 0.9, 0.2, 3)];
  const palm = models.neonprops.byName.get('Palm')!;
  const palmGlow = models.neonprops.byName.get('PalmGlow')!;
  for (const isl of ISLANDS) {
    if (isl.kind !== 'neon') continue;
    onIsland(isl, Math.round(isl.r / 6), isl.seed, 1.0, (x, z, h, r) => {
      const p = sc.add(palm, x, h - 0.2, z, r() * 6.28, 0.8 + r() * 0.5, chrome, 2400);
      sc.twin(p, palmGlow, palmGlows[Math.floor(r() * 3)]);
    });
  }
  const sign = models.neonprops.byName.get('Sign')!;
  const signGlow = models.neonprops.byName.get('SignGlow')!;
  for (const [seed, yaw] of [[401, 3.4], [404, 0.6], [407, 2.0]] as const) {
    const isl = ISLANDS.find((i) => i.seed === seed);
    if (!isl) continue;
    const x = isl.x + Math.sin(yaw) * isl.r * 0.35, z = isl.z + Math.cos(yaw) * isl.r * 0.35;
    const p = sc.add(sign, x, heightAt(x, z) - 0.3, z, yaw, 1.4, Inst.solid(0, 0.05), 3500);
    sc.twin(p, signGlow, glowInst(1.5, 0.3, 1.2, 4));
  }
  // arcade cabinets on the reef floor
  const cab = models.neonprops.byName.get('Arcade')!;
  const cabGlow = models.neonprops.byName.get('ArcadeGlow')!;
  const screens = [glowInst(0.2, 1.4, 1.5, 3), glowInst(1.4, 0.3, 1.2, 3), glowInst(1.3, 1.3, 0.2, 3)];
  sc.scatter(zi('arcade'), 90, 610, (x, z, h, r) => {
    if (h > -4) return;
    const p = sc.add(cab, x, h - 0.2, z, r() * 6.28, 1.5 + r(), Inst.solid(0, 0.04), 240, true, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4);
    sc.twin(p, cabGlow, screens[Math.floor(r() * 3)]);
  });
  // glitch shards hanging in the air
  const shard = sc.tint('#40ff60', 0.03, 1.6);
  sc.scatter(zi('glitch'), 40, 620, (x, z, _h, r) => {
    const y = 8 + r() * 60;
    sc.add(models.crystal, x, y, z, r() * 6.28, 2 + r() * 5, shard, 3000, false, r() * 3, r() * 3);
  });
  crystals(sc, ['sunset', 'arcade'], 40, '#ff5ab0', 1.2, 630);
  seabedRocks(sc, ['sunset', 'glitch'], 40, '#3a1a50', 640);
  chests(sc, ['sunset', 'arcade', 'glitch'], 6, 650);
}

function maw(sc: Scenery) {
  const { models } = sc.a;
  const asteroid = sc.tint('#3a3440', 0.07);
  const ember = glowInst(1.5, 0.6, 0.2, 3);
  for (const isl of ISLANDS) {
    if (isl.kind !== 'asteroid') continue;
    onIsland(isl, Math.round(isl.r / 8), isl.seed, 1, (x, z, h, r) => sc.add(models.rock, x, h - 0.6, z, r() * 6.28, 2 + r() * 4, asteroid, 2400));
    onIsland(isl, Math.round(isl.r / 16), isl.seed + 4, 2, (x, z, h, r) => {
      sc.add(models.crystal, x, h - 0.4, z, r() * 6.28, 2 + r() * 3, sc.tint('#ff9a40', 0.03, 1.4), 2600);
    });
  }
  floatingRocks(sc, ['rim', 'maw'], 22, 701, ember, '#3a3040', 20, 140);
  // drifting space junk
  const junk = Inst.solid(0, 0.05);
  sc.scatter(zi('rim'), 10, 710, (x, z, _h, r) => {
    sc.add(models.moonbase.byName.get('Dish')!, x, 15 + r() * 60, z, r() * 6.28, 1 + r(), junk, 3500, false, r() * 2, r() * 2);
  });
  crystals(sc, ['rim', 'maw'], 60, '#c060ff', 1.4, 720);
  seabedRocks(sc, ['rim', 'maw'], 60, '#2a2030', 730);
  chests(sc, ['rim', 'maw'], 8, 740);
}

export function buildRealmScenery(sc: Scenery, realm: RealmId) {
  switch (realm) {
    case 'jurassic': jurassic(sc); break;
    case 'shattered': shattered(sc); break;
    case 'selene': selene(sc); break;
    case 'neon': neon(sc); break;
    case 'maw': maw(sc); break;
    default: break;
  }
}

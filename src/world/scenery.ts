// Static world dressing: harbor buildings, island vegetation, zone landmarks and seafloor props.
// The Blue Planet has its harbor, landmarks and outposts; portal realms get theirs from realm-scenery.ts.
import { activeRealm, NAMED_ZONES, type RealmId, realmById, type ZoneId, zoneWeights } from '../data/zones';
import { hex, mat4, type Mat4, rng, Vec3 } from '../engine/math';
import { Inst, type GpuMesh, type GpuModel, type Renderer } from '../engine/renderer';
import type { Assets } from '../game/assets';
import { buildRealmScenery } from './realm-scenery';
import { HARBOR, heightAt, ISLANDS } from './terrain';

export interface Prop {
  mesh: GpuMesh | GpuModel;
  m: Mat4;
  inst: Inst;
  pos: Vec3;
  maxDist: number;
  /** only visible from underwater */
  under: boolean;
  phaseSpeed?: number;
  skip?: (mesh: GpuMesh) => boolean;
}

const zoneIdx = (id: string) => NAMED_ZONES.findIndex((z) => z.id === id);

export interface Outpost { zone: ZoneId; name: string; pos: Vec3; yaw: number; dock: Vec3 }
/** A rift portal: the harbor gate travels between unlocked realms, the tear leads to the next realm. */
export interface Portal { kind: 'gate' | 'tear'; pos: Vec3; yaw: number; color: [number, number, number] }

const OUTPOST_NAMES: Partial<Record<ZoneId, string>> = {
  kelp: 'Kelp Corner', coral: 'Reef Rest', deepblue: 'Blue Buoy Station', frost: 'Frostbite Hut', candy: 'Sugar Shack',
  toxic: 'Hazmat Hub', magma: 'Ember Outpost', storm: 'Stormwatch', pirate: 'Skull Cove', atlantis: "Poseidon's Porch",
  temple: 'Last Light', void: 'Event Horizon',
  fern: 'Fern Hut', tarpit: 'Tar Pit Shack', crater: 'Impact Station',
  hellfire: 'Brimstone Post', nether: 'Drift Dock', blackgate: 'Gatewatch',
  tranquil: 'Tranquility Base', craters: 'Crater Camp', darkside: 'Dark Side Relay',
  sunset: 'Sunset Shack', arcade: 'Pixel Pier', glitch: 'Checkpoint',
  rim: 'Rim Station', maw: 'The Last Stop',
};
const BASE_NAMES: Record<RealmId, string> = {
  blue: 'Harbor Tackle Shop', jurassic: 'Base Camp Rex', shattered: 'Fel Harbor', selene: 'Moon Base Alpha', neon: 'Neon Marina',
  maw: 'Horizon Station',
};

export class Scenery {
  readonly realm: RealmId;
  props: Prop[] = [];
  portals: Portal[] = [];
  baseName = '';
  volcanoTops: Vec3[] = [];
  factoryTop: Vec3 | null = null;
  terrain: GpuMesh;
  terrainInst = Inst.solid(3, 0);
  dockSpot = new Vec3();
  dockHeading = 0;
  shopPos = new Vec3();
  lighthouseTop: Vec3 | null = null;
  chests: { pos: Vec3; zone: number; taken: number }[] = [];
  outposts: Outpost[] = [];
  aquarium = { pos: new Vec3(), yaw: 0, halfX: 8.5, halfZ: 5, depth: 2.6 };
  ghost = { center: new Vec3(-2000, 0, -700), radius: 260, pos: new Vec3(), heading: 0 };
  private bigFishM = mat4.create();
  private shopM = mat4.create();
  private bigFishPivot = new Vec3();

  constructor(private r: Renderer, readonly a: Assets, terrain: GpuMesh, unlockedRealms: RealmId[] = ['blue']) {
    this.terrain = terrain;
    this.realm = activeRealm();
    this.baseName = BASE_NAMES[this.realm];
    if (this.realm === 'blue') {
      this.buildHarbor();
      this.buildIslands();
      this.buildZones();
      this.buildExpansion();
    } else {
      this.buildRealmBase();
      this.buildIslands();
      this.buildOutposts();
      buildRealmScenery(this, this.realm);
    }
    for (const isl of ISLANDS) if (isl.kind === 'volcano') this.volcanoTops.push(new Vec3(isl.x, heightAt(isl.x + isl.r * 0.03, isl.z) + isl.top * 0.06, isl.z));
    this.buildPortals(unlockedRealms);
  }

  /** Finds open water of a given depth near (x, z), searching outwards in rings. */
  findWater(x: number, z: number, clearance = 30, depth = -8): Vec3 | null {
    for (let ring = 0; ring < 12; ring++) {
      const n = ring === 0 ? 1 : 12;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring;
        const px = x + Math.cos(a) * ring * 25, pz = z + Math.sin(a) * ring * 25;
        let ok = true;
        for (let j = 0; j < 8 && ok; j++) {
          const b = (j / 8) * Math.PI * 2;
          if (heightAt(px + Math.cos(b) * clearance, pz + Math.sin(b) * clearance) > depth) ok = false;
        }
        if (ok && heightAt(px, pz) < depth) return new Vec3(px, 0, pz);
      }
    }
    return null;
  }

  /** (Re)creates this realm's rift portals; the harbor gate needs a second unlocked realm. */
  buildPortals(unlocked: RealmId[]) {
    this.portals = [];
    const info = realmById(this.realm);
    // the harbor gate appears once there is more than one realm to travel between
    if (unlocked.length > 1 || this.realm !== 'blue') {
      const home = this.realm === 'blue' ? this.findWater(-150, 150, 26, -6) : this.findWater(-130, 120, 26, -6);
      if (home) this.portals.push({ kind: 'gate', pos: home, yaw: Math.atan2(-home.x, -home.z) + Math.PI / 2, color: [0.4, 0.9, 1.4] });
    }
    if (info.tear) {
      const t = this.findWater(info.tear.x, info.tear.z, 26, -10);
      if (t) this.portals.push({ kind: 'tear', pos: t, yaw: Math.atan2(-t.x, -t.z) + Math.PI / 2, color: [1.2, 0.4, 1.6] });
    }
  }

  /** A realm's harbor: a big outpost next to the central island, with the shop. */
  private buildRealmBase() {
    const { models } = this.a;
    const spot = this.findWater(0, 118, 24, -6) ?? new Vec3(0, 0, 118);
    const yaw = Math.atan2(-spot.x, -spot.z);
    const wood = Inst.solid(0, 0.045);
    const glow = Inst.solid(2);
    glow.a.set([1, 0.85, 0.55, 3.5]);
    const p = this.add(models.outpost, spot.x, 0, spot.z, yaw, 1.25, wood, 3000);
    p.skip = (mesh) => mesh.name === 'Glow';
    this.add(models.outpost.byName.get('Glow')!, spot.x, 0, spot.z, yaw, 1.25, glow, 3000);
    const dockLocal = models.outpost.nodes.get('DockSpot')!;
    const m = mat4.compose(mat4.create(), spot.x, 0, spot.z, yaw, 0, 0, 1.25);
    this.dockSpot.set(dockLocal[12], 0, dockLocal[14]).applyMat4(m);
    this.dockSpot.y = 0;
    this.dockHeading = yaw + Math.PI / 2;
    this.shopPos.set(spot.x, 2, spot.z);
  }

  private buildOutposts() {
    const { models } = this.a;
    const glow = Inst.solid(2);
    glow.a.set([1, 0.85, 0.55, 3.5]);
    const wood = Inst.solid(0, 0.045);
    const dockLocal = models.outpost.nodes.get('DockSpot')!;
    for (const i of NAMED_ZONES.map((_, k) => k)) {
      const z = NAMED_ZONES[i];
      if (z.realm !== this.realm) continue;
      const name = OUTPOST_NAMES[z.id];
      if (!name) continue;
      const found = this.findWater(z.x + (z.x > 0 ? -1 : 1) * z.radius * 0.3, z.z + (z.z > 0 ? -1 : 1) * z.radius * 0.3, 30, -8);
      if (!found) continue;
      const yaw = Math.atan2(z.x - found.x, z.z - found.z);
      const o: Outpost = { zone: z.id, name, pos: found, yaw, dock: new Vec3() };
      const m = mat4.compose(mat4.create(), found.x, 0, found.z, yaw);
      o.dock.set(dockLocal[12], 0, dockLocal[14]).applyMat4(m);
      o.dock.y = 0;
      this.outposts.push(o);
      const p = this.add(models.outpost, found.x, 0, found.z, yaw, 1, wood, 2600);
      p.skip = (mesh) => mesh.name === 'Glow';
      this.add(models.outpost.byName.get('Glow')!, found.x, 0, found.z, yaw, 1, glow, 2600);
    }
  }

  add(mesh: GpuMesh | GpuModel, x: number, y: number, z: number, yaw: number, s: number, inst: Inst, maxDist: number, under = false, pitch = 0, roll = 0) {
    const p: Prop = { mesh, m: mat4.compose(mat4.create(), x, y, z, yaw, pitch, roll, s), inst, pos: new Vec3(x, y, z), maxDist, under };
    this.props.push(p);
    return p;
  }

  private buildHarbor() {
    const { models } = this.a;
    const wood = Inst.solid(0, 0.045);
    const glow = Inst.solid(2);
    glow.a.set([1, 0.85, 0.55, 3.5]);
    const pierZ = 54;
    const pier = this.add(models.pier, 0, 0, pierZ, 0, 1, wood, 2500);
    pier.skip = (m) => m.name === 'Glow';
    this.add(models.pier.byName.get('Glow')!, 0, 0, pierZ, 0, 1, glow, 2500);
    const ds = models.pier.nodes.get('DockSpot')!;
    this.dockSpot.set(ds[12], 0, ds[14] + pierZ);
    this.dockHeading = Math.PI;

    const sx = -15, sz = 29;
    let sy = Infinity;
    for (const [dx, dz] of [[-5, -4], [5, -4], [-5, 5], [5, 5], [0, 0]]) sy = Math.min(sy, heightAt(sx + dx, sz + dz));
    sy = Math.max(sy, HARBOR.plateau - 1.2) - 0.1;
    mat4.compose(this.shopM, sx, sy, sz, 0, 0, 0, 1);
    this.shopPos.set(sx, sy, sz);
    const shop = this.add(models.shop, sx, sy, sz, 0, 1, Inst.solid(0, 0.05), 2500);
    shop.skip = (m) => m.name === 'BigFish';
    const bf = models.shop.nodes.get('BigFish')!;
    this.bigFishPivot.set(bf[12], bf[13], bf[14]);

    const lx = 30, lz = -6;
    const ly = heightAt(lx, lz) - 0.3;
    const lh = this.add(models.lighthouse, lx, ly, lz, 0.4, 1, Inst.solid(0, 0.06), 4000);
    lh.skip = (m) => m.name === 'Glow';
    const beacon = Inst.solid(2);
    beacon.a.set([1, 0.9, 0.6, 5]);
    this.add(models.lighthouse.byName.get('Glow')!, lx, ly, lz, 0.4, 1, beacon, 4000);
    this.lighthouseTop = new Vec3(lx, ly + 17, lz);

    const flag = Inst.solid(0, 0.03);
    this.add(this.a.flag, 5.5, 1.4, pierZ + 40, 0, 1, flag, 1500);
  }

  private buildIslands() {
    const r = rng(99);
    const palmInst = Inst.solid(0, 0.05);
    const rockInst = Inst.solid(0, 0.06);
    const realmKinds = new Set(['jungle', 'tar', 'bone', 'hellfire', 'fel', 'ash', 'moon', 'crater', 'neon', 'chrome', 'asteroid']);
    for (const isl of ISLANDS) {
      if (realmKinds.has(isl.kind)) continue;
      const count = Math.round(isl.r / (isl.kind === 'volcano' ? 12 : 5));
      for (let k = 0; k < count; k++) {
        const ang = r() * Math.PI * 2;
        const dist = Math.sqrt(r()) * isl.r * 0.85;
        const x = isl.x + Math.cos(ang) * dist, z = isl.z + Math.sin(ang) * dist;
        const h = heightAt(x, z);
        if (h < 1.2) continue;
        if (isl === ISLANDS[0] && (Math.hypot(x + 15, z - 29) < 11 || Math.hypot(x - 30, z + 6) < 6 || (Math.abs(x) < 4 && z > 40) || (x > -28 && x < 12 && z > 32) || (x > -2 && x < 24 && z > 12 && z < 34))) continue;
        if ((isl.kind === 'grass' || isl.kind === 'sand') && r() < 0.7) {
          this.add(this.a.palm, x, h - 0.2, z, r() * 6.28, 0.8 + r() * 0.5, palmInst, 1600);
        } else {
          const s = 1 + r() * (isl.kind === 'volcano' ? 6 : 2.5);
          const inst = isl.kind === 'snow' ? this.tint('#e8f2ff', 0.06) : isl.kind === 'basalt' || isl.kind === 'volcano' ? this.tint('#4a4040', 0.06) : isl.kind === 'ruins' ? this.tint('#7f8f78', 0.06) : rockInst;
          this.add(this.a.models.rock, x, h - s * 0.3, z, r() * 6.28, s, inst, 1800);
        }
      }
      if (isl.kind === 'ruins') {
        const pillar = this.tint('#c8d0c0', 0.06);
        for (let k = 0; k < 7; k++) {
          const ang = (k / 7) * Math.PI * 2;
          const x = isl.x + Math.cos(ang) * isl.r * 0.45, z = isl.z + Math.sin(ang) * isl.r * 0.45;
          this.add(this.a.models.pillar, x, heightAt(x, z) - 0.5, z, r() * 6, 1.3 + r() * 0.6, pillar, 2400, false, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3);
        }
      }
    }
  }

  tint(h: string, outline = 0.05, glow = 0) {
    const i = Inst.solid(0, outline);
    const c = hex(h);
    i.a.set([c[0] * 1.3, c[1] * 1.3, c[2] * 1.3, glow]);
    return i;
  }

  scatter(zone: number, count: number, seed: number, fn: (x: number, z: number, h: number, r: () => number) => void) {
    const r = rng(seed);
    const zn = NAMED_ZONES[zone];
    if (!zn) return;
    const w: number[] = [];
    let placed = 0, tries = 0;
    while (placed < count && tries++ < count * 20) {
      const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * zn.radius;
      const x = zn.x + Math.cos(ang) * d, z = zn.z + Math.sin(ang) * d;
      if (zoneWeights(x, z, w)[zone] < 0.5) continue;
      fn(x, z, heightAt(x, z), r);
      placed++;
    }
  }

  private buildZones() {
    const { models } = this.a;
    const Z = { shallows: zoneIdx('shallows'), kelp: zoneIdx('kelp'), deep: zoneIdx('deepblue'), frost: zoneIdx('frost'), magma: zoneIdx('magma'), temple: zoneIdx('temple'), void: zoneIdx('void') };
    const coralColors = ['#ff6a8a', '#ffa03a', '#b070ff', '#ff5a5a', '#5ad0c0', '#ffd23a'];
    const corals = coralColors.map((c) => this.tint(c, 0.03));
    this.scatter(Z.shallows, 420, 11, (x, z, h, r) => {
      if (h > -2 || h < -45) return;
      this.add(models.coral, x, h - 0.2, z, r() * 6.28, 1.2 + r() * 2.2, corals[Math.floor(r() * corals.length)], 160, true);
    });
    const seaRock = this.tint('#8a8278', 0.04);
    for (const [zi, n, seed] of [[Z.shallows, 120, 12], [Z.kelp, 120, 13], [Z.deep, 60, 14], [Z.frost, 80, 15], [Z.temple, 60, 16]] as const) {
      this.scatter(zi, n, seed, (x, z, h, r) => {
        if (h > -3) return;
        this.add(models.rock, x, h, z, r() * 6.28, 1.5 + r() * 5, seaRock, 200, true);
      });
    }
    this.scatter(Z.kelp, 520, 21, (x, z, h, r) => {
      if (h > -8) return;
      const s = Math.min((-h + 4) / 40, 0.6 + r() * 1.6);
      const inst = Inst.solid(0, 0);
      inst.c[3] = 7;
      inst.amp = 0.12 + r() * 0.08;
      const p = this.add(this.a.kelp, x, h - 0.5, z, r() * 6.28, s, inst, 190, true);
      p.phaseSpeed = 0.6 + r() * 0.4;
      inst.phase = r() * 10;
    });
    const buoyInst = Inst.solid(0, 0.04);
    for (const [x, z] of [[180, 560], [420, 700], [120, 980], [380, 1080], [520, 880]]) this.add(this.a.buoy, x, 0, z, 0, 1.4, buoyInst, 1800);

    const ice = Inst.solid(0, 0.08);
    this.scatter(Z.frost, 46, 31, (x, z, h, r) => {
      if (h > -8) return;
      const s = 5 + r() * 16;
      this.add(models.iceberg, x, -s * 0.25, z, r() * 6.28, s, ice, 3000);
    });
    const crystalIce = this.tint('#bff0ff', 0.04, 0.4);
    this.scatter(Z.frost, 40, 32, (x, z, h, r) => {
      if (h > -4) return;
      this.add(models.crystal, x, h, z, r() * 6.28, 2 + r() * 3, crystalIce, 200, true);
    });

    const basalt = this.tint('#3a3434', 0.05);
    this.scatter(Z.magma, 140, 41, (x, z, h, r) => {
      if (h > -3) return;
      this.add(models.rock, x, h, z, r() * 6.28, 2 + r() * 6, basalt, 220, true);
    });
    this.scatter(Z.magma, 30, 42, (x, z, h, r) => {
      if (h < -60 || h > -2) return;
      this.add(models.rock, x, h, z, r() * 6.28, 6 + r() * 8, basalt, 2500);
    });

    const tentacleInsts: Inst[] = [];
    this.scatter(Z.temple, 16, 51, (x, z, h, r) => {
      if (h > -10) return;
      const inst = Inst.solid(0, 0.06);
      inst.c[3] = 7;
      inst.amp = 0.08;
      inst.phase = r() * 10;
      tentacleInsts.push(inst);
      const p = this.add(models.tentacle, x, -3 - r() * 4, z, r() * 6.28, 1.3 + r() * 1.6, inst, 3000);
      p.phaseSpeed = 0.5 + r() * 0.3;
    });
    const stone = this.tint('#8a9a88', 0.05);
    this.scatter(Z.temple, 70, 52, (x, z, h, r) => {
      if (h > -6) return;
      this.add(models.pillar, x, h - 0.5, z, r() * 6.28, 2 + r() * 2.5, stone, 220, true, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
    });
    const runes = this.tint('#60ff90', 0.03, 1.2);
    this.scatter(Z.temple, 30, 53, (x, z, h, r) => {
      if (h > -10) return;
      this.add(models.crystal, x, h, z, r() * 6.28, 1.5 + r() * 2, runes, 220, true);
    });

    const vz = NAMED_ZONES[Z.void];
    const pl = Inst.solid(0, 0);
    pl.a.set([1, 1, 1, 0.35]);
    this.add(this.a.planets[0], vz.x + 300, 420, vz.z + 700, 0.3, 190, pl, 2000, false, 0.3, 0.2);
    this.add(this.a.planets[1], vz.x + 750, 260, vz.z - 100, 0, 110, pl, 1900);
    this.add(this.a.planets[2], vz.x - 350, 620, vz.z + 900, 1, 260, pl, 2100, false, -0.4, 0.3);
    const voidCrystal = this.tint('#b080ff', 0.05, 0.9);
    this.scatter(Z.void, 60, 61, (x, z, _h, r) => {
      const above = r() < 0.5;
      const y = above ? 2 + r() * 30 : -5 - r() * 200;
      this.add(models.crystal, x, y, z, r() * 6.28, 2 + r() * 6, voidCrystal, above ? 2500 : 220, !above, r() * 3, r() * 3);
    });

    // treasure chests on the seafloor
    const zonesForChests = [Z.shallows, Z.kelp, Z.deep, Z.frost, Z.magma, Z.temple, Z.void];
    for (const zi of zonesForChests) {
      this.scatter(zi, 5, 70 + zi, (x, z, h) => {
        if (h > -6 || h < -2200) return;
        this.chests.push({ pos: new Vec3(x, h + 0.2, z), zone: zi, taken: 0 });
      });
    }
  }

  private buildExpansion() {
    const { models } = this.a;
    const r = rng(2024);
    // aquarium pool next to the shop
    const ax = 10, az = 21;
    // a shallow pool sitting on the ground: the rim hides the terrain, the water sits above it
    let ay = -Infinity;
    for (let dx = -9; dx <= 9; dx += 3) for (let dz = -5; dz <= 5; dz += 2.5) ay = Math.max(ay, heightAt(ax + dx, az + dz));
    ay += 0.05;
    this.aquarium.pos.set(ax, ay, az);
    this.add(models.aquarium, ax, ay, az, 0, 1, Inst.solid(0, 0.05), 2500);

    // outposts: one floating dock per zone
    const NAMES = OUTPOST_NAMES;
    const glow = Inst.solid(2);
    glow.a.set([1, 0.85, 0.55, 3.5]);
    const wood = Inst.solid(0, 0.045);
    const dockLocal = models.outpost.nodes.get('DockSpot')!;
    for (const z of NAMED_ZONES) {
      if (z.realm !== 'blue') continue;
      const name = NAMES[z.id];
      if (!name) continue;
      let found: Vec3 | null = null;
      search: for (const f of [0.3, 0.45, 0.6, 0.15]) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + z.x * 0.001;
          const x = z.x + Math.cos(a) * z.radius * f, zz = z.z + Math.sin(a) * z.radius * f;
          let ok = true;
          for (let j = 0; j < 8 && ok; j++) {
            const b = (j / 8) * Math.PI * 2;
            if (heightAt(x + Math.cos(b) * 30, zz + Math.sin(b) * 30) > -8) ok = false;
          }
          if (ok) { found = new Vec3(x, 0, zz); break search; }
        }
      }
      if (!found) continue;
      const yaw = Math.atan2(z.x - found.x, z.z - found.z);
      const o: Outpost = { zone: z.id, name, pos: found, yaw, dock: new Vec3() };
      const m = mat4.compose(mat4.create(), found.x, 0, found.z, yaw);
      o.dock.set(dockLocal[12], 0, dockLocal[14]).applyMat4(m);
      o.dock.y = 0;
      this.outposts.push(o);
      const p = this.add(models.outpost, found.x, 0, found.z, yaw, 1, wood, 2600);
      p.skip = (mesh) => mesh.name === 'Glow';
      this.add(models.outpost.byName.get('Glow')!, found.x, 0, found.z, yaw, 1, glow, 2600);
    }

    const Z = (id: ZoneId) => zoneIdx(id);
    const woodWreck = Inst.solid(0, 0.06);
    const wreckCounts: [ZoneId, number][] = [['pirate', 7], ['deepblue', 2], ['kelp', 1], ['frost', 1], ['temple', 2], ['atlantis', 1], ['storm', 2]];
    for (const [zid, n] of wreckCounts) {
      this.scatter(Z(zid), n, 300 + Z(zid), (x, z, h, rr) => {
        if (h > -20) return;
        this.add(models.shipwreck, x, h + 1, z, rr() * 6.28, 1, woodWreck, 260, true);
        this.add(models.anchor, x + 14, heightAt(x + 14, z) + 0.2, z + 6, rr() * 6.28, 1.2, woodWreck, 200, true, 1.2, 0.3);
      });
    }

    // coral kingdom: dense reef
    const coralColors = ['#ff6a8a', '#ffa03a', '#b070ff', '#ff5a5a', '#5ad0c0', '#ffd23a', '#3ad0ff', '#ff7ae0'];
    const corals = coralColors.map((c) => this.tint(c, 0.03));
    this.scatter(Z('coral'), 700, 401, (x, z, h, rr) => {
      if (h > -1.5 || h < -65) return;
      this.add(models.coral, x, h - 0.2, z, rr() * 6.28, 1.4 + rr() * 2.6, corals[Math.floor(rr() * corals.length)], 170, true);
    });
    const grassInst = Inst.solid(0, 0);
    grassInst.c[3] = 7;
    grassInst.amp = 1.5;
    for (const zid of ['shallows', 'coral', 'kelp'] as ZoneId[]) {
      this.scatter(Z(zid), 400, 402 + Z(zid), (x, z, h, rr) => {
        if (h > -1.5 || h < -50) return;
        const p = this.add(this.a.seagrass, x, h - 0.1, z, rr() * 6.28, 1 + rr() * 1.2, grassInst, 120, true);
        p.phaseSpeed = 1.2;
      });
    }
    const shellInsts = ['#fff0e0', '#ffd0e0', '#e0d0ff'].map((c) => this.tint(c, 0.02));
    for (const zid of ['shallows', 'coral', 'atlantis'] as ZoneId[]) {
      this.scatter(Z(zid), 120, 410 + Z(zid), (x, z, h, rr) => {
        if (h > -1.5) return;
        this.add(models.shell, x, h, z, rr() * 6.28, 0.8 + rr() * 1.4, shellInsts[Math.floor(rr() * 3)], 110, true, 1.4, rr());
      });
    }

    // candy lagoon
    const candyTints = ['#ffffff', '#ffd0f0', '#d0f0ff', '#fff0b0'].map((c) => this.tint(c, 0.05));
    const gum = ['#ff5aa0', '#70e070', '#ffd040', '#7a8aff', '#ff8a3a'].map((c) => this.tint(c, 0.05));
    this.scatter(Z('candy'), 50, 420, (x, z, h, rr) => {
      const s = 0.8 + rr() * 1.5;
      if (h > 1.5) this.add(models.lollipop, x, h - 0.5, z, rr() * 6.28, s, candyTints[0], 2200);
      else if (h > -30) this.add(models.candycane, x, Math.max(h, -6) - 1, z, rr() * 6.28, s * 1.4, candyTints[0], 2200);
    });
    this.scatter(Z('candy'), 160, 421, (x, z, h, rr) => {
      this.add(models.gumdrop, x, h - 0.2, z, rr() * 6.28, 1 + rr() * 3, gum[Math.floor(rr() * gum.length)], h > 0 ? 1800 : 180, h < 0);
    });
    const candyMain = ISLANDS.find((i) => i.kind === 'candy')!;
    this.add(models.icecream, candyMain.x, heightAt(candyMain.x, candyMain.z) - 1, candyMain.z, 0.4, 1.3, Inst.solid(0, 0.06), 3500);

    // toxic sludge bay
    const toxicMain = ISLANDS.find((i) => i.kind === 'toxic')!;
    const fac = this.add(models.factory, toxicMain.x + 8, heightAt(toxicMain.x + 8, toxicMain.z) - 0.5, toxicMain.z, 0.6, 1, Inst.solid(0, 0.06), 3500);
    fac.skip = (m) => m.name === 'Glow';
    const sludge = Inst.solid(2);
    sludge.a.set([0.6, 1, 0.2, 3]);
    this.add(models.factory.byName.get('Glow')!, toxicMain.x + 8, heightAt(toxicMain.x + 8, toxicMain.z) - 0.5, toxicMain.z, 0.6, 1, sludge, 3500);
    this.factoryTop = new Vec3(toxicMain.x + 8, 40, toxicMain.z);
    const barrelInst = Inst.solid(0, 0.04);
    const barrelGlow = Inst.solid(2);
    barrelGlow.a.set([0.6, 1, 0.2, 3]);
    this.scatter(Z('toxic'), 90, 430, (x, z, h, rr) => {
      const floating = rr() < 0.35 && h < -3;
      const y = floating ? -0.6 : h + 0.2;
      const p = this.add(models.barrel, x, y, z, rr() * 6.28, 1.3, barrelInst, floating ? 900 : 180, !floating, floating ? 0.3 : 1.2 * rr(), rr());
      p.skip = (m) => m.name === 'Glow';
      this.twin(p, models.barrel.byName.get('Glow')!, barrelGlow);
    });

    // storm reach spires
    const spireInst = Inst.solid(0, 0.08);
    const spireGlow = Inst.solid(2);
    spireGlow.a.set([0.6, 0.95, 1, 4]);
    this.scatter(Z('storm'), 26, 440, (x, z, h, rr) => {
      if (h > -6) return;
      const s = 0.8 + rr() * 1.2;
      const p = this.add(models.spire, x, h * 0.3 - 4, z, rr() * 6.28, s, spireInst, 3200);
      p.skip = (m) => m.name === 'Glow';
      this.twin(p, models.spire.byName.get('Glow')!, spireGlow);
      this.spires.push(p.pos.clone().add(new Vec3(0, 45 * s, 0)));
    });

    // pirate's graveyard
    const pirMain = ISLANDS.find((i) => i.x === -2000)!;
    const sk = this.add(models.skullrock, pirMain.x, heightAt(pirMain.x, pirMain.z) - 6, pirMain.z, 0.8, 0.9, Inst.solid(0, 0.08), 3800);
    sk.skip = (m) => m.name === 'Glow';
    const eyeGlow = Inst.solid(2);
    eyeGlow.a.set([0.3, 1, 0.7, 5]);
    this.twin(sk, models.skullrock.byName.get('Glow')!, eyeGlow);

    // sunken atlantis
    const marble = this.tint('#ece6d8', 0.06);
    const goldGlow = Inst.solid(2);
    goldGlow.a.set([1, 0.85, 0.4, 4]);
    this.scatter(Z('atlantis'), 14, 450, (x, z, h, rr) => {
      if (h > -30) return;
      const d = this.add(models.dome, x, h - 0.5, z, rr() * 6.28, 0.8 + rr() * 0.8, Inst.solid(0, 0.06), 320, true);
      d.skip = (m) => m.name === 'Glow';
      this.twin(d, models.dome.byName.get('Glow')!, goldGlow);
    });
    this.scatter(Z('atlantis'), 30, 451, (x, z, h, rr) => {
      if (h > -20) return;
      const kind = rr();
      if (kind < 0.35) this.add(models.statue, x, h - 0.3, z, rr() * 6.28, 1 + rr() * 0.8, marble, 260, true);
      else if (kind < 0.6) this.add(models.arch, x, h - 0.3, z, rr() * 6.28, 1 + rr() * 0.5, marble, 260, true);
      else this.add(models.pillar, x, h - 0.4, z, rr() * 6.28, 2 + rr() * 2, marble, 240, true, (rr() - 0.5) * 0.4, (rr() - 0.5) * 0.4);
    });
    const atlIsl = ISLANDS.find((i) => i.x === 500 && i.z === 1980)!;
    this.add(models.statue, atlIsl.x, heightAt(atlIsl.x, atlIsl.z) - 0.4, atlIsl.z, 2.5, 1.4, this.tint('#ffd878', 0.06, 0.1), 3000);

    // chests in the new zones
    for (const zid of ['coral', 'candy', 'toxic', 'storm', 'pirate', 'atlantis'] as ZoneId[]) {
      const zi = Z(zid);
      this.scatter(zi, zid === 'pirate' ? 12 : 5, 470 + zi, (x, z, h) => {
        if (h > -6) return;
        this.chests.push({ pos: new Vec3(x, h + 0.2, z), zone: zi, taken: 0 });
      });
    }
    void r;
  }

  /** Draws `mesh` with the same transform/visibility as prop `p` (glowing parts etc). */
  twin(p: Prop, mesh: GpuMesh, inst: Inst) {
    this.props.push({ mesh, m: p.m, inst, pos: p.pos, maxDist: p.maxDist, under: p.under, phaseSpeed: p.phaseSpeed });
  }

  spires: Vec3[] = [];
  private ghostM = mat4.create();

  draw(cam: Vec3, underwater: boolean, time: number) {
    // ghost ship sails a slow circle around the graveyard
    const g = this.ghost;
    const ga = time * 0.02;
    g.pos.set(g.center.x + Math.cos(ga) * g.radius, Math.sin(time * 0.7) * 0.3, g.center.z + Math.sin(ga) * g.radius);
    g.heading = Math.atan2(-Math.sin(ga), Math.cos(ga));
    if (this.realm === 'blue' && !underwater && g.pos.distanceXZ(cam) < 3500) {
      mat4.compose(this.ghostM, g.pos.x, g.pos.y, g.pos.z, g.heading, Math.sin(time * 0.5) * 0.03, Math.sin(time * 0.6) * 0.05, 1);
      this.r.draw(this.a.models.ghostship.byName.get('Ghostship')!, this.ghostM, ghostInst);
      this.r.draw(this.a.models.ghostship.byName.get('Glow')!, this.ghostM, ghostGlow);
    }
    const r = this.r;
    r.draw(this.terrain, mat4.create(), this.terrainInst);
    for (const p of this.props) {
      if (p.under && !underwater) continue;
      const dx = p.pos.x - cam.x, dz = p.pos.z - cam.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > p.maxDist * p.maxDist) continue;
      if (p.phaseSpeed) p.inst.phase = time * p.phaseSpeed + p.pos.x * 0.01;
      if ('meshes' in p.mesh) r.drawModel(p.mesh, p.m, p.inst, p.skip);
      else r.draw(p.mesh, p.m, p.inst);
    }
    // spinning shop fish
    if (this.realm === 'blue') {
      const bf = this.a.models.shop.byName.get('BigFish')!;
      const p = this.bigFishPivot;
      mat4.copy(this.bigFishM, this.shopM);
      mat4.multiply(this.bigFishM, this.bigFishM, mat4.compose(tmpM, p.x, p.y, p.z, Math.sin(time * 0.8) * 0.5, 0, Math.sin(time * 1.6) * 0.1));
      mat4.multiply(this.bigFishM, this.bigFishM, mat4.compose(tmpM, -p.x, -p.y, -p.z));
      r.draw(bf, this.bigFishM, bigFishInst);
    }
    // rift portals
    for (const pt of this.portals) {
      if (pt.pos.distanceXZ(cam) > 4000) continue;
      const pm = mat4.compose(tmpM, pt.pos.x, pt.pos.y, pt.pos.z, pt.yaw, 0, 0, 1);
      r.draw(this.a.models.portal.byName.get('Gate')!, pm, portalInst);
      portalGlow.a.set([pt.color[0], pt.color[1], pt.color[2], 3 + Math.sin(time * 2) * 0.8]);
      r.draw(this.a.models.portal.byName.get('Glow')!, pm, portalGlow);
    }
    // treasure
    const chest = this.a.models.chest;
    for (const c of this.chests) {
      if (c.taken > time || !underwater) continue;
      if (c.pos.distanceXZ(cam) > 150) continue;
      r.drawModel(chest, mat4.compose(tmpM, c.pos.x, c.pos.y, c.pos.z, c.pos.x, 0, 0, 1.4), chestInst);
      r.particle(c.pos.x, c.pos.y + 1, c.pos.z, 2.5 + Math.sin(time * 3) * 0.5, 1, 0.8, 0.3, 0, 0);
    }
  }
}

const tmpM = mat4.create();
const portalInst = Inst.solid(0, 0.08);
const portalGlow = Inst.solid(2);
const bigFishInst = Inst.solid(0, 0.05);
const chestInst = Inst.solid(0, 0.03);
chestInst.a.set([1, 1, 1, 0.15]);
const ghostInst = Inst.solid(0, 0.06);
ghostInst.a.set([0.75, 0.9, 0.85, 0.1]);
const ghostGlow = Inst.solid(2);
ghostGlow.a.set([0.4, 1, 0.75, 5]);

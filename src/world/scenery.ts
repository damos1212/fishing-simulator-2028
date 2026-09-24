// Static world dressing: harbor buildings, island vegetation, zone landmarks and seafloor props.
import { ZONES, zoneWeights } from '../data/zones';
import { hex, mat4, type Mat4, rng, Vec3 } from '../engine/math';
import { Inst, type GpuMesh, type GpuModel, type Renderer } from '../engine/renderer';
import type { Assets } from '../game/assets';
import { HARBOR, heightAt, ISLANDS } from './terrain';

interface Prop {
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

const zoneIdx = (id: string) => ZONES.findIndex((z) => z.id === id);

export class Scenery {
  props: Prop[] = [];
  terrain: GpuMesh;
  terrainInst = Inst.solid(3, 0);
  dockSpot = new Vec3();
  dockHeading = 0;
  shopPos = new Vec3();
  lighthouseTop = new Vec3();
  volcanoTop = new Vec3();
  chests: { pos: Vec3; zone: number; taken: number }[] = [];
  private bigFishM = mat4.create();
  private shopM = mat4.create();
  private bigFishPivot = new Vec3();

  constructor(private r: Renderer, private a: Assets, terrain: GpuMesh) {
    this.terrain = terrain;
    this.buildHarbor();
    this.buildIslands();
    this.buildZones();
  }

  private add(mesh: GpuMesh | GpuModel, x: number, y: number, z: number, yaw: number, s: number, inst: Inst, maxDist: number, under = false, pitch = 0, roll = 0) {
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
    this.lighthouseTop.set(lx, ly + 17, lz);

    const flag = Inst.solid(0, 0.03);
    this.add(this.a.flag, 5.5, 1.4, pierZ + 40, 0, 1, flag, 1500);
  }

  private buildIslands() {
    const r = rng(99);
    const palmInst = Inst.solid(0, 0.05);
    const rockInst = Inst.solid(0, 0.06);
    for (const isl of ISLANDS) {
      const count = Math.round(isl.r / (isl.kind === 'volcano' ? 12 : 5));
      for (let k = 0; k < count; k++) {
        const ang = r() * Math.PI * 2;
        const dist = Math.sqrt(r()) * isl.r * 0.85;
        const x = isl.x + Math.cos(ang) * dist, z = isl.z + Math.sin(ang) * dist;
        const h = heightAt(x, z);
        if (h < 1.2) continue;
        if (isl === ISLANDS[0] && (Math.hypot(x + 15, z - 29) < 11 || Math.hypot(x - 30, z + 6) < 6 || (Math.abs(x) < 4 && z > 40) || (x > -28 && x < 12 && z > 32))) continue;
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

  private tint(h: string, outline = 0.05, glow = 0) {
    const i = Inst.solid(0, outline);
    const c = hex(h);
    i.a.set([c[0] * 1.3, c[1] * 1.3, c[2] * 1.3, glow]);
    return i;
  }

  private scatter(zone: number, count: number, seed: number, fn: (x: number, z: number, h: number, r: () => number) => void) {
    const r = rng(seed);
    const zn = ZONES[zone];
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

    const vol = ISLANDS.find((i) => i.kind === 'volcano')!;
    this.volcanoTop.set(vol.x, heightAt(vol.x + 5, vol.z) + 10, vol.z);
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

    const vz = ZONES[Z.void];
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

  draw(cam: Vec3, underwater: boolean, time: number) {
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
    const bf = this.a.models.shop.byName.get('BigFish')!;
    const p = this.bigFishPivot;
    mat4.copy(this.bigFishM, this.shopM);
    mat4.multiply(this.bigFishM, this.bigFishM, mat4.compose(tmpM, p.x, p.y, p.z, Math.sin(time * 0.8) * 0.5, 0, Math.sin(time * 1.6) * 0.1));
    mat4.multiply(this.bigFishM, this.bigFishM, mat4.compose(tmpM, -p.x, -p.y, -p.z));
    r.draw(bf, this.bigFishM, bigFishInst);
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
const bigFishInst = Inst.solid(0, 0.05);
const chestInst = Inst.solid(0, 0.03);
chestInst.a.set([1, 1, 1, 0.15]);

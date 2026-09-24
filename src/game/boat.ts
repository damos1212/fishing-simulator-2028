import { hex, clamp, damp, dampAngle, mat4, type Mat4, Vec3 } from '../engine/math';
import { Inst, type Renderer } from '../engine/renderer';
import { HULL_COLORS } from '../data/upgrades';
import { waveHeight } from '../world/environment';
import { heightAt } from '../world/terrain';
import type { Assets } from './assets';

const ROD_SEGS = 6;
const ROD_LEN = 2.7;

export class Boat {
  pos = new Vec3(0, 0, 100);
  heading = Math.PI;
  speed = 0;
  throttle = 0;
  steer = 0;
  y = 0;
  pitch = 0;
  roll = 0;
  matrix = mat4.create();
  fisherYaw = 0;
  fisherYawTarget = 0;
  armPitch = 0;
  armTarget = 0;
  rodBend = 0.15;
  rodTip = new Vec3();
  hull = 0;
  radar = false;
  lamp = false;
  engineTier = 0;
  /** '' = hull tier color */
  paint = '';
  hat = 'HatSouwester';
  flagInst = Inst.solid(1, 0.01);
  npc = false;
  /** Pet mesh name from pets.glb, or '' for none. */
  pet = '';
  petBounce = 0;
  anchored = false;
  bumped = 0;
  private wakeT = 0;
  private wakeIdx = 0;
  wake = new Float32Array(64);
  private insts = {
    boat: Inst.solid(4, 0.035),
    radar: Inst.solid(0, 0.02),
    lamp: Inst.solid(0, 0.02),
    fisher: Inst.solid(0, 0.02),
    rod: Inst.solid(0, 0.25),
    reel: Inst.solid(0, 0.1),
  };
  private m = { fisher: mat4.create(), arms: mat4.create(), socket: mat4.create(), seg: mat4.create(), tmp: mat4.create(), tmp2: mat4.create(), radar: mat4.create() };

  get forward() { return new Vec3(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  update(dt: number, time: number, maxSpeed: number, waveScale: number, onBump: () => void) {
    const target = this.anchored ? 0 : this.throttle >= 0 ? this.throttle * maxSpeed : this.throttle * maxSpeed * 0.35;
    this.speed = damp(this.speed, target, this.throttle !== 0 && !this.anchored ? 0.9 : 0.6, dt);
    const turnRate = 1.15 * clamp(Math.abs(this.speed) / 5, 0.35, 1) * (this.speed < -0.2 ? -1 : 1);
    if (!this.anchored) this.heading += this.steer * turnRate * dt;
    const fwd = this.forward;
    const nx = this.pos.x + fwd.x * this.speed * dt, nz = this.pos.z + fwd.z * this.speed * dt;
    // terrain collision: probe ahead of the bow / behind the stern
    const probe = this.speed >= 0 ? 4 : -4;
    const px = nx + fwd.x * probe, pz = nz + fwd.z * probe;
    this.bumped = Math.max(0, this.bumped - dt);
    if (heightAt(px, pz) > -0.9 || heightAt(nx, nz) > -0.9) {
      if (Math.abs(this.speed) > 3 && this.bumped <= 0) { onBump(); this.bumped = 0.6; }
      this.speed *= -0.25;
      // nudge away from the slope
      const e = 2;
      const gx = heightAt(this.pos.x + e, this.pos.z) - heightAt(this.pos.x - e, this.pos.z);
      const gz = heightAt(this.pos.x, this.pos.z + e) - heightAt(this.pos.x, this.pos.z - e);
      const gl = Math.hypot(gx, gz) || 1;
      this.pos.x -= (gx / gl) * 4 * dt;
      this.pos.z -= (gz / gl) * 4 * dt;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }

    // buoyancy from the same waves the ocean shader draws
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const hb = waveHeight(this.pos.x + s * 3, this.pos.z + c * 3, time, waveScale);
    const hs = waveHeight(this.pos.x - s * 3, this.pos.z - c * 3, time, waveScale);
    const hp = waveHeight(this.pos.x + c * 1.3, this.pos.z - s * 1.3, time, waveScale);
    const hst = waveHeight(this.pos.x - c * 1.3, this.pos.z + s * 1.3, time, waveScale);
    const sp = Math.abs(this.speed) / Math.max(maxSpeed, 1);
    this.y = damp(this.y, (hb + hs + hp + hst) / 4 - 0.05 + sp * 0.25, 8, dt);
    this.pitch = damp(this.pitch, Math.atan2(hs - hb, 6) - sp * 0.07, 6, dt);
    this.roll = damp(this.roll, Math.atan2(hp - hst, 2.6) - this.steer * sp * 0.12, 5, dt);
    this.pos.y = this.y;
    mat4.compose(this.matrix, this.pos.x, this.y, this.pos.z, this.heading, this.pitch, this.roll, 1);

    // wake puffs for the ocean shader
    this.wakeT -= dt;
    if (this.wakeT <= 0 && Math.abs(this.speed) > 1.5) {
      this.wakeT = 0.14;
      const o = (this.wakeIdx++ % 16) * 4;
      this.wake[o] = this.pos.x - s * 3.4;
      this.wake[o + 1] = this.pos.z - c * 3.4;
      this.wake[o + 2] = 0;
      this.wake[o + 3] = Math.min(1, Math.abs(this.speed) / 10);
    }
    for (let i = 0; i < 16; i++) this.wake[i * 4 + 2] += dt;

    this.fisherYaw = dampAngle(this.fisherYaw, this.fisherYawTarget, 6, dt);
    this.armPitch = damp(this.armPitch, this.armTarget, 12, dt);
  }

  /** Makes the fisherman face a world direction (yaw). */
  faceWorldYaw(yaw: number) { this.fisherYawTarget = yaw - this.heading; }

  draw(r: Renderer, a: Assets, time: number) {
    const i = this.insts;
    const hc = hex(this.paint || HULL_COLORS[Math.min(this.hull, HULL_COLORS.length - 1)]);
    i.boat.b.set([hc[0], hc[1], hc[2], 0]);
    i.boat.a[3] = this.hull >= 6 ? 0.05 : 0;
    const boat = a.models.boat;
    r.draw(boat.byName.get('Boat')!, this.matrix, i.boat);
    if (this.lamp) r.draw(boat.byName.get('Lamp')!, this.matrix, i.lamp);
    // pennant flag waving on the mast
    const fl = this.flagInst;
    fl.c[3] = 1;
    fl.phase = time * 9;
    fl.amp = 0.12 + Math.min(Math.abs(this.speed) / 60, 0.25);
    r.draw(boat.byName.get('Flag')!, this.matrix, fl);
    if (this.engineTier >= 1) r.draw(boat.byName.get('Motor')!, this.matrix, i.lamp);
    if (this.engineTier >= 4) {
      r.draw(boat.byName.get('Rockets')!, this.matrix, i.lamp);
      const th = Math.max(0, this.throttle) * Math.min(1, Math.abs(this.speed) / 8);
      if (th > 0.05) {
        const fm = boat.byName.get('Flame')!;
        const fn = boat.nodes.get('Flame')!;
        const len = th * (0.9 + 0.3 * Math.sin(time * 40));
        const m = mat4.multiply(this.m.tmp2, this.matrix, mat4.compose(this.m.tmp, fn[12], fn[13], fn[14]));
        m[8] *= len; m[9] *= len; m[10] *= len;
        mat4.multiply(m, m, mat4.compose(this.m.tmp, -fn[12], -fn[13], -fn[14]));
        r.draw(fm, m, flameInst);
      }
    }
    if (this.radar) {
      const rn = boat.nodes.get('Radar')!;
      const px = rn[12], py = rn[13], pz = rn[14];
      mat4.multiply(this.m.radar, this.matrix, mat4.compose(this.m.tmp, px, py, pz, time * 3));
      mat4.multiply(this.m.radar, this.m.radar, mat4.compose(this.m.tmp, -px, -py, -pz));
      r.draw(boat.byName.get('Radar')!, this.m.radar, i.radar);
    }
    // pet
    if (this.pet) {
      const mesh = a.models.pets.byName.get(this.pet);
      if (mesh) {
        const [px, py, pz] = PET_SPOT[this.pet] ?? [0, 0.82, 2.4];
        this.petBounce = Math.max(0, this.petBounce - 0.02);
        const hover = this.pet === 'PetGhost' || this.pet === 'PetAlien' ? 0.25 + Math.sin(time * 2) * 0.12 : 0;
        const jump = Math.abs(Math.sin(this.petBounce * 18)) * this.petBounce * 0.8;
        const yaw = Math.sin(time * 0.5) * 0.4 + this.petBounce * 12;
        const pm = mat4.multiply(this.m.tmp2, this.matrix, mat4.compose(this.m.tmp, px, py + hover + jump, pz, yaw));
        r.draw(mesh, pm, i.fisher);
      }
    }
    // fisherman
    const spot = boat.nodes.get('FisherSpot')!;
    const fm = this.m.fisher;
    mat4.multiply(fm, this.matrix, mat4.compose(this.m.tmp, spot[12], spot[13], spot[14], this.fisherYaw));
    const fisher = a.models.fisher;
    r.draw(fisher.byName.get('Fisher')!, fm, i.fisher);
    const hs = fisher.nodes.get('HatSpot')!;
    const hm = mat4.multiply(this.m.radar, fm, mat4.compose(this.m.tmp, hs[12], hs[13], hs[14], 0, -0.08));
    const hats = a.models.hats;
    const hatMesh = hats.byName.get(this.hat) ?? hats.byName.get('HatSouwester')!;
    r.draw(hatMesh, hm, i.fisher);
    if (this.hat === 'HatPropeller') {
      const pm = mat4.multiply(this.m.tmp2, hm, mat4.compose(this.m.tmp, 0, 0.31, 0, time * 12));
      r.draw(hats.byName.get('HatPropellerBlades')!, pm, i.fisher);
    }
    const armsNode = fisher.nodes.get('Arms')!;
    const sx = armsNode[12], sy = armsNode[13], sz = armsNode[14];
    const am = this.m.arms;
    mat4.multiply(am, fm, mat4.compose(this.m.tmp, sx, sy, sz, 0, this.armPitch));
    mat4.multiply(am, am, mat4.compose(this.m.tmp, -sx, -sy, -sz));
    r.draw(fisher.byName.get('Arms')!, am, i.fisher);
    // rod: chain of bending segments from the hands
    const sock = mat4.multiply(this.m.socket, am, fisher.nodes.get('RodSocket')!);
    const base = mat4.multiply(this.m.tmp2, sock, mat4.compose(this.m.tmp, 0, -0.28, -0.2, 0, -0.95));
    const segLen = ROD_LEN / ROD_SEGS;
    const cur = mat4.copy(this.m.seg, base);
    r.draw(a.reel, mat4.multiply(this.m.tmp, cur, mat4.compose(mat4.create(), 0, -0.08, 0.28, 0, 0, 0, 1)), i.reel);
    for (let k = 0; k < ROD_SEGS; k++) {
      const r0 = 0.032 * (1 - k / ROD_SEGS) + 0.007;
      const sm = mat4.copy(this.m.tmp, cur);
      sm[0] *= r0; sm[1] *= r0; sm[2] *= r0;
      sm[4] *= r0; sm[5] *= r0; sm[6] *= r0;
      sm[8] *= segLen; sm[9] *= segLen; sm[10] *= segLen;
      r.draw(a.rodSeg, sm, i.rod);
      mat4.multiply(cur, cur, mat4.compose(this.m.tmp, 0, 0, segLen, 0, this.rodBend / ROD_SEGS));
    }
    this.rodTip.set(cur[12], cur[13], cur[14]);
  }

  get rodTipOrStern() { return this.rodTip; }

  sternPos(out: Vec3) {
    return out.set(this.pos.x - Math.sin(this.heading) * 2.2, this.y + 1, this.pos.z - Math.cos(this.heading) * 2.2);
  }

  deckMatrix(out: Mat4, dx: number, dz: number, yaw: number) {
    return mat4.multiply(out, this.matrix, mat4.compose(mat4.create(), dx, 0.85, dz, yaw));
  }
}

const flameInst = Inst.solid(2);
flameInst.a.set([1, 0.55, 0.15, 5]);
/** Where each pet sits on the boat (boat-local, +Z is the bow). */
const PET_SPOT: Record<string, [number, number, number]> = {
  PetCat: [0.45, 2.57, 1.0], PetParrot: [0.36, 3.72, 1.2], PetPenguin: [0.3, 0.82, 2.3],
  PetCrab: [-0.3, 0.82, 2.4], PetGhost: [0, 2.7, 0.7], PetAlien: [0, 2.62, 0.6],
};

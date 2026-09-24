import { clamp, damp, mat4, Vec3 } from '../engine/math';

/** Orbit camera around a moving target, with smoothing, shake and water/terrain constraints. */
export class CameraRig {
  yaw = 0;
  pitch = 0.32;
  dist = 18;
  distTarget = 18;
  fov = 0.95;
  fovTarget = 0.95;
  target = new Vec3();
  desired = new Vec3();
  pos = new Vec3();
  view = mat4.create();
  proj = mat4.create();
  minPitch = -0.2;
  maxPitch = 1.35;
  private shakeAmt = 0;
  private shakeT = 0;
  /** Keep camera below (-1) or above (+1) the water, 0 = free. */
  waterSide = 1;
  private sideOff = 0.8;

  get forwardXZ() { return new Vec3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get rightXZ() { return new Vec3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  /** World yaw the camera looks along (matches Boat heading convention). */
  get lookYaw() { return this.yaw + Math.PI; }

  rotate(dx: number, dy: number, sens: number, invert: boolean) {
    this.yaw -= dx * 0.0024 * sens;
    this.pitch = clamp(this.pitch + dy * 0.0024 * sens * (invert ? -1 : 1), this.minPitch, this.maxPitch);
  }

  shakeScale = 1;
  shake(a: number) { this.shakeAmt = Math.max(this.shakeAmt, a * this.shakeScale); }

  update(dt: number, water: (x: number, z: number) => number, ground: (x: number, z: number) => number, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 9);
    this.target.lerp(this.desired, k);
    this.dist = snap ? this.distTarget : damp(this.dist, this.distTarget, 5, dt);
    this.fov = damp(this.fov, this.fovTarget, 4, dt);
    const cp = Math.cos(this.pitch);
    this.pos.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    const w = water(this.pos.x, this.pos.z);
    // glide through the surface when switching sides, so the lens is briefly half in the sea
    if (this.waterSide !== 0) {
      const want = this.waterSide > 0 ? 0.8 : -0.9;
      this.sideOff = snap ? want : this.sideOff + clamp(want - this.sideOff, -2.6 * dt, 2.6 * dt);
      if (this.waterSide > 0) this.pos.y = Math.max(this.pos.y, w + this.sideOff);
      else this.pos.y = Math.min(this.pos.y, w + this.sideOff);
    }
    this.pos.y = Math.max(this.pos.y, ground(this.pos.x, this.pos.z) + 1.2);
    this.shakeT += dt * 40;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    const s = this.shakeAmt * this.shakeAmt;
    const look = new Vec3(this.target.x + Math.sin(this.shakeT * 1.3) * s, this.target.y + Math.cos(this.shakeT) * s, this.target.z);
    const eye = this.pos.clone().add(new Vec3(Math.sin(this.shakeT * 0.7) * s * 0.5, 0, Math.cos(this.shakeT * 0.9) * s * 0.5));
    mat4.lookAt(this.view, eye, look, new Vec3(0, 1, 0));
    this.pos.copy(eye);
  }

  matrices(aspect: number) {
    mat4.perspectiveReversedInf(this.proj, this.fov, aspect, 0.08);
  }
}

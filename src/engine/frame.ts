import { mat4, type Mat4, type RGB, Vec3 } from './math';

/** CPU-side mirror of the WGSL `Frame` uniform struct (see shaders.ts). */
export class FrameState {
  viewProj = mat4.create();
  invViewProj = mat4.create();
  view = mat4.create();
  proj = mat4.create();
  camPos = new Vec3();
  time = 0;
  sunDir = new Vec3(0.4, 0.8, 0.3).normalize();
  sunIntensity = 2.2;
  sunColor: RGB = [1, 0.95, 0.85];
  cameraUnderwater = 0;
  skyTop: RGB = [0.1, 0.3, 0.8];
  stars = 0;
  skyHorizon: RGB = [0.6, 0.8, 1];
  nebula = 0;
  cloudColor: RGB = [1, 1, 1];
  cloudCover = 0.4;
  fogColor: RGB = [0.6, 0.8, 1];
  fogDensity = 0.0007;
  ambient: RGB = [0.5, 0.6, 0.8];
  ambientIntensity = 0.7;
  ground: RGB = [0.3, 0.3, 0.3];
  waveScale = 1;
  waterShallow: RGB = [0.1, 0.7, 0.7];
  eerie = 0;
  waterDeep: RGB = [0.01, 0.1, 0.3];
  sparkle = 1;
  uwColor: RGB = [0.02, 0.2, 0.3];
  uwDensity = 0.03;
  uwDeep: RGB = [0.0, 0.02, 0.05];
  darkDepth = 150;
  lampPos = new Vec3();
  lampRadius = 0;
  lampColor: RGB = [1, 0.9, 0.7];
  lampIntensity = 0;
  width = 1;
  height = 1;
  voidAmount = 0;
  frost = 0;
  lightFalloff = 0.02;
  causticStrength = 0.6;
  oceanOffsetX = 0;
  oceanOffsetZ = 0;
  oceanExtent = 3500;
  oceanPower = 2.2;
  mapExtent = 2600;
  mapPower = 1.6;
  night = 0;
  rain = 0;
  boatX = 0;
  boatZ = 0;
  boatHeading = 0;
  boatSpeed = 0;
  lava: RGB = [1, 0.35, 0.05];
  lavaStrength = 0;
  /** Shadow cascades (light view-projection), filled in by the renderer. */
  sunVP0 = mat4.create();
  sunVP1 = mat4.create();
  shadowOn = 0;
  shadowTexel = 1 / 2048;
  shadowStrength = 0.85;
  shadowCascades = 2;
  /** 1 while rendering the mirrored reflection pass (clips everything below the water). */
  clipReflect = 0;
  aurora = 0;
  neon = 0;
  vortex = 0;
  /** Water: light absorption per meter, planar reflections available, foam amount, detail normal strength. */
  waterAbsorb = 0.09;
  planar = 0;
  foam = 1;
  waterDetail = 0.55;
  cloudBase = 900;
  cloudThickness = 1300;
  cloudDensity = 1;
  volumetric = 0;
  cloudSteps = 32;
  rays = 0.6;
  realmStyle = 0;
  lowGravity = 0;
  /** x, z, age, strength per wake puff */
  wake = new Float32Array(64);

  static readonly FLOATS = 248;

  setCamera(view: Mat4, proj: Mat4, pos: Vec3) {
    this.proj.set(proj);
    this.view.set(view);
    mat4.multiply(this.viewProj, proj, view);
    mat4.invert(this.invViewProj, this.viewProj);
    this.camPos.copy(pos);
  }

  pack(o: Float32Array) {
    o.set(this.viewProj, 0);
    o.set(this.invViewProj, 16);
    o.set(this.view, 32);
    const v4 = (i: number, a: number, b: number, c: number, d: number) => { o[i] = a; o[i + 1] = b; o[i + 2] = c; o[i + 3] = d; };
    const c4 = (i: number, c: RGB, d: number) => v4(i, c[0], c[1], c[2], d);
    v4(48, this.camPos.x, this.camPos.y, this.camPos.z, this.time);
    v4(52, this.sunDir.x, this.sunDir.y, this.sunDir.z, this.sunIntensity);
    c4(56, this.sunColor, this.cameraUnderwater);
    c4(60, this.skyTop, this.stars);
    c4(64, this.skyHorizon, this.nebula);
    c4(68, this.cloudColor, this.cloudCover);
    c4(72, this.fogColor, this.fogDensity);
    c4(76, this.ambient, this.ambientIntensity);
    c4(80, this.ground, this.waveScale);
    c4(84, this.waterShallow, this.eerie);
    c4(88, this.waterDeep, this.sparkle);
    c4(92, this.uwColor, this.uwDensity);
    c4(96, this.uwDeep, this.darkDepth);
    v4(100, this.lampPos.x, this.lampPos.y, this.lampPos.z, this.lampRadius);
    c4(104, this.lampColor, this.lampIntensity);
    v4(108, this.width, this.height, 1 / this.width, 1 / this.height);
    v4(112, this.voidAmount, this.frost, this.lightFalloff, this.causticStrength);
    v4(116, this.oceanOffsetX, this.oceanOffsetZ, this.oceanExtent, this.oceanPower);
    v4(120, this.mapExtent, this.mapPower, this.night, this.rain);
    v4(124, this.boatX, this.boatZ, this.boatHeading, this.boatSpeed);
    c4(128, this.lava, this.lavaStrength);
    o.set(this.sunVP0, 132);
    o.set(this.sunVP1, 148);
    v4(164, this.shadowOn, this.shadowTexel, this.shadowStrength, this.shadowCascades);
    v4(168, this.clipReflect, this.aurora, this.neon, this.vortex);
    v4(172, this.waterAbsorb, this.planar, this.foam, this.waterDetail);
    v4(176, this.cloudBase, this.cloudThickness, this.cloudDensity, this.volumetric);
    v4(180, this.cloudSteps, this.rays, this.realmStyle, this.lowGravity);
    o.set(this.wake, 184);
  }
}

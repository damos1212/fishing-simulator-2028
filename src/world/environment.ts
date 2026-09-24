// Blends zone atmospheres by position and pushes them into the frame uniforms.
import { activeOpen, NAMED_ZONES, OPEN_SEA, REALM_OPEN, realmZoneIdx, type ZoneEnv, zoneWeights } from '../data/zones';
import type { FrameState } from '../engine/frame';
import { clamp, hex, mixRGB, type RGB, smoothstep } from '../engine/math';
import { heightAt, shoreDistAt } from './terrain';
import type { TimeWeather } from './timeweather';

const NIGHT_TOP: RGB = [0.002, 0.004, 0.018];
const NIGHT_HORIZON: RGB = [0.012, 0.02, 0.05];
const DUSK: RGB = [1.0, 0.42, 0.22];
const DUSK_SUN: RGB = [1.0, 0.55, 0.3];
const MOON: RGB = [0.55, 0.65, 0.95];
const scaleRGB = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

type NumKey = { [K in keyof ZoneEnv]: ZoneEnv[K] extends number ? K : never }[keyof ZoneEnv];
type ColKey = { [K in keyof ZoneEnv]: ZoneEnv[K] extends string ? K : never }[keyof ZoneEnv];

const COLOR_KEYS: ColKey[] = ['skyTop', 'skyHorizon', 'fog', 'sun', 'cloud', 'waterShallow', 'waterDeep', 'uw', 'uwDeep', 'ambient', 'ground', 'lava', 'floor'];
const NUM_KEYS: NumKey[] = ['fogDensity', 'sunIntensity', 'cloudCover', 'stars', 'nebula', 'sparkle', 'uwDensity', 'darkDepth', 'lightFalloff',
  'caustics', 'ambientIntensity', 'waves', 'lavaStrength', 'voidAmount', 'frost', 'eerie', 'storm', 'clarity', 'aurora', 'neon', 'vortex',
  'cloudBase', 'cloudDensity', 'physSky'];

interface LinEnv { c: Record<ColKey, RGB>; n: Record<NumKey, number> }
const lin = (e: ZoneEnv): LinEnv => ({
  c: Object.fromEntries(COLOR_KEYS.map((k) => [k, hex(e[k])])) as Record<ColKey, RGB>,
  n: Object.fromEntries(NUM_KEYS.map((k) => [k, e[k]])) as Record<NumKey, number>,
});
const ZONE_LIN = NAMED_ZONES.map((z) => lin(z.env));
const OPEN_LIN = new Map(Object.values(REALM_OPEN).map((z) => [z.id, lin(z.env)]));

export class Environment {
  cur: LinEnv = lin(OPEN_SEA.env);
  private w: number[] = [];
  private target: LinEnv = lin(OPEN_SEA.env);

  /** Blend the zone atmospheres at (x, z); smoothed over time so crossings feel like transitions. */
  update(x: number, z: number, dt: number) {
    const w = zoneWeights(x, z, this.w);
    const t = this.target;
    const open = OPEN_LIN.get(activeOpen().id)!;
    const idx = realmZoneIdx();
    const nz = NAMED_ZONES.length;
    for (const k of COLOR_KEYS) {
      const o = open.c[k], wf = w[nz];
      let r = o[0] * wf, g = o[1] * wf, b = o[2] * wf;
      for (const i of idx) {
        if (w[i] <= 0) continue;
        const c = ZONE_LIN[i].c[k];
        r += c[0] * w[i]; g += c[1] * w[i]; b += c[2] * w[i];
      }
      t.c[k] = [r, g, b];
    }
    for (const k of NUM_KEYS) {
      let v = open.n[k] * w[nz];
      for (const i of idx) if (w[i] > 0) v += ZONE_LIN[i].n[k] * w[i];
      t.n[k] = v;
    }
    const a = dt < 0 ? 1 : 1 - Math.exp(-dt * 1.5);
    for (const k of COLOR_KEYS) {
      const c = this.cur.c[k], d = t.c[k];
      c[0] += (d[0] - c[0]) * a; c[1] += (d[1] - c[1]) * a; c[2] += (d[2] - c[2]) * a;
    }
    for (const k of NUM_KEYS) this.cur.n[k] += (t.n[k] - this.cur.n[k]) * a;
  }

  apply(f: FrameState, camDepth: number, underwater: boolean, tw: TimeWeather) {
    const { c, n } = this.cur;
    const nk = tw.night * (1 - n.voidAmount);
    const dusk = tw.dusk * (1 - n.voidAmount) * (1 - nk * 0.5);
    const wet = Math.max(tw.rain, tw.storm);
    const grey: RGB = [0.32, 0.35, 0.4];
    f.skyTop = mixRGB(mixRGB(c.skyTop, grey, wet * 0.55), NIGHT_TOP, nk);
    f.skyHorizon = mixRGB(mixRGB(mixRGB(c.skyHorizon, DUSK, dusk * 0.55), grey, wet * 0.5), NIGHT_HORIZON, nk);
    f.fogColor = mixRGB(mixRGB(mixRGB(c.fog, DUSK, dusk * 0.45), [0.5, 0.53, 0.56], wet * 0.5 + tw.fog * 0.3), NIGHT_HORIZON, nk);
    f.sunColor = mixRGB(mixRGB(c.sun, DUSK_SUN, dusk * 0.7), MOON, nk);
    f.cloudColor = scaleRGB(mixRGB(c.cloud, [0.3, 0.32, 0.36], tw.storm * 0.75 + tw.rain * 0.25), 1 - nk * 0.85);
    f.waterShallow = scaleRGB(mixRGB(c.waterShallow, grey, wet * 0.25), 1 - nk * 0.75);
    f.waterDeep = scaleRGB(c.waterDeep, 1 - nk * 0.7);
    f.uwColor = scaleRGB(c.uw, 1 - nk * 0.6);
    f.uwDeep = scaleRGB(c.uwDeep, 1 - nk * 0.5);
    f.ambient = scaleRGB(c.ambient, 1 - nk * 0.55);
    f.ground = c.ground;
    f.lava = c.lava;
    f.fogDensity = n.fogDensity * (1 + 4 * tw.fog + 1.2 * tw.rain + 1.5 * tw.storm);
    f.sunIntensity = (n.sunIntensity * (1 - nk) + 0.42 * nk) * (1 - 0.3 * tw.rain - 0.3 * tw.storm - 0.2 * tw.fog) + tw.lightning * 2.5;
    f.cloudCover = Math.min(1, Math.max(n.cloudCover, tw.clouds));
    f.stars = Math.max(n.stars, nk * (1 - tw.clouds * 0.85));
    f.nebula = n.nebula; f.sparkle = n.sparkle * (1 - wet * 0.7); f.darkDepth = n.darkDepth; f.lightFalloff = n.lightFalloff;
    f.causticStrength = n.caustics * (1 - nk) * (1 - tw.clouds * 0.5);
    f.ambientIntensity = n.ambientIntensity * (1 - nk * 0.35) + tw.lightning * 0.8;
    f.waveScale = n.waves * (1 + 0.9 * tw.storm + 0.25 * tw.rain);
    f.lavaStrength = n.lavaStrength; f.voidAmount = n.voidAmount; f.frost = n.frost; f.eerie = n.eerie;
    f.night = nk;
    f.rain = tw.rain;
    f.waterAbsorb = n.clarity * (1 + tw.storm * 0.6);
    f.aurora = n.aurora * Math.min(1, tw.night * 1.3) * (1 - tw.clouds * 0.7);
    f.neon = n.neon;
    f.vortex = n.vortex;
    f.cloudBase = n.cloudBase - tw.storm * 350;
    f.cloudThickness = 1300 + tw.storm * 900 + tw.rain * 300;
    f.cloudDensity = n.cloudDensity * (1 + tw.storm * 0.9 + tw.rain * 0.4);
    f.foam = 0.55 + n.waves * 0.3 + tw.storm * 1.3;
    f.waterDetail = 0.45 + 0.2 * n.waves + tw.storm * 0.25;
    f.cameraUnderwater = underwater ? 1 : 0;
    // physically based sky: weight, brightness matched to the zone's sun, greyed by bad weather
    f.physSky = n.physSky * (1 - n.voidAmount);
    f.skyExposure = 5 * (n.sunIntensity / 2.4) * (1 - 0.35 * tw.storm);
    f.skyGrey = clamp(wet * 0.7 + tw.fog * 0.4, 0, 1);
    f.cirrus = clamp((0.25 + 0.5 * n.physSky) * (1 - tw.storm) * (1 - tw.rain * 0.6), 0, 1);
    tw.trueSun(f.trueSun);
    // visibility shrinks in the dark deep
    f.uwDensity = n.uwDensity * (1 + clamp(camDepth / n.darkDepth, 0, 3) * 0.6);
  }

  get storm() { return this.cur.n.storm; }

  get lavaStrength() { return this.cur.n.lavaStrength; }
  get voidAmount() { return this.cur.n.voidAmount; }
  get frost() { return this.cur.n.frost; }
  get eerie() { return this.cur.n.eerie; }
}

/** CPU mirror of the ocean shader's wave height (ignores horizontal Gerstner drift). */
const WAVES = [
  [1.0, 0.35, 64, 0.45], [0.4, 1.0, 33, 0.22], [-0.8, 0.6, 19, 0.1],
].map(([dx, dz, L, a]) => { const l = Math.hypot(dx, dz); const k = (Math.PI * 2) / L; return { dx: dx / l, dz: dz / l, k, a, c: Math.sqrt(9.8 / k) }; });

export function waveHeight(x: number, z: number, t: number, scale: number) {
  let h = 0;
  for (const w of WAVES) h += w.a * scale * Math.sin(w.k * (w.dx * x + w.dz * z - w.c * t));
  // matches the shader: waves calm down over the shallows
  const g = heightAt(x, z);
  return g > -6 ? h * (0.35 + 0.65 * smoothstep(-0.5, -6, g)) : h;
}

/** CPU mirror of the shader's surf cycle (common.ts surfPhase). */
export function surfPhase(x: number, z: number, t: number) {
  const a = Math.sin(x * 0.011 + Math.sin(z * 0.0071) * 1.3) * 0.25 + Math.sin(z * 0.013 - x * 0.0043) * 0.2;
  const v = t * 0.085 + a;
  return v - Math.floor(v);
}

/** Where a breaker is pitching over near (x, z): returns the shoreward direction and strength, or null (mirrors shoreSurf). */
export function breakerAt(x: number, z: number, t: number): { dx: number; dz: number; k: number } | null {
  const ds = shoreDistAt(x, z);
  if (ds > 60 || ds < 0.5) return null;
  const h = heightAt(x, z);
  if (h > -0.2 || h < -12) return null;
  const cd = 70 * (1 - surfPhase(x, z, t));
  const lip = ds - cd + 0.6;
  const br = smoothstep(2.4, 1.1, -h);
  if (br < 0.4 || Math.abs(lip) > 1.2) return null;
  const e = 2;
  const gx = shoreDistAt(x - e, z) - shoreDistAt(x + e, z), gz = shoreDistAt(x, z - e) - shoreDistAt(x, z + e);
  const gl = Math.hypot(gx, gz) || 1;
  return { dx: gx / gl, dz: gz / gl, k: br * (1 - Math.abs(lip) / 1.2) };
}

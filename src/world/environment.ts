// Blends zone atmospheres by position and pushes them into the frame uniforms.
import { OPEN_SEA, ZONES, type ZoneEnv, zoneWeights } from '../data/zones';
import type { FrameState } from '../engine/frame';
import { clamp, hex, type RGB } from '../engine/math';

type NumKey = { [K in keyof ZoneEnv]: ZoneEnv[K] extends number ? K : never }[keyof ZoneEnv];
type ColKey = { [K in keyof ZoneEnv]: ZoneEnv[K] extends string ? K : never }[keyof ZoneEnv];

const COLOR_KEYS: ColKey[] = ['skyTop', 'skyHorizon', 'fog', 'sun', 'cloud', 'waterShallow', 'waterDeep', 'uw', 'uwDeep', 'ambient', 'ground', 'lava', 'floor'];
const NUM_KEYS: NumKey[] = ['fogDensity', 'sunIntensity', 'cloudCover', 'stars', 'nebula', 'sparkle', 'uwDensity', 'darkDepth', 'lightFalloff',
  'caustics', 'ambientIntensity', 'waves', 'lavaStrength', 'voidAmount', 'frost', 'eerie'];

interface LinEnv { c: Record<ColKey, RGB>; n: Record<NumKey, number> }
const lin = (e: ZoneEnv): LinEnv => ({
  c: Object.fromEntries(COLOR_KEYS.map((k) => [k, hex(e[k])])) as Record<ColKey, RGB>,
  n: Object.fromEntries(NUM_KEYS.map((k) => [k, e[k]])) as Record<NumKey, number>,
});
const ZONE_LIN = ZONES.map((z) => lin(z.env));
const OPEN_LIN = lin(OPEN_SEA.env);

export class Environment {
  cur: LinEnv = lin(OPEN_SEA.env);
  private w: number[] = [];
  private target: LinEnv = lin(OPEN_SEA.env);

  /** Blend the zone atmospheres at (x, z); smoothed over time so crossings feel like transitions. */
  update(x: number, z: number, dt: number) {
    const w = zoneWeights(x, z, this.w);
    const t = this.target;
    for (const k of COLOR_KEYS) {
      const o = OPEN_LIN.c[k], wf = w[ZONES.length];
      let r = o[0] * wf, g = o[1] * wf, b = o[2] * wf;
      for (let i = 0; i < ZONES.length; i++) {
        if (w[i] <= 0) continue;
        const c = ZONE_LIN[i].c[k];
        r += c[0] * w[i]; g += c[1] * w[i]; b += c[2] * w[i];
      }
      t.c[k] = [r, g, b];
    }
    for (const k of NUM_KEYS) {
      let v = OPEN_LIN.n[k] * w[ZONES.length];
      for (let i = 0; i < ZONES.length; i++) if (w[i] > 0) v += ZONE_LIN[i].n[k] * w[i];
      t.n[k] = v;
    }
    const a = dt < 0 ? 1 : 1 - Math.exp(-dt * 1.5);
    for (const k of COLOR_KEYS) {
      const c = this.cur.c[k], d = t.c[k];
      c[0] += (d[0] - c[0]) * a; c[1] += (d[1] - c[1]) * a; c[2] += (d[2] - c[2]) * a;
    }
    for (const k of NUM_KEYS) this.cur.n[k] += (t.n[k] - this.cur.n[k]) * a;
  }

  apply(f: FrameState, camDepth: number, underwater: boolean) {
    const { c, n } = this.cur;
    f.skyTop = c.skyTop; f.skyHorizon = c.skyHorizon; f.fogColor = c.fog; f.sunColor = c.sun; f.cloudColor = c.cloud;
    f.waterShallow = c.waterShallow; f.waterDeep = c.waterDeep; f.uwColor = c.uw; f.uwDeep = c.uwDeep;
    f.ambient = c.ambient; f.ground = c.ground; f.lava = c.lava;
    f.fogDensity = n.fogDensity; f.sunIntensity = n.sunIntensity; f.cloudCover = n.cloudCover; f.stars = n.stars;
    f.nebula = n.nebula; f.sparkle = n.sparkle; f.darkDepth = n.darkDepth; f.lightFalloff = n.lightFalloff;
    f.causticStrength = n.caustics; f.ambientIntensity = n.ambientIntensity; f.waveScale = n.waves;
    f.lavaStrength = n.lavaStrength; f.voidAmount = n.voidAmount; f.frost = n.frost; f.eerie = n.eerie;
    f.cameraUnderwater = underwater ? 1 : 0;
    // visibility shrinks in the dark deep
    f.uwDensity = n.uwDensity * (1 + clamp(camDepth / n.darkDepth, 0, 3) * 0.6);
  }

  get lavaStrength() { return this.cur.n.lavaStrength; }
  get voidAmount() { return this.cur.n.voidAmount; }
  get frost() { return this.cur.n.frost; }
  get eerie() { return this.cur.n.eerie; }
}

/** CPU mirror of the ocean shader's wave height (ignores horizontal Gerstner drift). */
const WAVES = [
  [1.0, 0.35, 64, 0.55], [0.4, 1.0, 33, 0.3], [-0.8, 0.6, 19, 0.16], [0.6, -0.9, 11, 0.08], [-0.3, -1.0, 6.5, 0.035],
].map(([dx, dz, L, a]) => { const l = Math.hypot(dx, dz); const k = (Math.PI * 2) / L; return { dx: dx / l, dz: dz / l, k, a, c: Math.sqrt(9.8 / k) }; });

export function waveHeight(x: number, z: number, t: number, scale: number) {
  let h = 0;
  for (const w of WAVES) h += w.a * scale * Math.sin(w.k * (w.dx * x + w.dz * z - w.c * t));
  return h;
}

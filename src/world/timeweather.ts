// Day/night cycle and a weather state machine. Pure simulation; Environment turns it into colors.
import type { WeatherKind } from '../data/fish';
import { clamp, damp, rng, smoothstep, Vec3 } from '../engine/math';

/** Seconds of play per in-game day. */
export const DAY_LENGTH = 960;

interface Look { clouds: number; rain: number; storm: number; fog: number }
const LOOK: Record<WeatherKind, Look> = {
  clear: { clouds: 0.1, rain: 0, storm: 0, fog: 0 },
  cloudy: { clouds: 0.65, rain: 0, storm: 0, fog: 0 },
  rain: { clouds: 0.85, rain: 1, storm: 0, fog: 0.15 },
  storm: { clouds: 1, rain: 1, storm: 1, fog: 0.2 },
  fog: { clouds: 0.45, rain: 0, storm: 0, fog: 1 },
};
const NEXT: Record<WeatherKind, [WeatherKind, number][]> = {
  clear: [['clear', 3], ['cloudy', 3], ['fog', 1]],
  cloudy: [['clear', 2], ['rain', 3], ['fog', 1], ['cloudy', 1]],
  rain: [['cloudy', 2], ['storm', 2], ['rain', 1]],
  storm: [['rain', 3], ['cloudy', 1]],
  fog: [['clear', 2], ['cloudy', 2]],
};

export const WEATHER_LABEL: Record<WeatherKind, string> = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', fog: 'Fog' };

export class TimeWeather {
  dayTime = 0.32;
  weather: WeatherKind = 'clear';
  clouds = 0.1;
  rain = 0;
  storm = 0;
  fog = 0;
  lightning = 0;
  private timer = 200;
  private nextStrike = 6;
  private r = rng(Date.now() & 0xffff);
  /** Recent lightning bolts: world position + age. */
  bolts: { pos: Vec3; age: number; seed: number }[] = [];

  /** forcedStorm 0..1: zones like Storm Reach keep the weather wild. Returns a strike position when lightning hits. */
  update(dt: number, forcedStorm: number, cam: Vec3): Vec3 | null {
    this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 150 + this.r() * 180;
      const opts = NEXT[this.weather];
      let x = this.r() * opts.reduce((s, o) => s + o[1], 0);
      for (const [k, w] of opts) { x -= w; if (x <= 0) { this.weather = k; break; } }
    }
    const t = LOOK[this.weather];
    const fs = clamp(forcedStorm, 0, 1);
    this.clouds = damp(this.clouds, Math.max(t.clouds, fs), 0.15, dt);
    this.rain = damp(this.rain, Math.max(t.rain, fs), 0.2, dt);
    this.storm = damp(this.storm, Math.max(t.storm, fs), 0.15, dt);
    this.fog = damp(this.fog, t.fog * (1 - fs * 0.5), 0.15, dt);
    this.lightning = Math.max(0, this.lightning - dt * 4);
    for (const b of this.bolts) b.age += dt;
    this.bolts = this.bolts.filter((b) => b.age < 0.5);
    if (this.storm > 0.55) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 3 + this.r() * 9;
        const a = this.r() * Math.PI * 2, d = 150 + this.r() * 600;
        const pos = new Vec3(cam.x + Math.cos(a) * d, 0, cam.z + Math.sin(a) * d);
        this.bolts.push({ pos, age: 0, seed: this.r() * 1000 });
        this.lightning = 1;
        return pos;
      }
    }
    return null;
  }

  /** The weather that counts for fish spawning (storm zones force storms). */
  effective(): WeatherKind {
    if (this.storm > 0.6) return 'storm';
    if (this.rain > 0.6) return 'rain';
    if (this.fog > 0.6) return 'fog';
    return this.clouds > 0.5 ? 'cloudy' : 'clear';
  }

  get sunElevation() { return Math.sin((this.dayTime - 0.25) * Math.PI * 2); }
  /** 1 at night, 0 in daylight. */
  get night() { return smoothstep(0.02, -0.22, this.sunElevation); }
  get isNight() { return this.night > 0.5; }
  /** Near sunrise/sunset. */
  get dusk() { return 1 - smoothstep(0.0, 0.35, Math.abs(this.sunElevation + 0.05)); }

  /** Direction towards the main light (sun by day, moon by night). */
  lightDir(out: Vec3) {
    const a = (this.dayTime - 0.25) * Math.PI * 2;
    const sun = new Vec3(Math.cos(a) * 0.75, Math.sin(a), -0.45).normalize();
    if (sun.y > -0.05) return out.set(sun.x, Math.max(sun.y, 0.08), sun.z).normalize();
    return out.set(-sun.x * 0.6, Math.max(-sun.y, 0.25), 0.5).normalize();
  }

  clock() {
    const mins = Math.floor(this.dayTime * 24 * 60);
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}

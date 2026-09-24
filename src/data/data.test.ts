import { describe, expect, it } from 'vitest';
import { heightAt, ISLANDS, WORLD_R } from '../world/terrain';
import { SPECIES } from './fish';
import { TRACKS } from './upgrades';
import { ALL_ZONES, ZONES, zoneAt, zoneWeights } from './zones';

describe('species data', () => {
  it('every catchable species is reachable with max gear and fits its zone', () => {
    const maxBait = TRACKS.find((t) => t.id === 'bait')!.tiers.at(-1)!.stats.baitTier!;
    const maxLine = TRACKS.find((t) => t.id === 'rod')!.tiers.at(-1)!.stats.lineLength!;
    for (const s of SPECIES) {
      const zone = ALL_ZONES.find((z) => z.id === s.zone)!;
      expect(zone, s.id).toBeDefined();
      expect(s.bait, s.id).toBeLessThanOrEqual(maxBait);
      expect(s.depth[0], s.id).toBeLessThan(s.depth[1]);
      expect(s.depth[0], s.id).toBeLessThan(zone.floorDepth);
      expect(s.depth[0], s.id).toBeLessThan(maxLine);
    }
  });

  it('each special zone has a legendary and a hazard', () => {
    for (const z of ZONES) {
      const list = SPECIES.filter((s) => s.zone === z.id);
      expect(list.some((s) => s.rarity === 'legendary'), z.id).toBe(true);
      expect(list.some((s) => s.hazard), z.id).toBe(true);
    }
  });

  it('ids are unique', () => {
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
  });
});

describe('upgrade tracks', () => {
  it('costs rise tier by tier and hull tiers cover every locked zone', () => {
    for (const t of TRACKS) {
      expect(t.tiers[0].cost).toBe(0);
      for (let i = 1; i < t.tiers.length; i++) expect(t.tiers[i].cost, `${t.id}${i}`).toBeGreaterThan(t.tiers[i - 1].cost);
    }
    const hullTiers = TRACKS.find((t) => t.id === 'hull')!.tiers.length;
    for (const z of ZONES) expect(z.hull).toBeLessThan(hullTiers);
  });
});

describe('world layout', () => {
  it('zone weights are a partition of unity', () => {
    for (const [x, z] of [[0, 0], [500, -100], [-900, 100], [2000, 2000], [300, 400]]) {
      const w = zoneWeights(x, z);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    }
  });

  it('zones are recognised at their centers and the harbor spawn is navigable water', () => {
    for (const z of ZONES) expect(zoneAt(z.x + 40, z.z + 40).id).toBe(z.id);
    expect(heightAt(-9, 91.5)).toBeLessThan(-2);
    expect(heightAt(0, 0)).toBeGreaterThan(2);
  });

  it('islands are land and all zones sit inside the world edge', () => {
    for (const i of ISLANDS) expect(heightAt(i.x, i.z), `${i.kind}@${i.x},${i.z}`).toBeGreaterThan(1);
    for (const z of ZONES) expect(Math.hypot(z.x, z.z) + z.radius * 0.5).toBeLessThan(WORLD_R);
  });
});

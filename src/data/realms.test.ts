import { afterAll, describe, expect, it } from 'vitest';
import { heightAt, REALM_ISLANDS, syncRealm } from '../world/terrain';
import { BOSS_FOR_ZONE, CATCHABLE } from './fish';
import { QUESTS } from './quests';
import { TRACKS } from './upgrades';
import { ALL_ZONES, NAMED_ZONES, REALM_OPEN, REALMS, setActiveRealm, zoneAt } from './zones';

afterAll(() => { setActiveRealm('blue'); syncRealm(); });

describe('realms', () => {
  it('every named zone has a crowd of species and exactly one boss', () => {
    for (const z of NAMED_ZONES) {
      const list = CATCHABLE.filter((s) => s.zone === z.id && !s.boss);
      expect(list.length, z.id).toBeGreaterThanOrEqual(6);
      expect(CATCHABLE.filter((s) => s.zone === z.id && s.boss).length, z.id).toBe(1);
      expect(BOSS_FOR_ZONE.get(z.id), z.id).toBeTruthy();
    }
    for (const o of Object.values(REALM_OPEN)) expect(CATCHABLE.filter((s) => s.zone === o.id).length, o.id).toBeGreaterThanOrEqual(5);
  });

  it('has hull, rod and bait tiers for every zone level', () => {
    const tiers = (id: string) => TRACKS.find((t) => t.id === id)!.tiers.length;
    const maxLevel = Math.max(...ALL_ZONES.map((z) => z.level));
    const maxHull = Math.max(...ALL_ZONES.map((z) => z.hull));
    expect(tiers('hull')).toBeGreaterThan(maxHull);
    expect(tiers('bait')).toBeGreaterThan(maxLevel);
    expect(tiers('rod')).toBeGreaterThan(maxLevel);
    for (const r of REALMS) expect(ALL_ZONES.some((z) => z.realm === r.id && z.hull === r.hull), r.id).toBe(true);
  });

  it('keeps every species within reach of the rod for its zone', () => {
    const rods = TRACKS.find((t) => t.id === 'rod')!.tiers;
    for (const s of CATCHABLE) {
      if (s.junk) continue;
      const z = ALL_ZONES.find((zz) => zz.id === s.zone)!;
      const reach = rods[Math.min(z.level + 1, rods.length - 1)].stats.lineLength!;
      expect(s.depth[0], s.id).toBeLessThan(reach);
    }
  });

  it('builds a world per realm with a harbor island, open water around it and a reachable rift', () => {
    for (const r of REALMS) {
      setActiveRealm(r.id);
      syncRealm();
      expect(REALM_ISLANDS[r.id].length, r.id).toBeGreaterThan(3);
      expect(heightAt(0, 0), r.id).toBeGreaterThan(0.5);
      expect(heightAt(0, 140), r.id).toBeLessThan(-2);
      if (r.tear) expect(heightAt(r.tear.x, r.tear.z), r.id).toBeLessThan(-5);
      for (const z of NAMED_ZONES.filter((zz) => zz.realm === r.id)) expect(zoneAt(z.x, z.z).id, z.id).toBe(z.id);
    }
  });

  it('tells a story that visits every realm', () => {
    for (const r of REALMS.filter((x) => x.id !== 'blue')) {
      expect(QUESTS.some((q) => q.goal.kind === 'realm' && q.goal.realm === r.id), r.id).toBe(true);
    }
    expect(QUESTS[QUESTS.length - 1].after).toBe('finale');
  });
});

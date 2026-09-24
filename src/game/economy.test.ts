import { describe, expect, it } from 'vitest';
import { speciesById, SPECIES } from '../data/fish';
import { rng } from '../engine/math';
import { buy, catchFish, computeStats, landCatch, migrateSave, newSave, pickSpecies, sellAll } from './economy';

describe('upgrades', () => {
  it('starts with tier-0 stats and applies purchases', () => {
    const s = newSave();
    expect(computeStats(s.upgrades).lineLength).toBe(45);
    expect(buy(s, 'rod')).toBe(false);
    s.money = 1000;
    expect(buy(s, 'rod')).toBe(true);
    expect(s.money).toBe(850);
    expect(computeStats(s.upgrades).lineLength).toBe(85);
  });

  it('never buys past the last tier', () => {
    const s = newSave();
    s.money = 1e12;
    let n = 0;
    while (buy(s, 'finder')) n++;
    expect(n).toBe(3);
    expect(computeStats(s.upgrades).finder).toBe(3);
  });
});

describe('catching and selling', () => {
  it('logs new species, records, and releases overflow when the cooler is full', () => {
    const s = newSave();
    const sp = speciesById.get('snapper')!;
    const first = landCatch(s, [catchFish(sp, 1), catchFish(sp, 1.3)], 1);
    expect(first.newSpecies).toEqual(['snapper']);
    expect(first.records).toEqual(['snapper']);
    expect(first.kept).toHaveLength(1);
    expect(first.released).toHaveLength(1);
    expect(s.dex.snapper).toEqual({ caught: 2, best: 1.3 });
  });

  it('bigger fish are worth more and selling empties the cooler', () => {
    const sp = speciesById.get('tuna')!;
    expect(catchFish(sp, 1.4).value).toBeGreaterThan(catchFish(sp, 0.8).value);
    const s = newSave();
    landCatch(s, [catchFish(sp, 1), catchFish(sp, 1)], 10);
    const v = sellAll(s);
    expect(v).toBe(2 * sp.value);
    expect(s.money).toBe(v);
    expect(s.cooler).toHaveLength(0);
  });
});

describe('spawning', () => {
  it('only picks species whose depth band fits', () => {
    const pool = SPECIES.filter((x) => x.zone === 'deepblue');
    const r = rng(1);
    for (let i = 0; i < 200; i++) {
      const sp = pickSpecies(pool, 300, r)!;
      expect(sp.depth[1]).toBeGreaterThanOrEqual(295);
    }
    expect(pickSpecies(pool, 5000, r)).toBeNull();
  });
});

describe('saves', () => {
  it('migrates partial or foreign data safely', () => {
    const s = migrateSave({ money: 42, upgrades: { rod: 2 }, cooler: [{ id: 'nope', size: 1, value: 1 }, { id: 'clown', size: 1, value: 9 }] });
    expect(s.money).toBe(42);
    expect(s.upgrades.rod).toBe(2);
    expect(s.upgrades.hull).toBe(0);
    expect(s.cooler.map((f) => f.id)).toEqual(['clown']);
    expect(migrateSave('garbage').money).toBe(0);
  });
});

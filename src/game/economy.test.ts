import { TRACKS } from '../data/upgrades';
import { describe, expect, it } from 'vitest';
import { speciesById, SPECIES } from '../data/fish';
import { itemById, itemPrice } from '../data/items';
import { rng } from '../engine/math';
import {
  buy, buyCosmetic, buyItem, catchFish, computeStats, eligible, equipCosmetic, landCatch, migrateSave, newSave, pickSpecies, progressLevel,
  sellAll, useItem, zonePool,
} from './economy';

describe('upgrades', () => {
  it('starts with tier-0 stats and applies purchases', () => {
    const s = newSave();
    expect(computeStats(s.upgrades).lineLength).toBe(45);
    expect(buy(s, 'rod')).toBe(false);
    s.money = 1000;
    expect(buy(s, 'rod')).toBe(true);
    expect(s.money).toBe(1000 - TRACKS.find((t) => t.id === 'rod')!.tiers[1].cost);
    expect(computeStats(s.upgrades).lineLength).toBe(85);
    expect(s.stats.upgrades).toBe(1);
  });

  it('never buys past the last tier', () => {
    const s = newSave();
    s.money = 1e12;
    let n = 0;
    while (buy(s, 'finder')) n++;
    expect(n).toBe(3);
    expect(computeStats(s.upgrades).finder).toBe(3);
  });

  it('hull tiers raise the progress level', () => {
    const s = newSave();
    expect(progressLevel(s)).toBe(2);
    s.upgrades.hull = 9;
    expect(progressLevel(s)).toBe(11);
  });
});

describe('catching and selling', () => {
  it('logs new species, records, and releases overflow when the cooler is full', () => {
    const s = newSave();
    const sp = speciesById.get('snapper')!;
    const first = landCatch(s, [catchFish(sp, 1), catchFish(sp, 1.3)], 1);
    expect(first.newSpecies).toEqual(['snapper']);
    expect(first.records).toEqual([]);
    expect(first.kept).toHaveLength(1);
    expect(first.released).toHaveLength(1);
    expect(s.dex.snapper).toEqual({ caught: 2, best: 1.3 });
    const second = landCatch(s, [catchFish(sp, 1.4)], 10);
    expect(second.records).toEqual(['snapper']);
  });

  it('bigger fish are worth more and selling empties the cooler', () => {
    const sp = speciesById.get('tuna')!;
    expect(catchFish(sp, 1.4).value).toBeGreaterThan(catchFish(sp, 0.8).value);
    expect(catchFish(sp, 1, true).value).toBe(catchFish(sp, 1).value * 2);
    const s = newSave();
    landCatch(s, [catchFish(sp, 1), catchFish(sp, 1)], 10);
    const v = sellAll(s);
    expect(v).toBe(2 * sp.value);
    expect(s.money).toBe(v);
    expect(s.cooler).toHaveLength(0);
  });

  it('bosses are kept even with a full cooler and tracked as trophies', () => {
    const s = newSave();
    const boss = speciesById.get('kinggrouper')!;
    const res = landCatch(s, [catchFish(boss, 1)], 0);
    expect(res.kept).toHaveLength(1);
    expect(s.bosses).toEqual(['kinggrouper']);
    expect(s.stats.bosses).toBe(1);
  });

  it('bottles pay out pearls and junk has a flat value', () => {
    const s = newSave();
    const res = landCatch(s, [catchFish(speciesById.get('bottle')!, 1.4)], 10);
    expect(res.pearls).toBe(2);
    expect(s.pearls).toBe(2);
    expect(res.kept[0].value).toBe(speciesById.get('bottle')!.value);
  });
});

describe('spawning', () => {
  it('only picks species whose depth band fits', () => {
    const pool = SPECIES.filter((x) => x.zone === 'deepblue');
    const r = rng(1);
    for (let i = 0; i < 200; i++) {
      const sp = pickSpecies(pool, 300, r, 1, { night: false, weather: 'clear' })!;
      expect(sp.depth[1]).toBeGreaterThanOrEqual(295);
      expect(sp.boss).toBe(false);
    }
    expect(pickSpecies(pool, 5000, r)).toBeNull();
  });

  it('respects time of day and weather', () => {
    const glow = speciesById.get('glowgoby')!;
    const rainy = speciesById.get('raindrop')!;
    expect(eligible(glow, { night: false, weather: 'clear' })).toBe(false);
    expect(eligible(glow, { night: true, weather: 'clear' })).toBe(true);
    expect(eligible(rainy, { night: false, weather: 'clear' })).toBe(false);
    expect(eligible(rainy, { night: false, weather: 'storm' })).toBe(true);
    expect(eligible(speciesById.get('megalodon')!, { night: true, weather: 'storm' })).toBe(false);
  });

  it('every zone pool includes junk that washes up anywhere', () => {
    expect(zonePool('magma').some((s) => s.id === 'boot')).toBe(true);
    expect(zonePool('magma').every((s) => s.zone === 'magma' || s.anywhere)).toBe(true);
  });
});

describe('items and cosmetics', () => {
  it('buys, uses and prices supplies by progress', () => {
    const s = newSave();
    const chum = itemById.get('chum')!;
    expect(itemPrice(chum, 5)).toBeGreaterThan(itemPrice(chum, 0));
    s.money = itemPrice(chum, 0) * 2;
    expect(buyItem(s, 'chum', itemPrice(chum, 0), 3)).toBe(false);
    expect(buyItem(s, 'chum', itemPrice(chum, 0), 2)).toBe(true);
    expect(useItem(s, 'chum')).toBe(true);
    expect(s.inventory.chum).toBe(1);
    expect(s.stats.itemsUsed).toBe(1);
  });

  it('buys cosmetics with pearls and equips owned ones', () => {
    const s = newSave();
    expect(buyCosmetic(s, 'hat-crown')).toBe(false);
    s.pearls = 50;
    expect(buyCosmetic(s, 'hat-crown')).toBe(true);
    expect(s.pearls).toBe(10);
    expect(s.cosmetics.equipped.hat).toBe('hat-crown');
    expect(equipCosmetic(s, 'hat-souwester')).toBe(true);
    expect(equipCosmetic(s, 'hat-wizard')).toBe(false);
  });
});

describe('saves', () => {
  it('migrates partial or foreign data safely', () => {
    const s = migrateSave({ money: 42, upgrades: { rod: 2 }, cooler: [{ id: 'nope', size: 1, value: 1 }, { id: 'clown', size: 1, value: 9 }] });
    expect(s.money).toBe(42);
    expect(s.upgrades.rod).toBe(2);
    expect(s.upgrades.hull).toBe(0);
    expect(s.cooler.map((f) => f.id)).toEqual(['clown']);
    expect(s.inventory.bossbait).toBe(0);
    expect(s.cosmetics.equipped.hat).toBe('hat-souwester');
    expect(migrateSave('garbage').money).toBe(0);
  });

  it('upgrades a v1 save and clamps out-of-range tiers', () => {
    const v1 = { version: 1, money: 10, upgrades: { hull: 4, rod: 99 }, stats: { caught: 5 }, dex: { snapper: { caught: 1, best: 1 }, gone: { caught: 1, best: 1 } } };
    const s = migrateSave(v1);
    expect(s.version).toBe(2);
    expect(s.upgrades.rod).toBe(TRACKS.find((t) => t.id === 'rod')!.tiers.length - 1);
    expect(s.stats.caught).toBe(5);
    expect(s.stats.bosses).toBe(0);
    expect(Object.keys(s.dex)).toEqual(['snapper']);
  });
});

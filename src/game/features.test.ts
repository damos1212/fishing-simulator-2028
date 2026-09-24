import { describe, expect, it } from 'vitest';
import { speciesById } from '../data/fish';
import { PERKS } from '../data/perks';
import { buyPerk, catchFish, landCatch, migrateSave, newSave, perkCost, perkRank, perkValue, SHINY_VALUE } from './economy';
import { checkAchievements } from './progress';
import { Tournament, TOURNEY_TIME } from './tournament';

describe('perks', () => {
  it('costs pearls per rank and stops at the last rank', () => {
    const s = newSave();
    expect(perkValue(s, 'haggler')).toBe(0);
    expect(buyPerk(s, 'haggler')).toBe(false);
    s.pearls = 1000;
    let n = 0;
    while (buyPerk(s, 'haggler')) n++;
    const p = PERKS.find((x) => x.id === 'haggler')!;
    expect(n).toBe(p.costs.length);
    expect(perkCost(s, 'haggler')).toBeNull();
    expect(perkValue(s, 'haggler')).toBe(p.values[p.costs.length]);
    expect(s.pearls).toBe(1000 - p.costs.reduce((a, b) => a + b, 0));
  });

  it('needs the prerequisite perk first', () => {
    const s = newSave();
    s.pearls = 1000;
    expect(buyPerk(s, 'combo')).toBe(false);
    expect(buyPerk(s, 'haggler')).toBe(true);
    expect(buyPerk(s, 'combo')).toBe(true);
    expect(perkRank(s, 'combo')).toBe(1);
  });

  it('survives old saves and clamps tampered ranks', () => {
    const s = migrateSave({ perks: { haggler: 99, bogus: 3 } });
    expect(perkRank(s, 'haggler')).toBe(PERKS.find((x) => x.id === 'haggler')!.costs.length);
    expect(Object.keys(s.perks)).toEqual(['haggler']);
    expect(migrateSave({}).perks).toEqual({});
  });
});

describe('shiny fish', () => {
  it('are worth more and are logged separately', () => {
    const sp = speciesById.get('sardine') ?? [...speciesById.values()].find((x) => !x.junk && !x.boss)!;
    const plain = catchFish(sp, 1);
    const shiny = catchFish(sp, 1, false, 1, true);
    expect(shiny.shiny).toBe(true);
    expect(shiny.value).toBe(plain.value * SHINY_VALUE);
    const s = newSave();
    const res = landCatch(s, [plain, shiny], 10);
    expect(res.newShiny).toEqual([sp.id]);
    expect(s.dex[sp.id].shiny).toBe(1);
    expect(s.stats.shinies).toBe(1);
    expect(landCatch(s, [catchFish(sp, 1, false, 1, true)], 10).newShiny).toEqual([]);
    expect(checkAchievements(s).map((a) => a.id)).toContain('shiny1');
  });
});

describe('tournaments', () => {
  const form = { perMinCount: 3, perMinValue: 300, bestLen: 2 };

  it('paces rivals around the player form and ranks everyone', () => {
    const t = new Tournament('count', 100, form, 7);
    for (let i = 0; i < TOURNEY_TIME * 10 + 5 && !t.done; i++) t.update(0.1);
    expect(t.done).toBe(true);
    const par = form.perMinCount * TOURNEY_TIME / 60;
    const best = Math.max(...t.rivals.map((r) => r.score));
    expect(best).toBeGreaterThan(par * 0.8);
    expect(best).toBeLessThan(par * 1.8);
    expect(t.place).toBe(5);
    expect(t.standings()).toHaveLength(5);
  });

  it('counts catches by the contest rules', () => {
    const count = new Tournament('count', 100, form, 1);
    count.add([{ value: 5, length: 1 }, { value: 7, length: 3 }]);
    expect(count.score).toBe(2);
    const value = new Tournament('value', 100, form, 1);
    value.add([{ value: 5, length: 1 }, { value: 7, length: 3 }]);
    expect(value.score).toBe(12);
    const big = new Tournament('biggest', 100, form, 1);
    big.add([{ value: 5, length: 1 }, { value: 7, length: 3 }]);
    big.add([{ value: 1, length: 2 }]);
    expect(big.score).toBe(3);
  });

  it('pays the podium only', () => {
    expect(Tournament.prize(1, 100)).toEqual({ money: 600, pearls: 6 });
    expect(Tournament.prize(3, 100).pearls).toBe(1);
    expect(Tournament.prize(4, 100)).toEqual({ money: 0, pearls: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import { speciesById } from '../data/fish';
import { rng } from '../engine/math';
import { catchFish, newSave } from './economy';
import { ACHIEVEMENTS, checkAchievements, contractGoal, fillContracts, generateContract, progressContracts } from './progress';

describe('contracts', () => {
  it('fills three distinct contracts for unlocked zones', () => {
    const s = newSave();
    fillContracts(s, rng(3), 45, 1);
    expect(s.contracts).toHaveLength(3);
    const keys = s.contracts.map((c) => c.kind + c.target);
    expect(new Set(keys).size).toBe(3);
    for (const c of s.contracts) {
      expect(c.money).toBeGreaterThan(0);
      expect(c.title.length).toBeGreaterThan(5);
    }
  });

  it('only targets zones the hull can reach', () => {
    const s = newSave();
    const r = rng(9);
    for (let i = 0; i < 100; i++) {
      const c = generateContract(s, r, 45, 1);
      expect(c.level).toBeLessThanOrEqual(2);
    }
  });

  it('progresses, pays out and is replaced', () => {
    const s = newSave();
    s.contracts = [{ id: 1, kind: 'species', target: 'snapper', n: 2, progress: 0, money: 100, pearls: 2, level: 0, title: '' }];
    const snapper = speciesById.get('snapper')!;
    const cast = { zone: 'shallows' as const, maxDepth: 10, night: false, weather: 'clear' as const };
    expect(progressContracts(s, [catchFish(snapper, 1)], cast)).toHaveLength(0);
    expect(s.contracts[0].progress).toBe(1);
    const done = progressContracts(s, [catchFish(snapper, 1)], cast);
    expect(done).toHaveLength(1);
    expect(s.money).toBe(100);
    expect(s.pearls).toBe(2);
    expect(s.contracts).toHaveLength(0);
    expect(s.stats.contracts).toBe(1);
  });

  it('depth and size contracts complete in one catch', () => {
    const s = newSave();
    s.contracts = [
      { id: 1, kind: 'depth', target: '', n: 20, progress: 0, money: 1, pearls: 1, level: 0, title: '' },
      { id: 2, kind: 'size', target: '', n: 1, progress: 0, money: 1, pearls: 1, level: 0, title: '' },
    ];
    expect(contractGoal(s.contracts[0])).toBe(1);
    const grouper = speciesById.get('grouper')!;
    const done = progressContracts(s, [catchFish(grouper, 1)], { zone: 'shallows', maxDepth: 30, night: false, weather: 'clear' });
    expect(done).toHaveLength(2);
  });
});

describe('achievements', () => {
  it('ids are unique and unlock once with pearl rewards', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const s = newSave();
    expect(checkAchievements(s)).toHaveLength(0);
    s.stats.caught = 12;
    const got = checkAchievements(s).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['first', 'c10']));
    expect(s.pearls).toBe(3);
    expect(checkAchievements(s)).toHaveLength(0);
  });
});

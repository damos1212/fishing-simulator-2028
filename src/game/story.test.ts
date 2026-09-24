import { describe, expect, it } from 'vitest';
import { CATCHABLE, speciesById } from '../data/fish';
import { COSMETICS } from '../data/items';
import { NPCS, QUESTS } from '../data/quests';
import { TRACKS } from '../data/upgrades';
import { ALL_ZONES } from '../data/zones';
import { buyCosmetic, catchFish, masteredZones, newSave } from './economy';
import { completeQuest, currentQuest, questEvent, questStatus } from './progress';

const cast = { zone: 'shallows' as const, maxDepth: 5, night: false, weather: 'clear' as const };

describe('story quests', () => {
  it('references real species, zones, tracks, npcs and cosmetics', () => {
    for (const q of QUESTS) {
      expect(NPCS[q.npc]).toBeTruthy();
      expect(q.intro.length).toBeGreaterThan(0);
      expect(q.outro.length).toBeGreaterThan(0);
      const g = q.goal;
      if (g.kind === 'catch' && g.species) expect(speciesById.has(g.species)).toBe(true);
      if (g.kind === 'boss') expect(speciesById.get(g.species)?.boss).toBe(true);
      if ((g.kind === 'catch' && g.zone) || g.kind === 'visit') expect(ALL_ZONES.some((z) => z.id === (g as { zone: string }).zone)).toBe(true);
      if (g.kind === 'upgrade') expect(TRACKS.find((t) => t.id === g.track)!.tiers.length).toBeGreaterThan(g.tier);
      if (q.reward.cosmetic) expect(COSMETICS.find((c) => c.id === q.reward.cosmetic)?.quest).toBe(true);
    }
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
  });

  it('counts catches, completes, pays and advances', () => {
    const s = newSave();
    expect(currentQuest(s)?.id).toBe('first');
    const fish = CATCHABLE.find((sp) => sp.zone === 'shallows' && !sp.junk && !sp.boss)!;
    questEvent(s, { catches: [catchFish(fish, 1), catchFish(fish, 1)], cast });
    expect(questStatus(s)).toEqual({ value: 2, goal: 3 });
    expect(completeQuest(s)).toBeNull();
    const junk = CATCHABLE.find((sp) => sp.junk)!;
    questEvent(s, { catches: [catchFish(junk, 1)], cast });
    expect(questStatus(s).value).toBe(2);
    questEvent(s, { catches: [catchFish(fish, 1)], cast });
    const money = s.money;
    const done = completeQuest(s);
    expect(done?.id).toBe('first');
    expect(s.money).toBe(money + done!.reward.money);
    expect(s.quest).toEqual({ index: 1, progress: 0, intro: false });
  });

  it('grants and equips quest pets that cannot be bought', () => {
    const s = newSave();
    expect(s.cosmetics.owned).not.toContain('pet-cat');
    s.pearls = 999;
    expect(buyCosmetic(s, 'pet-cat')).toBe(false);
    s.quest.index = QUESTS.findIndex((q) => q.id === 'sell');
    questEvent(s, { sold: 1000 });
    completeQuest(s);
    expect(s.cosmetics.owned).toContain('pet-cat');
    expect(s.cosmetics.equipped.pet).toBe('pet-cat');
  });

  it('returns null after the final quest', () => {
    const s = newSave();
    s.quest.index = QUESTS.length;
    expect(currentQuest(s)).toBeNull();
    expect(completeQuest(s)).toBeNull();
  });
});

describe('zone mastery', () => {
  it('masters a zone once every regular species is logged', () => {
    const s = newSave();
    expect(masteredZones(s).size).toBe(0);
    for (const sp of CATCHABLE.filter((x) => x.zone === 'shallows' && !x.boss && !x.anywhere)) s.dex[sp.id] = { caught: 1, best: 1 };
    expect(masteredZones(s).has('shallows')).toBe(true);
  });

  it('applies bonus multipliers to value', () => {
    const sp = CATCHABLE.find((x) => !x.junk && !x.boss)!;
    const base = catchFish(sp, 1).value;
    expect(catchFish(sp, 1, false, 1.2).value).toBe(Math.round(base * 1.2));
    expect(catchFish(sp, 1, true).value).toBeGreaterThanOrEqual(base * 2 - 1);
  });
});

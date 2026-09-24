import { describe, expect, it } from 'vitest';
import { COST_SCALE } from '../src/data/upgrades';
import { report, STAGE_MINUTES } from './balance';

describe('progression pacing', () => {
  const rows = report();

  it('prints the model', () => {
    console.log(rows.map((r) => `L${String(r.level).padStart(2)} ${r.zones.join(',').padEnd(22)} fish ${r.avgFish.toExponential(2)} cast ${r.castSec.toFixed(0)}s`
      + ` /min ${r.perMin.toExponential(2)} all ${r.allMin.toFixed(1).padStart(5)}m (target ${STAGE_MINUTES[r.level]}) need ${r.needMin.toFixed(1)}m`
      + ` scale->${(COST_SCALE[r.level] * STAGE_MINUTES[r.level] / r.allMin).toFixed(2)}`).join('\n'));
    expect(rows.length).toBeGreaterThan(20);
  });

  // the model is a little quicker than real play (the play-tester lands ~15% behind it), hence the wider lower bound
  it('keeps every stage close to its target length', () => {
    for (const r of rows) {
      expect(r.allMin, `level ${r.level}`).toBeGreaterThan(STAGE_MINUTES[r.level] * 0.5);
      expect(r.allMin, `level ${r.level}`).toBeLessThan(STAGE_MINUTES[r.level] * 1.6);
    }
  });
});

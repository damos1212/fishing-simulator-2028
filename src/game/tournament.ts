// Harbor tournaments: a timed contest against rival anglers. Rivals pace themselves on the player's
// recent form so every contest is winnable but never a walkover.
import { rng } from '../engine/math';

export type TourneyKind = 'count' | 'value' | 'biggest';

export interface TourneyInfo { kind: TourneyKind; title: string; desc: string; unit: (v: number) => string }
export const TOURNEYS: TourneyInfo[] = [
  { kind: 'count', title: 'Speed Fishing', desc: 'Land the most fish in 4 minutes.', unit: (v) => `${Math.round(v)} fish` },
  { kind: 'value', title: 'Cash Cup', desc: 'Land the most valuable haul in 4 minutes.', unit: (v) => `$${Math.round(v).toLocaleString('en-US')}` },
  { kind: 'biggest', title: 'Monster Derby', desc: 'Land the single longest fish in 4 minutes.', unit: (v) => `${v.toFixed(2)}m` },
];
export const TOURNEY_TIME = 240;
const RIVALS = ['Salty Pete', 'Captain Gill', 'Reel Rita', 'Big Barb', 'Old Finnegan', 'Marina Del Rey', 'Hookline Hank', 'Codfather'];

export interface Rival { name: string; score: number; pace: number; next: number }
export interface Standing { name: string; score: number; you: boolean }

/** What the player tends to manage per minute (rolling), used to pace the rivals. */
export interface Form { perMinCount: number; perMinValue: number; bestLen: number }

export class Tournament {
  kind: TourneyKind;
  left = TOURNEY_TIME;
  score = 0;
  fee: number;
  rivals: Rival[];
  private r: () => number;

  constructor(kind: TourneyKind, fee: number, form: Form, seed: number) {
    this.kind = kind;
    this.fee = fee;
    this.r = rng(seed);
    const par = kind === 'count' ? form.perMinCount * (TOURNEY_TIME / 60) : kind === 'value' ? form.perMinValue * (TOURNEY_TIME / 60) : form.bestLen;
    const names = [...RIVALS].sort(() => this.r() - 0.5).slice(0, 4);
    const strength = [1.22, 0.98, 0.78, 0.55];
    this.rivals = names.map((name, i) => ({ name, score: 0, pace: Math.max(par, 0.01) * strength[i] * (0.9 + this.r() * 0.2), next: 6 + this.r() * 14 }));
  }

  get info() { return TOURNEYS.find((t) => t.kind === this.kind)!; }
  get done() { return this.left <= 0; }

  update(dt: number) {
    if (this.done) return;
    this.left = Math.max(0, this.left - dt);
    if (this.left < 1e-6) this.left = 0;
    const elapsed = TOURNEY_TIME - this.left;
    for (const rv of this.rivals) {
      rv.next -= dt;
      // everyone weighs in their last catch at the horn
      if (rv.next > 0 && this.left > 0) continue;
      rv.next = 8 + this.r() * 18;
      if (this.kind === 'biggest') {
        // a new personal best now and then, creeping towards their pace
        const k = Math.min(1, elapsed / TOURNEY_TIME + 0.2);
        rv.score = Math.max(rv.score, rv.pace * (0.55 + this.r() * 0.5) * k);
      } else {
        // catches arrive in bursts; the expected total at the end equals the pace
        const want = rv.pace * (elapsed / TOURNEY_TIME);
        rv.score = Math.max(rv.score, want * (0.8 + this.r() * 0.4));
        if (this.kind === 'count') rv.score = Math.round(rv.score);
      }
    }
  }

  /** Records a landed catch. */
  add(fish: { value: number; length: number }[]) {
    if (this.done) return;
    if (this.kind === 'count') this.score += fish.length;
    else if (this.kind === 'value') this.score += fish.reduce((s, f) => s + f.value, 0);
    else this.score = Math.max(this.score, ...fish.map((f) => f.length));
  }

  standings(): Standing[] {
    return [{ name: 'You', score: this.score, you: true }, ...this.rivals.map((r) => ({ name: r.name, score: r.score, you: false }))]
      .sort((a, b) => b.score - a.score || (a.you ? -1 : 1));
  }

  get place() { return this.standings().findIndex((s) => s.you) + 1; }

  /** Winnings for a final place. */
  static prize(place: number, fee: number) {
    if (place === 1) return { money: fee * 6, pearls: 6 };
    if (place === 2) return { money: Math.round(fee * 2.5), pearls: 3 };
    if (place === 3) return { money: Math.round(fee * 1.2), pearls: 1 };
    return { money: 0, pearls: 0 };
  }
}

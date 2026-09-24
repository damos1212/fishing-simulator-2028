// The harbor aquarium: one of each of your best catches swims around the pool.
import { CATCHABLE, speciesById, type Rarity } from '../data/fish';
import { clamp, rng, Vec3 } from '../engine/math';
import type { Renderer } from '../engine/renderer';
import type { SaveData } from './economy';
import { FishActor } from './fishing';

const ORDER: Record<Rarity, number> = { boss: 6, legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };

export class Aquarium {
  fish: FishActor[] = [];
  private key = '';
  private r = rng(5);

  constructor(private pos: Vec3, private halfX: number, private halfZ: number) {}

  /** Rebuild the display when the fish log changes. */
  sync(save: SaveData) {
    const ids = CATCHABLE.filter((s) => save.dex[s.id] && !s.junk)
      .sort((a, b) => ORDER[b.rarity] - ORDER[a.rarity] || b.value - a.value)
      .slice(0, 18)
      .map((s) => s.id);
    const key = ids.join(',');
    if (key === this.key) return;
    this.key = key;
    this.fish = ids.map((id) => {
      const sp = speciesById.get(id)!;
      const fit = clamp(1.8 / (sp.size * (sp.boss ? 1 : 1.5)), 0.2, 1.4);
      const f = new FishActor(sp, fit);
      f.pos.set(this.pos.x + (this.r() - 0.5) * this.halfX, this.pos.y + 0.4, this.pos.z + (this.r() - 0.5) * this.halfZ);
      f.target.copy(f.pos);
      f.speed = Math.min(sp.speed, 1.6);
      return f;
    });
  }

  update(dt: number) {
    for (const f of this.fish) {
      if (f.pos.distanceTo(f.target) < 0.6 || (f.timer -= dt) <= 0) {
        f.timer = 3 + this.r() * 4;
        const lo = this.pos.y + 0.2;
        f.target.set(
          this.pos.x + (this.r() * 2 - 1) * (this.halfX - 1.2),
          f.sp.bottom ? lo : lo + this.r() * 0.45,
          this.pos.z + (this.r() * 2 - 1) * (this.halfZ - 1));
      }
      const want = f.target.clone().sub(f.pos);
      const l = want.length();
      if (l > 0.01) f.dir.lerp(want.scale(1 / l), clamp(dt * 1.5, 0, 1)).normalize();
      if (f.sp.upright || f.sp.bottom) f.dir.y *= 0.2;
      f.pos.addScaled(f.dir, f.speed * dt);
      f.phase += dt * (3 + f.speed * 2);
    }
  }

  /** Translucent water surface over the pool. */
  drawWater(r: Renderer, time: number) {
    const y = this.pos.y + 0.85 + Math.sin(time * 1.5) * 0.03;
    const x0 = this.pos.x - this.halfX, x1 = this.pos.x + this.halfX, z0 = this.pos.z - this.halfZ, z1 = this.pos.z + this.halfZ;
    const quad = (yy: number, c: number[]) => {
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z0], [x1, z1], [x0, z1]]) r.vertex(x, yy, z, c[0], c[1], c[2], c[3]);
    };
    // sandy bottom (hides the island grass), then the translucent surface
    quad(this.pos.y + 0.08, [0.3, 0.62, 0.62, 1]);
    quad(y, [0.02, 0.45, 0.8, 0.35]);
  }
}

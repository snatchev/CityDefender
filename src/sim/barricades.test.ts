import { describe, expect, it } from 'vitest';
import rulesData from '../data/rules.json';
import { LOOP } from './__fixtures__/maps';
import { parseAsciiMap } from './asciiMap';
import { barricadeSpan, damageBarricade, placeBarricade, type Barricade } from './barricades';
import { TICK_HZ } from './constants';
import { tracePath } from './flow';
import { queueWave } from './mobs';
import { createWorld, tickWorld, type World } from './world';

// LOOP: S at (1,1), G at (7,1). Top route 6 tiles; the detour round the bottom is 10 tiles.
const idx = (w: World, tx: number, ty: number) => ty * w.map!.width + tx;

function place(w: World, tx: number, ty: number): Barricade {
  const b = placeBarricade(w, tx, ty);
  if (typeof b === 'string') throw new Error(b);
  return b;
}

function runUntilAllLeaked(w: World, count: number, maxSeconds = 600): void {
  for (let i = 0; i < maxSeconds * TICK_HZ && w.stats.leaked < count; i++) tickWorld(w);
}

describe('barricades (siege rule)', () => {
  it('spans the full street width, one tile thick', () => {
    const w = createWorld(1, parseAsciiMap(LOOP));
    const span = barricadeSpan(w, 4, 1);
    expect(span).toEqual({ tiles: [idx(w, 4, 1)], axis: 'y' });
  });

  it('reroutes the swarm around a barricade when the detour is short', () => {
    const w = createWorld(1, parseAsciiMap(LOOP));
    const b = place(w, 4, 1);
    const route = tracePath(w.map!, w.field!, w.extraCost!, idx(w, 1, 1));
    expect(route).not.toContain(idx(w, 4, 1));
    expect(route).toHaveLength(11); // 10 steps round the bottom, plus the start tile

    queueWave(w, { count: 5 });
    runUntilAllLeaked(w, 5);
    expect(w.stats.leaked).toBe(5);
    expect(b.hp).toBe(b.maxHp); // nobody touched it
  });

  it('besieges the cheapest barricade when every route is sealed', () => {
    const w = createWorld(1, parseAsciiMap(LOOP));
    const top = place(w, 4, 1);
    const bottom = place(w, 4, 3);
    damageBarricade(w, bottom, bottom.maxHp / 2); // top route costs 6 + 50, bottom 10 + 25

    queueWave(w, { count: 5 });
    runUntilAllLeaked(w, 5);
    expect(w.stats.leaked).toBe(5);
    expect(w.stats.barricadesDestroyed).toBe(1);
    expect(w.barricades).toEqual([top]);
    expect(top.hp).toBe(top.maxHp);
  });

  it('recomputes the flow field only at HP bands, not on every hit', () => {
    const w = createWorld(1, parseAsciiMap('#######\n#S...G#\n#######'));
    place(w, 3, 1);
    const before = w.fieldVersion;
    queueWave(w, { count: 3 });
    runUntilAllLeaked(w, 3);
    expect(w.stats.barricadesDestroyed).toBe(1);
    // One recompute per band crossed below full (75%, 50%, 25%) plus one when it's destroyed.
    expect(w.fieldVersion - before).toBe(rulesData.barricadeHpBands);
  });
});

import { describe, expect, it } from 'vitest';
import mobsData from '../data/mobs.json';
import rulesData from '../data/rules.json';
import { GRID, LOOP } from './__fixtures__/maps';
import { parseAsciiMap } from './asciiMap';
import { TICK_HZ, TILE_M } from './constants';
import { queueWave } from './mobs';
import { createWorld, tickWorld } from './world';

const speed = mobsData.skitterling.speedMps;

describe('mobs', () => {
  it('walk the shortest route and reach the goal in the expected tick count', () => {
    // LOOP: S at (1,1), G at (7,1); the top row is 6 tiles, the detour round the bottom is 10.
    const w = createWorld(1, parseAsciiMap(LOOP));
    queueWave(w, 1);
    const expected = Math.ceil(((6 * TILE_M) / speed) * TICK_HZ);
    for (let i = 0; i < expected - 1; i++) tickWorld(w);
    expect(w.mobs).toHaveLength(1);
    tickWorld(w);
    expect(w.mobs).toHaveLength(0);
    expect(w.integrity).toBe(rulesData.startIntegrity - mobsData.skitterling.goalDamage);
  });

  it('brings every mob from every spawn to the goal, replaying identically for a seed', () => {
    const run = (seed: number) => {
      const w = createWorld(seed, parseAsciiMap(GRID));
      for (let s = 0; s < 4; s++) queueWave(w, 5, s);
      const trace: string[] = [];
      for (let i = 0; i < 60 * TICK_HZ && w.stats.leaked < 20; i++) {
        tickWorld(w);
        trace.push(w.mobs.map((m) => `${m.id}:${m.toX},${m.toY}`).join(' '));
      }
      return { leaked: w.stats.leaked, trace: trace.join('|') };
    };
    const a = run(7);
    expect(a.leaked).toBe(20);
    expect(run(7).trace).toBe(a.trace);
  });
});

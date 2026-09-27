import { describe, expect, it } from 'vitest';
import { GRID } from './__fixtures__/maps';
import { parseAsciiMap } from './asciiMap';
import { TICK_HZ } from './constants';
import { startRun, startWave, type Phase, type WaveDef } from './phase';
import { placeTower } from './towers';
import { createWorld, tickWorld, type World } from './world';

// GRID: spawns in the four corners, goal in the middle. Two short waves from two corners.
const WAVES: WaveDef[] = [
  { groups: [{ spawnIndex: 0, type: 'skitterling', count: 6, hpMul: 1, intervalS: 0.5 }] },
  {
    groups: [
      { spawnIndex: 0, type: 'skitterling', count: 6, hpMul: 1.5, intervalS: 0.5 },
      { spawnIndex: 3, type: 'skitterling', count: 6, hpMul: 1.5, intervalS: 0.5 },
    ],
  },
];

/** Play a scripted run: two towers by the goal, call the first wave early, let the rest play out. */
function scriptedRun(seed: number, withTowers: boolean) {
  const w: World = createWorld(seed, parseAsciiMap(GRID));
  startRun(w, WAVES);
  if (withTowers) {
    for (const [tx, ty] of [
      [5, 3],
      [5, 5],
    ] as const) {
      const t = placeTower(w, tx, ty);
      if (typeof t === 'string') throw new Error(t);
    }
  }
  const phases: Phase[] = [w.phase];
  startWave(w); // call wave 1 early: pays the early bonus
  for (let i = 0; i < 300 * TICK_HZ && w.phase !== 'won' && w.phase !== 'lost'; i++) {
    tickWorld(w);
    if (phases[phases.length - 1] !== w.phase) phases.push(w.phase);
  }
  const { tick, integrity, cash, stats } = w;
  return { phases, final: { phase: w.phase, tick, integrity, cash, stats } };
}

describe('a run', () => {
  it('goes prep → assault → debrief → prep → assault → won, and replays identically for a seed', () => {
    const a = scriptedRun(42, true);
    expect(a.phases).toEqual(['prep', 'assault', 'debrief', 'prep', 'assault', 'won']);
    expect(a.final.stats.kills).toBeGreaterThan(0);
    expect(scriptedRun(42, true)).toEqual(a);
  });

  it('can be lost', () => {
    // No towers: every bug reaches City Hall. Shrink Integrity so the fixture's 18 bugs are enough.
    const w = createWorld(1, parseAsciiMap(GRID));
    w.integrity = 10;
    startRun(w, WAVES);
    for (let i = 0; i < 300 * TICK_HZ && w.phase !== 'lost' && w.phase !== 'won'; i++) tickWorld(w);
    expect(w.phase).toBe('lost');
    expect(w.integrity).toBe(0);
  });
});

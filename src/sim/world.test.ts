import { describe, expect, it } from 'vitest';
import { TICK_HZ } from './constants';
import { createWorld, resetWorld, simTimeSeconds, tickWorld } from './world';

describe('world', () => {
  it('ticks and reports sim time', () => {
    const w = createWorld(42);
    for (let i = 0; i < TICK_HZ * 3; i++) tickWorld(w);
    expect(w.tick).toBe(TICK_HZ * 3);
    expect(simTimeSeconds(w)).toBeCloseTo(3, 9);
  });

  it('reset keeps the same object and replays the same RNG stream', () => {
    const w = createWorld(5);
    const first = w.rng.next();
    tickWorld(w);
    const ref = w;
    resetWorld(w, 5);
    expect(w).toBe(ref);
    expect(w.tick).toBe(0);
    expect(w.rng.next()).toBe(first);
  });
});

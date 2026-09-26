import { TICK_DT } from './constants';
import { createRng, type Rng } from './rng';

/**
 * All simulation state lives here. Plain data + functions: no three.js, no React.
 * Later passes add: map, mobs, barricades, towers, economy, phase.
 */
export interface World {
  seed: number;
  rng: Rng;
  /** Number of fixed ticks simulated since the run started. */
  tick: number;
}

export function createWorld(seed: number): World {
  return { seed, rng: createRng(seed), tick: 0 };
}

/** Re-initialise in place so existing references (renderer, dev hook) stay valid. */
export function resetWorld(world: World, seed: number): void {
  world.seed = seed;
  world.rng = createRng(seed);
  world.tick = 0;
}

/** Advance the simulation by exactly one fixed step. */
export function tickWorld(world: World): void {
  world.tick += 1;
}

export function simTimeSeconds(world: World): number {
  return world.tick * TICK_DT;
}

import { TICK_DT } from './constants';
import type { TileMap } from './map';
import { createRng, type Rng } from './rng';

/**
 * All simulation state lives here. Plain data + functions: no three.js, no React.
 * Later passes add: mobs, barricades, towers, economy, phase.
 */
export interface World {
  seed: number;
  rng: Rng;
  /** The level's tile grid. Null until the city has loaded. */
  map: TileMap | null;
  /** Number of fixed ticks simulated since the run started. */
  tick: number;
}

export function createWorld(seed: number, map: TileMap | null = null): World {
  return { seed, rng: createRng(seed), map, tick: 0 };
}

/** Re-initialise in place so existing references (renderer, dev hook) stay valid. The map is kept. */
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

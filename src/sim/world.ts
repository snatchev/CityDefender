import rulesData from '../data/rules.json';
import { TICK_DT } from './constants';
import { goalDistanceField } from './flow';
import type { TileMap } from './map';
import { stepMobs, tickSpawners, type Mob, type Spawner } from './mobs';
import { createRng, type Rng } from './rng';

/**
 * All simulation state lives here. Plain data + functions: no three.js, no React.
 * Later passes add: barricades, towers, economy, phase.
 */
export interface World {
  seed: number;
  rng: Rng;
  /** The level's tile grid. Null until the city has loaded. */
  map: TileMap | null;
  /** Steps to the goal per tile (see flow.ts). Recomputed when the map changes. */
  goalDist: Int32Array | null;
  /** Number of fixed ticks simulated since the run started. */
  tick: number;
  /** City Hall Integrity, the "lives" value (DESIGN §3.2). */
  integrity: number;
  mobs: Mob[];
  spawners: Spawner[];
  nextMobId: number;
  stats: { spawned: number; leaked: number };
}

export function createWorld(seed: number, map: TileMap | null = null): World {
  const world: World = {
    seed,
    rng: createRng(seed),
    map: null,
    goalDist: null,
    tick: 0,
    integrity: rulesData.startIntegrity,
    mobs: [],
    spawners: [],
    nextMobId: 1,
    stats: { spawned: 0, leaked: 0 },
  };
  if (map) setMap(world, map);
  return world;
}

export function setMap(world: World, map: TileMap): void {
  world.map = map;
  world.goalDist = goalDistanceField(map);
}

/** Re-initialise in place so existing references (renderer, dev hook) stay valid. The map is kept. */
export function resetWorld(world: World, seed: number): void {
  world.seed = seed;
  world.rng = createRng(seed);
  world.tick = 0;
  world.integrity = rulesData.startIntegrity;
  world.mobs = [];
  world.spawners = [];
  world.nextMobId = 1;
  world.stats = { spawned: 0, leaked: 0 };
}

/** Advance the simulation by exactly one fixed step. */
export function tickWorld(world: World): void {
  tickSpawners(world);
  stepMobs(world);
  world.tick += 1;
}

export function simTimeSeconds(world: World): number {
  return world.tick * TICK_DT;
}

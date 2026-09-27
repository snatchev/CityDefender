import rulesData from '../data/rules.json';
import { recomputeField, type Barricade } from './barricades';
import { TICK_DT } from './constants';
import type { TileMap } from './map';
import { stepMobs, tickSpawners, type Mob, type Spawner } from './mobs';
import { tickPhase, type Phase, type WaveDef } from './phase';
import { fireTowers, type Tower } from './towers';
import { createRng, type Rng } from './rng';

/**
 * All simulation state lives here. Plain data + functions: no three.js, no React.
 * Later passes add: upgrades, grants, more mob and tower types.
 */
export interface World {
  seed: number;
  rng: Rng;
  phase: Phase;
  /** Current wave index (0-based) into `waves`. */
  wave: number;
  waves: WaveDef[];
  /** Ticks left in the current prep or debrief countdown. */
  phaseTicks: number;
  cash: number;
  towers: Tower[];
  /** Tower id per tile, 0 = none. */
  towerAt: Int32Array;
  nextTowerId: number;
  /** The level's tile grid. Null until the city has loaded. */
  map: TileMap | null;
  /** Flow field: cheapest cost to the goal per tile (see flow.ts). Recomputed on barricade events. */
  field: Float64Array | null;
  /** Extra cost per tile from barricades, the input the field was computed with. */
  extraCost: Float64Array | null;
  /** Bumped on every field recompute, so the UI knows when to redraw routes. */
  fieldVersion: number;
  barricades: Barricade[];
  /** Barricade id per tile, 0 = none. */
  barricadeAt: Int32Array;
  nextBarricadeId: number;
  /** Number of fixed ticks simulated since the run started. */
  tick: number;
  /** City Hall Integrity, the "lives" value (DESIGN §3.2). */
  integrity: number;
  mobs: Mob[];
  spawners: Spawner[];
  nextMobId: number;
  stats: WorldStats;
}

export interface WorldStats {
  spawned: number;
  leaked: number;
  kills: number;
  barricadesDestroyed: number;
  earlyBonus: number;
}

const freshStats = (): WorldStats => ({
  spawned: 0,
  leaked: 0,
  kills: 0,
  barricadesDestroyed: 0,
  earlyBonus: 0,
});

export function createWorld(seed: number, map: TileMap | null = null): World {
  const world: World = {
    seed,
    rng: createRng(seed),
    phase: 'idle',
    wave: 0,
    waves: [],
    phaseTicks: 0,
    cash: rulesData.startCash,
    towers: [],
    towerAt: new Int32Array(0),
    nextTowerId: 1,
    map: null,
    field: null,
    extraCost: null,
    fieldVersion: 0,
    barricades: [],
    barricadeAt: new Int32Array(0),
    nextBarricadeId: 1,
    tick: 0,
    integrity: rulesData.startIntegrity,
    mobs: [],
    spawners: [],
    nextMobId: 1,
    stats: freshStats(),
  };
  if (map) setMap(world, map);
  return world;
}

export function setMap(world: World, map: TileMap): void {
  world.map = map;
  world.barricades = [];
  world.barricadeAt = new Int32Array(map.width * map.height);
  world.towers = [];
  world.towerAt = new Int32Array(map.width * map.height);
  recomputeField(world);
}

/**
 * Re-initialise in place so existing references (renderer, dev hook) stay valid. The map is kept;
 * barricades, towers, mobs and the run are cleared (call `startRun` to begin a new run).
 */
export function resetWorld(world: World, seed: number): void {
  world.seed = seed;
  world.rng = createRng(seed);
  world.phase = 'idle';
  world.wave = 0;
  world.waves = [];
  world.phaseTicks = 0;
  world.cash = rulesData.startCash;
  world.nextTowerId = 1;
  world.tick = 0;
  world.integrity = rulesData.startIntegrity;
  world.mobs = [];
  world.spawners = [];
  world.nextMobId = 1;
  world.nextBarricadeId = 1;
  world.stats = freshStats();
  if (world.map) setMap(world, world.map);
}

/** Advance the simulation by exactly one fixed step. Frozen once the run is won or lost. */
export function tickWorld(world: World): void {
  if (world.phase === 'won' || world.phase === 'lost') return;
  tickSpawners(world);
  stepMobs(world);
  fireTowers(world);
  tickPhase(world);
  world.tick += 1;
}

export function simTimeSeconds(world: World): number {
  return world.tick * TICK_DT;
}

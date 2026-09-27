import rulesData from '../data/rules.json';
import { recomputeField, type Barricade } from './barricades';
import { TICK_DT, TICK_HZ } from './constants';
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
  /** Recent events for visual effects only (death pops, screen shake); the sim never reads them. */
  fx: WorldFx;
}

export interface FxEvent {
  tick: number;
  /** Position in (continuous) tile coordinates. */
  x: number;
  y: number;
}

export interface WorldFx {
  kills: FxEvent[];
  barricadeBreaks: FxEvent[];
}

/** Effects events are kept this many ticks (1 s), then dropped. */
const FX_KEEP_TICKS = TICK_HZ;
const freshFx = (): WorldFx => ({ kills: [], barricadeBreaks: [] });

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

/** Everything that starts fresh with each run (the map and its derived arrays are set separately). */
function freshRun(seed: number) {
  return {
    seed,
    rng: createRng(seed),
    phase: 'idle' as Phase,
    wave: 0,
    waves: [] as WaveDef[],
    phaseTicks: 0,
    cash: rulesData.startCash,
    tick: 0,
    integrity: rulesData.startIntegrity,
    mobs: [] as Mob[],
    spawners: [] as Spawner[],
    nextMobId: 1,
    nextTowerId: 1,
    nextBarricadeId: 1,
    stats: freshStats(),
    fx: freshFx(),
  } satisfies Partial<World>;
}

export function createWorld(seed: number, map: TileMap | null = null): World {
  const world: World = {
    ...freshRun(seed),
    map: null,
    field: null,
    extraCost: null,
    fieldVersion: 0,
    towers: [],
    towerAt: new Int32Array(0),
    barricades: [],
    barricadeAt: new Int32Array(0),
  };
  if (map) setMap(world, map);
  return world;
}

/** Install a map: clears everything placed on the old one and recomputes the flow field. */
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
  Object.assign(world, freshRun(seed));
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
  const oldest = world.tick - FX_KEEP_TICKS;
  world.fx.kills = world.fx.kills.filter((e) => e.tick >= oldest);
  world.fx.barricadeBreaks = world.fx.barricadeBreaks.filter((e) => e.tick >= oldest);
}

export function simTimeSeconds(world: World): number {
  return world.tick * TICK_DT;
}

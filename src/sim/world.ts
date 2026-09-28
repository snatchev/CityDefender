import rulesData from '../data/rules.json';
import { recomputeField, repairBarricades, type Barricade } from './barricades';
import { flowField } from './flow';
import { TICK_DT, TICK_HZ } from './constants';
import type { TileMap } from './map';
import { deriveSlots, type MapSlots } from './slots';
import { stepMobs, tickSpawners, type Mob, type Spawner } from './mobs';
import { tickPhase, type Phase, type WaveDef } from './phase';
import { fireTowers, type Shell, type Tower } from './towers';
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
  /** Street graph and placement slots derived from the map (slots.ts). */
  slots: MapSlots | null;
  /** Flow field: cheapest cost to the goal per tile (see flow.ts). Recomputed on barricade events. */
  field: Float64Array | null;
  /** Extra cost per tile from barricades, the input the field was computed with. */
  extraCost: Float64Array | null;
  /**
   * Flow field without barricade costs, for fliers and diggers (DESIGN §5.4–5.5). Fixed per map;
   * its values count tiles to the goal.
   */
  freeField: Float64Array | null;
  /** All-zero extra cost, the input `freeField` was computed with. */
  zeroCost: Float64Array | null;
  /** Bumped on every field recompute, so the UI knows when to redraw routes. */
  fieldVersion: number;
  barricades: Barricade[];
  /** Barricade id per tile, 0 = none. */
  barricadeAt: Int32Array;
  /** Traps (spike strips): span a street like barricades but never block or reroute. */
  traps: Barricade[];
  /** Trap id per tile, 0 = none. */
  trapAt: Int32Array;
  nextBarricadeId: number;
  /** Number of fixed ticks simulated since the run started. */
  tick: number;
  /** City Hall Integrity, the "lives" value (DESIGN §3.2). */
  integrity: number;
  mobs: Mob[];
  /** Mortar shells in flight. */
  shells: Shell[];
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

export interface SplashFx extends FxEvent {
  radiusM: number;
  /** Tower type that fired it (effects colour it). */
  source: string;
}

export interface WorldFx {
  kills: FxEvent[];
  /** A shell (Mortar, Flak) burst. */
  splashes: SplashFx[];
  /** A Seismic Pulse went off. */
  pulses: SplashFx[];
  barricadeBreaks: FxEvent[];
  /** A bug reached City Hall (one event per bug). */
  goalHits: FxEvent[];
}

/** Effects events are kept this many ticks (1 s), then dropped. */
const FX_KEEP_TICKS = TICK_HZ;
const freshFx = (): WorldFx => ({
  kills: [],
  splashes: [],
  pulses: [],
  barricadeBreaks: [],
  goalHits: [],
});

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
    shells: [] as Shell[],
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
    slots: null,
    field: null,
    extraCost: null,
    freeField: null,
    zeroCost: null,
    fieldVersion: 0,
    towers: [],
    towerAt: new Int32Array(0),
    barricades: [],
    barricadeAt: new Int32Array(0),
    traps: [],
    trapAt: new Int32Array(0),
  };
  if (map) setMap(world, map);
  return world;
}

/** Install a map: clears everything placed on the old one and recomputes the flow field. */
export function setMap(world: World, map: TileMap): void {
  world.map = map;
  world.slots = deriveSlots(map, map.heightsM);
  world.barricades = [];
  world.barricadeAt = new Int32Array(map.width * map.height);
  world.traps = [];
  world.trapAt = new Int32Array(map.width * map.height);
  world.zeroCost = new Float64Array(map.width * map.height);
  world.freeField = flowField(map, world.zeroCost);
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
  const phaseBefore = world.phase;
  tickPhase(world);
  if (phaseBefore === 'debrief' && world.phase === 'prep') repairBarricades(world);
  world.tick += 1;
  const oldest = world.tick - FX_KEEP_TICKS;
  const fx = world.fx;
  fx.kills = fx.kills.filter((e) => e.tick >= oldest);
  fx.splashes = fx.splashes.filter((e) => e.tick >= oldest);
  fx.pulses = fx.pulses.filter((e) => e.tick >= oldest);
  fx.barricadeBreaks = fx.barricadeBreaks.filter((e) => e.tick >= oldest);
  fx.goalHits = fx.goalHits.filter((e) => e.tick >= oldest);
}

export function simTimeSeconds(world: World): number {
  return world.tick * TICK_DT;
}

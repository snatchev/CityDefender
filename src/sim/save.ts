import rulesData from '../data/rules.json';
import { hpBand, recomputeField, type Barricade } from './barricades';
import type { Mods } from './grants';
import type { Phase } from './phase';
import { createRng } from './rng';
import type { Tower } from './towers';
import { resetWorld, type World, type WorldStats } from './world';

/**
 * A saved run (DESIGN / plan Pass 9 "save/resume, versioned"). Taken at the start of a prep, when no
 * mobs, spawners or shells exist, so it is small and exact: restoring it and playing on gives the
 * same run as never having left (the RNG state is saved too). The map, waves and grants come back
 * from the city data; `city` checks they're the same city.
 */
export interface SaveV1 {
  version: 1;
  city: string;
  seed: number;
  rngState: number;
  tick: number;
  phase: Phase;
  wave: number;
  phaseTicks: number;
  cash: number;
  integrity: number;
  towers: Tower[];
  barricades: Barricade[];
  traps: Barricade[];
  stats: WorldStats;
  mods: Mods;
  grantsTaken: string[];
  nextMobId: number;
  nextTowerId: number;
  nextBarricadeId: number;
}

/** Snapshot a run at the start of a prep; null at any other time. */
export function saveRun(world: World, city: string): SaveV1 | null {
  if (world.phase !== 'prep' || world.mobs.length > 0 || world.spawners.length > 0) return null;
  return structuredClone({
    version: rulesData.saveVersion as 1,
    city,
    seed: world.seed,
    rngState: world.rng.state,
    tick: world.tick,
    phase: world.phase,
    wave: world.wave,
    phaseTicks: world.phaseTicks,
    cash: world.cash,
    integrity: world.integrity,
    towers: world.towers,
    barricades: world.barricades,
    traps: world.traps,
    stats: world.stats,
    mods: world.mods,
    grantsTaken: world.grantsTaken,
    nextMobId: world.nextMobId,
    nextTowerId: world.nextTowerId,
    nextBarricadeId: world.nextBarricadeId,
  });
}

/**
 * Restore a saved run into `world` (which has the save's city map installed and its waves and grant
 * pool set by `startRun`). Returns an error for a save from another version or city.
 */
export function restoreRun(world: World, save: SaveV1, city: string): string | null {
  if (save.version !== rulesData.saveVersion)
    return `save version ${save.version} is not supported`;
  if (save.city !== city) return `save is for ${save.city}`;
  if (!world.map) return 'no map';
  const { waves, grantPool } = world;
  resetWorld(world, save.seed);
  const s = structuredClone(save);
  Object.assign(world, {
    waves,
    grantPool,
    rng: createRng(s.rngState),
    tick: s.tick,
    phase: s.phase,
    wave: s.wave,
    phaseTicks: s.phaseTicks,
    cash: s.cash,
    integrity: s.integrity,
    towers: s.towers,
    barricades: s.barricades,
    traps: s.traps,
    stats: s.stats,
    mods: s.mods,
    grantsTaken: s.grantsTaken,
    grantOffer: null,
    nextMobId: s.nextMobId,
    nextTowerId: s.nextTowerId,
    nextBarricadeId: s.nextBarricadeId,
  });
  for (const t of world.towers) world.towerAt[t.ty * world.map.width + t.tx] = t.id;
  for (const b of world.barricades) {
    b.band = hpBand(b.hp, b.maxHp);
    for (const i of b.tiles) world.barricadeAt[i] = b.id;
  }
  for (const t of world.traps) for (const i of t.tiles) world.trapAt[i] = t.id;
  recomputeField(world);
  return null;
}

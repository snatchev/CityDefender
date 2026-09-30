import { TICK_DT, TICK_HZ, TILE_M } from './constants';
import mobsData from '../data/mobs.json';
import rulesData from '../data/rules.json';
import elitesData from '../data/elites.json';
import type { EliteDef, MobDef, TargetLayer } from '../data/schema';
import { BARRICADES, crossTrap, damageBarricade } from './barricades';
import { cheapestNeighbours } from './flow';
import type { World } from './world';

export type MobType = keyof typeof mobsData;

/** The mob table, typed by its schema (src/data/schema.ts). */
export const MOBS = mobsData as Record<MobType, MobDef>;

export type EliteType = keyof typeof elitesData;
/** Elite affixes (DESIGN §6), typed by their schema. */
export const ELITES = elitesData as Record<EliteType, EliteDef>;

/**
 * A crawler walking tile centre to tile centre. Positions are tile coordinates; (tx, ty) is the
 * tile's centre. `t` is progress (0..1) from the `from` tile to the `to` tile.
 */
export interface Mob {
  id: number;
  type: MobType;
  hp: number;
  maxHp: number;
  /** Tick of the last tower hit (for the hit flash), or -1. */
  lastHitTick: number;
  /** Slowed (Cryo) until this tick, moving at `slowMul` × speed meanwhile. */
  slowUntilTick: number;
  slowMul: number;
  /** Wet (Cryo) until this tick: Tesla chains jump once more off a wet target. */
  wetUntilTick: number;
  /** Stunned (Seismic Pulse) until this tick: doesn't move or attack. */
  stunUntilTick: number;
  /** Diggers: above ground until this tick (after a manhole or a Seismic Pulse). */
  surfacedUntilTick: number;
  /** Spitters: last spit, for effects (target position in tile coordinates). */
  lastSpit: { tick: number; x: number; y: number } | null;
  /** Elite affix (DESIGN §6), if any. */
  elite: EliteType | null;
  /** Marked (Railgun Spotter) until this tick: takes `markBonus` more damage from towers. */
  markUntilTick: number;
  markBonus: number;
  /** Brood Mother: births its brood when HP falls to this fraction of max (then steps down). */
  broodAt: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
}

/** Mob position in (continuous) tile coordinates. */
export function mobPos(m: Mob): [number, number] {
  return [m.fromX + (m.toX - m.fromX) * m.t, m.fromY + (m.toY - m.fromY) * m.t];
}

/** A buried digger: underground, untargetable by anything but a Seismic Pulse (DESIGN §5.5). */
export function isBuried(world: World, m: Mob): boolean {
  const def = MOBS[m.type];
  if (def.layer !== 'digger' || world.tick < m.surfacedUntilTick) return false;
  // Close to the goal it surfaces for good. The barricade-free field counts tiles to the goal.
  const toGoal = world.freeField?.[m.toY * world.map!.width + m.toX] ?? Infinity;
  return toGoal > def.surfaceNearGoalTiles!;
}

/** What a tower sees this mob as: flying, on the ground (surfaced diggers too), or nothing (buried). */
export function targetLayer(world: World, m: Mob): TargetLayer | null {
  const layer = MOBS[m.type].layer;
  if (layer === 'air') return 'air';
  return isBuried(world, m) ? null : 'ground';
}

export function isWet(world: World, m: Mob): boolean {
  return world.tick < m.wetUntilTick;
}

/** Flat armor per hit, including an elite affix. */
export function mobArmor(m: Mob): number {
  return MOBS[m.type].armor + (m.elite ? (ELITES[m.elite].armorAdd ?? 0) : 0);
}

/** Speed this tick in metres per second, after any elite affix and slow. */
export function mobSpeedMps(world: World, m: Mob): number {
  const base = MOBS[m.type].speedMps * (m.elite ? (ELITES[m.elite].speedMul ?? 1) : 1);
  return world.tick < m.slowUntilTick ? base * m.slowMul : base;
}

/** Slow a mob (Cryo). Overlapping slows keep the stronger multiplier and the later end. */
export function slowMob(world: World, m: Mob, mul: number, ticks: number): void {
  const active = world.tick < m.slowUntilTick;
  m.slowMul = active ? Math.min(m.slowMul, mul) : mul;
  m.slowUntilTick = Math.max(active ? m.slowUntilTick : 0, world.tick + ticks);
}

/** Mobs waiting to leave one station, one every `intervalTicks`. */
export interface Spawner {
  spawnIndex: number;
  type: MobType;
  remaining: number;
  hpMul: number;
  elite: EliteType | null;
  intervalTicks: number;
  nextTick: number;
}

/** One station's share of a wave: `count` mobs of `type` leaving `spawnIndex`, one per `intervalS`. */
export interface SpawnGroup {
  /** Index into `world.map.spawns`. */
  spawnIndex: number;
  type: MobType;
  count: number;
  /** HP multiplier for this wave (HP grows faster than income; DESIGN §3.3). */
  hpMul: number;
  intervalS: number;
  /** Elite affix for every mob in the group (DESIGN §6), if any. */
  elite?: EliteType | null;
}

/** Queue a spawn group. Only `count` is required; the rest default to one plain group at spawn 0. */
export function queueWave(
  world: World,
  {
    count,
    spawnIndex = 0,
    type = 'skitterling',
    hpMul = 1,
    intervalS = rulesData.spawnIntervalS,
    elite = null,
  }: Partial<SpawnGroup> & { count: number },
): void {
  if (!world.map) throw new Error('queueWave: no map loaded');
  if (!world.map.spawns[spawnIndex]) throw new Error(`queueWave: no spawn ${spawnIndex}`);
  world.spawners.push({
    spawnIndex,
    type,
    remaining: count,
    hpMul,
    elite,
    intervalTicks: Math.max(1, Math.round(intervalS * TICK_HZ)),
    nextTick: world.tick,
  });
}

export function spawnMob(
  world: World,
  spawnIndex: number,
  type: MobType,
  hpMul = 1,
  elite: EliteType | null = null,
): Mob {
  const [tx, ty] = world.map!.spawns[spawnIndex]!;
  return spawnMobAt(world, tx, ty, type, hpMul, elite);
}

/** A new mob standing on tile (tx, ty) (a station, or where a Brood Mother births). */
export function spawnMobAt(
  world: World,
  tx: number,
  ty: number,
  type: MobType,
  hpMul = 1,
  elite: EliteType | null = null,
): Mob {
  const def = MOBS[type];
  const hp = def.hp * hpMul * (elite ? ELITES[elite].hpMul : 1);
  const mob: Mob = {
    id: world.nextMobId++,
    type,
    hp,
    maxHp: hp,
    lastHitTick: -1,
    slowUntilTick: 0,
    slowMul: 1,
    wetUntilTick: 0,
    stunUntilTick: 0,
    surfacedUntilTick: 0,
    lastSpit: null,
    elite,
    markUntilTick: 0,
    markBonus: 0,
    broodAt: def.broodEvery ? 1 - def.broodEvery : 0,
    fromX: tx,
    fromY: ty,
    toX: tx,
    toY: ty,
    t: 1,
  };
  world.mobs.push(mob);
  world.stats.spawned++;
  return mob;
}

/**
 * Brood Mothers (DESIGN §6) birth `broodCount` × `broodType` on their tile each time their HP falls
 * past another `broodEvery` of max, including the last share when they die. Regenerating elites
 * heal a share of max HP per second. Call after towers have fired, before the dead are cleared.
 */
export function tickBroodAndRegen(world: World): void {
  const born: [Mob, number][] = [];
  for (const m of world.mobs) {
    const def = MOBS[m.type];
    if (def.broodEvery) {
      let batches = 0;
      while (m.broodAt >= 0 && m.hp <= m.maxHp * m.broodAt + 1e-9) {
        batches++;
        m.broodAt -= def.broodEvery;
      }
      if (batches > 0) born.push([m, batches]);
    }
    const regen = m.elite ? ELITES[m.elite].regenPerS : undefined;
    if (regen && m.hp > 0) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * regen * TICK_DT);
  }
  for (const [mother, batches] of born) {
    const def = MOBS[mother.type];
    for (let k = 0; k < batches * def.broodCount!; k++) {
      spawnMobAt(world, mother.toX, mother.toY, def.broodType as MobType, def.broodHpMul ?? 1);
    }
  }
}

export function tickSpawners(world: World): void {
  for (const s of world.spawners) {
    while (s.remaining > 0 && world.tick >= s.nextTick) {
      spawnMob(world, s.spawnIndex, s.type, s.hpMul, s.elite);
      s.remaining--;
      s.nextTick += s.intervalTicks;
    }
  }
  world.spawners = world.spawners.filter((s) => s.remaining > 0);
}

/**
 * Advance every mob one tick (DESIGN §5). Crawlers (`ground`) follow the barricade-weighted flow
 * field: a crawler whose cheapest next tile is a barricade stops and attacks it (siege rule), a
 * spitter stops earlier, as soon as a barricade on its route is within spitting range, and spits at
 * it; crossing a spike strip hurts. Fliers and diggers follow the barricade-free field and never
 * touch barricades or traps; a digger crossing a manhole surfaces for a while. Stunned mobs stand
 * still. A mob that arrives on a goal tile damages City Hall and is removed. Ties between equally
 * cheap next tiles are broken with the seeded RNG, so a swarm spreads over the street's lanes but a
 * seed always replays the same.
 */
export function stepMobs(world: World): void {
  const map = world.map;
  if (!map || !world.field || !world.freeField) return;
  const survivors: Mob[] = [];
  for (const m of world.mobs) {
    const stats = MOBS[m.type];
    if (world.tick < m.stunUntilTick) {
      survivors.push(m);
      continue;
    }
    const crawler = stats.layer === 'ground';
    const field = crawler ? world.field : world.freeField;
    const extra = crawler ? world.extraCost! : world.zeroCost!;
    const fullBudget = (mobSpeedMps(world, m) * TICK_DT) / TILE_M; // tiles per tick
    let budget = fullBudget;
    const arrived = () => m.t >= 1 && field[m.toY * map.width + m.toX] === 0;
    let reached = arrived(); // only if it spawned on a goal tile
    while (budget > 0 && !reached && m.hp > 0) {
      if (m.t >= 1) {
        const here = m.toY * map.width + m.toX;
        if (stats.spitRangeM && spit(world, m, here, budget / fullBudget)) break;
        const next = nextTile(world, here, field, extra);
        if (next === null) break; // stranded (unreachable): wait in place
        const bId = crawler ? world.barricadeAt[next]! : 0;
        if (bId !== 0) {
          const b = world.barricades.find((x) => x.id === bId)!;
          if (stats.crushTier && BARRICADES[b.type].tier <= stats.crushTier) {
            // Bosses flatten weak walls on contact (DESIGN §6 "crushes T1 barricades").
            damageBarricade(world, b, b.hp + 1);
            break;
          }
          // Siege: spend the rest of this tick hitting the barricade instead of moving.
          // Damage scales with the part of the tick left after walking up to the barricade.
          damageBarricade(world, b, stats.barricadeDps * TICK_DT * (budget / fullBudget));
          break;
        }
        m.fromX = m.toX;
        m.fromY = m.toY;
        m.toX = next % map.width;
        m.toY = (next - m.toX) / map.width;
        m.t = 0;
        if (crawler && world.trapAt[next] !== 0) crossTrap(world, m, next);
        if (stats.layer === 'digger' && world.slots?.manholeAt[next]) {
          m.surfacedUntilTick = Math.max(
            m.surfacedUntilTick,
            world.tick + Math.round(stats.surfaceS! * TICK_HZ),
          );
        }
      }
      const used = Math.min(budget, 1 - m.t);
      m.t += used;
      budget -= used;
      reached = arrived(); // counts the tick the mob steps onto the goal
    }
    if (reached && m.hp > 0) {
      world.integrity = Math.max(0, world.integrity - stats.goalDamage);
      world.stats.leaked++;
      world.fx.goalHits.push({ tick: world.tick, x: m.toX, y: m.toY });
    } else {
      survivors.push(m); // dead ones (a trap) are cleared and paid for with the tower kills
    }
  }
  world.mobs = survivors;
}

/**
 * Sapper (DESIGN §6): look ahead along this spitter's route; if a barricade is within spitting range,
 * spit at it for the rest of the tick (`share` of a full tick) and report true. The look-ahead takes
 * the first cheapest step each time (no RNG), so it never disturbs the seeded tie-breaks.
 */
function spit(world: World, m: Mob, here: number, share: number): boolean {
  const map = world.map!;
  const stats = MOBS[m.type];
  const reach = Math.floor(stats.spitRangeM! / TILE_M);
  let at = here;
  for (let k = 0; k < reach; k++) {
    const next = cheapestNeighbours(map, world.field!, world.extraCost!, at)[0];
    if (next === undefined) return false;
    const bId = world.barricadeAt[next]!;
    if (bId !== 0) {
      const b = world.barricades.find((x) => x.id === bId)!;
      m.lastSpit = { tick: world.tick, x: next % map.width, y: Math.floor(next / map.width) };
      damageBarricade(world, b, stats.spitDps! * TICK_DT * share);
      return true;
    }
    if (world.field![next] === 0) return false; // reached the goal first
    at = next;
  }
  return false;
}

function nextTile(
  world: World,
  here: number,
  field: Float64Array,
  extra: Float64Array,
): number | null {
  const options = cheapestNeighbours(world.map!, field, extra, here);
  return options.length === 0 ? null : world.rng.pick(options);
}

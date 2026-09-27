import mobsData from '../data/mobs.json';
import towersData from '../data/towers.json';
import { TICK_DT, TILE_M } from './constants';
import { gameHeight } from './height';
import { Slot } from './slots';
import { builtNow, sellValue, type BuiltAt } from './economy';
import { mobPos, type Mob } from './mobs';
import { isOver } from './phase';
import type { World } from './world';

export type TowerType = keyof typeof towersData;

export interface Tower {
  id: number;
  type: TowerType;
  tx: number;
  ty: number;
  /** Seconds until the next shot is ready (≤ 0 = ready). */
  cooldown: number;
  /** Height the tower stands at (gameplay metres; 0 on a street corner). Sets its range (DESIGN §7). */
  heightM: number;
  /** Most recent shot, for tracers: target position in tile coordinates. */
  lastShot: { tick: number; x: number; y: number } | null;
  built: BuiltAt;
  kills: number;
}

/** Why a tower can't go on (tx, ty), or null if it can: towers need a roof pad or a corner (DESIGN §4.1). */
export function towerSiteError(world: World, tx: number, ty: number): string | null {
  const map = world.map;
  const slots = world.slots;
  if (!map || !slots) return 'no map';
  if (isOver(world.phase)) return 'the run is over';
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'off the map';
  const i = ty * map.width + tx;
  if (slots.towerSlot[i] === Slot.None) return 'not a tower spot (roof pads and corners only)';
  if (world.towerAt[i] !== 0) return 'already has a tower';
  return null;
}

/** Gameplay height of a tower spot: the roof for a pad, street level for a corner. */
export function siteHeight(world: World, i: number): number {
  return world.slots?.towerSlot[i] === Slot.Pad ? gameHeight(world.map?.heightsM?.[i] ?? 0) : 0;
}

/**
 * Range in metres (DESIGN §7): base range × (1 + heightFactor × height), capped, and a minimum range
 * for raised towers (they can't shoot straight down). Street-level towers have no minimum.
 */
export function towerRange(type: TowerType, heightM: number): { minM: number; maxM: number } {
  const s = towersData[type];
  const mul = Math.min(s.rangeMaxMul, 1 + s.rangeHeightFactor * heightM);
  return { minM: s.minRangePerHeight * heightM, maxM: s.rangeM * mul };
}

export function placeTower(
  world: World,
  tx: number,
  ty: number,
  type: TowerType = 'mgNest',
): Tower | string {
  const err = towerSiteError(world, tx, ty);
  if (err) return err;
  const cost = towersData[type].cost;
  if (world.cash < cost) return `needs $${cost}`;
  world.cash -= cost;
  const t: Tower = {
    id: world.nextTowerId++,
    type,
    tx,
    ty,
    heightM: siteHeight(world, ty * world.map!.width + tx),
    cooldown: 0,
    lastShot: null,
    built: builtNow(world),
    kills: 0,
  };
  world.towers.push(t);
  world.towerAt[ty * world.map!.width + tx] = t.id;
  return t;
}

export function towerSellValue(world: World, t: Tower): number {
  return sellValue(world, towersData[t.type].cost, t.built);
}

/** Sell a tower (any phase): 100% if built this prep, else 70%. */
export function sellTower(world: World, id: number): string | null {
  if (isOver(world.phase)) return 'the run is over';
  const t = world.towers.find((x) => x.id === id);
  if (!t) return 'no tower here';
  world.cash += towerSellValue(world, t);
  world.towers = world.towers.filter((x) => x.id !== id);
  world.towerAt[t.ty * world.map!.width + t.tx] = 0;
  return null;
}

/**
 * Targeting "First" (DESIGN §7): the mob in range furthest along its route, i.e. with the lowest
 * remaining flow-field cost. Ties go to the older mob (lower id) so it's deterministic.
 */
function acquireFirst(world: World, t: Tower): Mob | null {
  const map = world.map!;
  const field = world.field!;
  const r = towerRange(t.type, t.heightM);
  const maxTiles = r.maxM / TILE_M;
  const minTiles = r.minM / TILE_M;
  let best: Mob | null = null;
  let bestKey = Infinity;
  for (const m of world.mobs) {
    if (m.hp <= 0) continue;
    const [x, y] = mobPos(m);
    const d = Math.hypot(x - t.tx, y - t.ty);
    if (d > maxTiles || d < minTiles) continue;
    const key = field[m.toY * map.width + m.toX]! + (1 - m.t);
    if (key < bestKey || (key === bestKey && best && m.id < best.id)) {
      best = m;
      bestKey = key;
    }
  }
  return best;
}

/** Hitscan fire for every tower, then remove the dead and pay bounties. */
export function fireTowers(world: World): void {
  if (!world.map || !world.field) return;
  for (const t of world.towers) {
    const stats = towersData[t.type];
    t.cooldown -= TICK_DT;
    while (t.cooldown <= 0) {
      const target = acquireFirst(world, t);
      if (!target) {
        t.cooldown = 0; // stay ready
        break;
      }
      const wasAlive = target.hp > 0;
      target.hp -= stats.damage;
      if (wasAlive && target.hp <= 0) t.kills++;
      target.lastHitTick = world.tick;
      const [x, y] = mobPos(target);
      t.lastShot = { tick: world.tick, x, y };
      t.cooldown += 1 / stats.shotsPerS;
    }
  }
  const alive: Mob[] = [];
  for (const m of world.mobs) {
    if (m.hp > 0) {
      alive.push(m);
    } else {
      world.cash += mobsData[m.type].bounty;
      world.stats.kills++;
      const [x, y] = mobPos(m);
      world.fx.kills.push({ tick: world.tick, x, y });
    }
  }
  world.mobs = alive;
}

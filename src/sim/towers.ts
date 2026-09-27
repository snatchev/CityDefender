import mobsData from '../data/mobs.json';
import towersData from '../data/towers.json';
import { TICK_DT, TILE_M } from './constants';
import { Tile } from './map';
import { builtNow, sellValue, type BuiltAt } from './economy';
import type { Mob } from './mobs';
import type { World } from './world';

export type TowerType = keyof typeof towersData;

export interface Tower {
  id: number;
  type: TowerType;
  tx: number;
  ty: number;
  /** Seconds until the next shot is ready (≤ 0 = ready). */
  cooldown: number;
  /** Most recent shot, for tracers: target position in tile coordinates. */
  lastShot: { tick: number; x: number; y: number } | null;
  built: BuiltAt;
  kills: number;
}

/** Why a tower can't go on (tx, ty), or null if it can. MVP rule (DESIGN §4.1): a building tile touching a street. */
export function towerSiteError(world: World, tx: number, ty: number): string | null {
  const map = world.map;
  if (!map) return 'no map';
  if (world.phase === 'won' || world.phase === 'lost') return 'the run is over';
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height
      ? map.tiles[y * map.width + x]
      : Tile.Building;
  if (at(tx, ty) !== Tile.Building) return 'not a rooftop';
  const touchesStreet = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => at(tx + dx!, ty + dy!) === Tile.Street);
  if (!touchesStreet) return 'must overlook a street';
  if (world.towerAt[ty * map.width + tx] !== 0) return 'already has a tower';
  return null;
}

// TODO(pass-6): roof pads and the height range bonus (DESIGN §7).
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
  if (world.phase === 'won' || world.phase === 'lost') return 'the run is over';
  const t = world.towers.find((x) => x.id === id);
  if (!t) return 'no tower here';
  world.cash += towerSellValue(world, t);
  world.towers = world.towers.filter((x) => x.id !== id);
  world.towerAt[t.ty * world.map!.width + t.tx] = 0;
  return null;
}

/** Mob position in (continuous) tile coordinates. */
export function mobPos(m: Mob): [number, number] {
  return [m.fromX + (m.toX - m.fromX) * m.t, m.fromY + (m.toY - m.fromY) * m.t];
}

/**
 * Targeting "First" (DESIGN §7): the mob in range furthest along its route, i.e. with the lowest
 * remaining flow-field cost. Ties go to the older mob (lower id) so it's deterministic.
 */
function acquireFirst(world: World, t: Tower): Mob | null {
  const map = world.map!;
  const field = world.field!;
  const range = towersData[t.type].rangeM / TILE_M;
  let best: Mob | null = null;
  let bestKey = Infinity;
  for (const m of world.mobs) {
    if (m.hp <= 0) continue;
    const [x, y] = mobPos(m);
    if (Math.hypot(x - t.tx, y - t.ty) > range) continue;
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

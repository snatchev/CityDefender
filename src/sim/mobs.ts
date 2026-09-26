import { TICK_DT, TICK_HZ, TILE_M } from './constants';
import mobsData from '../data/mobs.json';
import rulesData from '../data/rules.json';
import { N4, UNREACHABLE } from './flow';
import type { World } from './world';

export type MobType = keyof typeof mobsData;

/**
 * A crawler walking tile centre to tile centre. Positions are tile coordinates; (tx, ty) is the
 * tile's centre. `t` is progress (0..1) from the `from` tile to the `to` tile.
 */
export interface Mob {
  id: number;
  type: MobType;
  hp: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t: number;
}

/** Mobs waiting to leave one station, one every `intervalTicks`. */
export interface Spawner {
  spawnIndex: number;
  type: MobType;
  remaining: number;
  intervalTicks: number;
  nextTick: number;
}

/** Queue `count` mobs to leave spawn `spawnIndex` (an index into `world.map.spawns`). */
export function queueWave(
  world: World,
  count: number,
  spawnIndex = 0,
  type: MobType = 'skitterling',
): void {
  if (!world.map) throw new Error('queueWave: no map loaded');
  if (!world.map.spawns[spawnIndex]) throw new Error(`queueWave: no spawn ${spawnIndex}`);
  world.spawners.push({
    spawnIndex,
    type,
    remaining: count,
    intervalTicks: Math.max(1, Math.round(rulesData.spawnIntervalS * TICK_HZ)),
    nextTick: world.tick,
  });
}

export function spawnMob(world: World, spawnIndex: number, type: MobType): Mob {
  const [tx, ty] = world.map!.spawns[spawnIndex]!;
  const mob: Mob = {
    id: world.nextMobId++,
    type,
    hp: mobsData[type].hp,
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

export function tickSpawners(world: World): void {
  for (const s of world.spawners) {
    while (s.remaining > 0 && world.tick >= s.nextTick) {
      spawnMob(world, s.spawnIndex, s.type);
      s.remaining--;
      s.nextTick += s.intervalTicks;
    }
  }
  world.spawners = world.spawners.filter((s) => s.remaining > 0);
}

/**
 * Advance every mob one tick along the distance field. A mob that arrives on a goal tile damages
 * City Hall and is removed. Ties between equally good next tiles are broken with the seeded RNG,
 * so a swarm spreads over the street's lanes but a seed always replays the same.
 */
export function stepMobs(world: World): void {
  const map = world.map;
  const dist = world.goalDist;
  if (!map || !dist) return;
  const survivors: Mob[] = [];
  for (const m of world.mobs) {
    let budget = (mobsData[m.type].speedMps * TICK_DT) / TILE_M; // tiles this tick
    const arrived = () => m.t >= 1 && dist[m.toY * map.width + m.toX] === 0;
    let reached = arrived(); // only if it spawned on a goal tile
    while (budget > 0 && !reached) {
      if (m.t >= 1) {
        const next = nextTile(world, m.toX, m.toY);
        if (!next) break; // stranded (unreachable): wait in place
        m.fromX = m.toX;
        m.fromY = m.toY;
        m.toX = next[0];
        m.toY = next[1];
        m.t = 0;
      }
      const used = Math.min(budget, 1 - m.t);
      m.t += used;
      budget -= used;
      reached = arrived(); // counts the tick the mob steps onto the goal
    }
    if (reached) {
      world.integrity = Math.max(0, world.integrity - mobsData[m.type].goalDamage);
      world.stats.leaked++;
    } else {
      survivors.push(m);
    }
  }
  world.mobs = survivors;
}

function nextTile(world: World, tx: number, ty: number): [number, number] | null {
  const map = world.map!;
  const dist = world.goalDist!;
  const d = dist[ty * map.width + tx]!;
  if (d === UNREACHABLE) return null;
  const options: [number, number][] = [];
  for (const [dx, dy] of N4) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    if (dist[ny * map.width + nx] === d - 1) options.push([nx, ny]);
  }
  return options.length === 0 ? null : world.rng.pick(options);
}

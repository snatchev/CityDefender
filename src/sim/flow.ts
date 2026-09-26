import rulesData from '../data/rules.json';
import { isWalkable, Tile, type TileMap, type TileType } from './map';

/** Field value for tiles that can't reach the goal (and non-walkable tiles). */
export const UNREACHABLE = Infinity;

/** 4-neighbour offsets. The order is fixed so the sim stays deterministic. */
export const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Flow field (DESIGN §5.1–5.3): the cheapest cost from every walkable tile to the goal, by Dijkstra
 * outward from all goal tiles. Stepping onto a tile costs `tileCost + extraCost[tile]`, where the
 * extra cost is how barricades enter (siege rule: cost grows with barricade HP). A mob steps to the
 * neighbour minimising `enterCost(n) + field[n]`, which always equals its own field value.
 *
 * All costs are integers, so equally good routes tie exactly.
 */
export function flowField(map: TileMap, extraCost: Float64Array): Float64Array {
  const field = new Float64Array(map.width * map.height).fill(UNREACHABLE);
  const heap = new MinHeap();
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] === Tile.Goal) {
      field[i] = 0;
      heap.push(i, 0);
    }
  }
  while (heap.size > 0) {
    const [i, d] = heap.pop();
    if (d > field[i]!) continue; // stale entry
    const step = d + enterCost(extraCost, i);
    const tx = i % map.width;
    const ty = (i - tx) / map.width;
    for (const [dx, dy] of N4) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const n = ny * map.width + nx;
      if (!isWalkable(map.tiles[n] as TileType) || step >= field[n]!) continue;
      field[n] = step;
      heap.push(n, step);
    }
  }
  return field;
}

/** Cost of stepping onto tile `i`. */
export function enterCost(extraCost: Float64Array, i: number): number {
  return rulesData.tileCost + extraCost[i]!;
}

/**
 * The route a mob would walk from `start` (tile index) to the goal, following the cheapest neighbour
 * (first in N4 order on ties, so the drawn route is stable). Includes `start` and the goal tile.
 * Empty if `start` can't reach the goal.
 */
export function tracePath(
  map: TileMap,
  field: Float64Array,
  extraCost: Float64Array,
  start: number,
): number[] {
  if (field[start] === UNREACHABLE) return [];
  const path = [start];
  let i = start;
  while (field[i]! > 0 && path.length <= map.tiles.length) {
    const next = cheapestNeighbours(map, field, extraCost, i)[0];
    if (next === undefined) break;
    path.push(next);
    i = next;
  }
  return path;
}

/** Neighbours of `i` that lie on a cheapest route to the goal (all of them, for tie-breaking). */
export function cheapestNeighbours(
  map: TileMap,
  field: Float64Array,
  extraCost: Float64Array,
  i: number,
): number[] {
  const tx = i % map.width;
  const ty = (i - tx) / map.width;
  let best = Infinity;
  let out: number[] = [];
  for (const [dx, dy] of N4) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
    const n = ny * map.width + nx;
    if (field[n] === UNREACHABLE) continue;
    const c = enterCost(extraCost, n) + field[n]!;
    if (c < best) {
      best = c;
      out = [n];
    } else if (c === best) {
      out.push(n);
    }
  }
  return best < Infinity && best <= field[i]! ? out : [];
}

/** Binary min-heap of (tile, cost) pairs. */
class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let c = this.items.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.swap(c, p);
      c = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.items[0]!, this.keys[0]!];
    const lastI = this.items.pop()!;
    const lastK = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastI;
      this.keys[0] = lastK;
      let p = 0;
      for (;;) {
        const l = 2 * p + 1;
        const r = l + 1;
        let m = p;
        if (l < this.items.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.items.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === p) break;
        this.swap(p, m);
        p = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
  }
}

import { isWalkable, Tile, type TileMap, type TileType } from './map';

/** Marks tiles that can't reach the goal (and non-walkable tiles) in a distance field. */
export const UNREACHABLE = -1;

/** 4-neighbour offsets. The order is fixed so the sim stays deterministic. */
export const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Steps from every walkable tile to the nearest goal tile (breadth-first search outward from all goal
 * tiles at once). A mob moves by stepping to any neighbour whose distance is one less.
 * TODO(pass-3): replace with a Dijkstra flow field that adds barricade costs (DESIGN §5.2).
 */
export function goalDistanceField(map: TileMap): Int32Array {
  const dist = new Int32Array(map.width * map.height).fill(UNREACHABLE);
  const queue: number[] = [];
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] === Tile.Goal) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const tx = i % map.width;
    const ty = (i - tx) / map.width;
    for (const [dx, dy] of N4) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const j = ny * map.width + nx;
      if (dist[j] !== UNREACHABLE || !isWalkable(map.tiles[j] as TileType)) continue;
      dist[j] = dist[i]! + 1;
      queue.push(j);
    }
  }
  return dist;
}

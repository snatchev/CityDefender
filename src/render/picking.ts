import type { Ray } from 'three';
import type { TileMap } from '../sim/map';
import { worldToTile, type TileFrame } from './coords';

/** Ray-march step along the pointer ray, in metres. */
const STEP_M = 1;

/**
 * The tile under the pointer, counting building roofs: march down the ray from the tallest roof
 * height to the ground and return the first tile whose top surface the ray has passed below.
 * Far cheaper than raycasting thousands of instanced boxes.
 */
export function pickTile(
  ray: Ray,
  frame: TileFrame,
  map: TileMap,
  heights: Float32Array,
  maxHeight: number,
): [number, number] | null {
  const { origin: o, direction: d } = ray;
  if (d.y >= 0) return null;
  const tStart = Math.max(0, (maxHeight - o.y) / d.y);
  const tEnd = -o.y / d.y;
  for (let t = tStart; t <= tEnd + STEP_M; t += STEP_M) {
    const y = o.y + d.y * t;
    const [tx, ty] = worldToTile(frame, o.x + d.x * t, o.z + d.z * t);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
    if (y <= heights[ty * map.width + tx]!) return [tx, ty];
  }
  const [tx, ty] = worldToTile(frame, o.x + d.x * tEnd, o.z + d.z * tEnd);
  return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height ? [tx, ty] : null;
}

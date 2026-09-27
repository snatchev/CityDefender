import type { ThreeEvent } from '@react-three/fiber';
import type { Ray } from 'three';
import { buildAt, hoverTile, sellAt } from '../planning';
import type { TileMap } from '../sim/map';
import { worldToTile, type TileFrame } from './coords';

/** Ray-march step along the pointer ray, in metres. */
const STEP_M = 1;
/** Pointer movement (px) above which a click counts as a camera drag, not a build. */
const CLICK_SLOP_PX = 5;

/** Pointer handlers for the ground plane mesh. */
export interface GroundHandlers {
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

/**
 * Pointer input on the map: hover previews, left-click builds (barricade on a street, MG Nest on a
 * rooftop, or selects a tower), right-click sells a tower or barricade. The tile comes from
 * `pickTile`, so roofs are picked, not the ground behind them. Clicks that end a camera drag are
 * ignored.
 */
export function groundHandlers(
  frame: TileFrame,
  map: TileMap,
  heights: Float32Array,
): GroundHandlers {
  const maxHeight = heights.reduce((m, h) => Math.max(m, h), 0);
  const tileAt = (ray: Ray) => pickTile(ray, frame, map, heights, maxHeight);
  return {
    onPointerMove: (e) => hoverTile(tileAt(e.ray)),
    onPointerOut: () => hoverTile(null),
    onClick: (e) => {
      if (e.delta > CLICK_SLOP_PX) return;
      const tile = tileAt(e.ray);
      if (tile) buildAt(tile[0], tile[1]);
    },
    onContextMenu: (e) => {
      e.nativeEvent.preventDefault();
      if (e.delta > CLICK_SLOP_PX) return;
      const tile = tileAt(e.ray);
      if (tile) sellAt(tile[0], tile[1]);
    },
  };
}

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

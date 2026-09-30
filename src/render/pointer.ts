import type { ThreeEvent } from '@react-three/fiber';
import { Vector3, type Camera, type Ray, type Vector2 } from 'three';
import { clickMap, hoverTile, sellAt } from '../planning';
import type { TileMap } from '../sim/map';
import { usePlan } from '../ui/planStore';
import { indexToWorld, worldToTile, type TileFrame } from './coords';
import { seeThroughFade } from './seeThrough';

/** Ray-march step along the pointer ray, in metres. */
const STEP_M = 1;
/** Pointer movement (px) above which a click counts as a camera drag, not a build. */
const CLICK_SLOP_PX = 5;
/** Roofs faded more than this by the see-through cutaway don't catch the pointer. */
const PICK_THROUGH_FADE = 0.5;
/**
 * A click this close to a route line on screen (fraction of the screen height) picks the route,
 * even when a building is drawn in front of it (D049).
 */
const ROUTE_PICK_SCREEN = 0.025;
/** Route lines are drawn this high above the street. */
const ROUTE_LINE_Y = 1.2;
const probe = new Vector3();
/** Pointer handlers for the ground plane mesh. */
export interface GroundHandlers {
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onContextMenu: (e: ThreeEvent<MouseEvent>) => void;
}

/**
 * Pointer input on the map: hover previews, left-click builds with the picked tool (a tower lands on
 * the spot its preview snapped to) or selects a tower, right-click sells a tower or barricade. The tile comes from
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
      clickMap(tileAt(e.ray), routeOnScreen(e.pointer, e.camera, frame, map.width));
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
 * The route whose line passes closest to the pointer on screen, within `ROUTE_PICK_SCREEN`, or null.
 * Works through buildings: the line is compared in screen space, not picked in the scene. The
 * focused route wins ties, so clicking it again re-frames it.
 */
function routeOnScreen(
  pointer: Vector2,
  camera: Camera,
  frame: TileFrame,
  width: number,
): number | null {
  const { routes, focus } = usePlan.getState();
  const aspect = 'aspect' in camera ? (camera.aspect as number) : 1;
  const p = new Vector3();
  const q = new Vector3();
  let best: number | null = null;
  let bestD = ROUTE_PICK_SCREEN * 2; // NDC spans 2 screen heights
  for (const r of routes) {
    let d = Infinity;
    for (let k = 0; k + 1 < r.tiles.length; k++) {
      const [ax, az] = indexToWorld(frame, width, r.tiles[k]!);
      const [bx, bz] = indexToWorld(frame, width, r.tiles[k + 1]!);
      p.set(ax, ROUTE_LINE_Y, az).project(camera);
      q.set(bx, ROUTE_LINE_Y, bz).project(camera);
      if (p.z > 1 || q.z > 1) continue; // behind the camera
      d = Math.min(d, segmentDistance(pointer.x, pointer.y, p.x, p.y, q.x, q.y, aspect));
    }
    if (d < bestD || (d <= bestD && r.station === focus?.station)) {
      bestD = d;
      best = r.station;
    }
  }
  return best;
}

/** Distance from (x, y) to segment a–b in NDC, with x scaled by the aspect so it's isotropic. */
function segmentDistance(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  aspect: number,
): number {
  const [px, qx, rx] = [x * aspect, ax * aspect, bx * aspect];
  const dx = rx - qx;
  const dy = by - ay;
  const t = Math.min(
    1,
    Math.max(0, ((px - qx) * dx + (y - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-12)),
  );
  return Math.hypot(px - (qx + dx * t), y - (ay + dy * t));
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
    const top = heights[ty * map.width + tx]!;
    if (y > top) continue;
    // A building faded out by the cutaway lets the pointer through to what's behind it.
    if (top > 0 && seeThroughFade(probe.set(o.x + d.x * t, y, o.z + d.z * t)) > PICK_THROUGH_FADE) {
      continue;
    }
    return [tx, ty];
  }
  const [tx, ty] = worldToTile(frame, o.x + d.x * tEnd, o.z + d.z * tEnd);
  return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height ? [tx, ty] : null;
}

import { Tile, type TileMap } from '../sim/map';

/** Open lots (non-street tiles with no building) are drawn as low slabs of this height. */
export const LOT_M = 0.4;

/**
 * Display height (m) of every tile's top surface: the real building height (D029: drawn 1:1; only
 * gameplay range uses the compressed height), `LOT_M` for open lots, 0 for streets and the goal.
 * Used for drawing, picking and putting towers on roofs.
 */
export function displayHeights(map: TileMap): Float32Array {
  const out = new Float32Array(map.width * map.height);
  for (let i = 0; i < out.length; i++) {
    if (map.tiles[i] !== Tile.Building) continue;
    const h = map.heightsM?.[i] ?? 0;
    out[i] = h > 0 ? h : LOT_M;
  }
  return out;
}

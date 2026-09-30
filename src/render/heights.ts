import type { BuildingsFileV1 } from '../sim/cityFile';
import { Tile, type TileMap } from '../sim/map';

/** Open lots (non-street tiles with no building on them) are drawn as low slabs of this height. */
export const LOT_M = 0.4;

/**
 * Display height (m) of every tile's top surface: the drawn roof at the tile's centre from
 * buildings.json (D046: setbacks and pitched roofs, so a tower stands on what's drawn; the sim keeps
 * its own per-tile heights for range), `LOT_M` for open lots, 0 for streets and the goal.
 * Used for drawing, picking and putting towers on roofs.
 */
export function displayHeights(map: TileMap, buildings: BuildingsFileV1): Float32Array {
  const out = new Float32Array(map.width * map.height);
  const roofs = decodeRows(buildings.roofRows, map.width, map.height);
  for (let i = 0; i < out.length; i++) {
    if (map.tiles[i] !== Tile.Building) continue;
    const h = map.heightsM?.[i] ?? 0;
    out[i] = h <= 0 ? LOT_M : roofs[i]! > 0 ? roofs[i]! / 10 : h;
  }
  return out;
}

function decodeRows(rows: readonly string[], width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  if (rows.length !== height) throw new Error(`buildings.json: expected ${height} roof rows`);
  rows.forEach((row, ty) => {
    const cells = row.split(',');
    if (cells.length !== width)
      throw new Error(`buildings.json: roof row ${ty} has ${cells.length} cells`);
    cells.forEach((c, tx) => (out[ty * width + tx] = Number(c)));
  });
  return out;
}

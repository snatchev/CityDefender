import { TILE_M } from '../sim/constants';
import { Tile, type TileMap } from '../sim/map';

/**
 * Tile ↔ world mapping. World units are metres, tile x → world x, tile y → world z, y is up.
 * The world origin sits at the centroid of the goal tiles, so the landmark is at (0, 0, 0).
 */
export interface TileFrame {
  /** Goal centroid in (continuous) tile coordinates. */
  cx: number;
  cy: number;
}

export function tileFrame(map: TileMap): TileFrame {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.tiles[ty * map.width + tx] === Tile.Goal) {
        sx += tx + 0.5;
        sy += ty + 0.5;
        n++;
      }
    }
  }
  return n > 0 ? { cx: sx / n, cy: sy / n } : { cx: map.width / 2, cy: map.height / 2 };
}

/** World [x, z] of a tile's centre. */
export function tileToWorld(f: TileFrame, tx: number, ty: number): [x: number, z: number] {
  return [(tx + 0.5 - f.cx) * TILE_M, (ty + 0.5 - f.cy) * TILE_M];
}

/** World [x, z] of the tile with row-major index `i` in a map `width` tiles wide. */
export function indexToWorld(f: TileFrame, width: number, i: number): [x: number, z: number] {
  const tx = i % width;
  return tileToWorld(f, tx, (i - tx) / width);
}

/** Tile under a world-space point (inverse of `tileToWorld`). */
export function worldToTile(f: TileFrame, x: number, z: number): [tx: number, ty: number] {
  return [Math.floor(x / TILE_M + f.cx), Math.floor(z / TILE_M + f.cy)];
}

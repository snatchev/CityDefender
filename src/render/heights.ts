import mapData from '../data/map.json';
import { cityHeights, compressHeight, type CityFileV0 } from '../sim/cityFile';
import { Tile, type TileMap } from '../sim/map';

/** Open lots (non-street tiles with no building) are drawn as low slabs of this height. */
export const LOT_M = 0.4;

/**
 * Display height (m) of every tile's top surface: compressed real height for buildings, `LOT_M` for
 * open lots, 0 for streets and the goal. Used for drawing, picking and putting towers on roofs.
 */
export function displayHeights(city: CityFileV0, map: TileMap): Float32Array {
  const real = cityHeights(city);
  const out = new Float32Array(map.width * map.height);
  for (let i = 0; i < out.length; i++) {
    if (map.tiles[i] !== Tile.Building) continue;
    const h = compressHeight(real[i]!, mapData.heightCompressionK);
    out[i] = h > 0 ? h : LOT_M;
  }
  return out;
}

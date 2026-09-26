import { parseAsciiMap } from './asciiMap';
import type { TileMap } from './map';

/**
 * `public/cities/<city>/city.json`, written by `npm run map:build` (tools/map/build.ts).
 * v0 (Pass 1): flat tile grid, uniform building height. Pass 6 adds heights, slots, the street graph.
 *
 * Tiles are stored as text rows using the same characters as the test fixtures
 * (`#` building, `.` street, `G` goal), row 0 = north edge, so the file diffs readably.
 */
export interface CityFileV0 {
  version: 0;
  meta: {
    city: string;
    title: string;
    tileM: number;
    width: number;
    height: number;
    /** The grid was rotated by this many degrees (counter-clockwise) to align Penn's streets with the axes. */
    gridRotationDeg: number;
    /** Uniform building height for v0 rendering. */
    buildingHeightM: number;
    attribution: string;
    /** OSM data timestamp of the cached download. */
    osmTimestamp: string;
  };
  rows: string[];
  goal: { name: string; tx: number; ty: number };
  /** Ordered outermost (farthest from the goal) first. */
  spawns: CitySpawn[];
  labels: CityLabel[];
}

export interface CitySpawn {
  name: string;
  tx: number;
  ty: number;
  /** Straight-line distance to the goal in metres. */
  goalDistM: number;
}

export interface CityLabel {
  text: string;
  tx: number;
  ty: number;
  /** True for streets running north–south on the grid. */
  vertical: boolean;
}

export function cityToTileMap(city: CityFileV0): TileMap {
  const map = parseAsciiMap(city.rows.join('\n'));
  if (map.width !== city.meta.width || map.height !== city.meta.height) {
    throw new Error(
      `city ${city.meta.city}: rows are ${map.width}×${map.height}, meta says ${city.meta.width}×${city.meta.height}`,
    );
  }
  map.spawns = city.spawns.map((s) => [s.tx, s.ty] as const);
  return map;
}

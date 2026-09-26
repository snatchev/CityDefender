import { parseAsciiMap } from './asciiMap';
import type { TileMap } from './map';

/**
 * `public/cities/<city>/city.json`, written by `npm run map:build` (tools/map/build.ts).
 * v0 (Pass 1): flat tile grid plus per-tile building heights. Pass 6 adds footprints, slots, the street graph.
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
    attribution: string;
    /** OSM data timestamp of the cached download (building heights come from City of Philadelphia data). */
    osmTimestamp: string;
  };
  rows: string[];
  /**
   * Real building height in whole metres per tile, one comma-separated row per map row.
   * 0 = street, goal, or an open lot (a non-street tile with no building on it).
   */
  heightRows: string[];
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

/** Decode `heightRows` into a row-major array of metres. */
export function cityHeights(city: CityFileV0): Float32Array {
  const { width, height } = city.meta;
  const out = new Float32Array(width * height);
  if (city.heightRows.length !== height)
    throw new Error(`city ${city.meta.city}: expected ${height} height rows`);
  city.heightRows.forEach((row, ty) => {
    const cells = row.split(',');
    if (cells.length !== width)
      throw new Error(`city ${city.meta.city}: height row ${ty} has ${cells.length} cells`);
    cells.forEach((c, tx) => (out[ty * width + tx] = Number(c)));
  });
  return out;
}

/**
 * Display/gameplay height from real height (DESIGN §4): a square-root curve that keeps the skyline's
 * ordering but stops skyscrapers from walling off the camera. `k` lives in src/data/map.json.
 */
export function compressHeight(realM: number, k: number): number {
  return realM > 0 ? k * Math.sqrt(realM) : 0;
}

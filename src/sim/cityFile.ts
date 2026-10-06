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

/**
 * `public/cities/<city>/buildings.json`, for rendering only (the sim never reads it): the drawn
 * buildings as solids (outline, height, roof) and street centerlines, in tile units × `coordScale`
 * as flat [u0, v0, u1, v1, …] arrays. v1 (Pass 10a, D046) adds roofs, setbacks from OSM
 * `building:part`s, colours and facade hints, and the landmark as its own list.
 */
export interface BuildingsFileV1 {
  version: 1;
  coordScale: number;
  solids: SolidRecord[];
  /** The goal landmark (City Hall), drawn apart so it can flash when bugs reach it. */
  landmark: SolidRecord[];
  /** OSM `highway` class and centerline, for lane markings. */
  streets: { kind: string; pts: number[] }[];
  /**
   * Drawn roof height at each tile's centre in decimetres (0 off buildings), one comma-separated row
   * per map row: towers stand here. The sim keeps city.json's `heightRows` (D046).
   */
  roofRows: string[];
}

/** One extruded shape with a roof: a whole footprint, or one OSM `building:part`. */
export interface SolidRecord {
  /** `rings[0]` is the outline, any further rings are courtyards (closed: first point repeated). */
  rings: number[][];
  /** Top of the walls (the eaves), m. */
  h: number;
  /** Bottom of the walls (m) for parts that start above the ground (OSM `min_height`). */
  base?: number;
  /** Roof shape (render/roofShape.ts), flat when absent, and its rise above the eaves (m). */
  roof?: RoofShape;
  rise?: number;
  /** The ridge runs along the short side (OSM `roof:orientation=across`). */
  across?: 1;
  /** Colours from OSM, `#rrggbb`. */
  color?: string;
  roofColor?: string;
  /** Facade hint from OSM tags (`building:material`, parking garages). */
  facade?: FacadeHint;
  /** Building number: solids with the same one are parts of one building (they fade together, D055). */
  b?: number;
}

export type FacadeHint = 'glass' | 'brick' | 'stone' | 'concrete' | 'parking';

/** Roof shapes we draw (render/roofShape.ts maps OSM `roof:shape` values onto these). */
export type RoofShape =
  | 'flat'
  | 'skillion'
  | 'gabled'
  | 'hipped'
  | 'pyramidal'
  | 'mansard'
  | 'dome'
  | 'onion'
  | 'cone'
  | 'round';

/**
 * `public/cities/<city>/backdrop.json`, render only (D027): the city beyond the playable level as
 * coarse height grids in the level's tile frame. Detail drops with distance via bigger cells.
 */
export interface BackdropFileV0 {
  version: 0;
  /** Nearest (finest) first. */
  layers: BackdropLayer[];
}

export interface BackdropLayer {
  /** Top-left corner of the grid in tile units (may be negative: outside the level). */
  u0: number;
  v0: number;
  /** Cell edge in tiles. */
  cellTiles: number;
  width: number;
  height: number;
  /** Real building height (m) per cell, one comma-separated row per grid row; 0 = open. */
  rows: string[];
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
  map.heightsM = cityHeights(city);
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

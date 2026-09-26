import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Per-city pipeline settings, from `tools/map/cities/<city>.json`. */
export interface CityConfig {
  name: string;
  title: string;
  /** Download area. Pad it beyond the level bounds so boundary streets come in whole. */
  fetchBbox: { south: number; west: number; north: number; east: number };
  goal: { name: string; lat: number; lon: number };
  /** Level edges given as street names (matched ignoring a North/South/East/West prefix). */
  bounds: { north: string; south: string; west: string; east: string; marginM: number };
  tileM: number;
  /** OSM `highway` values kept as streets. */
  highways: string[];
  /** Street width in tiles per highway class, with a `default`. */
  streetWidthTiles: Record<string, number>;
  buildingHeightM: number;
  /** Max search distance when snapping a station to the nearest street tile. */
  stationSnapMaxTiles: number;
}

export const MAP_DIR = 'tools/map';
export const CACHE_DIR = join(MAP_DIR, 'cache');

export function loadConfig(city: string): CityConfig {
  return JSON.parse(readFileSync(join(MAP_DIR, 'cities', `${city}.json`), 'utf8')) as CityConfig;
}

export function cachePath(city: string): string {
  return join(CACHE_DIR, `${city}-overpass.json`);
}

/** Overpass response (`out geom` for ways, `out center tags` for stations). */
export interface OverpassResponse {
  osm3s: { timestamp_osm_base: string };
  elements: OverpassElement[];
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

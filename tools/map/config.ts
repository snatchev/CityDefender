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
  /** Building footprints with heights (City of Philadelphia LI_BUILDING_FOOTPRINTS, ArcGIS REST). */
  buildings: {
    url: string;
    /** Attribute holding the building height; `fallbackHeightField` is used when it's missing or 0. */
    heightField: string;
    fallbackHeightField: string;
    /** Metres per height unit (feet → 0.3048). */
    heightUnitM: number;
    /** Height for footprints with no usable height. */
    defaultHeightM: number;
    /** Storey height used to turn OSM `building:levels` into metres. */
    osmLevelM: number;
    /** Fraction of a tile a footprint must cover before the tile counts as built (else it's an open lot). */
    minTileCoverage: number;
  };
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

export function buildingsCachePath(city: string): string {
  return join(CACHE_DIR, `${city}-buildings.geojson`);
}

/** OSM building outlines: the fallback where the city footprints have gaps (e.g. the Convention Center). */
export function osmBuildingsCachePath(city: string): string {
  return join(CACHE_DIR, `${city}-osm-buildings.json`);
}

/** GeoJSON FeatureCollection of footprints (Polygon / MultiPolygon, lon/lat). */
export interface FootprintCollection {
  type: 'FeatureCollection';
  features: {
    geometry:
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'MultiPolygon'; coordinates: number[][][][] }
      | null;
    properties: Record<string, string | number | null>;
  }[];
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

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
  /**
   * Max half-width (m) of each highway class, with a `default`: tiles within this of a centerline are
   * street unless a building covers them (D026), so streets follow the real building gaps.
   */
  streetHalfWidthM: Record<string, number>;
  /** Footprint coverage (0..1) at which a tile counts as building, not street. */
  streetBlockedCoverage: number;
  /** Building footprints with heights (City of Philadelphia LI_BUILDING_FOOTPRINTS, ArcGIS REST). */
  buildings: {
    url: string;
    /** Attribute holding the building height; `fallbackHeightField` is used when it's missing or 0. */
    heightField: string;
    fallbackHeightField: string;
    /** Metres per height unit (feet → 0.3048). */
    heightUnitM: number;
    /**
     * Use the fallback (max) height when it's at most this many times the primary (approx) height:
     * that catches spires and crowns the approx value averages away, while rejecting max values
     * inflated by a taller neighbour (e.g. a podium next to a tower).
     */
    maxHeightTrustRatio: number;
    /** Height for footprints with no usable height. */
    defaultHeightM: number;
    /** Storey height used to turn OSM `building:levels` into metres. */
    osmLevelM: number;
    /** Fraction of a tile a footprint must cover before the tile counts as built (else it's an open lot). */
    minTileCoverage: number;
  };
  /**
   * Decorative city beyond the playable level (D027): footprints over a wider bbox, baked into coarse
   * height grids — `nearCellM` cells within `nearRingM` of the level, `farCellM` cells beyond.
   */
  backdrop: {
    bbox: { south: number; west: number; north: number; east: number };
    /** Server-side outline simplification (degrees) to keep the download small. */
    simplifyDeg: number;
    nearRingM: number;
    nearCellM: number;
    farCellM: number;
    /** Footprint coverage at which a cell counts as built. */
    minCoverage: number;
    /** OSM buildings at least this tall fill skyline gaps in the city data. */
    osmMinHeightM: number;
  };
  /** Max search distance when snapping a station to the nearest street tile. */
  stationSnapMaxTiles: number;
}

/** A city footprint's height in metres (D029): approx height, or max height when it's plausible. */
export function footprintHeightM(
  props: Record<string, string | number | null>,
  b: CityConfig['buildings'],
): number {
  const approx = Number(props[b.heightField]) || 0;
  const max = Number(props[b.fallbackHeightField]) || 0;
  const raw =
    approx > 0 && max > 0 ? (max <= approx * b.maxHeightTrustRatio ? max : approx) : approx || max;
  return raw > 0 ? raw * b.heightUnitM : b.defaultHeightM;
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
export function backdropBuildingsCachePath(city: string): string {
  return join(CACHE_DIR, `${city}-backdrop-buildings.geojson`);
}

export function backdropOsmCachePath(city: string): string {
  return join(CACHE_DIR, `${city}-backdrop-osm-tall.json`);
}

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

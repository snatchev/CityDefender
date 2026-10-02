import { readFileSync } from 'node:fs';
import type { BuildingsFileV1, SolidRecord } from '../../src/sim/cityFile';
import {
  buildingsCachePath,
  footprintHeightM,
  osmBuildingsCachePath,
  type CityConfig,
  type FootprintCollection,
  type OverpassResponse,
} from './config';
import type { Level } from './level';
import type { Solid } from './parts';
import { rasterizeHeights, T_BUILDING, T_GOAL, type Footprint, type Grid, type UV } from './raster';

export interface Footprints {
  /** City of Philadelphia footprints (primary source). */
  city: Footprint[];
  /** OSM building outlines, used where the city data has gaps (D019). */
  osm: Footprint[];
}

/** Both footprint sources, projected into tile units. */
export function loadFootprints(city: string, cfg: CityConfig, level: Level): Footprints {
  const b = cfg.buildings;
  const toTile = ([lon, lat]: number[]) => level.toUV(level.toGrid({ lat: lat!, lon: lon! }));

  const fc = JSON.parse(readFileSync(buildingsCachePath(city), 'utf8')) as FootprintCollection;
  const cityFps: Footprint[] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const heightM = footprintHeightM(f.properties, b);
    for (const poly of polys)
      cityFps.push({ heightM, rings: poly.map((ring) => ring.map(toTile)) });
  }

  const osmB = JSON.parse(readFileSync(osmBuildingsCachePath(city), 'utf8')) as OverpassResponse;
  const osmFps: Footprint[] = [];
  for (const e of osmB.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 4) continue;
    const t = e.tags ?? {};
    const heightM =
      parseFloat(t.height ?? '') ||
      (parseFloat(t['building:levels'] ?? '') || 0) * b.osmLevelM ||
      b.defaultHeightM;
    osmFps.push({ heightM, rings: [e.geometry.map((p) => toTile([p.lon, p.lat]))], tags: t });
  }
  return { city: cityFps, osm: osmFps };
}

export interface BuildingRaster {
  /** Tallest footprint per tile (m): city data first, OSM where the city has none. */
  heights: Float32Array;
  /** Footprint coverage per tile (0..1), the larger of the two sources. */
  coverage: Float32Array;
  /** Tiles whose height came from OSM. */
  fromOsm: number;
}

export function rasterizeBuildings(level: Level, fps: Footprints, cfg: CityConfig): BuildingRaster {
  const { width, height } = level;
  const c = rasterizeHeights(width, height, fps.city, cfg.buildings.minTileCoverage);
  const o = rasterizeHeights(width, height, fps.osm, cfg.buildings.minTileCoverage);
  let fromOsm = 0;
  const heights = c.heights.map((h, i) => {
    if (h > 0) return h;
    if (o.heights[i]! > 0) fromOsm++;
    return o.heights[i]!;
  });
  const coverage = c.coverage.map((v, i) => Math.max(v, o.coverage[i]!));
  return { heights, coverage, fromOsm };
}

/** city.json `heightRows`: whole metres per tile for building tiles, 0 elsewhere. */
export function heightRows(
  grid: Grid,
  heights: Float32Array,
): { rows: string[]; built: number; tallestM: number } {
  const rows: string[] = [];
  let built = 0;
  let tallestM = 0;
  for (let ty = 0; ty < grid.height; ty++) {
    const row: number[] = [];
    for (let tx = 0; tx < grid.width; tx++) {
      const h = grid.get(tx, ty) === T_BUILDING ? Math.round(heights[ty * grid.width + tx]!) : 0;
      if (h > 0) built++;
      tallestM = Math.max(tallestM, h);
      row.push(h);
    }
    rows.push(row.join(','));
  }
  return { rows, built, tallestM };
}

/** Footprints smaller than this aren't drawn (sheds, kiosks, slivers). */
const MIN_AREA_M2 = 40;
/** Douglas–Peucker tolerance for drawn outlines. */
const SIMPLIFY_M = 0.5;
/** Output coordinate precision: tile units × this, rounded (8 m tiles → 8 cm). */
const COORD_SCALE = 100;

/**
 * The footprints to draw: city footprints plus OSM outlines that fill gaps in the city data, without
 * tiny ones, the goal block or anything outside the level.
 */
export function drawnFootprints(
  level: Level,
  fps: Footprints,
  grid: Grid,
  cfg: CityConfig,
): Footprint[] {
  const minAreaTiles = MIN_AREA_M2 / (cfg.tileM * cfg.tileM);
  const cityCov = rasterizeHeights(level.width, level.height, fps.city, 0).coverage;
  const keep = (fp: Footprint, isOsm: boolean) => {
    const outer = fp.rings[0];
    if (!outer || outer.length < 4 || Math.abs(ringArea(outer)) < minAreaTiles) return false;
    const [cu, cv] = centroid(outer);
    const tx = Math.floor(cu);
    const ty = Math.floor(cv);
    if (!grid.inBounds(tx, ty) || grid.get(tx, ty) === T_GOAL) return false;
    // OSM outlines only where the city data has nothing (the same rule the heights use).
    return !isOsm || cityCov[ty * level.width + tx]! < cfg.buildings.minTileCoverage;
  };
  return [...fps.city.filter((fp) => keep(fp, false)), ...fps.osm.filter((fp) => keep(fp, true))];
}

/** Outlines simplified for drawing (and for sampling roof heights, so both use the same shapes). */
export function simplifySolids(solids: Solid[], cfg: CityConfig): Solid[] {
  const tol = SIMPLIFY_M / cfg.tileM;
  return solids
    .map((s) => ({
      ...s,
      rings: s.rings.map((r) => simplify(r, tol)).filter((r) => r.length >= 4),
    }))
    .filter((s) => s.rings.length > 0 && s.eaveM + s.riseM > 0);
}

/**
 * public/cities/<city>/buildings.json: the drawn solids, the landmark, street centerlines, and the
 * drawn roof height at every tile centre (`surface`, m).
 */
export function buildingsFile(
  level: Level,
  grid: Grid,
  solids: readonly Solid[],
  landmark: readonly Solid[],
  surface: Float32Array,
  cfg: CityConfig,
): BuildingsFileV1 {
  const tolTiles = SIMPLIFY_M / cfg.tileM;
  const streets = level.ways
    .map((w, i) => ({ w, line: simplify(level.uvLines[i]!, tolTiles) }))
    .filter(({ line }) => line.some((p) => grid.inBounds(Math.floor(p.u), Math.floor(p.v))))
    .map(({ w, line }) => ({ kind: w.tags.highway!, pts: encode(line) }));
  return {
    version: 1,
    coordScale: COORD_SCALE,
    solids: solids.map(solidRecord),
    landmark: landmark.map(solidRecord),
    streets,
    roofRows: Array.from({ length: grid.height }, (_, ty) =>
      Array.from(surface.subarray(ty * grid.width, (ty + 1) * grid.width), (m) =>
        Math.round(m * 10),
      ).join(','),
    ),
  };
}

const round1 = (m: number) => Math.round(m * 10) / 10;

function encode(pts: readonly UV[]): number[] {
  return pts.flatMap((p) => [Math.round(p.u * COORD_SCALE), Math.round(p.v * COORD_SCALE)]);
}

function solidRecord(s: Solid): SolidRecord {
  const r: SolidRecord = { rings: s.rings.map(encode), h: round1(s.eaveM) };
  if (s.baseM > 0) r.base = round1(s.baseM);
  if (s.roof !== 'flat') {
    r.roof = s.roof;
    r.rise = round1(s.riseM);
    if (s.across) r.across = 1;
  }
  if (s.color) r.color = s.color;
  if (s.roofColor) r.roofColor = s.roofColor;
  if (s.facade) r.facade = s.facade;
  if (s.building !== undefined) r.b = s.building;
  return r;
}

function ringArea(r: readonly UV[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += r[j]!.u * r[i]!.v - r[i]!.u * r[j]!.v;
  return a / 2;
}

function centroid(r: readonly UV[]): [number, number] {
  let u = 0;
  let v = 0;
  for (const p of r) {
    u += p.u;
    v += p.v;
  }
  return [u / r.length, v / r.length];
}

/** Douglas–Peucker simplification of a polyline or closed ring (endpoints kept). */
function simplify(pts: readonly UV[], tol: number): UV[] {
  if (pts.length <= 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let farD = tol;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i]!, pts[a]!, pts[b]!);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function segDist(p: UV, a: UV, b: UV): number {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const len2 = du * du + dv * dv;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.u - a.u) * du + (p.v - a.v) * dv) / len2));
  return Math.hypot(p.u - (a.u + t * du), p.v - (a.v + t * dv));
}

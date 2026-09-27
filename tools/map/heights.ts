import { readFileSync } from 'node:fs';
import {
  buildingsCachePath,
  osmBuildingsCachePath,
  type CityConfig,
  type FootprintCollection,
  type OverpassResponse,
} from './config';
import type { Level } from './level';
import { rasterizeHeights, T_BUILDING, type Footprint, type Grid } from './raster';

export interface HeightResult {
  /** One comma-separated row of whole metres per map row (city.json `heightRows`). */
  heightRows: string[];
  cityFootprints: number;
  osmFootprints: number;
  builtTiles: number;
  fromOsm: number;
  tallestM: number;
}

/**
 * Building heights per tile: City of Philadelphia footprints first, OSM building outlines where the
 * city data has gaps (D019). Streets and the goal block stay 0.
 */
export function tileHeights(city: string, cfg: CityConfig, level: Level, grid: Grid): HeightResult {
  const b = cfg.buildings;
  const toTile = ([lon, lat]: number[]) => level.toUV(level.toGrid({ lat: lat!, lon: lon! }));

  const fc = JSON.parse(readFileSync(buildingsCachePath(city), 'utf8')) as FootprintCollection;
  const footprints: Footprint[] = [];
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const raw =
      Number(f.properties[b.heightField]) || Number(f.properties[b.fallbackHeightField]) || 0;
    const heightM = raw > 0 ? raw * b.heightUnitM : b.defaultHeightM;
    for (const poly of polys)
      footprints.push({ heightM, rings: poly.map((ring) => ring.map(toTile)) });
  }

  const osmB = JSON.parse(readFileSync(osmBuildingsCachePath(city), 'utf8')) as OverpassResponse;
  const osmFootprints: Footprint[] = [];
  for (const e of osmB.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 4) continue;
    const t = e.tags ?? {};
    const heightM =
      parseFloat(t.height ?? '') ||
      (parseFloat(t['building:levels'] ?? '') || 0) * b.osmLevelM ||
      b.defaultHeightM;
    osmFootprints.push({ heightM, rings: [e.geometry.map((p) => toTile([p.lon, p.lat]))] });
  }

  const { width, height } = level;
  const cityHeights = rasterizeHeights(width, height, footprints, b.minTileCoverage);
  const osmHeights = rasterizeHeights(width, height, osmFootprints, b.minTileCoverage);
  let fromOsm = 0;
  const merged = cityHeights.map((h, i) => {
    if (h > 0) return h;
    if (osmHeights[i]! > 0) fromOsm++;
    return osmHeights[i]!;
  });

  const heightRows: string[] = [];
  let builtTiles = 0;
  let tallestM = 0;
  for (let ty = 0; ty < height; ty++) {
    const row: number[] = [];
    for (let tx = 0; tx < width; tx++) {
      const h = grid.get(tx, ty) === T_BUILDING ? Math.round(merged[ty * width + tx]!) : 0;
      if (h > 0) builtTiles++;
      tallestM = Math.max(tallestM, h);
      row.push(h);
    }
    heightRows.push(row.join(','));
  }
  return {
    heightRows,
    cityFootprints: footprints.length,
    osmFootprints: osmFootprints.length,
    builtTiles,
    fromOsm,
    tallestM,
  };
}

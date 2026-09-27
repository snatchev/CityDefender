import { readFileSync } from 'node:fs';
import type { BackdropFileV0, BackdropLayer } from '../../src/sim/cityFile';
import {
  backdropBuildingsCachePath,
  backdropOsmCachePath,
  footprintHeightM,
  type CityConfig,
  type FootprintCollection,
  type OverpassResponse,
} from './config';
import type { Level } from './level';
import { rasterizeHeights, type Footprint, type UV } from './raster';

/**
 * The decorative city beyond the playable level (D027), baked into two coarse height grids in the
 * level's tile frame: fine cells within `nearRingM` of the level, coarse cells beyond, out to the
 * backdrop bbox. The playable area itself (and, for the far grid, the near ring) is left empty.
 * Level of detail falls off with distance simply by cell size.
 */
export function bakeBackdrop(city: string, cfg: CityConfig, level: Level): BackdropFileV0 {
  const bd = cfg.backdrop;
  const toTile = ([lon, lat]: number[]): UV => level.toUV(level.toGrid({ lat: lat!, lon: lon! }));

  const fps: Footprint[] = [];
  const fc = JSON.parse(
    readFileSync(backdropBuildingsCachePath(city), 'utf8'),
  ) as FootprintCollection;
  const b = cfg.buildings;
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const heightM = footprintHeightM(f.properties, b);
    for (const poly of polys) fps.push({ heightM, rings: poly.map((ring) => ring.map(toTile)) });
  }
  // Tall OSM buildings fill skyline gaps (e.g. the Comcast towers are missing from the city data).
  const osm = JSON.parse(readFileSync(backdropOsmCachePath(city), 'utf8')) as OverpassResponse;
  let osmTall = 0;
  for (const e of osm.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 4) continue;
    const t = e.tags ?? {};
    const heightM =
      parseFloat(t.height ?? '') || (parseFloat(t['building:levels'] ?? '') || 0) * b.osmLevelM;
    if (!(heightM >= bd.osmMinHeightM)) continue;
    fps.push({ heightM, rings: [e.geometry.map((p) => toTile([p.lon, p.lat]))] });
    osmTall++;
  }

  // Backdrop extent in tile units (the bbox corners, rotated into the level frame).
  const corners = [
    [bd.bbox.west, bd.bbox.south],
    [bd.bbox.west, bd.bbox.north],
    [bd.bbox.east, bd.bbox.south],
    [bd.bbox.east, bd.bbox.north],
  ].map(toTile);
  const extent = {
    u0: Math.min(...corners.map((c) => c.u)),
    v0: Math.min(...corners.map((c) => c.v)),
    u1: Math.max(...corners.map((c) => c.u)),
    v1: Math.max(...corners.map((c) => c.v)),
  };
  const ring = bd.nearRingM / cfg.tileM;
  const levelRect = { u0: 0, v0: 0, u1: level.width, v1: level.height };
  const nearRect = { u0: -ring, v0: -ring, u1: level.width + ring, v1: level.height + ring };

  const near = layer(fps, nearRect, levelRect, bd.nearCellM / cfg.tileM, bd.minCoverage);
  const far = layer(fps, extent, nearRect, bd.farCellM / cfg.tileM, bd.minCoverage);
  console.log(
    `[map:build] backdrop: ${fps.length} footprints (${osmTall} tall from OSM) → ` +
      `near ${near.width}×${near.height} cells (${countBuilt(near)} built), ` +
      `far ${far.width}×${far.height} cells (${countBuilt(far)} built)`,
  );
  return { version: 0, layers: [near, far] };
}

type Rect = { u0: number; v0: number; u1: number; v1: number };

/** One height grid over `rect` with square cells `cellTiles` wide, empty inside `hole`. */
function layer(
  fps: Footprint[],
  rect: Rect,
  hole: Rect,
  cellTiles: number,
  minCoverage: number,
): BackdropLayer {
  const u0 = Math.floor(rect.u0 / cellTiles) * cellTiles;
  const v0 = Math.floor(rect.v0 / cellTiles) * cellTiles;
  const width = Math.ceil((rect.u1 - u0) / cellTiles);
  const height = Math.ceil((rect.v1 - v0) / cellTiles);
  const inCells = fps.map((fp) => ({
    heightM: fp.heightM,
    rings: fp.rings.map((r) =>
      r.map((p) => ({ u: (p.u - u0) / cellTiles, v: (p.v - v0) / cellTiles })),
    ),
  }));
  const { heights } = rasterizeHeights(width, height, inCells, minCoverage);
  const rows: string[] = [];
  for (let cy = 0; cy < height; cy++) {
    const row: number[] = [];
    for (let cx = 0; cx < width; cx++) {
      const cu = u0 + (cx + 0.5) * cellTiles;
      const cv = v0 + (cy + 0.5) * cellTiles;
      const inHole = cu > hole.u0 && cu < hole.u1 && cv > hole.v0 && cv < hole.v1;
      row.push(inHole ? 0 : Math.round(heights[cy * width + cx]!));
    }
    rows.push(row.join(','));
  }
  return { u0, v0, cellTiles, width, height, rows };
}

function countBuilt(l: BackdropLayer): number {
  return l.rows.reduce((n, r) => n + r.split(',').filter((h) => h !== '0').length, 0);
}

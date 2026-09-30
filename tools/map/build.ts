/**
 * Map pipeline v1 (Pass 6): `npm run map:build -- <city>`.
 *
 *   cached Overpass JSON → level frame (project, rotate onto the street grid, cut at the boundary
 *   streets; level.ts)
 *   → building footprints and heights (footprints.ts) → streets painted into the gaps between
 *   buildings → goal block → stations (stations.ts) → street labels (labels.ts)
 *   → backdrop grids beyond the level (backdrop.ts)
 *   → public/cities/<city>/city.json (sim) + buildings.json + backdrop.json (render only)
 *
 * Street graph, barricade slots, roof pads and corners are derived at load time by src/sim/slots.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BackdropFileV0, BuildingsFileV1, CityFileV0 } from '../../src/sim/cityFile';
import { bakeBackdrop } from './backdrop';
import { cachePath, loadConfig, type OverpassResponse } from './config';
import {
  fetchBackdrop,
  fetchBuildings,
  fetchCity,
  fetchOsmBuildings,
  fetchOsmParts,
} from './fetch';
import {
  buildingsFile,
  drawnFootprints,
  heightRows,
  loadFootprints,
  rasterizeBuildings,
  simplifySolids,
} from './footprints';
import { streetLabels } from './labels';
import { buildLevel } from './level';
import {
  fixDiagonalGaps,
  Grid,
  markGoalBlock,
  paintStreetBetweenBuildings,
  T_STREET,
} from './raster';
import { loadOsmParts, resolveSolids, surfaceHeights } from './parts';
import { stationSpawns } from './stations';

/** A landmark block larger than this means the ring road around it didn't rasterize closed. */
const MAX_GOAL_TILES = 40 * 40;

export interface BuildResult {
  city: CityFileV0;
  buildings: BuildingsFileV1;
  backdrop: BackdropFileV0;
}

export async function buildCity(city: string): Promise<BuildResult> {
  const cfg = loadConfig(city);
  await fetchCity(city);
  await fetchBuildings(city);
  await fetchOsmBuildings(city);
  await fetchOsmParts(city);
  await fetchBackdrop(city);
  const osm = JSON.parse(readFileSync(cachePath(city), 'utf8')) as OverpassResponse;

  const level = buildLevel(cfg, osm);
  const { width, height } = level;

  // Buildings first: streets are painted into the gaps between them (D026).
  const fps = loadFootprints(city, cfg, level);
  const raster = rasterizeBuildings(level, fps, cfg);
  const blocked = (i: number) => raster.coverage[i]! >= cfg.streetBlockedCoverage;

  const grid = new Grid(width, height);
  level.ways.forEach((w, i) => {
    const halfM = cfg.streetHalfWidthM[w.tags.highway!] ?? cfg.streetHalfWidthM.default ?? 6;
    paintStreetBetweenBuildings(grid, level.uvLines[i]!, halfM / cfg.tileM, blocked);
  });
  const diagonalFixes = fixDiagonalGaps(grid);

  // Goal = the block containing the landmark's coordinate (D012). The goal is the level's origin.
  const g = level.toUV({ x: 0, y: 0 });
  const goalTx = Math.floor(g.u);
  const goalTy = Math.floor(g.v);
  const goalTiles = markGoalBlock(grid, goalTx, goalTy, MAX_GOAL_TILES);

  const spawns = stationSpawns(osm, level, grid, cfg);
  const labels = streetLabels(level, grid);
  // Drawn shapes (D046): footprints, or their OSM building parts; the landmark from its OSM parts.
  const resolved = resolveSolids(
    drawnFootprints(level, fps, grid, cfg),
    loadOsmParts(city, cfg, level),
    grid,
    cfg,
  );
  const solids = simplifySolids(resolved.solids, cfg);
  const landmark = simplifySolids(resolved.landmark, cfg);
  // The sim keeps the raster heights; towers are drawn on the roofs as drawn (render only).
  const surface = surfaceHeights(grid, solids, raster.heights, cfg.tileM);
  const heights = heightRows(grid, raster.heights);
  const buildings = buildingsFile(level, grid, solids, landmark, surface, cfg);
  const backdrop = bakeBackdrop(city, cfg, level);

  const streetTiles = grid.cells.filter((c) => c === T_STREET).length;
  console.log(
    `[map:build] ${city}: grid rotated ${level.angleDeg.toFixed(2)}°, ${width}×${height} tiles ` +
      `(${((width * cfg.tileM) / 1000).toFixed(2)} × ${((height * cfg.tileM) / 1000).toFixed(2)} km), ` +
      `${((100 * streetTiles) / grid.cells.length).toFixed(0)}% street (${diagonalFixes} diagonal fixes), ` +
      `goal ${goalTiles} tiles, ${spawns.length} spawns, ${labels.length} labels, ` +
      `${fps.city.length} city + ${fps.osm.length} OSM footprints → ${heights.built} built tiles ` +
      `(${raster.fromOsm} from OSM, tallest ${heights.tallestM} m), ${buildings.solids.length} drawn solids ` +
      `(${resolved.parts} OSM parts replace ${resolved.replaced} footprints), landmark ${landmark.length} solids`,
  );
  for (const s of spawns)
    console.log(`  spawn ${s.name.padEnd(22)} (${s.tx}, ${s.ty})  ${s.goalDistM} m`);

  return {
    city: {
      version: 0,
      meta: {
        city: cfg.name,
        title: cfg.title,
        tileM: cfg.tileM,
        width,
        height,
        gridRotationDeg: Number(level.angleDeg.toFixed(3)),
        attribution: '© OpenStreetMap contributors',
        osmTimestamp: osm.osm3s.timestamp_osm_base,
      },
      rows: grid.rows(),
      heightRows: heights.rows,
      goal: { name: cfg.goal.name, tx: goalTx, ty: goalTy },
      spawns,
      labels,
    },
    buildings,
    backdrop,
  };
}

const name = process.argv[2] ?? 'philly';
const t0 = performance.now();
const result = await buildCity(name);
const outDir = join('public', 'cities', name);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'city.json'), JSON.stringify(result.city, null, 1) + '\n');
writeFileSync(join(outDir, 'buildings.json'), JSON.stringify(result.buildings) + '\n');
writeFileSync(join(outDir, 'backdrop.json'), JSON.stringify(result.backdrop) + '\n');
console.log(
  `[map:build] wrote ${outDir}/city.json + buildings.json + backdrop.json in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
);

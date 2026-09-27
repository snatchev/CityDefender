/**
 * Map pipeline v0 (Pass 1, crude on purpose; heights added early, D019): `npm run map:build -- <city>`.
 *
 *   cached Overpass JSON → level frame (project, rotate onto the street grid, cut at the boundary
 *   streets; level.ts) → rasterize street centerlines → mark the goal block → snap stations to
 *   streets (stations.ts) → street labels (labels.ts) → per-tile building heights (heights.ts)
 *   → public/cities/<city>/city.json
 *
 * Pass 6 adds footprint meshes, street widths from lanes, slots and the street graph. See docs/IMPLEMENTATION_PLAN.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CityFileV0 } from '../../src/sim/cityFile';
import { cachePath, loadConfig, type OverpassResponse } from './config';
import { fetchBuildings, fetchCity, fetchOsmBuildings } from './fetch';
import { tileHeights } from './heights';
import { streetLabels } from './labels';
import { buildLevel } from './level';
import { Grid, markGoalBlock, paintStreet, T_STREET } from './raster';
import { stationSpawns } from './stations';

/** A landmark block larger than this means the ring road around it didn't rasterize closed. */
const MAX_GOAL_TILES = 40 * 40;

export async function buildCity(city: string): Promise<CityFileV0> {
  const cfg = loadConfig(city);
  await fetchCity(city);
  await fetchBuildings(city);
  await fetchOsmBuildings(city);
  const osm = JSON.parse(readFileSync(cachePath(city), 'utf8')) as OverpassResponse;

  const level = buildLevel(cfg, osm);
  const { width, height } = level;

  const grid = new Grid(width, height);
  level.ways.forEach((w, i) => {
    const hw = w.tags.highway!;
    paintStreet(
      grid,
      level.uvLines[i]!,
      cfg.streetWidthTiles[hw] ?? cfg.streetWidthTiles.default ?? 2,
    );
  });

  // Goal = the block containing the landmark's coordinate (D012). The goal is the level's origin.
  const g = level.toUV({ x: 0, y: 0 });
  const goalTx = Math.floor(g.u);
  const goalTy = Math.floor(g.v);
  const goalTiles = markGoalBlock(grid, goalTx, goalTy, MAX_GOAL_TILES);

  const spawns = stationSpawns(osm, level, grid, cfg);
  const labels = streetLabels(level, grid);
  const heights = tileHeights(city, cfg, level, grid);

  const streetTiles = grid.cells.filter((c) => c === T_STREET).length;
  console.log(
    `[map:build] ${city}: grid rotated ${level.angleDeg.toFixed(2)}°, ${width}×${height} tiles ` +
      `(${((width * cfg.tileM) / 1000).toFixed(2)} × ${((height * cfg.tileM) / 1000).toFixed(2)} km), ` +
      `${((100 * streetTiles) / grid.cells.length).toFixed(0)}% street, goal ${goalTiles} tiles, ` +
      `${spawns.length} spawns, ${labels.length} labels, ` +
      `${heights.cityFootprints} city + ${heights.osmFootprints} OSM footprints → ${heights.builtTiles} built tiles ` +
      `(${heights.fromOsm} from OSM, tallest ${heights.tallestM} m)`,
  );
  for (const s of spawns)
    console.log(`  spawn ${s.name.padEnd(22)} (${s.tx}, ${s.ty})  ${s.goalDistM} m`);

  return {
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
    heightRows: heights.heightRows,
    goal: { name: cfg.goal.name, tx: goalTx, ty: goalTy },
    spawns,
    labels,
  };
}

const city = process.argv[2] ?? 'philly';
const file = await buildCity(city);
const outDir = join('public', 'cities', city);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'city.json'), JSON.stringify(file, null, 1) + '\n');
console.log(`[map:build] wrote ${join(outDir, 'city.json')}`);

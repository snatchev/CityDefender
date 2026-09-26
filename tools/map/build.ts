/**
 * Map pipeline v0 (Pass 1, crude on purpose): `npm run map:build -- <city>`.
 *
 *   cached Overpass JSON → project to metres around the goal → rotate so the street grid is axis-aligned
 *   → cut the level at the boundary streets → rasterize centerlines onto tiles → mark the goal block
 *   → snap stations to streets → public/cities/<city>/city.json
 *
 * Pass 6 replaces the uniform buildings with real footprints and heights. See docs/IMPLEMENTATION_PLAN.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CityFileV0, CityLabel, CitySpawn } from '../../src/sim/cityFile';
import { cachePath, loadConfig, type OverpassElement, type OverpassResponse } from './config';
import { fetchCity } from './fetch';
import { dominantGridAngle, project, rotate, type Pt } from './geo';
import {
  Grid,
  markGoalBlock,
  nearestStreet,
  paintStreet,
  samplePolyline,
  T_GOAL,
  T_STREET,
  type UV,
} from './raster';

/** A landmark block larger than this means the ring road around it didn't rasterize closed. */
const MAX_GOAL_TILES = 40 * 40;
/** Stations closer than this to an already-kept one are the same place (e.g. 8th St MFL + PATCO). */
const STATION_MERGE_M = 60;
/** Streets shorter than this (in tiles, inside the level) get no label. */
const LABEL_MIN_SPAN = 12;
/** Roughly one label per this many tiles of street. */
const LABEL_SPACING = 50;

const stripDirection = (name: string) => name.replace(/^(North|South|East|West) /, '');
const shortName = (name: string) =>
  stripDirection(name)
    .replace(/ Street$/, ' St')
    .replace(/ Avenue$/, ' Ave')
    .replace(/ Boulevard$/, ' Blvd');

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export async function buildCity(city: string): Promise<CityFileV0> {
  const cfg = loadConfig(city);
  await fetchCity(city);
  const osm = JSON.parse(readFileSync(cachePath(city), 'utf8')) as OverpassResponse;
  const origin = { lat: cfg.goal.lat, lon: cfg.goal.lon };

  // 1. Project streets to metres around the goal, then rotate the grid onto the axes.
  const ways = osm.elements.filter(
    (e): e is OverpassElement & { geometry: { lat: number; lon: number }[] } =>
      e.type === 'way' && !!e.geometry && !!e.tags?.highway,
  );
  const raw = ways.map((w) => w.geometry.map((p) => project(p, origin)));
  const angle = dominantGridAngle(raw);
  const lines: Pt[][] = raw.map((l) => l.map((p) => rotate(p, -angle)));

  // 2. Level rectangle from the boundary streets (median position of each street's points).
  const streetCoord = (name: string, axis: 'x' | 'y') => {
    const pts = ways.flatMap((w, i) =>
      stripDirection(w.tags!.name ?? '') === name ? lines[i]! : [],
    );
    if (pts.length === 0) throw new Error(`boundary street "${name}" not found in OSM data`);
    return median(pts.map((p) => p[axis]));
  };
  const m = cfg.bounds.marginM;
  const xmin = streetCoord(cfg.bounds.west, 'x') - m;
  const xmax = streetCoord(cfg.bounds.east, 'x') + m;
  const ymin = streetCoord(cfg.bounds.south, 'y') - m;
  const ymax = streetCoord(cfg.bounds.north, 'y') + m;
  const width = Math.ceil((xmax - xmin) / cfg.tileM);
  const height = Math.ceil((ymax - ymin) / cfg.tileM);
  const toUV = (p: Pt): UV => ({ u: (p.x - xmin) / cfg.tileM, v: (ymax - p.y) / cfg.tileM });
  const uvLines = lines.map((l) => l.map(toUV));

  // 3. Rasterize streets.
  const grid = new Grid(width, height);
  ways.forEach((w, i) => {
    const hw = w.tags!.highway!;
    paintStreet(grid, uvLines[i]!, cfg.streetWidthTiles[hw] ?? cfg.streetWidthTiles.default ?? 2);
  });

  // 4. Goal = the block containing the landmark's coordinate.
  const g = toUV({ x: 0, y: 0 });
  const goalTx = Math.floor(g.u);
  const goalTy = Math.floor(g.v);
  const goalTiles = markGoalBlock(grid, goalTx, goalTy, MAX_GOAL_TILES);

  // 5. Stations → spawns: drop ones outside the level or under the landmark, merge duplicates, snap to streets.
  const kept: (CitySpawn & { p: Pt })[] = [];
  for (const e of osm.elements) {
    const t = e.tags ?? {};
    const ll = e.center ?? (e.lat !== undefined ? { lat: e.lat, lon: e.lon! } : null);
    if (!ll || !t.name || !/^(station|halt)$/.test(t.railway ?? '')) continue;
    const p = rotate(project(ll, origin), -angle);
    const { u, v } = toUV(p);
    const tx = Math.floor(u);
    const ty = Math.floor(v);
    if (!grid.inBounds(tx, ty) || grid.get(tx, ty) === T_GOAL) continue;
    if (kept.some((k) => Math.hypot(k.p.x - p.x, k.p.y - p.y) < STATION_MERGE_M)) continue;
    const snap = nearestStreet(grid, tx, ty, cfg.stationSnapMaxTiles);
    if (!snap) {
      console.warn(
        `[map:build] station "${t.name}" has no street within ${cfg.stationSnapMaxTiles} tiles; skipped`,
      );
      continue;
    }
    kept.push({
      name: t.name,
      tx: snap[0],
      ty: snap[1],
      goalDistM: Math.round(Math.hypot(p.x, p.y)),
      p,
    });
  }
  const spawns: CitySpawn[] = kept
    .sort((a, b) => b.goalDistM - a.goalDistM)
    .map(({ name, tx, ty, goalDistM }) => ({ name, tx, ty, goalDistM }));

  // 6. Street labels, spread along each named street inside the level.
  const byName = new Map<string, { pts: UV[]; vertical: number }>();
  ways.forEach((w, i) => {
    const name = w.tags!.name;
    if (!name) return;
    const key = shortName(name);
    const entry = byName.get(key) ?? { pts: [], vertical: 0 };
    const l = uvLines[i]!;
    for (let k = 1; k < l.length; k++) {
      const du = l[k]!.u - l[k - 1]!.u;
      const dv = l[k]!.v - l[k - 1]!.v;
      entry.vertical += Math.abs(dv) - Math.abs(du);
    }
    samplePolyline(l, 1, (p) => {
      if (grid.inBounds(Math.floor(p.u), Math.floor(p.v))) entry.pts.push(p);
    });
    byName.set(key, entry);
  });
  const labels: CityLabel[] = [];
  for (const [text, { pts, vertical }] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
    if (pts.length === 0) continue;
    const isVertical = vertical > 0;
    const along = (p: UV) => (isVertical ? p.v : p.u);
    pts.sort((a, b) => along(a) - along(b));
    const span = along(pts[pts.length - 1]!) - along(pts[0]!);
    if (span < LABEL_MIN_SPAN) continue;
    const n = Math.max(1, Math.floor(span / LABEL_SPACING));
    for (let k = 0; k < n; k++) {
      const p = pts[Math.floor(((k + 0.5) / n) * pts.length)]!;
      const tx = Math.floor(p.u);
      const ty = Math.floor(p.v);
      if (grid.get(tx, ty) === T_STREET) labels.push({ text, tx, ty, vertical: isVertical });
    }
  }

  const rows = grid.rows();
  const streetTiles = grid.cells.filter((c) => c === T_STREET).length;
  console.log(
    `[map:build] ${city}: grid rotated ${angle.toFixed(2)}°, ${width}×${height} tiles ` +
      `(${((width * cfg.tileM) / 1000).toFixed(2)} × ${((height * cfg.tileM) / 1000).toFixed(2)} km), ` +
      `${((100 * streetTiles) / grid.cells.length).toFixed(0)}% street, goal ${goalTiles} tiles, ` +
      `${spawns.length} spawns, ${labels.length} labels`,
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
      gridRotationDeg: Number(angle.toFixed(3)),
      buildingHeightM: cfg.buildingHeightM,
      attribution: '© OpenStreetMap contributors',
      osmTimestamp: osm.osm3s.timestamp_osm_base,
    },
    rows,
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

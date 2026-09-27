import type { CitySpawn } from '../../src/sim/cityFile';
import type { CityConfig, OverpassResponse } from './config';
import type { Pt } from './geo';
import type { Level } from './level';
import { nearestStreet, T_GOAL, type Grid } from './raster';

/** Stations closer than this to an already-kept one are the same place (e.g. 8th St MFL + PATCO). */
const STATION_MERGE_M = 60;

/**
 * Stations → spawns: drop ones outside the level or under the landmark, merge duplicates, and snap
 * each to the nearest street tile. Ordered outermost (farthest from the goal) first.
 */
export function stationSpawns(
  osm: OverpassResponse,
  level: Level,
  grid: Grid,
  cfg: CityConfig,
): CitySpawn[] {
  const kept: (CitySpawn & { p: Pt })[] = [];
  for (const e of osm.elements) {
    const t = e.tags ?? {};
    const ll = e.center ?? (e.lat !== undefined ? { lat: e.lat, lon: e.lon! } : null);
    if (!ll || !t.name || !/^(station|halt)$/.test(t.railway ?? '')) continue;
    const p = level.toGrid(ll);
    const { u, v } = level.toUV(p);
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
  return kept
    .sort((a, b) => b.goalDistM - a.goalDistM)
    .map(({ name, tx, ty, goalDistM }) => ({ name, tx, ty, goalDistM }));
}

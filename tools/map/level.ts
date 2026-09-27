import type { CityConfig, OverpassElement, OverpassResponse } from './config';
import { dominantGridAngle, project, rotate, type LatLon, type Pt } from './geo';
import { stripDirection } from './names';
import type { UV } from './raster';

/** An OSM street way with its geometry (Overpass `out geom`). */
export type StreetWay = OverpassElement & {
  geometry: LatLon[];
  tags: Record<string, string>;
};

/**
 * The level's coordinate frame: lat/lon → metres around the goal → rotated onto the street grid →
 * tile units (u east, v south, row 0 = the north edge), cut at the configured boundary streets.
 */
export interface Level {
  origin: LatLon;
  /** The street grid's rotation in degrees (the map is rotated by minus this). */
  angleDeg: number;
  width: number;
  height: number;
  ways: StreetWay[];
  /** Each way's polyline in tile units, parallel to `ways`. */
  uvLines: UV[][];
  /** Lat/lon → rotated local metres (x east, y north on the rotated grid). */
  toGrid(p: LatLon): Pt;
  /** Rotated local metres → tile units. */
  toUV(p: Pt): UV;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export function buildLevel(cfg: CityConfig, osm: OverpassResponse): Level {
  const origin = { lat: cfg.goal.lat, lon: cfg.goal.lon };
  const ways = osm.elements.filter(
    (e): e is StreetWay => e.type === 'way' && !!e.geometry && !!e.tags?.highway,
  );

  // Project streets to metres around the goal, then rotate the grid onto the axes.
  const raw = ways.map((w) => w.geometry.map((p) => project(p, origin)));
  const angleDeg = dominantGridAngle(raw);
  const lines: Pt[][] = raw.map((l) => l.map((p) => rotate(p, -angleDeg)));

  // Level rectangle from the boundary streets (median position of each street's points).
  const streetCoord = (name: string, axis: 'x' | 'y') => {
    const pts = ways.flatMap((w, i) =>
      stripDirection(w.tags.name ?? '') === name ? lines[i]! : [],
    );
    if (pts.length === 0) throw new Error(`boundary street "${name}" not found in OSM data`);
    return median(pts.map((p) => p[axis]));
  };
  const m = cfg.bounds.marginM;
  const xmin = streetCoord(cfg.bounds.west, 'x') - m;
  const xmax = streetCoord(cfg.bounds.east, 'x') + m;
  const ymin = streetCoord(cfg.bounds.south, 'y') - m;
  const ymax = streetCoord(cfg.bounds.north, 'y') + m;
  const toUV = (p: Pt): UV => ({ u: (p.x - xmin) / cfg.tileM, v: (ymax - p.y) / cfg.tileM });

  return {
    origin,
    angleDeg,
    width: Math.ceil((xmax - xmin) / cfg.tileM),
    height: Math.ceil((ymax - ymin) / cfg.tileM),
    ways,
    uvLines: lines.map((l) => l.map(toUV)),
    toGrid: (p) => rotate(project(p, origin), -angleDeg),
    toUV,
  };
}

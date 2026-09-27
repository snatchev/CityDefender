import type { CityLabel } from '../../src/sim/cityFile';
import type { Level } from './level';
import { shortName } from './names';
import { samplePolyline, T_STREET, type Grid, type UV } from './raster';

/** Streets shorter than this (in tiles, inside the level) get no label. */
const LABEL_MIN_SPAN = 12;
/** Roughly one label per this many tiles of street. */
const LABEL_SPACING = 50;

/** Street labels, spread along each named street inside the level, placed on street tiles. */
export function streetLabels(level: Level, grid: Grid): CityLabel[] {
  const byName = new Map<string, { pts: UV[]; vertical: number }>();
  level.ways.forEach((w, i) => {
    const name = w.tags.name;
    if (!name) return;
    const key = shortName(name);
    const entry = byName.get(key) ?? { pts: [], vertical: 0 };
    const l = level.uvLines[i]!;
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
  return labels;
}

/**
 * Roof shapes as height fields (Pass 10a, D046). A roof is the lower envelope of a few planes over
 * the footprint: z(p) = min_i(a_i·x + b_i·y + c_i), the rise above the eaves. A gable is two planes,
 * a hip or pyramid four, a mansard five (four steep sides and a flat top); domes, cones and barrel
 * roofs are faceted with tangent planes (low-poly on purpose). Every plane is ≥ 0 inside the
 * footprint, so walls simply rise to the envelope along the outline.
 *
 * Pure maths with no three.js: the map pipeline samples it for tile heights (towers stand on the
 * drawn roof) and the renderer builds meshes from it, so both agree. Points are metres in any
 * right-angled frame (the pipeline's tile frame × tile size, or the world's x/z).
 */

import type { RoofShape } from '../sim/cityFile';

export type P2 = readonly [number, number];

/** z = a·x + b·y + c (metres above the eaves). */
export interface Plane {
  a: number;
  b: number;
  c: number;
}

export type { RoofShape };

/** OSM `roof:shape` values we draw as one of ours; anything unknown is drawn flat. */
const SHAPE_ALIASES: Record<string, RoofShape> = {
  flat: 'flat',
  skillion: 'skillion',
  lean_to: 'skillion',
  gabled: 'gabled',
  saltbox: 'gabled',
  hipped: 'hipped',
  half_hipped: 'hipped',
  side_hipped: 'hipped',
  quadruple_saltbox: 'hipped',
  'quadruple:saltbox': 'hipped',
  pyramidal: 'pyramidal',
  mansard: 'mansard',
  gambrel: 'mansard',
  dome: 'dome',
  onion: 'onion',
  cone: 'cone',
  round: 'round',
};

export function roofShapeOf(tag: string | undefined): RoofShape {
  return (tag && SHAPE_ALIASES[tag.trim().toLowerCase()]) || 'flat';
}

/** Default rise when OSM gives no `roof:height` / `roof:levels`, from the footprint's size. */
const PITCH_TAN = Math.tan((30 * Math.PI) / 180); // gables and hips: 30° pitch on the short side
const PYRAMID_RISE_PER_HALF_W = 1.0; // 45°
const MANSARD_RISE_M = 4;
/** A mansard's steep sides reach full rise within this share of the half-width. */
const MANSARD_STEEP_SHARE = 0.3;
const DOME_RISE_PER_R = 0.8;
const ONION_RISE_PER_R = 1.3;
const CONE_RISE_PER_R = 1.6;
const ROUND_RISE_PER_HALF_W = 0.5;
/** Pitched roofs on big footprints (halls, stations) would get absurd; cap the default. */
const MAX_DEFAULT_RISE_M = 14;
/** Tangent-plane facets for curved roofs. */
const CURVE_SECTORS = 16;
const DOME_LATITUDES_DEG = [10, 30, 50, 70];
const ROUND_LATITUDES_DEG = [12, 35, 58, 80];

/** The footprint's minimum-area bounding rectangle: centre, long axis, half-sizes (halfL ≥ halfW). */
export interface RoofBox {
  cx: number;
  cy: number;
  /** Unit vector along the long side. */
  ux: number;
  uy: number;
  halfL: number;
  halfW: number;
  /** Farthest outline vertex from the centre (curved roofs). */
  radius: number;
}

export function roofBox(ring: readonly P2[]): RoofBox {
  const hull = convexHull(ring);
  let best: RoofBox | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const [x0, y0] = hull[i]!;
    const [x1, y1] = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-9) continue;
    const ex = (x1 - x0) / len;
    const ey = (y1 - y0) / len;
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const [x, y] of hull) {
      const a = x * ex + y * ey;
      const b = -x * ey + y * ex;
      minA = Math.min(minA, a);
      maxA = Math.max(maxA, a);
      minB = Math.min(minB, b);
      maxB = Math.max(maxB, b);
    }
    const area = (maxA - minA) * (maxB - minB);
    if (area >= bestArea) continue;
    bestArea = area;
    const ma = (minA + maxA) / 2;
    const mb = (minB + maxB) / 2;
    const cx = ma * ex - mb * ey;
    const cy = ma * ey + mb * ex;
    const [ha, hb] = [(maxA - minA) / 2, (maxB - minB) / 2];
    best =
      ha >= hb
        ? { cx, cy, ux: ex, uy: ey, halfL: ha, halfW: hb, radius: 0 }
        : { cx, cy, ux: -ey, uy: ex, halfL: hb, halfW: ha, radius: 0 };
  }
  if (!best) {
    const [x, y] = ring[0] ?? [0, 0];
    best = { cx: x, cy: y, ux: 1, uy: 0, halfL: 0, halfW: 0, radius: 0 };
  }
  for (const [x, y] of ring)
    best.radius = Math.max(best.radius, Math.hypot(x - best.cx, y - best.cy));
  return best;
}

/** A sensible rise (m) for a roof shape on this footprint when the data has none. */
export function defaultRiseM(shape: RoofShape, box: RoofBox): number {
  const w = box.halfW;
  const r = box.radius;
  const rise = {
    flat: 0,
    skillion: w * PITCH_TAN,
    gabled: w * PITCH_TAN,
    hipped: w * PITCH_TAN,
    pyramidal: w * PYRAMID_RISE_PER_HALF_W,
    mansard: Math.min(MANSARD_RISE_M, w),
    dome: r * DOME_RISE_PER_R,
    onion: r * ONION_RISE_PER_R,
    cone: r * CONE_RISE_PER_R,
    round: w * ROUND_RISE_PER_HALF_W,
  }[shape];
  return Math.min(MAX_DEFAULT_RISE_M, rise);
}

/**
 * The planes whose lower envelope is the roof. `across` turns a ridge to run along the short side
 * (OSM `roof:orientation=across`). Flat roofs (and a rise of 0) have no planes.
 */
export function roofPlanes(shape: RoofShape, box: RoofBox, riseM: number, across = false): Plane[] {
  if (shape === 'flat' || riseM <= 0 || box.halfW <= 0) return [];
  const { cx, cy } = box;
  // Ridge axis (r) and the axis across it (s), with their half-extents.
  let [rx, ry, halfR, halfS] = [box.ux, box.uy, box.halfL, box.halfW];
  if (across) [rx, ry, halfR, halfS] = [-box.uy, box.ux, box.halfW, box.halfL];
  const [sx, sy] = [-ry, rx];
  /** Plane with height `c0` at the centre rising `slope` per metre along direction (dx, dy). */
  const plane = (dx: number, dy: number, slope: number, c0: number): Plane => ({
    a: dx * slope,
    b: dy * slope,
    c: c0 - (dx * cx + dy * cy) * slope,
  });
  const sideSlope = riseM / halfS;
  switch (shape) {
    case 'skillion':
      return [plane(sx, sy, riseM / (2 * halfS), riseM / 2)];
    case 'gabled':
      return [plane(sx, sy, -sideSlope, riseM), plane(-sx, -sy, -sideSlope, riseM)];
    case 'hipped': {
      // Hip ends at the same pitch as the sides: the ridge is 2·(halfR − halfS) long.
      const endC = sideSlope * halfR;
      return [
        plane(sx, sy, -sideSlope, riseM),
        plane(-sx, -sy, -sideSlope, riseM),
        plane(rx, ry, -sideSlope, endC),
        plane(-rx, -ry, -sideSlope, endC),
      ];
    }
    case 'pyramidal': {
      const endSlope = riseM / halfR;
      return [
        plane(sx, sy, -sideSlope, riseM),
        plane(-sx, -sy, -sideSlope, riseM),
        plane(rx, ry, -endSlope, riseM),
        plane(-rx, -ry, -endSlope, riseM),
      ];
    }
    case 'mansard': {
      const steep = riseM / (MANSARD_STEEP_SHARE * halfS);
      return [
        plane(sx, sy, -steep, steep * halfS),
        plane(-sx, -sy, -steep, steep * halfS),
        plane(rx, ry, -steep, steep * halfR),
        plane(-rx, -ry, -steep, steep * halfR),
        { a: 0, b: 0, c: riseM },
      ];
    }
    case 'cone': {
      const r = box.radius;
      const out: Plane[] = [];
      for (let k = 0; k < CURVE_SECTORS; k++) {
        const t = (2 * Math.PI * k) / CURVE_SECTORS;
        out.push(plane(Math.cos(t), Math.sin(t), -riseM / r, riseM));
      }
      return out;
    }
    case 'dome':
    case 'onion': {
      // Tangent planes of z = rise·√(1 − (d/r)²) at a few latitudes: z = rise·(1 − cosφ·d̂·q)/sinφ.
      const r = box.radius;
      const out: Plane[] = [{ a: 0, b: 0, c: riseM }];
      DOME_LATITUDES_DEG.forEach((latDeg, ring) => {
        const phi = (latDeg * Math.PI) / 180;
        const offset = ring % 2 === 0 ? 0 : 0.5; // stagger rings so facets interlock
        for (let k = 0; k < CURVE_SECTORS; k++) {
          const t = (2 * Math.PI * (k + offset)) / CURVE_SECTORS;
          out.push(
            plane(
              Math.cos(t),
              Math.sin(t),
              (-riseM * Math.cos(phi)) / (r * Math.sin(phi)),
              riseM / Math.sin(phi),
            ),
          );
        }
      });
      return out;
    }
    case 'round': {
      // Barrel vault across the short side: tangent planes of z = rise·√(1 − (s/halfS)²).
      const out: Plane[] = [{ a: 0, b: 0, c: riseM }];
      for (const latDeg of ROUND_LATITUDES_DEG) {
        const phi = (latDeg * Math.PI) / 180;
        const slope = (-riseM * Math.cos(phi)) / (halfS * Math.sin(phi));
        const c0 = riseM / Math.sin(phi);
        out.push(plane(sx, sy, slope, c0), plane(-sx, -sy, slope, c0));
      }
      return out;
    }
  }
}

export function planeZ(p: Plane, x: number, y: number): number {
  return p.a * x + p.b * y + p.c;
}

/** The roof's rise above the eaves at (x, y): the lower envelope of its planes (0 for flat). */
export function roofZ(planes: readonly Plane[], x: number, y: number): number {
  if (planes.length === 0) return 0;
  let z = Infinity;
  for (const p of planes) z = Math.min(z, planeZ(p, x, y));
  return Math.max(0, z);
}

/**
 * Where the envelope changes plane along the edge p → q, as parameters in (0, 1), sorted. Walls
 * split there so their tops follow the roof (gable ends, hip corners).
 */
export function edgeBreaks(planes: readonly Plane[], p: P2, q: P2): number[] {
  if (planes.length < 2) return [];
  const lines = planes.map((pl) => {
    const z0 = planeZ(pl, p[0], p[1]);
    return { z0, dz: planeZ(pl, q[0], q[1]) - z0 };
  });
  const envelope = (t: number) => Math.min(...lines.map((l) => l.z0 + l.dz * t));
  const out: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const d = lines[i]!.dz - lines[j]!.dz;
      if (Math.abs(d) < 1e-12) continue;
      const t = (lines[j]!.z0 - lines[i]!.z0) / d;
      if (t <= 1e-6 || t >= 1 - 1e-6) continue;
      // Only crossings on the envelope matter.
      if (Math.abs(lines[i]!.z0 + lines[i]!.dz * t - envelope(t)) < 1e-6) out.push(t);
    }
  }
  return [...new Set(out.map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b);
}

/**
 * The footprint cut into the pieces where each plane is the lowest (one flat facet each). A piece
 * may come back as a polygon with zero-width bridges where a concave outline crosses the cut;
 * triangulating it still gives the right surface.
 */
export function roofFacets(
  planes: readonly Plane[],
  outline: readonly P2[],
): { plane: Plane; poly: P2[] }[] {
  if (planes.length === 0) return [{ plane: { a: 0, b: 0, c: 0 }, poly: [...outline] }];
  const out: { plane: Plane; poly: P2[] }[] = [];
  planes.forEach((pi, i) => {
    let poly: P2[] = [...outline];
    for (let j = 0; j < planes.length && poly.length >= 3; j++) {
      if (j === i) continue;
      const pj = planes[j]!;
      // Keep where plane i is at or below plane j: (pi − pj)(x, y) ≤ 0.
      poly = clipHalfPlane(poly, pi.a - pj.a, pi.b - pj.b, pi.c - pj.c);
    }
    if (poly.length >= 3 && Math.abs(polygonArea(poly)) > 1e-6) out.push({ plane: pi, poly });
  });
  return out;
}

/** Sutherland–Hodgman against a·x + b·y + c ≤ 0. */
function clipHalfPlane(poly: readonly P2[], a: number, b: number, c: number): P2[] {
  const out: P2[] = [];
  const f = (p: P2) => a * p[0] + b * p[1] + c;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const fp = f(p);
    const fq = f(q);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Signed area (counter-clockwise positive in a y-up frame). */
export function polygonArea(poly: readonly P2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    a += poly[j]![0] * poly[i]![1] - poly[i]![0] * poly[j]![1];
  return a / 2;
}

/** Even–odd point in polygon (with holes: pass every ring). */
export function insideRings(rings: readonly (readonly P2[])[], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]!;
      const [xj, yj] = r[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function convexHull(pts: readonly P2[]): P2[] {
  const s = [...pts].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (s.length < 3) return s;
  const cross = (o: P2, a: P2, b: P2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

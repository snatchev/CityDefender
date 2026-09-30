/**
 * Overlapping drawn shapes (D048). Footprints, OSM parts and city data overlap in places (a part at
 * its footprint's height, parts stacked on parts, duplicate outlines). Where they do, two roofs lie
 * in one plane and two facades on one wall, and the GPU can't tell which is in front: z-fighting,
 * which the per-building colours and windows make flicker.
 *
 * Fix: where a shape is fully covered by another (at least as tall, starting no higher), cut the
 * covered area out of it, so every spot is drawn once. The cut edge becomes a wall facing into the
 * taller shape, hidden inside it. Ties go to the shape listed first.
 */
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { Solid } from './parts';
import type { UV } from './raster';

/** Heights within this are the same roof. */
const SAME_HEIGHT_M = 0.3;
/**
 * Covering shapes are grown by this before cutting: outlines from different sources disagree by a
 * few centimetres, which otherwise leaves a hair-thin strip of the lower shape standing just in
 * front of the taller one's wall (two facades in one plane again).
 */
const GROW_M = 0.15;
/** Pieces left over after cutting that are smaller than this, or thinner, are dropped. */
const MIN_PIECE_M2 = 4;
const MIN_PIECE_WIDTH_M = 0.8;

export interface OverlapResult {
  solids: Solid[];
  /** Shapes that lost area, and shapes that vanished (fully covered). */
  cut: number;
  dropped: number;
}

export function resolveOverlaps(solids: readonly Solid[], tileM: number): OverlapResult {
  const polys = solids.map((s) => toPolygon(s.rings));
  const boxes = solids.map((s) => bbox(s.rings[0]!));
  const top = (s: Solid) => s.eaveM + s.riseM;
  const out: Solid[] = [];
  let cut = 0;
  let dropped = 0;

  const grown = new Map<number, Polygon[]>();
  const grow = (j: number) => {
    if (!grown.has(j)) grown.set(j, grownPolygon(polys[j]!, GROW_M / tileM));
    return grown.get(j)!;
  };

  solids.forEach((s, i) => {
    const covers: Polygon[] = [];
    const pitched = s.roof !== 'flat';
    solids.forEach((t, j) => {
      if (j === i || !overlaps(boxes[i]!, boxes[j]!)) return;
      if (t.baseM > s.baseM + SAME_HEIGHT_M) return;
      // Walls above this whole shape cover it. So does an equal shape listed first (a duplicate):
      // for a flat roof the same height, for a pitched one the same eaves and at least as high.
      const above = t.eaveM - top(s) > SAME_HEIGHT_M;
      const equal = pitched
        ? Math.abs(t.eaveM - s.eaveM) <= SAME_HEIGHT_M && top(t) >= top(s) - SAME_HEIGHT_M
        : Math.abs(t.eaveM - top(s)) <= SAME_HEIGHT_M;
      if (above || (equal && j < i)) covers.push(...grow(j));
    });
    if (covers.length === 0) {
      out.push(s);
      return;
    }
    const rest = polygonClipping.difference(polys[i]!, ...covers);
    const pieces = keepPieces(rest, tileM);
    if (pieces.length === 0) {
      dropped++;
      return;
    }
    // A pitched roof is built over its own outline, so cutting would reshape it: keep it whole
    // unless it's covered completely (dropped above).
    if (s.roof !== 'flat') {
      out.push(s);
      return;
    }
    if (pieces.length !== 1 || area(pieces[0]!) < area(polys[i]!) - 1e-9) cut++;
    for (const p of pieces) out.push({ ...s, rings: fromPolygon(p) });
  });
  return { solids: out, cut, dropped };
}

/** Drop slivers: tiny pieces and thin strips left along a covering shape's edge. */
function keepPieces(mp: MultiPolygon, tileM: number): Polygon[] {
  return mp.filter((p) => {
    const a = area(p) * tileM * tileM;
    const perimeter = ringLength(p[0]!) * tileM;
    return a >= MIN_PIECE_M2 && (2 * a) / perimeter >= MIN_PIECE_WIDTH_M;
  });
}

/**
 * A polygon grown by about `d` (tile units): its union with copies shifted along both axes. Cheap
 * stand-in for a real offset, enough to swallow slivers narrower than `d`.
 */
function grownPolygon(p: Polygon, d: number): Polygon[] {
  const shift = (dx: number, dy: number): Polygon =>
    p.map((r) => r.map(([u, v]): [number, number] => [u + dx, v + dy]));
  return polygonClipping.union(p, shift(d, 0), shift(-d, 0), shift(0, d), shift(0, -d));
}

function toPolygon(rings: readonly UV[][]): Polygon {
  return rings.map((r) => {
    const pts = r.map((p): [number, number] => [p.u, p.v]);
    const [f, l] = [pts[0]!, pts[pts.length - 1]!];
    if (f[0] !== l[0] || f[1] !== l[1]) pts.push([f[0], f[1]]);
    return pts;
  });
}

function fromPolygon(p: Polygon): UV[][] {
  return p.map((r) => r.map(([u, v]) => ({ u, v })));
}

/** Area of a polygon with holes (tile units²). */
function area(p: Polygon): number {
  return p.reduce((s, r, k) => s + (k === 0 ? 1 : -1) * Math.abs(ringArea(r)), 0);
}

function ringArea(r: readonly [number, number][]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += r[j]![0] * r[i]![1] - r[i]![0] * r[j]![1];
  return a / 2;
}

function ringLength(r: readonly [number, number][]): number {
  let l = 0;
  for (let i = 1; i < r.length; i++)
    l += Math.hypot(r[i]![0] - r[i - 1]![0], r[i]![1] - r[i - 1]![1]);
  return l;
}

type Box = [number, number, number, number];

function bbox(r: readonly UV[]): Box {
  let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of r) {
    u0 = Math.min(u0, p.u);
    v0 = Math.min(v0, p.v);
    u1 = Math.max(u1, p.u);
    v1 = Math.max(v1, p.v);
  }
  return [u0, v0, u1, v1];
}

function overlaps(a: Box, b: Box): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/**
 * Which buildings stand between the camera and a point (D055)? Pure maths, no three.js, so it can
 * be unit-tested. Every building (an extruded footprint) is rasterised once into a grid of square
 * cells; a sight line is walked through that grid cell by cell, and a building in a cell blocks it
 * when the line passes through that cell between the building's base and top.
 */

export type XZ = readonly [number, number];

/** Something that can block the view: a footprint (outline, then any courtyards) and its heights. */
export interface OccluderShape {
  id: number;
  rings: readonly (readonly XZ[])[];
  base: number;
  top: number;
}

export interface OccluderGrid {
  /** World x/z of the grid's corner, cell size (m) and size in cells. */
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  /** Shapes per cell, as one list: cell k holds `shapes[start[k] .. start[k + 1])` (shape indices). */
  start: Int32Array;
  shapes: Int32Array;
  /** Per shape: its occluder id (several shapes can share one: parts of a building) and heights. */
  id: Int32Array;
  base: Float32Array;
  top: Float32Array;
  maxTop: number;
}

/** Rasterise shapes into a grid covering `bounds` ([x0, z0, x1, z1], m). */
export function buildOccluderGrid(
  shapes: readonly OccluderShape[],
  bounds: readonly [number, number, number, number],
  cell: number,
): OccluderGrid {
  const [x0, z0, x1, z1] = bounds;
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const id = Int32Array.from(shapes, (s) => s.id);
  const base = Float32Array.from(shapes, (s) => s.base);
  const top = Float32Array.from(shapes, (s) => s.top);
  let maxTop = 0;
  const pairs: number[] = []; // cell, id, cell, id…
  const mark = new Set<number>();
  shapes.forEach((s, si) => {
    maxTop = Math.max(maxTop, s.top);
    const outer = s.rings[0];
    if (!outer || outer.length < 3) return;
    mark.clear();
    let ax = Infinity;
    let az = Infinity;
    let bx = -Infinity;
    let bz = -Infinity;
    for (const [x, z] of outer) {
      ax = Math.min(ax, x);
      az = Math.min(az, z);
      bx = Math.max(bx, x);
      bz = Math.max(bz, z);
    }
    const cx0 = clampCell(Math.floor((ax - x0) / cell), nx);
    const cx1 = clampCell(Math.floor((bx - x0) / cell), nx);
    const cz0 = clampCell(Math.floor((az - z0) / cell), nz);
    const cz1 = clampCell(Math.floor((bz - z0) / cell), nz);
    // Cells whose centre is inside (courtyards excluded)…
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++)
        if (inside(s.rings, x0 + (cx + 0.5) * cell, z0 + (cz + 0.5) * cell)) mark.add(cz * nx + cx);
    // …and every cell an outline passes through, so narrow buildings aren't missed.
    for (const ring of s.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [px, pz] = ring[i]!;
        const [qx, qz] = ring[(i + 1) % ring.length]!;
        const steps = Math.max(1, Math.ceil((Math.hypot(qx - px, qz - pz) / cell) * 2));
        for (let k = 0; k <= steps; k++) {
          const cx = Math.floor((px + ((qx - px) * k) / steps - x0) / cell);
          const cz = Math.floor((pz + ((qz - pz) * k) / steps - z0) / cell);
          if (cx >= 0 && cz >= 0 && cx < nx && cz < nz) mark.add(cz * nx + cx);
        }
      }
    }
    for (const k of mark) pairs.push(k, si);
  });
  const start = new Int32Array(nx * nz + 1);
  for (let i = 0; i < pairs.length; i += 2) start[pairs[i]! + 1]!++;
  for (let k = 0; k < nx * nz; k++) start[k + 1]! += start[k]!;
  const fill = start.slice(0, nx * nz);
  const list = new Int32Array(pairs.length / 2);
  for (let i = 0; i < pairs.length; i += 2) list[fill[pairs[i]!]!++] = pairs[i + 1]!;
  return { x0, z0, cell, nx, nz, start, shapes: list, id, base, top, maxTop };
}

function clampCell(c: number, n: number): number {
  return Math.min(n - 1, Math.max(0, c));
}

/** Even-odd point in polygon over all rings (so courtyards are outside). */
function inside(rings: readonly (readonly XZ[])[], x: number, z: number): boolean {
  let odd = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i]!;
      const [xj, zj] = ring[j]!;
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) odd = !odd;
    }
  }
  return odd;
}

/** The grid cell holding a world point, or -1 outside the grid. */
export function cellAt(g: OccluderGrid, x: number, z: number): number {
  const cx = Math.floor((x - g.x0) / g.cell);
  const cz = Math.floor((z - g.z0) / g.cell);
  return cx >= 0 && cz >= 0 && cx < g.nx && cz < g.nz ? cz * g.nx + cx : -1;
}

/**
 * Call `hit(id)` for every occluder that blocks the straight line from `from` to `to` (world x, y,
 * z), with all heights scaled by `heightScale`. Occluders in the target's own cell are skipped
 * (the target is on or against them, not behind them), and so is the last `stopShortM` of the line,
 * so the walls lining a street don't count as hiding it. An occluder can be reported more than once.
 */
export function forEachBlocker(
  g: OccluderGrid,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  heightScale: number,
  stopShortM: number,
  hit: (id: number) => void,
): void {
  const [fx, fy, fz] = from;
  const [tx, ty, tz] = to;
  const dx = tx - fx;
  const dy = ty - fy;
  const dz = tz - fz;
  const len = Math.hypot(dx, dy, dz);
  if (len <= stopShortM) return;
  const tMax = 1 - stopShortM / len;
  // Nothing is taller than maxTop: start where the line comes down to it.
  let t = 0;
  const ceiling = g.maxTop * heightScale;
  if (fy > ceiling && dy < 0) t = Math.min(tMax, (ceiling - fy) / dy);
  const targetCell = cellAt(g, tx, tz);
  const ts = g.start;
  const skip = (si: number) => {
    if (targetCell < 0) return false;
    for (let k = ts[targetCell]!; k < ts[targetCell + 1]!; k++) if (g.shapes[k] === si) return true;
    return false;
  };

  let cx = Math.floor((fx + dx * t - g.x0) / g.cell);
  let cz = Math.floor((fz + dz * t - g.z0) / g.cell);
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? g.cell / Math.abs(dx) : Infinity;
  const tDeltaZ = dz !== 0 ? g.cell / Math.abs(dz) : Infinity;
  const edgeX = g.x0 + (cx + (dx > 0 ? 1 : 0)) * g.cell;
  const edgeZ = g.z0 + (cz + (dz > 0 ? 1 : 0)) * g.cell;
  let tNextX = dx !== 0 ? (edgeX - fx) / dx : Infinity;
  let tNextZ = dz !== 0 ? (edgeZ - fz) / dz : Infinity;

  while (t < tMax) {
    const tExit = Math.min(tNextX, tNextZ, tMax);
    if (cx >= 0 && cz >= 0 && cx < g.nx && cz < g.nz) {
      const k = cz * g.nx + cx;
      if (k !== targetCell) {
        const ya = fy + dy * t;
        const yb = fy + dy * tExit;
        const lo = Math.min(ya, yb);
        const hi = Math.max(ya, yb);
        for (let i = ts[k]!; i < ts[k + 1]!; i++) {
          const si = g.shapes[i]!;
          if (lo < g.top[si]! * heightScale && hi > g.base[si]! * heightScale && !skip(si))
            hit(g.id[si]!);
        }
      }
    }
    if (tExit >= tMax) break;
    t = tExit;
    if (tNextX < tNextZ) {
      cx += stepX;
      tNextX += tDeltaX;
    } else {
      cz += stepZ;
      tNextZ += tDeltaZ;
    }
  }
}

/**
 * The largest `value(id)` over the occluders around a world point (inside its footprint's cell,
 * between its base and top), or 0 if there are none.
 */
export function maxAt(
  g: OccluderGrid,
  x: number,
  y: number,
  z: number,
  heightScale: number,
  value: (id: number) => number,
): number {
  const k = cellAt(g, x, z);
  if (k < 0) return 0;
  let best = 0;
  for (let i = g.start[k]!; i < g.start[k + 1]!; i++) {
    const si = g.shapes[i]!;
    if (y >= g.base[si]! * heightScale - 0.5 && y <= g.top[si]! * heightScale + 0.5)
      best = Math.max(best, value(g.id[si]!));
  }
  return best;
}

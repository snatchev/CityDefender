/** Tile-grid operations for the map pipeline. Coordinates are in tile units: u → east (tx), v → south (ty). */

export const T_BUILDING = '#';
export const T_STREET = '.';
export const T_GOAL = 'G';

export class Grid {
  readonly cells: string[];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Array<string>(width * height).fill(T_BUILDING);
  }
  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }
  get(tx: number, ty: number): string {
    return this.inBounds(tx, ty) ? this.cells[ty * this.width + tx]! : T_BUILDING;
  }
  set(tx: number, ty: number, c: string): void {
    if (this.inBounds(tx, ty)) this.cells[ty * this.width + tx] = c;
  }
  rows(): string[] {
    const out: string[] = [];
    for (let ty = 0; ty < this.height; ty++) {
      out.push(this.cells.slice(ty * this.width, (ty + 1) * this.width).join(''));
    }
    return out;
  }
}

export interface UV {
  u: number;
  v: number;
}

/** Sample a polyline every `step` tiles, calling `visit` with each sample point. */
export function samplePolyline(line: readonly UV[], step: number, visit: (p: UV) => void): void {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      visit({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
    }
  }
}

/**
 * Paint a street centerline with a square brush `widthTiles` wide. Because the grid is aligned to the
 * streets, axis-parallel streets come out exactly `widthTiles` wide; diagonals come out a bit fatter.
 */
export function paintStreet(grid: Grid, line: readonly UV[], widthTiles: number): void {
  samplePolyline(line, 0.25, ({ u, v }) => {
    const tx0 = Math.round(u - widthTiles / 2);
    const ty0 = Math.round(v - widthTiles / 2);
    for (let dy = 0; dy < widthTiles; dy++) {
      for (let dx = 0; dx < widthTiles; dx++) grid.set(tx0 + dx, ty0 + dy, T_STREET);
    }
  });
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Flood-fill the non-street block containing (tx, ty) and mark it as goal. Fails if the block is
 * bigger than `maxTiles`, which means the ring road around the landmark didn't rasterize closed.
 */
export function markGoalBlock(grid: Grid, tx: number, ty: number, maxTiles: number): number {
  if (grid.get(tx, ty) !== T_BUILDING)
    throw new Error(`goal tile (${tx}, ${ty}) is not inside a block`);
  const stack: [number, number][] = [[tx, ty]];
  grid.set(tx, ty, T_GOAL);
  let count = 1;
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid.inBounds(nx, ny) && grid.get(nx, ny) === T_BUILDING) {
        grid.set(nx, ny, T_GOAL);
        stack.push([nx, ny]);
        if (++count > maxTiles)
          throw new Error(`goal block exceeds ${maxTiles} tiles: ring road not closed?`);
      }
    }
  }
  return count;
}

/** Nearest street tile to (tx, ty) by breadth-first search, or null if none within `maxDist` steps. */
export function nearestStreet(
  grid: Grid,
  tx: number,
  ty: number,
  maxDist: number,
): [number, number] | null {
  const seen = new Set<number>([ty * grid.width + tx]);
  let frontier: [number, number][] = [[tx, ty]];
  for (let d = 0; d <= maxDist && frontier.length > 0; d++) {
    const next: [number, number][] = [];
    for (const [x, y] of frontier) {
      if (grid.get(x, y) === T_STREET) return [x, y];
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        const k = ny * grid.width + nx;
        if (grid.inBounds(nx, ny) && !seen.has(k)) {
          seen.add(k);
          next.push([nx, ny]);
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** A footprint in tile units: rings (outer + holes, any winding) and its height in metres. */
export interface Footprint {
  rings: UV[][];
  heightM: number;
}

/** Even-odd point-in-polygon over all rings, so holes work without caring about winding. */
function insideRings(rings: readonly UV[][], u: number, v: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.v > v !== b.v > v && u < ((b.u - a.u) * (v - a.v)) / (b.v - a.v) + a.u)
        inside = !inside;
    }
  }
  return inside;
}

/**
 * Per-tile building height (metres, row-major). Each tile is sampled on a `sub`×`sub` grid; a tile is
 * built if footprints cover at least `minCoverage` of its samples, and then takes the tallest height
 * among them. Uncovered tiles get 0 (open lot).
 */
export function rasterizeHeights(
  width: number,
  height: number,
  footprints: readonly Footprint[],
  minCoverage: number,
  sub = 4,
): Float32Array {
  const sw = width * sub;
  const sh = height * sub;
  const samples = new Float32Array(sw * sh);
  for (const fp of footprints) {
    let u0 = Infinity;
    let v0 = Infinity;
    let u1 = -Infinity;
    let v1 = -Infinity;
    for (const r of fp.rings) {
      for (const p of r) {
        u0 = Math.min(u0, p.u);
        v0 = Math.min(v0, p.v);
        u1 = Math.max(u1, p.u);
        v1 = Math.max(v1, p.v);
      }
    }
    const si0 = Math.max(0, Math.floor(u0 * sub));
    const si1 = Math.min(sw - 1, Math.ceil(u1 * sub));
    const sj0 = Math.max(0, Math.floor(v0 * sub));
    const sj1 = Math.min(sh - 1, Math.ceil(v1 * sub));
    for (let sj = sj0; sj <= sj1; sj++) {
      for (let si = si0; si <= si1; si++) {
        const k = sj * sw + si;
        if (samples[k]! >= fp.heightM) continue;
        if (insideRings(fp.rings, (si + 0.5) / sub, (sj + 0.5) / sub)) samples[k] = fp.heightM;
      }
    }
  }

  const out = new Float32Array(width * height);
  const need = minCoverage * sub * sub;
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      let covered = 0;
      let max = 0;
      for (let dy = 0; dy < sub; dy++) {
        for (let dx = 0; dx < sub; dx++) {
          const h = samples[(ty * sub + dy) * sw + tx * sub + dx]!;
          if (h > 0) {
            covered++;
            max = Math.max(max, h);
          }
        }
      }
      out[ty * width + tx] = covered >= need ? max : 0;
    }
  }
  return out;
}

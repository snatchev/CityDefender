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

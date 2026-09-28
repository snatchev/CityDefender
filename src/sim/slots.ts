import rulesData from '../data/rules.json';
import { N4, Tile, tileAt, tileXY, type TileMap } from './map';

/** What kind of tower spot a tile is (DESIGN §4.1). */
export const Slot = { None: 0, Pad: 1, Corner: 2 } as const;
export type SlotKind = (typeof Slot)[keyof typeof Slot];

/** A street segment: the street between two graph nodes (a block face), one tile run across. */
export interface Segment {
  id: number;
  tiles: number[];
  /** Axis a barricade spans: 'x' across a north–south street, 'y' across an east–west one. */
  axis: 'x' | 'y';
  /** Graph nodes (intersections or stations) this segment touches. */
  nodes: number[];
}

/** An intersection (a blob of crossing tiles) or a station tile. */
export interface GraphNode {
  id: number;
  tiles: number[];
  station: boolean;
}

/** Everything derived from the tile grid for placement and pathing layers (Pass 6). */
export interface MapSlots {
  /** Segment id per tile, -1 for non-street tiles and graph nodes. */
  segmentOf: Int32Array;
  segments: Segment[];
  /** Node id per tile, -1 elsewhere. */
  nodeOf: Int32Array;
  nodes: GraphNode[];
  /** Tower spot kind per tile. */
  towerSlot: Uint8Array;
  /** Roof pads: 1–3 per building run, on its street front. */
  pads: number[];
  /** Street-level corners: the corner tiles of each intersection. */
  corners: number[];
  /** Where diggers surface (DESIGN §5.5): one or more per longer segment. */
  manholes: number[];
  /** 1 on manhole tiles, per tile. */
  manholeAt: Uint8Array;
}

/** Buildings within this many metres of each other's height merge into one "building run" for pads. */
const SAME_BUILDING_M = 3;
/** Height assumed for building tiles when a map has no heights (ASCII test fixtures). */
const FIXTURE_HEIGHT_M = 10;
/** Roughly one roof pad per this many street-front tiles of a building run, at most 3. */
const FRONT_TILES_PER_PAD = 10;
const MAX_PADS = 3;
/** One manhole per this many tiles along a segment (segments shorter than this get none). */
const MANHOLE_SPACING = 12;

/**
 * Derive the street graph and all placement slots from a tile map (and its real heights, if any).
 * Pure and deterministic; runs at load time, so the offline pipeline and the ASCII test fixtures
 * share one implementation.
 */
export function deriveSlots(map: TileMap, heightsM?: Float32Array): MapSlots {
  const { width, height } = map;
  const n = width * height;
  const isStreet = (i: number) => map.tiles[i] === Tile.Street;
  const [runH, runV] = runLengths(map);
  const maxSpan = rulesData.maxBarricadeSpanTiles;
  const spawns = new Set(map.spawns.map(([x, y]) => y * width + x));

  // Graph nodes: crossing tiles (both runs wider than any street) and station tiles.
  const isNodeTile = (i: number) =>
    isStreet(i) && (spawns.has(i) || Math.min(runH[i]!, runV[i]!) > maxSpan);
  const nodeOf = new Int32Array(n).fill(-1);
  const nodes: GraphNode[] = [];
  for (let i = 0; i < n; i++) {
    if (nodeOf[i] !== -1 || !isNodeTile(i)) continue;
    // Stations are single-tile nodes; crossing tiles merge into blobs.
    const tiles = spawns.has(i) ? [i] : flood(map, i, (j) => isNodeTile(j) && !spawns.has(j));
    const id = nodes.length;
    for (const t of tiles) nodeOf[t] = id;
    nodes.push({ id, tiles, station: spawns.has(i) });
  }

  // Segments: connected street tiles between nodes.
  const segmentOf = new Int32Array(n).fill(-1);
  const segments: Segment[] = [];
  for (let i = 0; i < n; i++) {
    if (segmentOf[i] !== -1 || !isStreet(i) || nodeOf[i] !== -1) continue;
    const tiles = flood(map, i, (j) => isStreet(j) && nodeOf[j] === -1);
    const id = segments.length;
    for (const t of tiles) segmentOf[t] = id;
    const acrossX = tiles.filter((t) => runH[t]! <= runV[t]!).length;
    const touching = new Set<number>();
    for (const t of tiles) {
      const [x, y] = tileXY(map, t);
      for (const [dx, dy] of N4) {
        const j = (y + dy) * width + (x + dx);
        if (tileAt(map, x + dx, y + dy) === Tile.Street && nodeOf[j]! >= 0)
          touching.add(nodeOf[j]!);
      }
    }
    segments.push({
      id,
      tiles,
      axis: acrossX * 2 >= tiles.length ? 'x' : 'y',
      nodes: [...touching].sort((a, b) => a - b),
    });
  }

  const towerSlot = new Uint8Array(n);
  const pads = roofPads(map, heightsM);
  for (const p of pads) towerSlot[p] = Slot.Pad;
  const corners = intersectionCorners(map, nodes);
  for (const c of corners) towerSlot[c] = Slot.Corner;

  const manholeTiles = segments.flatMap((s) => manholes(map, s));
  const manholeAt = new Uint8Array(n);
  for (const m of manholeTiles) manholeAt[m] = 1;
  return {
    segmentOf,
    segments,
    nodeOf,
    nodes,
    towerSlot,
    pads,
    corners,
    manholes: manholeTiles,
    manholeAt,
  };
}

/** Length of the contiguous street run through each street tile, horizontally and vertically. */
function runLengths(map: TileMap): [Int32Array, Int32Array] {
  const { width, height } = map;
  const runH = new Int32Array(width * height);
  const runV = new Int32Array(width * height);
  const street = (x: number, y: number) => tileAt(map, x, y) === Tile.Street;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width;) {
      if (!street(x, y)) {
        x++;
        continue;
      }
      let e = x;
      while (street(e, y)) e++;
      for (let k = x; k < e; k++) runH[y * width + k] = e - x;
      x = e;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height;) {
      if (!street(x, y)) {
        y++;
        continue;
      }
      let e = y;
      while (street(x, e)) e++;
      for (let k = y; k < e; k++) runV[k * width + x] = e - y;
      y = e;
    }
  }
  return [runH, runV];
}

/** 4-connected flood fill from `start` over tiles where `ok(i)`; returns tiles in visit order. */
function flood(map: TileMap, start: number, ok: (i: number) => boolean): number[] {
  const seen = new Set([start]);
  const out = [start];
  for (let k = 0; k < out.length; k++) {
    const [x, y] = tileXY(map, out[k]!);
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const j = ny * map.width + nx;
      if (!seen.has(j) && ok(j)) {
        seen.add(j);
        out.push(j);
      }
    }
  }
  return out;
}

/**
 * Roof pads (DESIGN §4.1): group building tiles into "runs" of similar height (so a row of rowhouses
 * is one run and a tower next to it is another), then put 1–3 pads on each run's street front,
 * spread out by farthest-point picking. Open lots (height 0) get none.
 */
function roofPads(map: TileMap, heightsM?: Float32Array): number[] {
  const n = map.width * map.height;
  const h = (i: number) => (heightsM ? heightsM[i]! : FIXTURE_HEIGHT_M);
  const isRoof = (i: number) => map.tiles[i] === Tile.Building && h(i) > 0;
  const streetNeighbours = (i: number) => {
    const [x, y] = tileXY(map, i);
    return N4.filter(([dx, dy]) => tileAt(map, x + dx, y + dy) === Tile.Street).length;
  };
  const done = new Uint8Array(n);
  const pads: number[] = [];
  for (let i = 0; i < n; i++) {
    if (done[i] || !isRoof(i)) continue;
    const base = h(i);
    const run = flood(map, i, (j) => isRoof(j) && Math.abs(h(j) - base) <= SAME_BUILDING_M);
    for (const t of run) done[t] = 1;
    const front = run.filter((t) => streetNeighbours(t) > 0);
    if (front.length === 0) continue;
    const count = Math.min(MAX_PADS, Math.max(1, Math.round(front.length / FRONT_TILES_PER_PAD)));
    // Start at the most exposed front tile (most street sides, e.g. a corner), then spread out.
    let first = front[0]!;
    for (const t of front) if (streetNeighbours(t) > streetNeighbours(first)) first = t;
    const chosen = [first];
    while (chosen.length < count) {
      let best = -1;
      let bestD = -1;
      for (const t of front) {
        const [x, y] = tileXY(map, t);
        const d = Math.min(
          ...chosen.map((c) => {
            const [cx, cy] = tileXY(map, c);
            return Math.hypot(cx - x, cy - y);
          }),
        );
        if (d > bestD) {
          bestD = d;
          best = t;
        }
      }
      if (bestD <= 0) break;
      chosen.push(best);
    }
    pads.push(...chosen);
  }
  return pads.sort((a, b) => a - b);
}

/** Street-level tower spots: the four bounding-box corners of each intersection (not stations). */
function intersectionCorners(map: TileMap, nodes: GraphNode[]): number[] {
  const out = new Set<number>();
  for (const node of nodes) {
    if (node.station) continue;
    const xy = node.tiles.map((t) => tileXY(map, t));
    const xs = xy.map(([x]) => x);
    const ys = xy.map(([, y]) => y);
    const set = new Set(node.tiles);
    for (const x of [Math.min(...xs), Math.max(...xs)]) {
      for (const y of [Math.min(...ys), Math.max(...ys)]) {
        const i = y * map.width + x;
        if (set.has(i)) out.add(i);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Manholes spaced along a segment, on its middle line. */
function manholes(map: TileMap, s: Segment): number[] {
  const along = (t: number) => {
    const [x, y] = tileXY(map, t);
    return s.axis === 'x' ? y : x;
  };
  const sorted = [...s.tiles].sort((a, b) => along(a) - along(b) || a - b);
  const span = along(sorted[sorted.length - 1]!) - along(sorted[0]!) + 1;
  const count = Math.floor(span / MANHOLE_SPACING);
  const out: number[] = [];
  for (let k = 0; k < count; k++)
    out.push(sorted[Math.floor(((k + 0.5) / count) * sorted.length)]!);
  return out;
}

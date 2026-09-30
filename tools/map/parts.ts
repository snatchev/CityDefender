/**
 * Real 3D building shapes (Pass 10a, D046). OSM `building:part`s describe setback tiers and roofs;
 * where they cover most of a footprint the footprint is drawn as its parts instead. Roof tags on OSM
 * outlines are kept, and the landmark (City Hall) is built from its OSM relation and parts, with
 * hand-set tags from the city config where the data has no heights.
 *
 * Everything here is render data, except that the sim's tile heights are sampled from these drawn
 * roofs (`surfaceHeights`), so towers stand on what's drawn.
 */
import { readFileSync } from 'node:fs';
import { Color } from 'three';
import {
  defaultRiseM,
  insideRings,
  roofBox,
  roofPlanes,
  roofShapeOf,
  roofZ,
  type P2,
  type Plane,
} from '../../src/render/roofShape';
import type { FacadeHint, RoofShape } from '../../src/sim/cityFile';
import { osmPartsCachePath, type CityConfig, type OverpassResponse } from './config';
import type { LatLon } from './geo';
import type { Level } from './level';
import { T_BUILDING, T_GOAL, type Footprint, type Grid, type UV } from './raster';

/** One drawn shape: walls from `baseM` to `eaveM`, then the roof. Rings in tile units. */
export interface Solid {
  rings: UV[][];
  baseM: number;
  eaveM: number;
  roof: RoofShape;
  riseM: number;
  across: boolean;
  color?: string;
  roofColor?: string;
  facade?: FacadeHint;
}

/** An OSM way or relation with building tags, projected to tile units. */
export interface OsmShape {
  id: string;
  tags: Record<string, string>;
  rings: UV[][];
}

/** Parts and building relations from the cache, with the config's tag overrides applied. */
export function loadOsmParts(
  city: string,
  cfg: CityConfig,
  level: Level,
): { parts: OsmShape[]; relations: OsmShape[] } {
  const osm = JSON.parse(readFileSync(osmPartsCachePath(city), 'utf8')) as OverpassResponse;
  const toUV = (p: LatLon) => level.toUV(level.toGrid(p));
  const parts: OsmShape[] = [];
  const relations: OsmShape[] = [];
  for (const e of osm.elements) {
    const id = `${e.type}/${e.id}`;
    const tags = { ...e.tags, ...cfg.osmTagOverrides[id] };
    let rings: UV[][] = [];
    if (e.type === 'way' && e.geometry && e.geometry.length >= 4) rings = [e.geometry.map(toUV)];
    else if (e.type === 'relation' && e.members) {
      const outer = stitch(
        e.members.filter((m) => m.role === 'outer').map((m) => m.geometry ?? []),
      );
      const inner = stitch(
        e.members.filter((m) => m.role === 'inner').map((m) => m.geometry ?? []),
      );
      // Multipolygons with several outers become one shape per outer (holes go with the first).
      rings = outer.length > 0 ? [outer[0]!, ...inner].map((r) => r.map(toUV)) : [];
      for (const extra of outer.slice(1)) {
        const s = { id, tags, rings: [extra.map(toUV)] };
        (tags['building:part'] ? parts : relations).push(s);
      }
    }
    if (rings.length === 0) continue;
    (tags['building:part'] ? parts : relations).push({ id, tags, rings });
  }
  return { parts, relations };
}

/** Join a multipolygon's member ways end to end into closed rings; open leftovers are dropped. */
function stitch(ways: LatLon[][]): LatLon[][] {
  const same = (a: LatLon, b: LatLon) => a.lat === b.lat && a.lon === b.lon;
  const pool = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const rings: LatLon[][] = [];
  while (pool.length > 0) {
    let ring = pool.shift()!;
    while (!same(ring[0]!, ring[ring.length - 1]!)) {
      const end = ring[ring.length - 1]!;
      const i = pool.findIndex((w) => same(w[0]!, end) || same(w[w.length - 1]!, end));
      if (i < 0) break;
      const w = pool.splice(i, 1)[0]!;
      ring = ring.concat((same(w[0]!, end) ? w : [...w].reverse()).slice(1));
    }
    if (ring.length >= 4 && same(ring[0]!, ring[ring.length - 1]!)) rings.push(ring);
  }
  return rings;
}

/** An OSM length: "12", "12.5 m", "40 ft", "40'"; the first of several ("28;1"). */
function lengthM(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const first = v.split(';')[0]!.trim();
  const n = parseFloat(first);
  if (!Number.isFinite(n)) return undefined;
  return /ft|'/.test(first) ? n * 0.3048 : n;
}

function count(v: string | undefined): number | undefined {
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

const STONE = /^(stone|granite|limestone|marble|sandstone)$/;

function facadeOf(tags: Record<string, string>): FacadeHint | undefined {
  const m = (tags['building:material'] ?? tags['building:facade:material'] ?? '').toLowerCase();
  if (m === 'glass') return 'glass';
  if (m === 'brick') return 'brick';
  if (STONE.test(m)) return 'stone';
  if (m === 'concrete') return 'concrete';
  if (/^(parking|garage|garages)$/.test(tags.building ?? '') || tags.parking === 'multi-storey')
    return 'parking';
  return undefined;
}

/** A CSS colour name or hex as `#rrggbb`, or undefined if it isn't one. */
function colorOf(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  const named = (Color.NAMES as Record<string, number>)[s];
  if (named !== undefined) return '#' + new Color(named).getHexString();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return '#' + new Color(s).getHexString();
  return undefined;
}

/** Ring in metres for the roof maths (the tile frame scaled; any right-angled frame works). */
function metres(ring: readonly UV[], tileM: number): P2[] {
  return ring.map((p) => [p.u * tileM, p.v * tileM] as const);
}

/**
 * A solid from OSM tags. `height` is the top of the roof (OSM convention); without it,
 * `building:levels` gives the eaves; without either, `fallbackM` (the parent footprint's height)
 * is the top.
 */
export function solidFromTags(
  tags: Record<string, string>,
  rings: UV[][],
  cfg: CityConfig,
  fallbackM: number,
): Solid {
  const b = cfg.buildings;
  const base = lengthM(tags.min_height) ?? (count(tags['building:min_level']) ?? 0) * b.osmLevelM;
  let roof = roofShapeOf(tags['roof:shape']);
  // Pitched roofs over courtyards would need a straight skeleton; draw those flat.
  if (rings.length > 1) roof = 'flat';
  const roofLevels = count(tags['roof:levels']);
  const riseTag =
    lengthM(tags['roof:height']) ??
    (roofLevels !== undefined ? roofLevels * b.roofLevelM : undefined);
  let rise =
    roof === 'flat' ? 0 : (riseTag ?? defaultRiseM(roof, roofBox(metres(rings[0]!, cfg.tileM))));
  const height = lengthM(tags.height);
  const levels = count(tags['building:levels']);
  let eave: number;
  if (height !== undefined && height > 0) eave = height - rise;
  else if (levels !== undefined && levels > 0) eave = levels * b.osmLevelM;
  else eave = fallbackM - rise;
  if (eave < base) {
    // A roof taller than the part: keep the top, start the roof at the base.
    rise = Math.max(0, rise - (base - eave));
    eave = base;
  }
  return {
    rings,
    baseM: base,
    eaveM: eave,
    roof: rise > 0 ? roof : 'flat',
    riseM: rise,
    across: tags['roof:orientation'] === 'across',
    color: colorOf(tags['building:colour']),
    roofColor: colorOf(tags['roof:colour']),
    facade: facadeOf(tags),
  };
}

export function flatSolid(fp: Footprint): Solid {
  return { rings: fp.rings, baseM: 0, eaveM: fp.heightM, roof: 'flat', riseM: 0, across: false };
}

/** Samples per metre-ish when measuring how much of a footprint its parts cover. */
const COVER_STEP_TILES = 1 / 8;
/** Spatial index cell (tiles). */
const CELL_TILES = 4;

interface Indexed {
  rings: UV[][];
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Bucket shapes by bounding box so point lookups only test nearby shapes. */
class ShapeIndex<T extends Indexed> {
  private cells = new Map<string, T[]>();
  add(s: T): void {
    for (let cy = Math.floor(s.v0 / CELL_TILES); cy <= Math.floor(s.v1 / CELL_TILES); cy++)
      for (let cx = Math.floor(s.u0 / CELL_TILES); cx <= Math.floor(s.u1 / CELL_TILES); cx++) {
        const k = `${cx},${cy}`;
        const list = this.cells.get(k);
        if (list) list.push(s);
        else this.cells.set(k, [s]);
      }
  }
  at(u: number, v: number): T[] {
    const near =
      this.cells.get(`${Math.floor(u / CELL_TILES)},${Math.floor(v / CELL_TILES)}`) ?? [];
    return near.filter(
      (s) => u >= s.u0 && u <= s.u1 && v >= s.v0 && v <= s.v1 && inside(s.rings, u, v),
    );
  }
}

function bounds<T extends { rings: UV[][] }>(s: T): T & Indexed {
  let [u0, v0, u1, v1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of s.rings[0]!) {
    u0 = Math.min(u0, p.u);
    v0 = Math.min(v0, p.v);
    u1 = Math.max(u1, p.u);
    v1 = Math.max(v1, p.v);
  }
  return { ...s, u0, v0, u1, v1 };
}

function inside(rings: readonly UV[][], u: number, v: number): boolean {
  return insideRings(
    rings.map((r) => r.map((p) => [p.u, p.v] as const)),
    u,
    v,
  );
}

function centroid(ring: readonly UV[]): UV {
  let u = 0;
  let v = 0;
  for (const p of ring) {
    u += p.u;
    v += p.v;
  }
  return { u: u / ring.length, v: v / ring.length };
}

export interface ResolvedSolids {
  solids: Solid[];
  landmark: Solid[];
  /** Footprints drawn as their parts instead. */
  replaced: number;
  parts: number;
}

/**
 * The level's drawn solids: footprints (OSM outlines keep their roof tags) except those whose parts
 * cover at least `replaceCoverage` of them, plus every part in the level. Parts and building
 * relations inside the goal block are the landmark.
 */
export function resolveSolids(
  drawn: readonly Footprint[],
  osm: { parts: OsmShape[]; relations: OsmShape[] },
  grid: Grid,
  cfg: CityConfig,
): ResolvedSolids {
  const where = (s: OsmShape) => {
    const c = centroid(s.rings[0]!);
    const tx = Math.floor(c.u);
    const ty = Math.floor(c.v);
    return grid.inBounds(tx, ty) ? grid.get(tx, ty) : null;
  };
  const levelParts = osm.parts.filter((p) => where(p) === T_BUILDING).map(bounds);
  const goalParts = osm.parts.filter((p) => where(p) === T_GOAL);
  const goalRelations = osm.relations.filter((r) => where(r) === T_GOAL).map(bounds);

  const partIndex = new ShapeIndex<OsmShape & Indexed>();
  for (const p of levelParts) partIndex.add(p);
  const fpIndex = new ShapeIndex<Footprint & Indexed>();
  const drawnB = drawn.map(bounds);
  for (const f of drawnB) fpIndex.add(f);

  // Footprints mostly covered by parts are drawn as the parts.
  const solids: Solid[] = [];
  let replaced = 0;
  for (const f of drawnB) {
    let inFp = 0;
    let covered = 0;
    for (let v = f.v0 + COVER_STEP_TILES / 2; v < f.v1; v += COVER_STEP_TILES) {
      for (let u = f.u0 + COVER_STEP_TILES / 2; u < f.u1; u += COVER_STEP_TILES) {
        if (!inside(f.rings, u, v)) continue;
        inFp++;
        if (partIndex.at(u, v).length > 0) covered++;
      }
    }
    if (inFp > 0 && covered / inFp >= cfg.parts.replaceCoverage) {
      replaced++;
      continue;
    }
    solids.push(f.tags ? solidFromTags(f.tags, f.rings, cfg, f.heightM) : flatSolid(f));
  }

  // Parts without heights take their building's: the drawn footprint around their centre.
  const parentM = (s: OsmShape, parents: ShapeIndex<Indexed & { heightM: number }>) => {
    const c = centroid(s.rings[0]!);
    const hs = parents.at(c.u, c.v).map((p) => p.heightM);
    return hs.length > 0 ? Math.max(...hs) : cfg.buildings.defaultHeightM;
  };
  for (const p of levelParts) solids.push(solidFromTags(p.tags, p.rings, cfg, parentM(p, fpIndex)));

  // The landmark: its building relation(s) and parts, parts falling back to the relation's height.
  const landmark = goalRelations.map((r) =>
    solidFromTags(r.tags, r.rings, cfg, cfg.buildings.defaultHeightM),
  );
  const relIndex = new ShapeIndex<Indexed & { heightM: number }>();
  goalRelations.forEach((r, i) => relIndex.add({ ...r, heightM: landmark[i]!.eaveM }));
  for (const p of goalParts)
    landmark.push(solidFromTags(p.tags, p.rings, cfg, parentM(p, relIndex)));

  return { solids, landmark, replaced, parts: levelParts.length };
}

/** A solid's roof planes in the tile frame's metres. */
function planesOf(s: Solid, tileM: number): Plane[] {
  return roofPlanes(s.roof, roofBox(metres(s.rings[0]!, tileM)), s.riseM, s.across);
}

/** Sub-samples per tile edge when a building tile's centre misses every drawn roof. */
const EDGE_SAMPLES = [0.2, 0.5, 0.8];

/**
 * Per-tile heights (m) sampled from the drawn roofs: the roof surface at the tile's centre (where a
 * tower would stand), else the highest roof under a few points of the tile, else the raster height
 * (tiles that are building by coverage but that no drawn outline reaches).
 */
export function surfaceHeights(
  grid: Grid,
  solids: readonly Solid[],
  raster: Float32Array,
  tileM: number,
): Float32Array {
  const index = new ShapeIndex<Indexed & { eave: number; planes: Plane[] }>();
  for (const s of solids)
    index.add(bounds({ rings: s.rings, eave: s.eaveM, planes: planesOf(s, tileM) }));
  const top = (u: number, v: number) => {
    let h = -1;
    for (const s of index.at(u, v)) h = Math.max(h, s.eave + roofZ(s.planes, u * tileM, v * tileM));
    return h;
  };
  const out = new Float32Array(grid.width * grid.height);
  for (let ty = 0; ty < grid.height; ty++) {
    for (let tx = 0; tx < grid.width; tx++) {
      const i = ty * grid.width + tx;
      if (grid.get(tx, ty) !== T_BUILDING || raster[i]! <= 0) continue;
      let h = top(tx + 0.5, ty + 0.5);
      if (h < 0)
        for (const dy of EDGE_SAMPLES)
          for (const dx of EDGE_SAMPLES) h = Math.max(h, top(tx + dx, ty + dy));
      out[i] = h >= 0 ? h : raster[i]!;
    }
  }
  return out;
}

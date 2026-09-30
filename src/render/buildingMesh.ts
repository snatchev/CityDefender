import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three';
import type { BuildingsFileV1, SolidRecord } from '../sim/cityFile';
import { createRng, type Rng } from '../sim/rng';
import { uvToWorld, type TileFrame } from './coords';
import { lookOf, Style, WINDOWS_BELOW_EAVES_M, WINDOWS_FROM_M, type StyleId } from './facades';
import {
  edgeBreaks,
  insideRings,
  polygonArea,
  roofBox,
  roofFacets,
  roofPlanes,
  roofZ,
  type P2,
  type Plane,
  type RoofBox,
} from './roofShape';

/** Flat roofs get a parapet: the walls run this far above the roof. Taller on towers. */
const PARAPET_M = 0.9;
const TOWER_PARAPET_M = 1.6;
const TOWER_M = 60;
/** No parapet on sheds and one-storey buildings. */
const PARAPET_FROM_M = 6;
/** Parapet inner faces are a little darker than the facade. */
const PARAPET_INNER_SHADE = 0.8;
/**
 * Parapets have thickness: the inner face sits this far inside the outline, with a cap on top. A
 * zero-thickness parapet's inner face lay in the same plane as a taller neighbour's wall and
 * z-fought with it (D048).
 */
const PARAPET_THICKNESS_M = 0.35;

/** Rooftop boxes (mechanical rooms, stair and elevator bulkheads) on flat roofs. */
const BOX = {
  minRoofAreaM2: 150,
  minEaveM: 10,
  areaPerBoxM2: 600,
  maxBoxes: 4,
  sizeM: [3, 10] as const,
  heightM: [2, 4.5] as const,
  /** Towers get a taller elevator bulkhead as their first box. */
  bulkheadM: [5, 8] as const,
  /** Distance from the roof edge (m). */
  marginM: 1.5,
  /** Keep this far (m) from roof pads, so towers never sit inside a box. */
  clearM: 7,
  tries: 24,
  colors: ['#b9b9b4', '#a3a39e', '#c4c1b8'],
};

export interface SolidsOptions {
  /** World points (x, z) that rooftop clutter must stay clear of: roof pads. */
  keepClear?: readonly (readonly [number, number])[];
  /** Draw every solid in the landmark style. */
  landmark?: boolean;
}

/**
 * One merged, non-indexed geometry for a list of solids (D046): walls from base to eaves that rise
 * to meet the roof along the outline, faceted roofs (roofShape.ts), parapets on flat roofs, rooftop
 * boxes. Per-vertex colour, flat normals, and `aFacade` for the window shader (facades.ts).
 * Built once when the city loads.
 */
export function solidsGeometry(
  solids: readonly SolidRecord[],
  coordScale: number,
  frame: TileFrame,
  opts: SolidsOptions = {},
): BufferGeometry {
  const out = new GeometryBuilder();
  const clear = opts.keepClear ?? [];
  for (const s of solids) {
    const rings = s.rings.map((flat) => worldRing(flat, coordScale, frame));
    const outer = rings[0];
    if (!outer || outer.length < 3) continue;
    // Seed from the outline so a building keeps its look when others change.
    const rng = createRng(Math.round(outer[0]![0] * 100) * 7919 + Math.round(outer[0]![1] * 100));
    const look = lookOf(s, rng, !!opts.landmark);
    const base = s.base ?? 0;
    const eave = s.h;
    const box = roofBox(outer);
    const planes = s.roof ? roofPlanes(s.roof, box, s.rise ?? 0, s.across === 1) : [];
    const parapet =
      planes.length === 0 && eave >= PARAPET_FROM_M
        ? eave >= TOWER_M
          ? TOWER_PARAPET_M
          : PARAPET_M
        : 0;

    walls(out, rings, base, eave, planes, parapet, look.wall, look.style);
    roof(out, rings, eave, planes, look.roof);
    if (planes.length === 0 && !opts.landmark)
      roofBoxes(out, rings, box, eave, rng, clear, look.wall);
  }
  return out.build();
}

/** A closed flat ring (tile units × scale) as open world (x, z) points, counter-clockwise-agnostic. */
function worldRing(flat: readonly number[], scale: number, frame: TileFrame): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2)
    pts.push(uvToWorld(frame, flat[i]! / scale, flat[i + 1]! / scale));
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first && last && pts.length > 1 && first[0] === last[0] && first[1] === last[1]) pts.pop();
  return pts;
}

function walls(
  out: GeometryBuilder,
  rings: P2[][],
  base: number,
  eave: number,
  planes: readonly Plane[],
  parapet: number,
  color: Color,
  style: StyleId,
): void {
  const inner = color.clone().multiplyScalar(PARAPET_INNER_SHADE);
  const winFrom = base + (base > 0 ? 0 : WINDOWS_FROM_M);
  const winTo = eave - WINDOWS_BELOW_EAVES_M;
  rings.forEach((ring, k) => {
    // Outward from the solid: the outline's normals point out, a courtyard's point into the court.
    const ccw = polygonArea(ring) > 0;
    const outward = k === 0 ? ccw : !ccw;
    const inset = parapet > 0 ? insetRing(ring, outward, PARAPET_THICKNESS_M) : null;
    let along = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 1e-6) continue;
      const dx = (q[0] - p[0]) / len;
      const dz = (q[1] - p[1]) / len;
      const n: Vec3 = outward ? [dz, 0, -dx] : [-dz, 0, dx];
      const ts = [0, ...edgeBreaks(planes, p, q), 1];
      for (let j = 0; j + 1 < ts.length; j++) {
        const t0 = ts[j]!;
        const t1 = ts[j + 1]!;
        const a: P2 = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0];
        const b: P2 = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1];
        const topA = eave + roofZ(planes, a[0], a[1]) + parapet;
        const topB = eave + roofZ(planes, b[0], b[1]) + parapet;
        const ua = along + len * t0;
        const ub = along + len * t1;
        const facade = (u: number): Vec4 => [u, winFrom, winTo, style];
        out.quad(
          [a[0], base, a[1]],
          [b[0], base, b[1]],
          [b[0], topB, b[1]],
          [a[0], topA, a[1]],
          n,
          color,
          [facade(ua), facade(ub), facade(ub), facade(ua)],
        );
      }
      if (inset) {
        // Parapets only sit on flat roofs, so the edge is one piece at a constant height.
        const top = eave + parapet;
        const pi = inset[i]!;
        const qi = inset[(i + 1) % ring.length]!;
        const ni: Vec3 = [-n[0], 0, -n[2]];
        out.quad(
          [qi[0], eave, qi[1]],
          [pi[0], eave, pi[1]],
          [pi[0], top, pi[1]],
          [qi[0], top, qi[1]],
          ni,
          inner,
        );
        out.quad(
          [p[0], top, p[1]],
          [q[0], top, q[1]],
          [qi[0], top, qi[1]],
          [pi[0], top, pi[1]],
          [0, 1, 0],
          inner,
        );
      }
      along += len;
    }
  });
}

/** The ring moved `t` metres into the solid, with mitred corners (capped so spikes don't shoot out). */
function insetRing(ring: readonly P2[], outward: boolean, t: number): P2[] {
  const m = ring.length;
  // Inward normal of each edge (i → i + 1); zero-length edges borrow the previous one.
  const normals: P2[] = [];
  for (let i = 0; i < m; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % m]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const prev = normals[i - 1] ?? [0, 0];
    if (len < 1e-6) {
      normals.push(prev);
      continue;
    }
    const [dx, dz] = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    normals.push(outward ? [-dz, dx] : [dz, -dx]);
  }
  return ring.map((v, i) => {
    const a = normals[(i - 1 + m) % m]!;
    const b = normals[i]!;
    let [mx, mz] = [a[0] + b[0], a[1] + b[1]];
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) [mx, mz] = b;
    else [mx, mz] = [mx / ml, mz / ml];
    const d = t / Math.max(1 / 3, mx * b[0] + mz * b[1]);
    return [v[0] + mx * d, v[1] + mz * d];
  });
}

function roof(
  out: GeometryBuilder,
  rings: P2[][],
  eave: number,
  planes: readonly Plane[],
  color: Color,
): void {
  if (planes.length === 0) {
    const [outer, ...holes] = rings.map((r) => r.map(([x, z]) => new Vector2(x, z)));
    const all = [outer!, ...holes].flat();
    for (const [i, j, k] of ShapeUtils.triangulateShape(outer!, holes)) {
      const v = [all[i!]!, all[j!]!, all[k!]!].map((p): Vec3 => [p.x, eave, p.y]);
      out.tri(v[0]!, v[1]!, v[2]!, [0, 1, 0], color);
    }
    return;
  }
  // Pitched: one flat facet per plane, over the outline (pitched roofs never have courtyards).
  for (const { plane, poly } of roofFacets(planes, rings[0]!)) {
    const n = normalize([-plane.a, 1, -plane.b]);
    const pts = poly.map(([x, z]) => new Vector2(x, z));
    for (const [i, j, k] of ShapeUtils.triangulateShape(pts, [])) {
      const v = [pts[i!]!, pts[j!]!, pts[k!]!].map((p): Vec3 => [
        p.x,
        eave + Math.max(0, plane.a * p.x + plane.b * p.y + plane.c),
        p.y,
      ]);
      out.tri(v[0]!, v[1]!, v[2]!, n, color);
    }
  }
}

/** Seeded boxes on a flat roof, inside the outline, clear of the edge, each other and roof pads. */
function roofBoxes(
  out: GeometryBuilder,
  rings: P2[][],
  box: RoofBox,
  eave: number,
  rng: Rng,
  clear: readonly (readonly [number, number])[],
  wall: Color,
): void {
  const area = Math.abs(polygonArea(rings[0]!));
  if (eave < BOX.minEaveM || area < BOX.minRoofAreaM2) return;
  const count = Math.min(BOX.maxBoxes, 1 + Math.floor(area / BOX.areaPerBoxM2));
  const placed: { x: number; z: number; r: number }[] = [];
  const near = clear.filter(
    ([x, z]) => Math.hypot(x - box.cx, z - box.cy) < box.radius + BOX.clearM,
  );
  const { ux, uy } = box;
  const [vx, vy] = [-uy, ux];
  for (let t = 0; t < BOX.tries && placed.length < count; t++) {
    const w = Math.min(lerp(BOX.sizeM, rng.next()), box.halfL);
    const d = Math.min(lerp(BOX.sizeM, rng.next()), box.halfW);
    const tall = placed.length === 0 && eave >= TOWER_M;
    const h = lerp(tall ? BOX.bulkheadM : BOX.heightM, rng.next());
    const a = (rng.next() * 2 - 1) * Math.max(0, box.halfL - w / 2 - BOX.marginM);
    const b = (rng.next() * 2 - 1) * Math.max(0, box.halfW - d / 2 - BOX.marginM);
    const cx = box.cx + ux * a + vx * b;
    const cz = box.cy + uy * a + vy * b;
    const corner = (sa: number, sb: number): P2 => [
      cx + ux * sa * (w / 2 + BOX.marginM) + vx * sb * (d / 2 + BOX.marginM),
      cz + uy * sa * (w / 2 + BOX.marginM) + vy * sb * (d / 2 + BOX.marginM),
    ];
    const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    if (!corners.every(([x, z]) => insideRings(rings, x, z))) continue;
    const r = Math.hypot(w, d) / 2;
    if (placed.some((p) => Math.hypot(p.x - cx, p.z - cz) < p.r + r + 1)) continue;
    if (near.some(([x, z]) => Math.hypot(x - cx, z - cz) < r + BOX.clearM)) continue;
    placed.push({ x: cx, z: cz, r });
    const color = placed.length === 1 && tall ? wall : new Color(rng.pick(BOX.colors));
    out.box(cx, cz, ux, uy, w / 2, d / 2, eave, eave + h, color);
  }
}

const lerp = ([a, b]: readonly [number, number], t: number) => a + (b - a) * t;

type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];

function normalize([x, y, z]: Vec3): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

const NO_FACADE: Vec4 = [0, 0, 0, Style.None];

/** Accumulates triangles (non-indexed) with flat normals, colours and facade data. */
class GeometryBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private fac: number[] = [];

  /** A triangle, wound so its front face matches the normal `n`. */
  tri(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    n: Vec3,
    color: Color,
    f: Vec4[] = [NO_FACADE, NO_FACADE, NO_FACADE],
  ) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const dot =
      (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
    const verts: [Vec3, Vec4][] =
      dot >= 0
        ? [
            [a, f[0]!],
            [b, f[1]!],
            [c, f[2]!],
          ]
        : [
            [a, f[0]!],
            [c, f[2]!],
            [b, f[1]!],
          ];
    for (const [v, fv] of verts) {
      this.pos.push(v[0], v[1], v[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(color.r, color.g, color.b);
      this.fac.push(fv[0], fv[1], fv[2], fv[3]);
    }
  }

  /** Quad a-b-c-d (in order around its edge). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, color: Color, f?: [Vec4, Vec4, Vec4, Vec4]) {
    const [fa, fb, fc, fd] = f ?? [NO_FACADE, NO_FACADE, NO_FACADE, NO_FACADE];
    this.tri(a, b, c, n, color, [fa, fb, fc]);
    this.tri(a, c, d, n, color, [fa, fc, fd]);
  }

  /** An oriented box on a roof: centre (x, z), axis (ux, uz), half sizes, from y0 to y1. */
  box(
    x: number,
    z: number,
    ux: number,
    uz: number,
    hw: number,
    hd: number,
    y0: number,
    y1: number,
    color: Color,
  ) {
    const [vx, vz] = [-uz, ux];
    const c = (sa: number, sb: number): [number, number] => [
      x + ux * sa * hw + vx * sb * hd,
      z + uz * sa * hw + vz * sb * hd,
    ];
    const ring = [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
    for (let i = 0; i < 4; i++) {
      const [px, pz] = ring[i]!;
      const [qx, qz] = ring[(i + 1) % 4]!;
      const mx = (px + qx) / 2 - x;
      const mz = (pz + qz) / 2 - z;
      const l = Math.hypot(mx, mz) || 1;
      this.quad([px, y0, pz], [qx, y0, qz], [qx, y1, qz], [px, y1, pz], [mx / l, 0, mz / l], color);
    }
    const top = ring.map(([px, pz]): Vec3 => [px, y1, pz]);
    this.quad(top[0]!, top[1]!, top[2]!, top[3]!, [0, 1, 0], color);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('aFacade', new BufferAttribute(new Float32Array(this.fac), 4));
    g.computeBoundingSphere();
    return g;
  }
}

/** Street centerlines as line segments for dashed lane markings (major streets only). */
export function laneLineGeometry(
  file: BuildingsFileV1,
  frame: TileFrame,
  kinds: readonly string[],
): BufferGeometry {
  const pos: number[] = [];
  const s = file.coordScale;
  for (const st of file.streets) {
    if (!kinds.includes(st.kind)) continue;
    for (let i = 0; i + 3 < st.pts.length; i += 2) {
      const [x0, z0] = uvToWorld(frame, st.pts[i]! / s, st.pts[i + 1]! / s);
      const [x1, z1] = uvToWorld(frame, st.pts[i + 2]! / s, st.pts[i + 3]! / s);
      pos.push(x0, 0, z0, x1, 0, z1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  return g;
}

import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three';
import type { BuildingsFileV0 } from '../sim/cityFile';
import { uvToWorld, type TileFrame } from './coords';

/** Low buildings (rowhouses, brick) … */
const LOW = new Color('#c8b89b');
/** … blend toward this for towers. */
const HIGH = new Color('#9fb0c0');
/** Heights (m) between which the colour blends from low (rowhouses) to high (towers). */
const TINT_FROM_M = 20;
const TINT_TO_M = 120;
/** Walls are drawn a little darker than roofs so the massing reads. */
const WALL_SHADE = 0.86;

/** Building colour for a display height (also used for the lot/tile fallback). */
export function buildingColor(h: number, out: Color): Color {
  const t = Math.min(1, Math.max(0, (h - TINT_FROM_M) / (TINT_TO_M - TINT_FROM_M)));
  return out.copy(LOW).lerp(HIGH, t);
}

/**
 * One merged, non-indexed geometry for every building: each outline extruded to its display height
 * (walls + flat roof, courtyards as holes), with flat normals and per-vertex colour.
 * Built once when the city loads (a few hundred thousand vertices; one draw call).
 */
export function buildingGeometry(file: BuildingsFileV0, frame: TileFrame): BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const c = new Color();
  const s = file.coordScale;

  const tri = (
    a: number[],
    b: number[],
    cc: number[],
    n: [number, number, number],
    color: Color,
  ) => {
    // Make the winding match the intended normal (three.js front faces are counter-clockwise).
    const ux = b[0]! - a[0]!,
      uy = b[1]! - a[1]!,
      uz = b[2]! - a[2]!;
    const vx = cc[0]! - a[0]!,
      vy = cc[1]! - a[1]!,
      vz = cc[2]! - a[2]!;
    const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const [p, q] = cross[0]! * n[0] + cross[1]! * n[1] + cross[2]! * n[2] >= 0 ? [b, cc] : [cc, b];
    for (const v of [a, p!, q!]) {
      pos.push(v[0]!, v[1]!, v[2]!);
      nrm.push(...n);
      col.push(color.r, color.g, color.b);
    }
  };

  for (const b of file.buildings) {
    const h = b.h; // real metres, drawn 1:1 (D029)
    if (h <= 0) continue;
    const roofColor = buildingColor(h, c).clone();
    const wallColor = roofColor.clone().multiplyScalar(WALL_SHADE);
    const rings = b.rings.map((flat) => {
      const pts: Vector2[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const [x, z] = uvToWorld(frame, flat[i]! / s, flat[i + 1]! / s);
        pts.push(new Vector2(x, z));
      }
      // Rings arrive closed (first point repeated); triangulation wants them open.
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      if (pts.length > 1 && first.equals(last)) pts.pop();
      return pts;
    });
    const [outer, ...holes] = rings;
    if (!outer || outer.length < 3) continue;

    // Walls: outward from the solid (outer ring outward, courtyard rings inward).
    rings.forEach((ring, k) => {
      const ccw = signedArea(ring) > 0;
      const out = k === 0 ? ccw : !ccw;
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        const dx = q.x - p.x;
        const dz = q.y - p.y;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        const n: [number, number, number] = out
          ? [dz / len, 0, -dx / len]
          : [-dz / len, 0, dx / len];
        const p0 = [p.x, 0, p.y],
          q0 = [q.x, 0, q.y],
          p1 = [p.x, h, p.y],
          q1 = [q.x, h, q.y];
        tri(p0, q0, q1, n, wallColor);
        tri(p0, q1, p1, n, wallColor);
      }
    });

    // Roof.
    const faces = ShapeUtils.triangulateShape(outer, holes);
    const all = [outer, ...holes].flat();
    for (const [i, j, k] of faces) {
      const v = [all[i!]!, all[j!]!, all[k!]!].map((p) => [p.x, h, p.y]);
      tri(v[0]!, v[1]!, v[2]!, [0, 1, 0], roofColor);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

/** Street centerlines as line segments for dashed lane markings (major streets only). */
export function laneLineGeometry(
  file: BuildingsFileV0,
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

/** Twice the signed area of a ring in the (x, z) plane. */
function signedArea(r: readonly Vector2[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += r[j]!.x * r[i]!.y - r[i]!.x * r[j]!.y;
  return a;
}

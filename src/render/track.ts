/**
 * A camera track (branch down-the-street, D054): the route from one station to City Hall as a
 * polyline on the ground, measured from the station (s = 0) to the goal (s = length). The rail
 * camera rides it; cutscenes and track switches place the camera on it. Pure maths, world x/z metres.
 */

export type XZ = readonly [number, number];

export interface Track {
  station: number;
  /** Corner points, station first. */
  pts: XZ[];
  /** Distance along the track at each point. */
  cum: number[];
  length: number;
}

/** A track through these points (consecutive duplicates and straight-on points are dropped). */
export function makeTrack(station: number, points: readonly XZ[]): Track {
  const pts: XZ[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    const prev = pts[pts.length - 2];
    // Three in a row on one line: the middle one adds nothing.
    if (
      last &&
      prev &&
      Math.abs((last[0] - prev[0]) * (p[1] - last[1]) - (last[1] - prev[1]) * (p[0] - last[0])) <
        1e-9
    )
      pts[pts.length - 1] = p;
    else pts.push(p);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return { station, pts, cum, length: cum[cum.length - 1] ?? 0 };
}

/** The point `s` metres from the station (clamped to the track). */
export function pointAt(t: Track, s: number): [number, number] {
  if (t.pts.length === 0) return [0, 0];
  if (t.pts.length === 1 || s <= 0) return [t.pts[0]![0], t.pts[0]![1]];
  if (s >= t.length) {
    const p = t.pts[t.pts.length - 1]!;
    return [p[0], p[1]];
  }
  let i = 1;
  while (i < t.cum.length - 1 && t.cum[i]! < s) i++;
  const a = t.pts[i - 1]!;
  const b = t.pts[i]!;
  const k = (s - t.cum[i - 1]!) / Math.max(1e-9, t.cum[i]! - t.cum[i - 1]!);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/**
 * Heading (radians, atan2(dx, dz)) of the track around `s`, pointing toward the goal: the direction
 * from `windowM` behind to `windowM` ahead, so corners turn the camera gradually.
 */
export function headingAt(t: Track, s: number, windowM: number): number {
  const [ax, az] = pointAt(t, s - windowM);
  const [bx, bz] = pointAt(t, s + windowM);
  if (Math.hypot(bx - ax, bz - az) < 1e-6) {
    const a = t.pts[0];
    const b = t.pts[t.pts.length - 1];
    return a && b ? Math.atan2(b[0] - a[0], b[1] - a[1]) : 0;
  }
  return Math.atan2(bx - ax, bz - az);
}

/** Distance along the track of the point on it nearest (x, z). */
export function nearestS(t: Track, x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 1; i < t.pts.length; i++) {
    const a = t.pts[i - 1]!;
    const b = t.pts[i]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const k = len2 > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
    const d = Math.hypot(x - (a[0] + dx * k), z - (a[1] + dz * k));
    if (d < bestD) {
      bestD = d;
      best = t.cum[i - 1]! + k * Math.sqrt(len2);
    }
  }
  return best;
}

/** Shortest signed angle from a to b (radians, in (-π, π]). */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

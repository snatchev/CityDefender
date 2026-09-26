/** Geometry helpers for the map pipeline: lat/lon → local metres, and finding the street grid's rotation. */

export interface LatLon {
  lat: number;
  lon: number;
}

/** Local planar point in metres: x = east, y = north. */
export interface Pt {
  x: number;
  y: number;
}

const EARTH_RADIUS_M = 6_371_008.8;
const DEG = Math.PI / 180;

/** Equirectangular projection around `origin`. Accurate to well under a metre across a few km. */
export function project(p: LatLon, origin: LatLon): Pt {
  return {
    x: (p.lon - origin.lon) * DEG * EARTH_RADIUS_M * Math.cos(origin.lat * DEG),
    y: (p.lat - origin.lat) * DEG * EARTH_RADIUS_M,
  };
}

/** Rotate a point around the origin by `deg` (counter-clockwise positive). */
export function rotate(p: Pt, deg: number): Pt {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Fold an angle in degrees into [-45, 45): a grid looks the same every 90°. */
function fold90(deg: number): number {
  return ((((deg + 45) % 90) + 90) % 90) - 45;
}

/**
 * Dominant street-grid angle in degrees, in [-45, 45).
 * Builds a length-weighted histogram of segment directions mod 90°, takes the peak bin,
 * then refines it with the weighted mean of directions within ±3° of the peak.
 * Rotating the map by the negative of this angle makes the grid axis-aligned.
 */
export function dominantGridAngle(polylines: readonly Pt[][], binDeg = 0.5): number {
  const bins = Math.round(90 / binDeg);
  const hist = new Float64Array(bins);
  const segs: { a: number; w: number }[] = [];
  for (const line of polylines) {
    for (let i = 1; i < line.length; i++) {
      const dx = line[i]!.x - line[i - 1]!.x;
      const dy = line[i]!.y - line[i - 1]!.y;
      const w = Math.hypot(dx, dy);
      if (w === 0) continue;
      const a = fold90(Math.atan2(dy, dx) / DEG);
      segs.push({ a, w });
      hist[Math.min(bins - 1, Math.floor((a + 45) / binDeg))]! += w;
    }
  }
  if (segs.length === 0) throw new Error('dominantGridAngle: no segments');

  // Smooth circularly over ±1 bin so a peak split across two bins still wins.
  let best = 0;
  let bestW = -1;
  for (let b = 0; b < bins; b++) {
    const w = hist[(b - 1 + bins) % bins]! + hist[b]! + hist[(b + 1) % bins]!;
    if (w > bestW) {
      bestW = w;
      best = b;
    }
  }
  const peak = -45 + (best + 0.5) * binDeg;

  let sum = 0;
  let wsum = 0;
  for (const { a, w } of segs) {
    const d = fold90(a - peak);
    if (Math.abs(d) <= 3) {
      sum += d * w;
      wsum += w;
    }
  }
  return fold90(peak + sum / wsum);
}

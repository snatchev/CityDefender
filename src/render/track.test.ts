import { describe, expect, it } from 'vitest';
import { angleDelta, headingAt, makeTrack, nearestS, pointAt } from './track';

// An L: 100 m east, then 50 m south (+z). Tile centres every 10 m, as a route would give them.
const route = [
  ...Array.from({ length: 11 }, (_, i) => [i * 10, 0] as const),
  ...Array.from({ length: 5 }, (_, i) => [100, (i + 1) * 10] as const),
];

describe('camera track', () => {
  const t = makeTrack(3, route);

  it('keeps only the corners and measures the length', () => {
    expect(t.pts).toEqual([
      [0, 0],
      [100, 0],
      [100, 50],
    ]);
    expect(t.length).toBeCloseTo(150);
  });

  it('walks along it from the station', () => {
    expect(pointAt(t, 30)).toEqual([30, 0]);
    expect(pointAt(t, 120)).toEqual([100, 20]);
    expect(pointAt(t, -5)).toEqual([0, 0]);
    expect(pointAt(t, 999)).toEqual([100, 50]);
  });

  it('points toward the goal, turning gradually at the corner', () => {
    expect(headingAt(t, 30, 10)).toBeCloseTo(Math.PI / 2); // east: atan2(dx, dz) = 90°
    expect(headingAt(t, 140, 5)).toBeCloseTo(0); // south: +z
    const corner = headingAt(t, 100, 20);
    expect(corner).toBeGreaterThan(0.1);
    expect(corner).toBeLessThan(Math.PI / 2 - 0.1);
  });

  it('finds the nearest point', () => {
    expect(nearestS(t, 42, 7)).toBeCloseTo(42);
    expect(nearestS(t, 130, 25)).toBeCloseTo(125);
  });

  it('measures turns the short way round', () => {
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDelta(-3, 3)).toBeCloseTo(6 - 2 * Math.PI);
    expect(angleDelta(0.5, 1)).toBeCloseTo(0.5);
  });
});

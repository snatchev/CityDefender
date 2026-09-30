import { describe, expect, it } from 'vitest';
import {
  edgeBreaks,
  polygonArea,
  roofBox,
  roofFacets,
  roofPlanes,
  roofZ,
  type P2,
  type RoofShape,
} from './roofShape';

/** 20 m × 10 m, long side along x, turned 30° so nothing is axis-aligned by accident. */
const turn = (p: P2): P2 => {
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  return [p[0] * c - p[1] * s + 100, p[0] * s + p[1] * c - 40];
};
const RECT: P2[] = (
  [
    [-10, -5],
    [10, -5],
    [10, 5],
    [-10, 5],
  ] as P2[]
).map(turn);
const at = (x: number, y: number) => turn([x, y]);

describe('roof shapes', () => {
  const box = roofBox(RECT);

  it('finds the footprint box', () => {
    expect(box.halfL).toBeCloseTo(10);
    expect(box.halfW).toBeCloseTo(5);
  });

  it('gabled: ridge along the long side, eaves at 0, gable walls break at the ridge', () => {
    const planes = roofPlanes('gabled', box, 4);
    expect(roofZ(planes, ...at(0, 0))).toBeCloseTo(4);
    expect(roofZ(planes, ...at(-10, 0))).toBeCloseTo(4); // top of the gable end
    expect(roofZ(planes, ...at(3, 5))).toBeCloseTo(0);
    expect(roofZ(planes, ...at(3, 2.5))).toBeCloseTo(2);
    expect(edgeBreaks(planes, at(-10, -5), at(-10, 5))).toEqual([0.5]);
    expect(edgeBreaks(planes, at(-10, -5), at(10, -5))).toEqual([]);
  });

  it('across turns the ridge', () => {
    const planes = roofPlanes('gabled', box, 4, true);
    expect(roofZ(planes, ...at(0, 5))).toBeCloseTo(4);
    expect(roofZ(planes, ...at(10, 0))).toBeCloseTo(0);
  });

  it('hipped: same pitch on every side, a ridge 10 m long', () => {
    const planes = roofPlanes('hipped', box, 5);
    expect(roofZ(planes, ...at(5, 0))).toBeCloseTo(5);
    expect(roofZ(planes, ...at(-5, 0))).toBeCloseTo(5);
    expect(roofZ(planes, ...at(8, 0))).toBeCloseTo(2);
    expect(roofZ(planes, ...at(-10, 0))).toBeCloseTo(0);
    // Every wall stays at the eaves (breaks at the hip corners only touch 0).
    for (let i = 0; i < 4; i++) {
      const p = RECT[i]!;
      const q = RECT[(i + 1) % 4]!;
      for (const t of [0, 0.25, 0.5, 0.75, 1])
        expect(roofZ(planes, p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)).toBeCloseTo(0);
    }
  });

  it('mansard: steep sides, flat top at the rise', () => {
    const planes = roofPlanes('mansard', box, 3);
    expect(roofZ(planes, ...at(0, 0))).toBeCloseTo(3);
    expect(roofZ(planes, ...at(0, 3))).toBeCloseTo(3);
    expect(roofZ(planes, ...at(0, 5))).toBeCloseTo(0);
  });

  it('pyramid, cone and dome peak at the centre and stay ≥ 0 on the outline', () => {
    for (const shape of ['pyramidal', 'cone', 'dome'] as RoofShape[]) {
      const planes = roofPlanes(shape, box, 6);
      expect(roofZ(planes, ...at(0, 0))).toBeCloseTo(6);
      for (const p of RECT) expect(roofZ(planes, ...p)).toBeGreaterThanOrEqual(0);
    }
  });

  it('facets tile the footprint exactly, also on a concave outline', () => {
    const L: P2[] = (
      [
        [0, 0],
        [30, 0],
        [30, 10],
        [12, 10],
        [12, 25],
        [0, 25],
      ] as P2[]
    ).map(turn);
    const area = Math.abs(polygonArea(L));
    for (const shape of ['gabled', 'hipped', 'pyramidal', 'mansard', 'dome'] as RoofShape[]) {
      const planes = roofPlanes(shape, roofBox(L), 5);
      const facets = roofFacets(planes, L);
      const sum = facets.reduce((s, f) => s + Math.abs(polygonArea(f.poly)), 0);
      expect(sum, shape).toBeCloseTo(area, 3);
    }
  });

  it('flat roofs have no planes and one facet', () => {
    const planes = roofPlanes('flat', box, 5);
    expect(planes).toEqual([]);
    expect(roofZ(planes, ...at(0, 0))).toBe(0);
    expect(roofFacets(planes, RECT)).toHaveLength(1);
  });
});

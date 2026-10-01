import { describe, expect, it } from 'vitest';
import { buildOccluderGrid, forEachBlocker, maxAt, type OccluderShape } from './occluders';

/** A w × d box footprint with its corner at (x, z). */
function box(id: number, x: number, z: number, w: number, d: number, top: number, base = 0) {
  const ring = [
    [x, z],
    [x + w, z],
    [x + w, z + d],
    [x, z + d],
  ] as const;
  return { id, rings: [ring], base, top } satisfies OccluderShape;
}

function blockers(
  shapes: OccluderShape[],
  from: [number, number, number],
  to: [number, number, number],
  heightScale = 1,
) {
  const g = buildOccluderGrid(shapes, [-100, -100, 100, 100], 4);
  const out = new Set<number>();
  forEachBlocker(g, from, to, heightScale, 4, (id) => out.add(id));
  return [...out].sort();
}

describe('forEachBlocker', () => {
  // A street along z = 0; the camera south of it, up high, looking north at the street.
  const tower = box(1, -10, -40, 20, 20, 60); // between camera and street
  const low = box(2, -10, -40, 20, 20, 5); // same spot, too low to block
  const beside = box(3, 40, -40, 20, 20, 60); // off to the side
  const across = box(4, -10, 10, 20, 20, 60); // behind the street

  it('finds the tall building in the way and nothing else', () => {
    expect(blockers([tower, beside, across], [0, 80, -90], [0, 2, 0])).toEqual([1]);
  });

  it('a line passing over a low building is not blocked', () => {
    expect(blockers([low], [0, 80, -90], [0, 2, 0])).toEqual([]);
  });

  it('squashed (tactical view) the tower no longer blocks', () => {
    expect(blockers([tower], [0, 80, -90], [0, 2, 0], 0.12)).toEqual([]);
  });

  it('a building the target stands against does not count', () => {
    const street = box(5, -2, -2, 4, 4, 30); // covers the target's cell
    expect(blockers([street], [0, 80, -90], [0, 2, 0])).toEqual([]);
  });

  it('a raised part (base above the line) does not block', () => {
    const bridge = box(6, -10, -40, 20, 20, 120, 100);
    expect(blockers([bridge], [0, 80, -90], [0, 2, 0])).toEqual([]);
  });

  it('a courtyard does not block a line that drops through it', () => {
    const outer = [
      [-30, -60],
      [30, -60],
      [30, -10],
      [-30, -10],
    ] as const;
    const yard = [
      [-25, -55],
      [25, -55],
      [25, -15],
      [-25, -15],
    ] as const;
    // Straight down through the yard onto a point in it.
    const ring = { id: 7, rings: [outer, yard], base: 0, top: 40 };
    expect(blockers([ring], [0, 200, -35.1], [0, 2, -35])).toEqual([]);
  });
});

describe('maxAt', () => {
  it('finds the building around a point between its base and top', () => {
    const g = buildOccluderGrid([box(1, 0, 0, 20, 20, 30)], [-50, -50, 50, 50], 4);
    const v = (id: number) => id * 0.5;
    expect(maxAt(g, 10, 15, 10, 1, v)).toBe(0.5);
    expect(maxAt(g, 10, 45, 10, 1, v)).toBe(0);
    expect(maxAt(g, 40, 5, 40, 1, v)).toBe(0);
  });
});

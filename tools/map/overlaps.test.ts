import { describe, expect, it } from 'vitest';
import { resolveOverlaps } from './overlaps';
import type { Solid } from './parts';

const TILE_M = 8;

/** An axis-aligned box outline in tile units. */
function box(
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  eaveM: number,
  extra: Partial<Solid> = {},
): Solid {
  return {
    rings: [
      [
        { u: u0, v: v0 },
        { u: u1, v: v0 },
        { u: u1, v: v1 },
        { u: u0, v: v1 },
        { u: u0, v: v0 },
      ],
    ],
    baseM: 0,
    eaveM,
    roof: 'flat',
    riseM: 0,
    across: false,
    ...extra,
  };
}

function areaM2(s: Solid): number {
  let a = 0;
  const r = s.rings[0]!;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += r[j]!.u * r[i]!.v - r[i]!.u * r[j]!.v;
  return (Math.abs(a) / 2) * TILE_M * TILE_M;
}

describe('resolveOverlaps', () => {
  it('cuts the part of a lower shape that a taller one covers', () => {
    const podium = box(0, 0, 4, 2, 20); // 32 m × 16 m
    const tower = box(0, 0, 2, 2, 150); // covers the west half
    const { solids } = resolveOverlaps([podium, tower], TILE_M);
    expect(solids).toHaveLength(2);
    const cutPodium = solids.find((s) => s.eaveM === 20)!;
    // Half is left, minus the grow margin along the tower's edge.
    expect(areaM2(cutPodium)).toBeGreaterThan(250);
    expect(areaM2(cutPodium)).toBeLessThan(256);
  });

  it('keeps one of two identical shapes, the first', () => {
    const a = box(0, 0, 2, 2, 30);
    const b = box(0, 0, 2, 2, 30);
    const { solids, dropped } = resolveOverlaps([a, b], TILE_M);
    expect(solids).toEqual([a]);
    expect(dropped).toBe(1);
  });

  it('drops a duplicated pitched part without reshaping the one it keeps', () => {
    const roof = { roof: 'gabled' as const, riseM: 10 };
    const a = box(0, 0, 2, 4, 200, roof);
    const b = box(0, 0, 2, 4, 200, roof);
    expect(resolveOverlaps([a, b], TILE_M).solids).toEqual([a]);
  });

  it('leaves no sliver where outlines from two sources disagree by a few centimetres', () => {
    const tower = box(0, 0, 2, 2, 150);
    // The lower block's front edge sits 3 cm in front of the tower's.
    const block = box(-0.00375, 0, 4, 2, 20);
    const { solids } = resolveOverlaps([block, tower], TILE_M);
    const cut = solids.find((s) => s.eaveM === 20)!;
    expect(Math.min(...cut.rings[0]!.map((p) => p.u))).toBeGreaterThanOrEqual(2);
  });

  it('leaves shapes starting higher up alone (a part on a podium does not cover the podium)', () => {
    const podium = box(0, 0, 4, 2, 20);
    const crown = box(0, 0, 2, 2, 150, { baseM: 20 });
    const { solids } = resolveOverlaps([podium, crown], TILE_M);
    expect(solids.map(areaM2)).toEqual([512, 256]);
  });
});

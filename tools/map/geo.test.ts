import { describe, expect, it } from 'vitest';
import { dominantGridAngle, rotate, type Pt } from './geo';

/** A square street grid rotated by `deg`, plus one long diagonal "avenue" as noise. */
function grid(deg: number): Pt[][] {
  const lines: Pt[][] = [];
  for (let i = -5; i <= 5; i++) {
    lines.push([rotate({ x: -500, y: i * 100 }, deg), rotate({ x: 500, y: i * 100 }, deg)]);
    lines.push([rotate({ x: i * 100, y: -500 }, deg), rotate({ x: i * 100, y: 500 }, deg)]);
  }
  lines.push([
    { x: -600, y: -600 },
    { x: 600, y: 600 },
  ]);
  return lines;
}

describe('dominantGridAngle', () => {
  it.each([0, 9.3, -12, 30])('recovers a grid rotated by %s°', (deg) => {
    expect(dominantGridAngle(grid(deg))).toBeCloseTo(deg, 1);
  });

  it('treats angles 90° apart as the same grid', () => {
    expect(dominantGridAngle(grid(9.3 + 90))).toBeCloseTo(9.3, 1);
  });
});

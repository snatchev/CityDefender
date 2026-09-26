import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('stays in range', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f >= 0 && f < 1).toBe(true);
      const n = r.int(3, 6);
      expect(n >= 3 && n <= 6 && Number.isInteger(n)).toBe(true);
    }
  });

  it('pick returns an element', () => {
    const r = createRng(9);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i++) expect(items.includes(r.pick(items))).toBe(true);
  });
});

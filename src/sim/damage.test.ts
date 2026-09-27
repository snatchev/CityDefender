import { describe, expect, it } from 'vitest';
import rulesData from '../data/rules.json';
import { hitDamage } from './damage';

const floor = rulesData.armorMinDamageFraction;

describe('hitDamage', () => {
  it('passes damage through unarmored targets', () => {
    expect(hitDamage(4, 'kinetic', 0)).toBe(4);
    expect(hitDamage(14, 'explosive', 0)).toBe(14);
  });

  it('takes armor off each hit', () => {
    expect(hitDamage(14, 'explosive', 6)).toBe(8);
    expect(hitDamage(10, 'cryo', 3)).toBe(7);
  });

  it('never goes below the floor fraction, however thick the armor', () => {
    expect(hitDamage(4, 'kinetic', 6)).toBe(4 * floor);
    expect(hitDamage(4, 'kinetic', 1000)).toBe(4 * floor);
    // Right at the crossover the two rules agree.
    expect(hitDamage(8, 'kinetic', 8 * (1 - floor))).toBeCloseTo(8 * floor);
  });

  it('pierce ignores armor', () => {
    expect(hitDamage(60, 'pierce', 6)).toBe(60);
    expect(hitDamage(60, 'pierce', 1000)).toBe(60);
  });

  it('zero raw damage stays zero', () => {
    expect(hitDamage(0, 'kinetic', 6)).toBe(0);
    expect(hitDamage(0, 'pierce', 0)).toBe(0);
  });
});

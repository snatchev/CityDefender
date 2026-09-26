import { describe, expect, it } from 'vitest';
import { FixedStepper } from './stepper';

describe('FixedStepper', () => {
  it('turns frame time into whole fixed steps and carries the remainder', () => {
    const s = new FixedStepper(0.05);
    expect(s.advance(0.12)).toBe(2); // 0.02 carried
    expect(s.advance(0.03)).toBe(1); // 0.05 total
    expect(s.alpha).toBeCloseTo(0, 5);
  });

  it('matches wall-clock over many 60 Hz frames', () => {
    const s = new FixedStepper(0.05);
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += s.advance(1 / 60); // 10 s
    expect(steps).toBeGreaterThanOrEqual(199);
    expect(steps).toBeLessThanOrEqual(200);
  });

  it('respects timeScale and pause', () => {
    const s = new FixedStepper(0.05);
    s.timeScale = 0;
    expect(s.paused).toBe(true);
    expect(s.advance(1)).toBe(0);
    s.timeScale = 3;
    expect(s.advance(0.1)).toBe(6);
  });

  it('caps steps per frame after a long stall', () => {
    const s = new FixedStepper(0.05, 8, 10);
    expect(s.advance(5)).toBe(8);
    expect(s.alpha).toBe(0);
  });
});

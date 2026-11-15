import { describe, expect, it } from 'vitest';
import { Crowd, MAX_OFFSET_M, type CrowdAgent } from './crowd';

const DT = 1 / 60;
type Pos = readonly [number, number];
type CanStand = (x: number, z: number) => boolean;
const anywhere: CanStand = () => true;

function agent(id: number, x: number, z: number, r: number, layer: number | null = 0): CrowdAgent {
  return { id, x, z, r, layer, hx: 0, hz: 1, ox: 0, oz: 0 };
}

/** Run the crowd for a few seconds; where each bug is drawn. */
function settle(crowd: Crowd, agents: CrowdAgent[], canStand = anywhere, frames = 240): Pos[] {
  for (let f = 0; f < frames; f++) crowd.step(agents, DT, canStand);
  return agents.map((a) => {
    const [ox, oz] = crowd.offset(a.id);
    return [a.x + ox, a.z + oz] as Pos;
  });
}

const dist = (p: Pos, q: Pos) => Math.hypot(p[0] - q[0], p[1] - q[1]);

describe('Crowd', () => {
  it('parts two bugs on the same spot until they barely overlap', () => {
    const [p, q] = settle(new Crowd(), [agent(1, 0, 0, 3), agent(2, 0, 0, 3)]) as [Pos, Pos];
    expect(dist(p, q)).toBeGreaterThan(6 * 0.8);
  });

  it('lets a big bug part small ones instead of being shoved', () => {
    const agents = [agent(1, 0, 0, 10), agent(2, 1, 0, 3), agent(3, -1, 1, 3)];
    const [boss, a, b] = settle(new Crowd(), agents) as [Pos, Pos, Pos];
    expect(dist(boss, [0, 0])).toBeLessThan(1);
    expect(dist(a, boss)).toBeGreaterThan(10);
    expect(dist(b, boss)).toBeGreaterThan(10);
  });

  it('keeps layers apart and buried bugs out of it', () => {
    const agents = [agent(1, 0, 0, 3, 0), agent(2, 0, 0, 3, 1), agent(3, 0, 0, 3, null)];
    for (const p of settle(new Crowd(), agents)) expect(dist(p, [0, 0])).toBeLessThan(0.01);
  });

  it('never draws a bug where it cannot stand, nor too far from its spot', () => {
    // A street 8 m wide along z (|x| < 4); twenty bugs on one spot.
    const street: CanStand = (x) => Math.abs(x) < 4;
    const agents = Array.from({ length: 20 }, (_, i) => agent(i + 1, 0, 0, 3));
    const out = settle(new Crowd(), agents, street);
    for (const p of out) {
      expect(street(p[0], p[1])).toBe(true);
      expect(dist(p, [0, 0])).toBeLessThanOrEqual(MAX_OFFSET_M + 1e-9);
    }
    // They string out along the street.
    const zs = out.map((p) => p[1]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(15);
  });
});

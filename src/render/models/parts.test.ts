import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { partsFromGltf } from './library';
import { bakeModel, Motion, partMotion, SEG_PHASE_STEP, type PartIn } from './parts';

const ORIGIN: [number, number, number] = [0, 0, 0];

describe('partMotion', () => {
  it('reads the motion from the name prefix', () => {
    expect(partMotion('bugs', 'body', undefined, ORIGIN).kind).toBe(Motion.rigid);
    expect(partMotion('bugs', 'leg_L1', undefined, ORIGIN).kind).toBe(Motion.leg);
    expect(partMotion('bugs', 'wing_R2', undefined, ORIGIN).kind).toBe(Motion.wing);
    expect(partMotion('bugs', 'jaw_L', undefined, ORIGIN).kind).toBe(Motion.jaw);
    expect(partMotion('bugs', 'sway_antenna_R', undefined, ORIGIN).kind).toBe(Motion.sway);
    expect(partMotion('bugs', 'seg_3', undefined, ORIGIN).kind).toBe(Motion.seg);
    expect(partMotion('bugs', 'pulse_sac', undefined, ORIGIN).kind).toBe(Motion.pulse);
    expect(partMotion('towers', 'turret', undefined, ORIGIN).kind).toBe(Motion.turret);
    expect(partMotion('towers', 'kick_barrels', undefined, ORIGIN).kind).toBe(Motion.kick);
    expect(partMotion('towers', 'spin_ring_2', undefined, ORIGIN).kind).toBe(Motion.spin);
    expect(partMotion('towers', 'base', undefined, ORIGIN).kind).toBe(Motion.rigid);
    // A person's leg strides; a bug's walks.
    expect(partMotion('props', 'leg_L', undefined, ORIGIN).kind).toBe(Motion.stride);
    expect(partMotion('props', 'arm_R', undefined, ORIGIN).kind).toBe(Motion.stride);
  });

  it('alternates legs in two tripods: L1 R2 L3 against R1 L2 R3', () => {
    const phase = (n: string) => partMotion('bugs', n, undefined, ORIGIN).phase;
    for (const n of ['leg_L1', 'leg_R2', 'leg_L3']) expect(phase(n)).toBe(0);
    for (const n of ['leg_R1', 'leg_L2', 'leg_R3']) expect(phase(n)).toBe(0.5);
  });

  it('takes the side from the name, else from where the pivot sits', () => {
    expect(partMotion('bugs', 'leg_L2', undefined, [-1, 0, 0]).side).toBe(1);
    expect(partMotion('bugs', 'jaw_R', undefined, [1, 0, 0]).side).toBe(-1);
    expect(partMotion('bugs', 'sway_antenna_L', undefined, ORIGIN).side).toBe(1);
    expect(partMotion('bugs', 'sway_tail', undefined, [-0.3, 0, 0]).side).toBe(-1);
  });

  it('ripples worm segments front to back', () => {
    const p = [1, 2, 3].map((k) => partMotion('bugs', `seg_${k}`, undefined, ORIGIN).phase);
    expect(p[0]).toBe(0);
    expect(p[1]).toBeCloseTo(SEG_PHASE_STEP);
    expect(p[2]).toBeCloseTo(2 * SEG_PHASE_STEP);
  });

  it('lets node extras override phase and amp', () => {
    const m = partMotion('bugs', 'leg_R1', { phase: 0.25, amp: 1.6 }, ORIGIN);
    expect(m.phase).toBe(0.25);
    expect(m.amp).toBe(1.6);
    expect(partMotion('bugs', 'sway_x', {}, ORIGIN).amp).toBe(1);
  });
});

describe('bakeModel', () => {
  const tri = (x: number, color: [number, number, number]) => ({
    positions: [x, 0, 0, x + 1, 0, 0, x, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2],
    color,
    glow: [0, 0, 0] as [number, number, number],
    tintSlot: 0,
  });
  const parts: PartIn[] = [
    { name: 'body', pivot: [0, 1, 0], primitives: [tri(0, [1, 0, 0])] },
    {
      name: 'leg_R1',
      pivot: [-2, 1, 0.5],
      primitives: [tri(-3, [0, 1, 0]), { ...tri(-5, [0, 0, 1]), glow: [3, 3, 0] }],
    },
    { name: 'muzzle', pivot: [0, 5, 7], primitives: [] },
  ];
  const b = bakeModel('bugs', parts);

  it('merges every primitive and offsets the indices', () => {
    expect(b.position.length).toBe(9 * 3);
    expect([...b.index]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('gives each vertex its part’s colour, glow, pivot and motion', () => {
    expect([...b.color.slice(0, 3)]).toEqual([1, 0, 0]);
    expect([...b.color.slice(9, 12)]).toEqual([0, 1, 0]);
    expect([...b.glow.slice(18, 21)]).toEqual([3, 3, 0]);
    expect([...b.pivot.slice(9, 12)]).toEqual([-2, 1, 0.5]);
    expect([...b.part.slice(0, 4)]).toEqual([Motion.rigid, 0, 1, 1]);
    expect([...b.part.slice(12, 16)]).toEqual([Motion.leg, 0.5, 1, -1]);
  });

  it('keeps Empties as named nodes and measures the bounds', () => {
    expect(b.nodes.muzzle).toEqual([0, 5, 7]);
    expect(b.motions.muzzle).toBeUndefined();
    expect(b.min).toEqual([-5, 0, 0]);
    expect(b.max).toEqual([1, 1, 0]);
  });
});

/** The real models, parsed as the game parses them. */
async function loadReal(path: string) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new GLTFLoader().parseAsync(ab, '');
  return partsFromGltf(gltf.scene);
}

describe('real models', () => {
  it('skitterling: six walking legs on two tripods, pivots at the hips', async () => {
    const family = 'bugs';
    const b = bakeModel(family, await loadReal('public/models/bugs/skitterling.glb'));
    const legs = Object.entries(b.motions).filter(([, m]) => m.kind === Motion.leg);
    expect(legs).toHaveLength(6);
    expect(b.motions.leg_L1!.phase).toBe(0);
    expect(b.motions.leg_R1!.phase).toBe(0.5);
    expect(b.nodes.leg_L1![0]).toBeGreaterThan(0); // left is +X
    expect(b.min[1]).toBeCloseTo(0, 1); // stands on the street
    expect(b.motions.sway_antenna_L!.amp).toBeCloseTo(1.2);
    // Eyes glow.
    expect(Math.max(...b.glow)).toBeGreaterThan(1);
  });

  it('mgNest: a turret, a kicking barrel and a muzzle in front (+Z)', async () => {
    const b = bakeModel('towers', await loadReal('public/models/towers/mgNest.glb'));
    expect(b.motions.turret!.kind).toBe(Motion.turret);
    expect(b.motions.kick_barrels!.kind).toBe(Motion.kick);
    expect(b.nodes.muzzle![2]).toBeGreaterThan(0);
  });
});

/**
 * Models → vertex attributes (D060, tools/models/README.md "The contract").
 *
 * A model is a set of parts (top-level glTF nodes). A part's name says how it moves and its
 * translation is the joint it moves about. This module turns parsed parts into one set of flat
 * arrays the vertex shader animates (`partMotion.ts`). Pure TypeScript with no three.js, so the
 * mapping is unit-tested (`parts.test.ts`).
 */

/** How a part moves. The numbers are what the shader reads from `aPart.x`; keep in step with partMotion.ts. */
export const Motion = {
  rigid: 0,
  /** Bug leg: swings about the vertical axis at the hip, lifts on the forward stroke. */
  leg: 1,
  /** Bug wing: flaps fast about the fore-aft axis at the root. */
  wing: 2,
  /** Bug jaw: opens and closes about the vertical axis at the hinge. */
  jaw: 3,
  /** Antenna, tail, stinger: sways gently about its base. */
  sway: 4,
  /** Worm segment: ripples (sideways and up), front to back. */
  seg: 5,
  /** Sac: swells and shrinks about its centre. */
  pulse: 6,
  /** Tower turret: turns to the target about the vertical axis through the model origin. */
  turret: 7,
  /** Tower barrel: turns with the turret and jumps away from the muzzle on firing. */
  kick: 8,
  /** Tower dish, ring: turns all the time about the vertical axis through its own origin. */
  spin: 9,
  /** Person's arm or leg: swings fore and aft about the side axis (walking). */
  stride: 10,
} as const;
export type MotionKind = (typeof Motion)[keyof typeof Motion];

/** What a model is, which decides how some names read (a person's `leg_L` strides, a bug's `leg_L1` walks). */
export type ModelFamily = 'bugs' | 'towers' | 'barricades' | 'props';

/** Phase step between successive worm segments (cycles): the ripple runs front to back. */
export const SEG_PHASE_STEP = 0.12;
/** Phase step between successive wings on one side (cycles), so fore and hind wings don't flap as one. */
export const WING_PHASE_STEP = 0.15;
/** Right-hand sway parts lag the left ones a little, so antennae don't move as a pair. */
const SWAY_R_PHASE = 0.3;

export interface PartMotion {
  kind: MotionKind;
  /** 0–1, cycles: offset of this part in its motion's cycle. */
  phase: number;
  /** 0–2: multiplier on the motion's default size. */
  amp: number;
  /** +1 for a left part (+X), −1 for a right part (−X); motions mirror by it. */
  side: number;
}

/** `leg_L1` → L, 1; `jaw_R` → R; `sway_antenna_L` → L; `body` → none. */
function sideAndNumber(name: string): { side: 'L' | 'R' | null; n: number } {
  const m = /(?:^|_)([LR])(\d*)$/.exec(name);
  if (!m) return { side: null, n: 0 };
  return { side: m[1] as 'L' | 'R', n: m[2] ? Number(m[2]) : 0 };
}

/**
 * How a part moves, from its name, its node's `extras` (`phase`, `amp` override the defaults) and
 * its pivot (a part with no L/R in its name takes its side from which side of the model it sits on).
 *
 * Legs alternate in two tripods (README): L1, R2, L3 at phase 0; R1, L2, R3 at phase 0.5. A
 * person's arms swing against the leg on the same side.
 */
export function partMotion(
  family: ModelFamily,
  name: string,
  extras: Record<string, unknown> | undefined,
  pivot: readonly [number, number, number],
): PartMotion {
  const { side: s, n } = sideAndNumber(name);
  const side = s === 'L' ? 1 : s === 'R' ? -1 : pivot[0] < 0 ? -1 : 1;
  let kind: MotionKind = Motion.rigid;
  let phase = 0;
  if (family === 'props') {
    if (name.startsWith('leg_')) {
      kind = Motion.stride;
      phase = s === 'R' ? 0.5 : 0;
    } else if (name.startsWith('arm_')) {
      kind = Motion.stride;
      phase = s === 'R' ? 0 : 0.5;
    }
  } else if (name.startsWith('leg_')) {
    kind = Motion.leg;
    phase = (n + (s === 'L' ? 1 : 0)) % 2 === 0 ? 0 : 0.5;
  } else if (name.startsWith('wing_')) {
    kind = Motion.wing;
    phase = Math.max(0, n - 1) * WING_PHASE_STEP;
  } else if (name.startsWith('jaw_')) {
    kind = Motion.jaw;
  } else if (name.startsWith('sway_')) {
    kind = Motion.sway;
    phase = s === 'R' ? SWAY_R_PHASE : 0;
  } else if (name.startsWith('seg_')) {
    kind = Motion.seg;
    const k = Number(/^seg_(\d+)/.exec(name)?.[1] ?? 1);
    phase = (k - 1) * SEG_PHASE_STEP;
  } else if (name.startsWith('pulse_')) {
    kind = Motion.pulse;
  } else if (name.startsWith('turret')) {
    kind = Motion.turret;
  } else if (name.startsWith('kick')) {
    kind = Motion.kick;
  } else if (name.startsWith('spin')) {
    kind = Motion.spin;
  }
  const ph = extras?.phase;
  const am = extras?.amp;
  return {
    kind,
    phase: typeof ph === 'number' ? ph : phase - Math.floor(phase),
    amp: typeof am === 'number' ? am : 1,
    side,
  };
}

/** One draw primitive of a part: indexed triangles in model space with one flat material. */
export interface PrimitiveIn {
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  /** Triangle indices into this primitive's vertices (null: unindexed, every 3 vertices a triangle). */
  indices: ArrayLike<number> | null;
  /** Base colour, linear RGB. */
  color: readonly [number, number, number];
  /** Emission, linear RGB times strength (0 for no glow). */
  glow: readonly [number, number, number];
  /** Per-instance colour slot (props: materials named `tint`, `tint2` → 1, 2; else 0). */
  tintSlot: number;
}

/** A top-level node: a moving part with geometry, or an Empty (a marker like `muzzle`). */
export interface PartIn {
  name: string;
  /** Node translation in model space: the part's joint. */
  pivot: [number, number, number];
  extras?: Record<string, unknown>;
  primitives: PrimitiveIn[];
}

/** A model merged into flat arrays, ready to become one BufferGeometry. */
export interface BakedModel {
  position: Float32Array;
  normal: Float32Array;
  /** Base colour per vertex (linear RGB): the `color` attribute. */
  color: Float32Array;
  /** Emission per vertex (linear RGB × strength). */
  glow: Float32Array;
  /** The part's joint per vertex. */
  pivot: Float32Array;
  /** Per vertex: motion kind, phase, amp, side. */
  part: Float32Array;
  /** Per vertex: tint slot (props). */
  tintSlot: Float32Array;
  /** Normals averaged over vertices at the same position (for an outline hull with no cracks). */
  smoothNormal: Float32Array;
  index: Uint32Array;
  /** Pivots of every node by name, Empties included (`muzzle`). */
  nodes: Record<string, [number, number, number]>;
  /** Motion of every part with geometry, by name. */
  motions: Record<string, PartMotion>;
  /** Axis-aligned bounds of the geometry, model space. */
  min: [number, number, number];
  max: [number, number, number];
}

/** Merge a model's parts into flat vertex arrays with each vertex's colour, glow, joint and motion. */
export function bakeModel(family: ModelFamily, parts: readonly PartIn[]): BakedModel {
  let nVerts = 0;
  let nIdx = 0;
  for (const p of parts) {
    for (const prim of p.primitives) {
      const v = prim.positions.length / 3;
      nVerts += v;
      nIdx += prim.indices ? prim.indices.length : v;
    }
  }
  const out: BakedModel = {
    position: new Float32Array(nVerts * 3),
    normal: new Float32Array(nVerts * 3),
    color: new Float32Array(nVerts * 3),
    glow: new Float32Array(nVerts * 3),
    pivot: new Float32Array(nVerts * 3),
    part: new Float32Array(nVerts * 4),
    tintSlot: new Float32Array(nVerts),
    smoothNormal: new Float32Array(nVerts * 3),
    index: new Uint32Array(nIdx),
    nodes: {},
    motions: {},
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  let v0 = 0;
  let i0 = 0;
  for (const p of parts) {
    out.nodes[p.name] = [...p.pivot];
    if (p.primitives.length === 0) continue;
    const m = partMotion(family, p.name, p.extras, p.pivot);
    out.motions[p.name] = m;
    for (const prim of p.primitives) {
      const v = prim.positions.length / 3;
      for (let k = 0; k < v; k++) {
        const j = v0 + k;
        for (let c = 0; c < 3; c++) {
          const x = prim.positions[k * 3 + c]!;
          out.position[j * 3 + c] = x;
          out.normal[j * 3 + c] = prim.normals[k * 3 + c] ?? 0;
          out.color[j * 3 + c] = prim.color[c]!;
          out.glow[j * 3 + c] = prim.glow[c]!;
          out.pivot[j * 3 + c] = p.pivot[c]!;
          if (x < out.min[c]!) out.min[c] = x;
          if (x > out.max[c]!) out.max[c] = x;
        }
        out.part.set([m.kind, m.phase, m.amp, m.side], j * 4);
        out.tintSlot[j] = prim.tintSlot;
      }
      if (prim.indices) {
        for (let k = 0; k < prim.indices.length; k++) out.index[i0 + k] = v0 + prim.indices[k]!;
        i0 += prim.indices.length;
      } else {
        for (let k = 0; k < v; k++) out.index[i0 + k] = v0 + k;
        i0 += v;
      }
      v0 += v;
    }
  }
  smoothNormals(out);
  return out;
}

/** Average the normals of vertices that share a position within one part (split at sharp edges). */
function smoothNormals(b: BakedModel): void {
  const n = b.position.length / 3;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = [
      Math.round(b.position[i * 3]! * 1000),
      Math.round(b.position[i * 3 + 1]! * 1000),
      Math.round(b.position[i * 3 + 2]! * 1000),
      // Parts move separately: never weld across two parts.
      b.pivot[i * 3],
      b.pivot[i * 3 + 1],
      b.pivot[i * 3 + 2],
      b.part[i * 4],
    ].join(',');
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(i);
  }
  for (const g of groups.values()) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const i of g) {
      x += b.normal[i * 3]!;
      y += b.normal[i * 3 + 1]!;
      z += b.normal[i * 3 + 2]!;
    }
    const len = Math.hypot(x, y, z) || 1;
    for (const i of g) b.smoothNormal.set([x / len, y / len, z / len], i * 3);
  }
}

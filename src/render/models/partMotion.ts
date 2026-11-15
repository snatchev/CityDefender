import type { Material, Vector3 } from 'three';
import { Motion } from './parts';

/**
 * The vertex shader that animates baked models part by part (D060). It patches a built-in material
 * (`onBeforeCompile`), so lighting, fog, shadows and instancing stay three's own.
 *
 * Every vertex knows its part's joint (`aPivot`) and motion (`aPart`: kind, phase, amp, side; see
 * `Motion` in parts.ts). Per instance, `aAnim` drives the motion:
 *
 * - bugs and people: x = walk (stride cycles covered: legs step with distance, not time),
 *   y = gait (0 standing … 1 walking: the stride's size), z = seed (0–1, so no two are in step),
 *   w = busy (0–1: jaws work faster while chewing or spitting);
 * - towers: x = turret yaw (rad), y = kick (1 just fired … 0 at rest), z = seed.
 *
 * Time-driven motions (wings, jaws, sways, pulses, spins) use `uTime`, the sim clock, so they hold
 * still while paused and speed up with the game.
 */

/** Sizes and rates of each motion (radians, metres, Hz). Model `amp` multiplies the sizes. */
export const MOTION = {
  /** Leg swing about the hip's vertical axis, and lift about the fore-aft axis on the forward stroke. */
  LEG_SWING: 0.38,
  LEG_LIFT: 0.32,
  /** Body dips this fraction of the model's height twice per stride (feet sink, never float). */
  BOB_FRACTION: 0.035,
  WING_REST: 0.1,
  WING_FLAP: 0.75,
  WING_HZ: 9,
  JAW_OPEN: 0.42,
  JAW_HZ: 0.9,
  /** Jaws chewing a barricade, or a spitter in firing position. */
  JAW_BUSY_HZ: 2.6,
  SWAY: 0.22,
  SWAY_HZ: 0.7,
  /** Worm segments: sideways and upward ripple (m), one wave per stride. */
  SEG_SIDE_M: 0.32,
  SEG_LIFT_M: 0.22,
  PULSE: 0.09,
  PULSE_HZ: 1.1,
  /** Tower barrel recoil (m), directly away from the muzzle. */
  KICK_M: 1.1,
  /** Radar dishes and coil rings (rad/s). */
  SPIN_RATE: 1.6,
  /** Arms and legs of people, swinging fore and aft. */
  STRIDE_SWING: 0.55,
} as const;

/** Uniforms shared by every patched material: set once per frame (`setMotionClock`). */
const shared = {
  uTime: { value: 0 },
};

/** The sim clock (seconds) the time-driven motions run on. Call once per frame. */
export function setMotionClock(simSeconds: number): void {
  shared.uTime.value = simSeconds;
}

export interface PartMotionOptions {
  /** Read per-instance `aAnim` (vec4); without it every part rests (barricades, static props). */
  animated?: boolean;
  /** Per-instance `aTint` (vec4: rgb, amount): mixes the surface toward a colour (hit flash, damage). */
  tint?: boolean;
  /** Per-instance `aTint1`, `aTint2` (vec3) colour the vertices of tint slots 1 and 2 (props' paint). */
  tintSlots?: boolean;
  /** Add the baked emission and a self-lit term (lit materials only). */
  glow?: boolean;
  /** Push vertices out along their welded normal by `hull` metres (an inverted-hull outline). */
  hull?: number;
  /** Self-lit share of the surface colour (glow only). */
  selfLit?: number;
  /** Multiplier on the baked emission (glow only). */
  glowScale?: number;
  /** Bugs: body dip per stride (m, model space). */
  bobM?: number;
  /** Towers: unit vector from the muzzle back toward the kick part's joint (model space). */
  kickDir?: Vector3;
}

/** Per-material uniforms the caller may change every frame (glow by night, hull width). */
export interface PartMotionUniforms {
  uSelfLit: { value: number };
  uGlow: { value: number };
  uHull: { value: number };
  uBob: { value: number };
  uKickDir: { value: Vector3 | [number, number, number] };
}

const defines = Object.entries(MOTION)
  .map(([k, v]) => `#define CD_${k} ${v.toFixed(4)}`)
  .concat(Object.entries(Motion).map(([k, v]) => `#define CD_KIND_${k.toUpperCase()} ${v}.0`))
  .join('\n');

const VERTEX_HEADER = /* glsl */ `
${defines}
attribute vec3 aPivot;
attribute vec4 aPart;
attribute vec3 aGlow;
attribute vec3 aSmoothN;
attribute float aTintSlot;
#ifdef CD_ANIMATED
attribute vec4 aAnim;
#endif
#ifdef CD_TINT
attribute vec4 aTint;
varying vec4 vTint;
#endif
#ifdef CD_TINT_SLOTS
attribute vec3 aTint1;
attribute vec3 aTint2;
#endif
#ifdef CD_GLOW
varying vec3 vGlow;
#endif
uniform float uTime;
uniform float uBob;
uniform float uHull;
uniform vec3 uKickDir;
const float CD_TAU = 6.2831853;
mat3 cdRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 cdRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 cdRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
bool cdIs(float kind, float k) { return abs(kind - k) < 0.5; }
// A part moves as p' = R (p - C) + C + T.
void cdPart(out mat3 R, out vec3 C, out vec3 T) {
  R = mat3(1.0);
  C = aPivot;
  T = vec3(0.0);
#ifdef CD_ANIMATED
  vec4 anim = aAnim;
#else
  vec4 anim = vec4(0.0);
#endif
  float kind = aPart.x;
  float ph = aPart.y;
  float amp = aPart.z;
  float side = aPart.w;
  float walk = anim.x;
  float gait = anim.y;
  float seed = anim.z;
  if (cdIs(kind, CD_KIND_LEG)) {
    float u = CD_TAU * (walk + ph);
    R = cdRotY(-side * CD_LEG_SWING * amp * gait * sin(u))
      * cdRotZ(side * CD_LEG_LIFT * amp * gait * max(0.0, cos(u)));
  } else if (cdIs(kind, CD_KIND_WING)) {
    R = cdRotZ(side * (CD_WING_REST + CD_WING_FLAP * amp * sin(CD_TAU * (uTime * CD_WING_HZ + ph + seed))));
  } else if (cdIs(kind, CD_KIND_JAW)) {
    float hz = mix(CD_JAW_HZ, CD_JAW_BUSY_HZ, anim.w);
    R = cdRotY(side * CD_JAW_OPEN * amp * (0.5 + 0.5 * sin(CD_TAU * (uTime * hz + ph + seed))));
  } else if (cdIs(kind, CD_KIND_SWAY)) {
    float t = CD_TAU * (uTime * CD_SWAY_HZ + ph + seed);
    R = cdRotX(CD_SWAY * amp * sin(t)) * cdRotY(0.7 * CD_SWAY * amp * sin(0.73 * t + 1.9));
  } else if (cdIs(kind, CD_KIND_SEG)) {
    float u = CD_TAU * (walk - ph);
    T = gait * amp * vec3(CD_SEG_SIDE_M * sin(u), CD_SEG_LIFT_M * max(0.0, cos(u)), 0.0);
  } else if (cdIs(kind, CD_KIND_PULSE)) {
    R = mat3(1.0 + CD_PULSE * amp * sin(CD_TAU * (uTime * CD_PULSE_HZ + ph + seed)));
  } else if (cdIs(kind, CD_KIND_TURRET)) {
    C = vec3(0.0);
    R = cdRotY(anim.x);
  } else if (cdIs(kind, CD_KIND_KICK)) {
    C = vec3(0.0);
    R = cdRotY(anim.x);
    T = R * (uKickDir * (CD_KICK_M * amp * anim.y));
  } else if (cdIs(kind, CD_KIND_SPIN)) {
    R = cdRotY(uTime * CD_SPIN_RATE * amp + CD_TAU * (ph + seed));
  } else if (cdIs(kind, CD_KIND_STRIDE)) {
    R = cdRotX(CD_STRIDE_SWING * amp * gait * sin(CD_TAU * (walk + ph)));
  }
  // The whole bug dips twice per stride (uBob is 0 for anything else).
  T.y -= uBob * gait * (0.5 + 0.5 * cos(2.0 * CD_TAU * walk));
}
`;

const FRAGMENT_HEADER = /* glsl */ `
uniform float uSelfLit;
uniform float uGlow;
#ifdef CD_TINT
varying vec4 vTint;
#endif
#ifdef CD_GLOW
varying vec3 vGlow;
#endif
`;

/**
 * Patch a built-in material (MeshStandardMaterial, MeshLambertMaterial, MeshBasicMaterial…) to
 * animate baked model parts. Use it with a geometry from `library.ts`. Returns the material and its
 * uniforms (change their values freely; no recompile).
 */
export function withPartMotion<M extends Material>(
  material: M,
  opts: PartMotionOptions = {},
): { material: M; uniforms: PartMotionUniforms } {
  const uniforms: PartMotionUniforms = {
    uSelfLit: { value: opts.selfLit ?? 0 },
    uGlow: { value: opts.glowScale ?? 1 },
    uHull: { value: opts.hull ?? 0 },
    uBob: { value: opts.bobM ?? 0 },
    uKickDir: { value: opts.kickDir ?? [0, 0, -1] },
  };
  const d: Record<string, string> = {};
  if (opts.animated) d.CD_ANIMATED = '';
  if (opts.tint) d.CD_TINT = '';
  if (opts.tintSlots) d.CD_TINT_SLOTS = '';
  if (opts.glow) d.CD_GLOW = '';
  if (opts.hull !== undefined) d.CD_HULL = '';
  material.defines = { ...(material.defines ?? {}), ...d };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, uniforms);
    shader.vertexShader = (VERTEX_HEADER + shader.vertexShader)
      .replace(
        'void main() {',
        'void main() {\n  mat3 cdR; vec3 cdC; vec3 cdT;\n  cdPart(cdR, cdC, cdT);',
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = cdR * vec3( normal );')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `vec3 transformed = cdR * (vec3(position) - cdC) + cdC + cdT;
#ifdef CD_HULL
  transformed += normalize(cdR * aSmoothN) * uHull;
#endif
#ifdef CD_TINT
  vTint = aTint;
#endif
#ifdef CD_GLOW
  vGlow = aGlow;
#endif`,
      )
      .replace(
        '#include <color_vertex>',
        /* glsl */ `#include <color_vertex>
#if defined(CD_TINT_SLOTS) && defined(USE_COLOR)
  vColor.rgb *= aTintSlot < 0.5 ? vec3(1.0) : aTintSlot < 1.5 ? aTint1 : aTint2;
#endif`,
      );
    shader.fragmentShader = (FRAGMENT_HEADER + shader.fragmentShader)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
#ifdef CD_TINT
  diffuseColor.rgb = mix(diffuseColor.rgb, vTint.rgb, vTint.a);
#endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
#ifdef CD_GLOW
  #ifdef CD_TINT
    float cdGlowMask = 1.0 - vTint.a;
  #else
    float cdGlowMask = 1.0;
  #endif
  totalEmissiveRadiance += diffuseColor.rgb * uSelfLit + vGlow * uGlow * cdGlowMask;
#endif`,
      );
  };
  material.customProgramCacheKey = () => `cdPartMotion:${Object.keys(d).sort().join(',')}`;
  return { material, uniforms };
}

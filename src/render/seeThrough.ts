import {
  DataTexture,
  LessEqualDepth,
  MeshBasicMaterial,
  RedFormat,
  UnsignedByteType,
  Vector3,
  type Material,
  type PerspectiveCamera,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import {
  buildOccluderGrid,
  forEachBlocker,
  maxAt,
  type OccluderGrid,
  type OccluderShape,
} from './occluders';
import { pointAt, type Track } from './track';

/**
 * See-through buildings (D055): a building that stands between the camera and the active track
 * (the route the rail camera rides) fades out as a whole, and clicks go through it. Each frame,
 * sight lines from the camera to points along the visible part of the track are walked through a
 * grid of building footprints (occluders.ts); every building one of them passes through fades out,
 * and fades back in a moment after none does. The fade is dithered ("screen door" transparency:
 * stays opaque to the GPU, so no sorting problems), leaving a faint ghost of the building.
 *
 * Every building-ish mesh carries an `aOcc` vertex (or instance) attribute naming its occluder;
 * a small texture holds each occluder's fade, which the shader looks up. Id 0 never fades.
 */

/** Share of pixels removed from a fully faded building (the rest keep a ghost of it). */
const MAX_FADE = 0.9;
/** Fade in and out over 1 / this (s). */
const FADE_PER_S = 5;
/** A building stays faded this long after it stops being in the way (s), so edges don't flicker. */
const HOLD_S = 0.35;
/** Sight lines go to points this far apart along the track (m), at this height, and this far to each side. */
const SAMPLE_M = 6;
const TARGET_Y_M = 2;
const LATERAL_M = 3;
/** The last stretch of a sight line, where it reaches the street between the walls lining it (m). */
const STOP_SHORT_M = 4;
/** Track points this far outside the screen (NDC) still count, for buildings at the edges. */
const SCREEN_MARGIN = 1.15;
/** Footprint grid cell size (m). */
const CELL_M = 4;
const TEX_W = 256;

/** Occluder ids: City Hall, then the level's buildings, then the near backdrop's boxes. */
export const CITY_HALL_ID = 1;
export const buildingId = (i: number) => 2 + i;
export const backdropId = (nSolids: number, k: number) => 2 + nSolids + k;

const state = {
  grid: null as OccluderGrid | null,
  heightScale: 1,
  /** Current fade (0..1) and when each occluder was last in the way (s), by id. */
  fade: new Float32Array(1),
  seen: new Float64Array(1),
  /** Occluders fading or faded. */
  active: new Set<number>(),
  data: new Uint8Array(TEX_W),
  /** Sight-line targets along the track: x, z, and the unit sideways direction. */
  samples: new Float32Array(0),
  /** CPU time of the last update (ms), for the dev hook. */
  lastMs: 0,
};

const uniforms = {
  uSeeFade: { value: makeTexture(state.data, 1) },
};

function makeTexture(data: Uint8Array, rows: number): DataTexture {
  const tex = new DataTexture(data, TEX_W, rows, RedFormat, UnsignedByteType);
  tex.needsUpdate = true;
  return tex;
}

/** The buildings that can fade (ids as above, each < `idCount`). Rebuilds the grid. */
export function setOccluders(shapes: readonly OccluderShape[], idCount: number): void {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const s of shapes)
    for (const [x, z] of s.rings[0] ?? []) {
      x0 = Math.min(x0, x);
      z0 = Math.min(z0, z);
      x1 = Math.max(x1, x);
      z1 = Math.max(z1, z);
    }
  state.grid = shapes.length > 0 ? buildOccluderGrid(shapes, [x0, z0, x1, z1], CELL_M) : null;
  const rows = Math.max(1, Math.ceil(idCount / TEX_W));
  state.fade = new Float32Array(idCount);
  state.seen = new Float64Array(idCount).fill(-Infinity);
  state.active.clear();
  state.data = new Uint8Array(TEX_W * rows);
  uniforms.uSeeFade.value.dispose();
  uniforms.uSeeFade.value = makeTexture(state.data, rows);
}

/** Buildings are drawn at this share of their height (tactical view, D050). */
export function setSeeThroughHeightScale(s: number): void {
  state.heightScale = s;
}

/** Fade whatever hides this track, or nothing (null). */
export function setCutawayTrack(track: Track | null): void {
  if (!track || track.length === 0) {
    state.samples = new Float32Array(0);
    return;
  }
  const n = Math.max(2, Math.ceil(track.length / SAMPLE_M) + 1);
  const out = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const s = (k * track.length) / (n - 1);
    const [x, z] = pointAt(track, s);
    const [ax, az] = pointAt(track, s - 1);
    const [bx, bz] = pointAt(track, s + 1);
    const l = Math.hypot(bx - ax, bz - az) || 1;
    out.set([x, z, -(bz - az) / l, (bx - ax) / l], k * 4);
  }
  state.samples = out;
}

const tmp = new Vector3();
const from: [number, number, number] = [0, 0, 0];
const to: [number, number, number] = [0, 0, 0];
let now = 0;
const hit = (id: number) => {
  if (state.seen[id] === now) return;
  state.seen[id] = now;
  state.active.add(id);
};

/** Called every frame, before anything is drawn: find what's in the way, and step the fades. */
export function updateSeeThrough(camera: PerspectiveCamera, timeS: number, dt: number): void {
  const g = state.grid;
  if (!g) return;
  const t0 = performance.now();
  now = timeS;
  camera.updateMatrixWorld();
  from[0] = camera.position.x;
  from[1] = camera.position.y;
  from[2] = camera.position.z;
  const smp = state.samples;
  for (let k = 0; k < smp.length; k += 4) {
    const x = smp[k]!;
    const z = smp[k + 1]!;
    // Only the part of the track on screen.
    tmp.set(x, TARGET_Y_M, z).applyMatrix4(camera.matrixWorldInverse);
    if (-tmp.z < camera.near) continue;
    tmp.applyMatrix4(camera.projectionMatrix);
    if (Math.abs(tmp.x) > SCREEN_MARGIN || Math.abs(tmp.y) > SCREEN_MARGIN) continue;
    for (const side of [0, -LATERAL_M, LATERAL_M]) {
      to[0] = x + smp[k + 2]! * side;
      to[1] = TARGET_Y_M;
      to[2] = z + smp[k + 3]! * side;
      forEachBlocker(g, from, to, state.heightScale, STOP_SHORT_M, hit);
    }
  }

  let dirty = false;
  const step = FADE_PER_S * Math.min(dt, 0.1);
  for (const id of state.active) {
    const want = now - state.seen[id]! < HOLD_S ? 1 : 0;
    const f = state.fade[id]!;
    const next = want > f ? Math.min(1, f + step) : Math.max(0, f - step);
    if (next !== f) {
      state.fade[id] = next;
      state.data[id] = Math.round(next * 255);
      dirty = true;
    }
    if (next === 0 && want === 0) state.active.delete(id);
  }
  if (dirty) uniforms.uSeeFade.value.needsUpdate = true;
  state.lastMs = performance.now() - t0;
}

/** For the dev hook: buildings faded or fading, and the last update's CPU time (ms). */
export function seeThroughStats(): { fading: number; ms: number } {
  return { fading: state.active.size, ms: state.lastMs };
}

/** Occluders fading or faded right now (don't modify). */
export function fadingOccluders(): ReadonlySet<number> {
  return state.active;
}

/** How faded the building around this world point is (0..1), so picking can go through it. */
export function seeThroughFade(p: Vector3): number {
  const g = state.grid;
  return g ? maxAt(g, p.x, p.y, p.z, state.heightScale, (id) => state.fade[id]!) : 0;
}

/**
 * Patch a built-in lit material (standard/basic) so it takes part in the fade. Its geometry needs an
 * `aOcc` attribute (per vertex, or per instance). Chains any earlier patch (e.g. windows).
 */
export function withSeeThrough<M extends Material>(material: M): M {
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      `attribute float aOcc;
        uniform sampler2D uSeeFade;
        varying float vSeeFade;
        void main() {
          {
            int id = int(aOcc + 0.5);
            vSeeFade = texelFetch(uSeeFade, ivec2(id % ${TEX_W}, id / ${TEX_W}), 0).r;
          }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying float vSeeFade;
        float bayer4(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
          return (float(b[i]) + 0.5) / 16.0;
        }
        void main() {`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (bayer4(gl_FragCoord.xy) < vSeeFade * ${MAX_FADE.toFixed(2)}) discard;`,
      );
  };
  material.customProgramCacheKey = () => `${prevKey()}|see-through-v9`;
  return material;
}

/**
 * Depth pre-pass for surfaces that may fade (D053). A shader that may `discard` stops the GPU from
 * skipping hidden surfaces, so an expensive material with the fade would shade every wall behind
 * every other one. Instead: draw the geometry first with this depth-only material (it does the
 * dithered discard, and costs next to nothing), then with the full material prepared by
 * `afterDepthPass` (no discard; it only draws where its depth matches the pre-pass).
 */
export function seeThroughDepthMaterial(): MeshBasicMaterial {
  return withSeeThrough(
    new MeshBasicMaterial({
      colorWrite: false,
      // Pushed back a hair so the second pass (the same surfaces) always passes its depth test.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
}

/** The full-material pass after `seeThroughDepthMaterial`: tests against its depth, writes none. */
export function afterDepthPass<M extends Material>(material: M): M {
  material.depthFunc = LessEqualDepth;
  material.depthWrite = false;
  return material;
}

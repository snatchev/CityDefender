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
import type { SolidRecord } from '../sim/cityFile';
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
 * (the route the rail camera rides) turns into a glassy ghost, as a whole, and clicks go through
 * it. Nothing else does.
 *
 * Each frame, sight lines from the camera to points along the on-screen part of the track are
 * walked through a grid of building footprints (occluders.ts); every building one passes through
 * fades, and fades back a moment after none does. A building's parts share one id, so they fade
 * together.
 *
 * Drawing: every building mesh carries an `aOcc` vertex (or instance) attribute naming its
 * building, and a small texture holds each building's fade (0..1). The normal materials
 * (`hideWhenFaded`) drop a fading building's triangles in the vertex shader, so they stay plain
 * opaque shaders with no `discard` (the GPU's hidden-surface removal keeps working). A ghost pass
 * (`ghostMaterials`, drawn only where something is fading) draws just the fading buildings,
 * translucent: opaque at the start of a fade, a faint glassy shell at the end. It draws only the
 * nearest ghost surface at each pixel (a depth-only pass first), so overlapping walls and parts
 * don't stack up into an opaque block. Ghosts draw last, after everything else. Id 0 never fades.
 */

/** A fully faded building keeps this much opacity. */
const GHOST_ALPHA = 0.16;
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

/** City Hall's occluder id (all its parts). */
export const CITY_HALL_ID = 1;

/**
 * Occluder ids for the level's solids, one per building (solids sharing `b`), after City Hall;
 * the near backdrop's boxes are numbered from `backdrop0`.
 */
export function occluderIds(solids: readonly SolidRecord[]): {
  ofSolid: number[];
  backdrop0: number;
} {
  const byBuilding = new Map<number, number>();
  let next = CITY_HALL_ID + 1;
  const ofSolid = solids.map((s) => {
    if (s.b === undefined) return next++;
    let id = byBuilding.get(s.b);
    if (id === undefined) byBuilding.set(s.b, (id = next++));
    return id;
  });
  return { ofSolid, backdrop0: next };
}

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

/** The buildings that can fade (each id < `idCount`). Rebuilds the grid. */
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
export function setSeeThroughTrack(track: Track | null): void {
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
    // Step toward `want` and stop there.
    const next = want > f ? Math.min(want, f + step) : Math.max(want, f - step);
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

/** Occluders fading or faded right now (don't modify). */
export function fadingOccluders(): ReadonlySet<number> {
  return state.active;
}

/** For the dev hook: buildings faded or fading (ids), and the last update's CPU time (ms). */
export function seeThroughStats(): {
  fading: number;
  ms: number;
  ids: number[];
  fades: number[];
} {
  const ids = [...state.active];
  return { fading: ids.length, ms: state.lastMs, ids, fades: ids.map((id) => state.fade[id]!) };
}

/** How faded the building around this world point is (0..1), so picking can go through it. */
export function seeThroughFade(p: Vector3): number {
  const g = state.grid;
  return g ? maxAt(g, p.x, p.y, p.z, state.heightScale, (id) => state.fade[id]!) : 0;
}

/** Vertex shader: this vertex's building fade, and a way to drop the triangle. */
const READ_FADE = `attribute float aOcc;
uniform sampler2D uSeeFade;
varying float vSeeFade;
void main() {
  int seeId = int(aOcc + 0.5);
  vSeeFade = texelFetch(uSeeFade, ivec2(seeId % ${TEX_W}, seeId / ${TEX_W}), 0).r;`;
/** Outside the clip volume: every vertex of the triangle goes there, so it isn't drawn. */
const DROP = 'gl_Position = vec4(0.0, 0.0, -2.0, 1.0);';

function patch<M extends Material>(
  material: M,
  key: string,
  edit: (shader: WebGLProgramParametersWithUniforms) => void,
): M {
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('void main() {', READ_FADE);
    edit(shader);
  };
  material.customProgramCacheKey = () => `${prevKey()}|${key}`;
  return material;
}

/**
 * A building material that leaves out buildings while they fade (their ghost is drawn instead).
 * Its geometry needs `aOcc` (per vertex or per instance). Chains any earlier patch (e.g. windows).
 */
export function hideWhenFaded<M extends Material>(material: M): M {
  return patch(material, 'hide-faded-v1', (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      if (vSeeFade > 0.0) ${DROP}`,
    );
  });
}

/** Ghosts draw after everything else: their depth pass, then their colour (see the module doc). */
export const GHOST_DEPTH_ORDER = 1000;
export const GHOST_COLOR_ORDER = 1001;
/** Polygon offsets (factor and units) of the ghost passes: behind solid walls, colour in front of depth. */
const GHOST_COLOR_OFFSET = 2;
const GHOST_DEPTH_OFFSET = 4;

/**
 * The ghost of fading buildings: the same geometry, drawn again after everything else, only where
 * its building is fading. `depth` (renderOrder `GHOST_DEPTH_ORDER`) marks the nearest ghost surface;
 * `color` (`GHOST_COLOR_ORDER`) is the building's own material (`look`, a fresh instance: it is
 * changed here) drawn with its opacity going from 1 to `GHOST_ALPHA` as the building fades, so a
 * fading building looks exactly like itself, just more see-through. Draw them only while something
 * is fading (they run every vertex).
 */
export function ghostMaterials<M extends Material>(
  look: M,
): {
  depth: MeshBasicMaterial;
  color: M;
} {
  const onlyFading = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      if (vSeeFade <= 0.0) ${DROP}`,
    );
  };
  // Both passes sit a hair behind the real surface, the depth pass further than the colour pass:
  // so a ghost wall loses every tie with a solid wall in the same plane (row houses share walls),
  // and the colour pass always passes its own depth pass (two shader programs need not compute
  // exactly the same depth). Without this, both flicker.
  // In the transparent queue (so it keeps its place after everything else), but writes depth only.
  const depth = patch(
    new MeshBasicMaterial({
      colorWrite: false,
      transparent: true,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: GHOST_DEPTH_OFFSET,
      polygonOffsetUnits: GHOST_DEPTH_OFFSET,
    }),
    'ghost-depth-v1',
    onlyFading,
  );
  look.transparent = true;
  look.depthWrite = false;
  look.depthFunc = LessEqualDepth;
  look.polygonOffset = true;
  look.polygonOffsetFactor = GHOST_COLOR_OFFSET;
  look.polygonOffsetUnits = GHOST_COLOR_OFFSET;
  const color = patch(look, 'ghost-color-v2', (shader) => {
    onlyFading(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vSeeFade;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        gl_FragColor.a *= mix(1.0, ${GHOST_ALPHA.toFixed(2)}, vSeeFade);`,
      );
  });
  return { depth, color };
}

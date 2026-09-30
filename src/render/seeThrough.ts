import {
  LessEqualDepth,
  MeshBasicMaterial,
  Vector3,
  Vector4,
  type Material,
  type PerspectiveCamera,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * See-through buildings (D030, D040): anything between the camera and what it's looking at (the
 * orbit target at the centre of the screen) fades out, so tall buildings never hide the street being
 * defended. It follows the camera only, never the mouse (Stefan). The sight line carries a cone: wide
 * at the camera (so a tower the camera is right next to fades) and narrow at the target (so the street
 * being looked at and its neighbours stay solid). Surfaces inside the cone are dithered away ("screen
 * door" transparency: stays opaque to the GPU, so no sorting problems) leaving a faint silhouette.
 *
 * Route cutaway (D049): while a route is focused, anything drawn in front of it on screen fades
 * almost completely, wherever the camera is. The route is projected to screen space every frame; a
 * building pixel near the projected route and closer to the camera than the route there is removed.
 */

/** Share of pixels removed at the core of the cutaway (the rest keep a ghost of the building). */
const MAX_FADE = 0.8;
/** Cone radius at the target end, as a fraction of the camera distance, clamped. */
const RADIUS_FRACTION = 0.1;
const RADIUS_MIN_M = 30;
const RADIUS_MAX_M = 160;
/** Cone radius at the camera end, as a fraction of the camera distance. */
const CAMERA_END_FRACTION = 0.3;
/**
 * Only surfaces above the sight line can hide the target; below it (low buildings the line passes
 * over) stay solid. The cutaway eases out between these depths below the line, as fractions of the
 * local cone radius (a band, not a hard edge: at shallow camera angles the line runs through
 * building faces, and a hard threshold drew a sharp cut across them).
 */
const BELOW_LINE_FADE_START = 0.0;
const BELOW_LINE_FADE_END = 0.5;
/**
 * The cutaway eases out between these fractions of the way to the target, so the street being
 * looked at stays solid without a hard edge.
 */
const T_FADE_START = 0.8;
const T_END = 0.97;

/** Share of pixels removed in front of a focused route: stronger than the camera cutaway. */
const ROUTE_MAX_FADE = 0.95;
/** Half-width of the cleared band around the route (m at the route's depth), with a floor in pixels. */
const ROUTE_RADIUS_M = 14;
const ROUTE_MIN_RADIUS_PX = 20;
/** A surface must be this much closer than the route to count as in front of it (m). */
const ROUTE_DEPTH_MARGIN_M = 2;
/** Most route corners the shader takes; longer routes are thinned evenly. */
export const MAX_ROUTE_POINTS = 48;

/** Live state, written once per frame by `updateSeeThrough`, read by every patched material. */
const state = {
  cam: new Vector3(),
  target: new Vector3(),
  /** Cone radius at the target end and at the camera end. */
  radius: 0,
  camRadius: 0,
};

/** The focused route: world points, and each frame their screen position, depth and band radius. */
const route = {
  world: [] as Vector3[],
  /** (x px, y px, view depth m, radius px); radius 0 marks a point behind the camera. */
  screen: Array.from({ length: MAX_ROUTE_POINTS }, () => new Vector4()),
  count: 0,
  camera: null as PerspectiveCamera | null,
  bufferW: 1,
  bufferH: 1,
};

const uniforms = {
  uSeeCam: { value: state.cam },
  uSeeTarget: { value: state.target },
  uSeeRadius: { value: 0 },
  uSeeCamRadius: { value: 0 },
  uRoute: { value: route.screen },
  uRouteCount: { value: 0 },
};

/** Focus the route cutaway on a polyline (world points at street level), or turn it off. */
export function setRouteCutaway(points: readonly Vector3[] | null): void {
  const pts = points ?? [];
  const n = Math.min(pts.length, MAX_ROUTE_POINTS);
  route.world =
    pts.length <= MAX_ROUTE_POINTS
      ? pts.map((p) => p.clone())
      : Array.from({ length: n }, (_, k) =>
          pts[Math.round((k * (pts.length - 1)) / (n - 1))]!.clone(),
        );
  route.count = route.world.length;
  uniforms.uRouteCount.value = 0;
}

const tmp = new Vector3();

/** Project a world point for the route cutaway: [x px, y px, depth m] in the drawing buffer. */
function toScreen(
  p: Vector3,
  cam: PerspectiveCamera,
  w: number,
  h: number,
): [number, number, number] {
  tmp.copy(p).applyMatrix4(cam.matrixWorldInverse);
  const depth = -tmp.z;
  tmp.applyMatrix4(cam.projectionMatrix);
  return [((tmp.x + 1) / 2) * w, ((tmp.y + 1) / 2) * h, depth];
}

/**
 * Called every frame with the camera, its orbit target and the drawing buffer size (px), before
 * anything is drawn.
 */
export function updateSeeThrough(
  camera: PerspectiveCamera,
  target: Vector3,
  bufferW: number,
  bufferH: number,
): void {
  const cam = camera.position;
  const dist = cam.distanceTo(target);
  state.cam.copy(cam);
  state.target.copy(target);
  state.radius = Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, dist * RADIUS_FRACTION));
  state.camRadius = dist * CAMERA_END_FRACTION;
  uniforms.uSeeRadius.value = state.radius;
  uniforms.uSeeCamRadius.value = state.camRadius;

  route.camera = camera;
  route.bufferW = bufferW;
  route.bufferH = bufferH;
  if (route.count > 0) {
    camera.updateMatrixWorld();
    const focalPx = bufferH / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const minPx = (ROUTE_MIN_RADIUS_PX * bufferH) / 1000;
    route.world.forEach((p, k) => {
      const [x, y, depth] = toScreen(p, camera, bufferW, bufferH);
      const r = depth > camera.near ? Math.max(minPx, (ROUTE_RADIUS_M * focalPx) / depth) : 0;
      route.screen[k]!.set(x, y, depth, r);
    });
  }
  uniforms.uRouteCount.value = route.count;
}

/**
 * Could anything inside this sphere be cut away this frame? Conservative (a cheap bound, true when
 * unsure). Buildings outside every cutaway get a material without `discard`, which keeps the GPU's
 * hidden-surface removal working for them (D053).
 */
export function cutawayMayTouch(centre: Vector3, radius: number): boolean {
  if (route.count > 1) return true;
  const ab = tmpB.copy(state.target).sub(state.cam);
  const len = ab.length();
  if (len === 0) return false;
  const t = tmpC.copy(centre).sub(state.cam).dot(ab) / (len * len);
  if (t * len < -radius || t > T_END + radius / len) return false;
  const tc = Math.min(Math.max(t, 0), 1);
  const r = state.camRadius + (state.radius - state.camRadius) * tc;
  const onLine = tmpC.copy(state.cam).addScaledVector(ab, tc);
  return onLine.distanceTo(centre) < r + radius;
}

const tmpB = new Vector3();
const tmpC = new Vector3();

/** Route cutaway strength (0..1) for a surface at screen (x, y) px and view depth, as in the shader. */
function routeFade(x: number, y: number, depth: number): number {
  let fade = 0;
  for (let k = 0; k + 1 < route.count; k++) {
    const a = route.screen[k]!;
    const b = route.screen[k + 1]!;
    if (a.w <= 0 || b.w <= 0) continue;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = Math.min(
      1,
      Math.max(0, ((x - a.x) * abx + (y - a.y) * aby) / Math.max(abx * abx + aby * aby, 1e-4)),
    );
    const d = Math.hypot(x - (a.x + abx * t), y - (a.y + aby * t));
    const r = a.w + (b.w - a.w) * t;
    const routeDepth = 1 / (1 / a.z + (1 / b.z - 1 / a.z) * t); // 1/depth is linear on screen
    if (depth < routeDepth - ROUTE_DEPTH_MARGIN_M)
      fade = Math.max(fade, 1 - smoothstep(r * 0.7, r, d));
  }
  return fade;
}

/**
 * Cutaway strength (0..1) at a world point, CPU side, so picking can look through faded buildings.
 * Mirrors the shader below: the stronger of the camera and the route cutaway.
 */
export function seeThroughFade(p: Vector3): number {
  const cam = route.camera;
  let viaRoute = 0;
  if (cam && route.count > 1) {
    const [x, y, depth] = toScreen(p, cam, route.bufferW, route.bufferH);
    viaRoute = routeFade(x, y, depth);
  }
  return Math.max(viaRoute, lineFade(p));
}

function lineFade(p: Vector3): number {
  const ab = state.target.clone().sub(state.cam);
  const len2 = ab.lengthSq();
  if (len2 === 0) return 0;
  const t = p.clone().sub(state.cam).dot(ab) / len2;
  if (t <= 0 || t >= T_END) return 0;
  const onLine = state.cam.clone().addScaledVector(ab, t);
  const r = state.camRadius + (state.radius - state.camRadius) * t; // cone: wide at the camera
  const radial = 1 - smoothstep(r * 0.6, r, p.distanceTo(onLine));
  // Below the sight line (not in the way) and close to the target, ease out rather than cut.
  const below = 1 - smoothstep(r * BELOW_LINE_FADE_START, r * BELOW_LINE_FADE_END, onLine.y - p.y);
  const nearEnd = 1 - smoothstep(T_FADE_START, T_END, t);
  return radial * below * nearEnd;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Patch a built-in lit material (standard/basic) so it takes part in the cutaway. Chains any earlier
 * patch (e.g. windows). Returns it.
 */
export function withSeeThrough<M extends Material>(material: M): M {
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vSeeWorld;\nvoid main() {')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 w = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            w = instanceMatrix * w;
          #endif
          vSeeWorld = (modelMatrix * w).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec3 vSeeWorld;
        uniform vec3 uSeeCam;
        uniform vec3 uSeeTarget;
        uniform float uSeeRadius;
        uniform float uSeeCamRadius;
        float seeLine() {
          vec3 ab = uSeeTarget - uSeeCam;
          float t = dot(vSeeWorld - uSeeCam, ab) / max(dot(ab, ab), 1e-6);
          if (t <= 0.0 || t >= ${T_END.toFixed(2)}) return 0.0;
          vec3 onLine = uSeeCam + ab * t;
          float r = mix(uSeeCamRadius, uSeeRadius, t);
          float radial = 1.0 - smoothstep(r * 0.6, r, length(vSeeWorld - onLine));
          float below = 1.0 - smoothstep(r * ${BELOW_LINE_FADE_START.toFixed(2)}, r * ${BELOW_LINE_FADE_END.toFixed(2)}, onLine.y - vSeeWorld.y);
          float nearEnd = 1.0 - smoothstep(${T_FADE_START.toFixed(2)}, ${T_END.toFixed(2)}, t);
          return radial * below * nearEnd;
        }
        uniform vec4 uRoute[${MAX_ROUTE_POINTS}];
        uniform int uRouteCount;
        float routeCut() {
          float fade = 0.0;
          vec2 f = gl_FragCoord.xy;
          float depth = -(viewMatrix * vec4(vSeeWorld, 1.0)).z;
          for (int k = 0; k < ${MAX_ROUTE_POINTS - 1}; k++) {
            if (k + 1 >= uRouteCount) break;
            vec4 a = uRoute[k];
            vec4 b = uRoute[k + 1];
            if (a.w <= 0.0 || b.w <= 0.0) continue;
            vec2 ab = b.xy - a.xy;
            float t = clamp(dot(f - a.xy, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
            float d = length(f - (a.xy + ab * t));
            float r = mix(a.w, b.w, t);
            float routeDepth = 1.0 / mix(1.0 / a.z, 1.0 / b.z, t);
            if (depth < routeDepth - ${ROUTE_DEPTH_MARGIN_M.toFixed(1)}) fade = max(fade, 1.0 - smoothstep(r * 0.7, r, d));
          }
          return fade;
        }
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
        {
          float fade = max(seeLine() * ${MAX_FADE.toFixed(2)}, routeCut() * ${ROUTE_MAX_FADE.toFixed(2)});
          if (bayer4(gl_FragCoord.xy) < fade) discard;
        }`,
      );
  };
  material.customProgramCacheKey = () => `${prevKey()}|see-through-v7`;
  return material;
}

/**
 * Depth pre-pass for surfaces the cutaway can reach (D053). A shader that may `discard` stops the
 * GPU from skipping hidden surfaces, so an expensive material with the cutaway would shade every
 * wall behind every other one. Instead: draw the geometry first with this depth-only material (it
 * does the dithered discard, and costs next to nothing), then with the full material prepared by
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

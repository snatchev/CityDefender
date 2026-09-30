import { Vector3, type Material, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * See-through buildings (D030, D040): anything between the camera and what it's looking at (the
 * orbit target at the centre of the screen) fades out, so tall buildings never hide the street being
 * defended. It follows the camera only, never the mouse (Stefan). The sight line carries a cone: wide
 * at the camera (so a tower the camera is right next to fades) and narrow at the target (so the street
 * being looked at and its neighbours stay solid). Surfaces inside the cone are dithered away ("screen
 * door" transparency: stays opaque to the GPU, so no sorting problems) leaving a faint silhouette.
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

/** Live state, written once per frame by `updateSeeThrough`, read by every patched material. */
const state = {
  cam: new Vector3(),
  target: new Vector3(),
  /** Cone radius at the target end and at the camera end. */
  radius: 0,
  camRadius: 0,
};

const uniforms = {
  uSeeCam: { value: state.cam },
  uSeeTarget: { value: state.target },
  uSeeRadius: { value: 0 },
  uSeeCamRadius: { value: 0 },
};

export function updateSeeThrough(cam: Vector3, target: Vector3): void {
  const dist = cam.distanceTo(target);
  state.cam.copy(cam);
  state.target.copy(target);
  state.radius = Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, dist * RADIUS_FRACTION));
  state.camRadius = dist * CAMERA_END_FRACTION;
  uniforms.uSeeRadius.value = state.radius;
  uniforms.uSeeCamRadius.value = state.camRadius;
}

/** Cutaway strength (0..1) at a world point, CPU side, so picking can look through faded buildings. Mirrors the shader below. */
export function seeThroughFade(p: Vector3): number {
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
          float fade = seeLine();
          if (bayer4(gl_FragCoord.xy) < fade * ${MAX_FADE.toFixed(2)}) discard;
        }`,
      );
  };
  material.customProgramCacheKey = () => `${prevKey()}|see-through-v5`;
  return material;
}

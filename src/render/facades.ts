import { Color, type Material, type WebGLProgramParametersWithUniforms } from 'three';
import type { FacadeHint, SolidRecord } from '../sim/cityFile';
import type { Rng } from '../sim/rng';

/**
 * Facades and roofs (Pass 10a, D046): each solid gets a window style and colours, from OSM tags
 * where they exist and otherwise picked by height with a per-building seeded roll. Windows are drawn
 * procedurally in the building shader from a per-vertex attribute (`aFacade`), so they cost no
 * geometry or textures, and fade to their average colour where they'd be smaller than a pixel.
 */

/** Window styles; the index is what the shader reads. 0 = no windows (roofs, parapets, boxes). */
export const Style = { None: 0, Brick: 1, Stone: 2, Glass: 3, Parking: 4, Landmark: 5 } as const;
export type StyleId = (typeof Style)[keyof typeof Style];

/**
 * Window grid per style: bay width (m), floor height (m), window width and height as shares of the
 * bay and floor, sill as a share of the floor.
 */
const WINDOWS: Record<StyleId, [bay: number, floor: number, w: number, h: number, sill: number]> = {
  [Style.None]: [1, 1, 0, 0, 0],
  [Style.Brick]: [3.0, 3.4, 0.42, 0.52, 0.28],
  [Style.Stone]: [3.4, 3.8, 0.55, 0.58, 0.24],
  [Style.Glass]: [1.6, 3.9, 0.9, 0.7, 0.18],
  [Style.Parking]: [9, 3.0, 0.96, 0.42, 0.34],
  [Style.Landmark]: [3.8, 5.2, 0.34, 0.56, 0.22],
};

const PALETTES = {
  brick: ['#8f5a45', '#9b6a52', '#a0705a', '#80544a', '#b08068', '#a58b73', '#94725e'],
  stone: ['#c9bfae', '#bdb3a2', '#d6cdbd', '#aaa292', '#b8ae9c', '#cfc8bb'],
  concrete: ['#a8a6a0', '#b5b2aa', '#9c9a94', '#bcb8ae'],
  glass: ['#7d93a6', '#6c8397', '#8fa3b3', '#5f7488', '#9aa8b0', '#768a8f'],
  flatRoof: ['#77736d', '#8a857d', '#6d6b67', '#9b968c', '#b9b6ae', '#827c73'],
} as const;
/** Pitched roofs: slate; domes, cones and onions: weathered copper. Unless OSM says otherwise. */
const SLATE = new Color('#5f636a');
const COPPER = new Color('#6f978a');
/** Per-building brightness jitter (±). */
const JITTER = 0.07;

/** Windows start this high on the ground floor (m), and stop this far below the eaves. */
export const WINDOWS_FROM_M = 1.2;
export const WINDOWS_BELOW_EAVES_M = 0.6;

/** Heights (m) that steer the untagged style roll: rowhouses, mid-rise, towers. */
const LOW_RISE_M = 18;
const HIGH_RISE_M = 60;

export interface Look {
  style: StyleId;
  wall: Color;
  roof: Color;
}

/** Style and colours for a solid. `rng` is seeded per building so the look is stable. */
export function lookOf(s: SolidRecord, rng: Rng, landmark: boolean): Look {
  const style = landmark ? Style.Landmark : styleOf(s.facade, s.h, rng);
  const palette =
    style === Style.Brick
      ? PALETTES.brick
      : style === Style.Glass
        ? PALETTES.glass
        : style === Style.Parking || s.facade === 'concrete'
          ? PALETTES.concrete
          : PALETTES.stone;
  const jitter = 1 + (rng.next() * 2 - 1) * JITTER;
  const wall = new Color(s.color ?? rng.pick(palette));
  if (!s.color) wall.multiplyScalar(jitter);
  const curved = s.roof === 'dome' || s.roof === 'onion' || s.roof === 'cone';
  const roof = s.roofColor
    ? new Color(s.roofColor)
    : !s.roof
      ? new Color(rng.pick(PALETTES.flatRoof)).multiplyScalar(jitter)
      : (curved ? COPPER : SLATE).clone();
  return { style, wall, roof };
}

/** Style and wall colour for a backdrop cell of height `h` (no tags there: the height roll only). */
export function backdropLook(h: number, rng: Rng): { style: StyleId; wall: Color } {
  const style = styleOf(undefined, h, rng);
  const palette =
    style === Style.Brick
      ? PALETTES.brick
      : style === Style.Glass
        ? PALETTES.glass
        : PALETTES.stone;
  return {
    style,
    wall: new Color(rng.pick(palette)).multiplyScalar(1 + (rng.next() * 2 - 1) * JITTER),
  };
}

function styleOf(hint: FacadeHint | undefined, h: number, rng: Rng): StyleId {
  switch (hint) {
    case 'glass':
      return Style.Glass;
    case 'brick':
      return Style.Brick;
    case 'stone':
    case 'concrete':
      return Style.Stone;
    case 'parking':
      return Style.Parking;
  }
  const r = rng.next();
  if (h < LOW_RISE_M) return r < 0.8 ? Style.Brick : Style.Stone;
  if (h < HIGH_RISE_M) return r < 0.35 ? Style.Brick : r < 0.85 ? Style.Stone : Style.Glass;
  return r < 0.6 ? Style.Glass : Style.Stone;
}

/** Backdrop boxes carry one colour per instance; their tops are pulled toward this roof grey. */
const BOX_ROOF = new Color('#827d75');
const BOX_ROOF_MIX = 0.7;

/** Window glass: dark by day, a little lighter at random (blinds, reflections). */
const WIN_DARK = new Color('#26313b');
const WIN_LIGHT = new Color('#4d6275');
/** How much the window colour replaces the wall. */
const WIN_STRENGTH = 0.85;
const WIN_ROUGHNESS = 0.3;

const glsl = (c: Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
const styles = Object.values(WINDOWS);

/**
 * Patch a MeshStandardMaterial to draw windows from the `aFacade` attribute:
 * (distance along the wall m, windows from y m, windows to y m, style). Chains any earlier patch.
 * With `instancedBoxes`, the facade is worked out in the shader instead, for an InstancedMesh of
 * unit boxes standing on the ground (the backdrop), with the style in a per-instance `aStyle`.
 */
export function withWindows<M extends Material>(
  material: M,
  { instancedBoxes = false }: { instancedBoxes?: boolean } = {},
): M {
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `${instancedBoxes ? 'attribute float aStyle;' : 'attribute vec4 aFacade;'}
        varying vec4 vFacade;
        varying float vFacadeY;
        void main() {`,
      )
      .replace(
        '#include <project_vertex>',
        instancedBoxes
          ? `#include <project_vertex>
        {
          vec4 w = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vFacadeY = w.y;
          float top = instanceMatrix[1][1];
          // Sides: distance along the face; tops: no windows, roof tint (style -1).
          vFacade = objectNormal.y > 0.5
            ? vec4(0.0, 0.0, 0.0, -1.0)
            : vec4(abs(objectNormal.x) > 0.5 ? w.z : w.x, ${WINDOWS_FROM_M.toFixed(2)}, top - ${WINDOWS_BELOW_EAVES_M.toFixed(2)}, aStyle);
        }`
          : `#include <project_vertex>
        vFacade = aFacade;
        vFacadeY = (modelMatrix * vec4(transformed, 1.0)).y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec4 vFacade;
        varying float vFacadeY;
        const vec4 WIN_GRID[${styles.length}] = vec4[${styles.length}](${styles
          .map(
            ([bay, floor, w, h]) =>
              `vec4(${bay.toFixed(2)}, ${floor.toFixed(2)}, ${w.toFixed(2)}, ${h.toFixed(2)})`,
          )
          .join(', ')});
        const float WIN_SILL[${styles.length}] = float[${styles.length}](${styles
          .map(([, , , , sill]) => sill.toFixed(2))
          .join(', ')});
        float winHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        void main() {
          float winMask = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vFacade.w < -0.5) diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(BOX_ROOF)}, ${BOX_ROOF_MIX.toFixed(2)});
        {
          int style = int(vFacade.w + 0.5);
          if (style > 0 && vFacadeY > vFacade.y && vFacadeY < vFacade.z) {
            vec4 g = WIN_GRID[style];
            float sill = WIN_SILL[style];
            vec2 cell = vec2(vFacade.x / g.x, (vFacadeY - vFacade.y) / g.y);
            vec2 f = fract(cell);
            vec2 fw = max(fwidth(cell), vec2(1e-4));
            float x0 = 0.5 - g.z * 0.5;
            float x1 = 0.5 + g.z * 0.5;
            float mx = smoothstep(x0 - fw.x, x0 + fw.x, f.x) - smoothstep(x1 - fw.x, x1 + fw.x, f.x);
            float my = smoothstep(sill - fw.y, sill + fw.y, f.y) - smoothstep(sill + g.w - fw.y, sill + g.w + fw.y, f.y);
            // Fade to the average where a window is under ~2 pixels, so distant facades don't shimmer.
            float far = clamp(max(fw.x, fw.y) * 3.0 - 0.5, 0.0, 1.0);
            winMask = mix(mx * my, g.z * g.w, far);
            vec3 glass = mix(${glsl(WIN_DARK)}, ${glsl(WIN_LIGHT)}, winHash(floor(cell) + float(style)) * mix(1.0, 0.5, far));
            diffuseColor.rgb = mix(diffuseColor.rgb, glass, winMask * ${WIN_STRENGTH.toFixed(2)});
          }
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, ${WIN_ROUGHNESS.toFixed(2)}, winMask);`,
      );
  };
  material.customProgramCacheKey = () => `${prevKey()}|windows-v1${instancedBoxes ? '-boxes' : ''}`;
  return material;
}

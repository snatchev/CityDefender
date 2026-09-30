import {
  Color,
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { FacadeHint, SolidRecord } from '../sim/cityFile';
import { createRng, type Rng } from '../sim/rng';

/**
 * Facades and roofs (Pass 10a, D046; varied styles D051). Each solid gets a facade preset and
 * colours, from OSM tags where they exist and otherwise picked by height with a per-building seeded
 * roll. A preset describes the whole wall: the window grid, its kind (punched windows, curtain wall,
 * ribbon windows, vertical piers, loft, parking deck), panes, trim, bands between floors, a ground
 * floor shopfront, a cornice, and the glass colour and how much it reflects the sky. Presets live in a
 * small float texture; walls carry only their preset index (`aFacade.w`), so windows cost no geometry.
 * Everything fades to its average colour where it would be smaller than a pixel.
 */

/** No windows: roofs, parapets, rooftop boxes. Preset 0 in the texture. */
export const NO_WINDOWS = 0;

/** How the window grid is drawn. */
const Kind = { Punched: 0, Curtain: 1, Ribbon: 2, Parking: 3, Piers: 4, Loft: 5 } as const;

interface Preset {
  /** Bay width and floor height (m); window width and height as shares of them; sill share. */
  bay: number;
  floor: number;
  w: number;
  h: number;
  sill: number;
  kind: number;
  /** Panes across and up within one window (glazing bars). */
  panesX: number;
  panesY: number;
  /** Window frame and band colour: > 0 lighter than the wall (toward cream), < 0 darker. */
  trim: number;
  /** A band between floors every this many floors (0: none). */
  bandEvery: number;
  /** Ground-floor shopfront height (m, 0: none) and cornice height at the top of the wall (m). */
  ground: number;
  cornice: number;
  glass: string;
  /** Share of sky reflected at grazing angles. */
  reflect: number;
}

type Family = 'brick' | 'loft' | 'stone' | 'piers' | 'ribbon' | 'glass' | 'parking' | 'landmark';

const GLASS = {
  dark: '#1f2a33',
  blue: '#2b4a63',
  green: '#2f4f4c',
  silver: '#5b6f80',
  bronze: '#4a3f33',
  warm: '#2d3238',
};

/** Hand-set families; `presets()` spreads each into seeded variants. */
const FAMILIES: Record<Family, { variants: number; base: Preset; spread: Partial<Preset> }> = {
  brick: {
    variants: 8,
    base: {
      bay: 3.0,
      floor: 3.4,
      w: 0.44,
      h: 0.55,
      sill: 0.25,
      kind: Kind.Punched,
      panesX: 1,
      panesY: 2,
      trim: 0.45,
      bandEvery: 0,
      ground: 0,
      cornice: 0.7,
      glass: GLASS.dark,
      reflect: 0.25,
    },
    spread: { bay: 0.5, floor: 0.25, w: 0.08, h: 0.06, trim: 0.3, cornice: 0.4 },
  },
  loft: {
    variants: 3,
    base: {
      bay: 4.2,
      floor: 4.3,
      w: 0.62,
      h: 0.66,
      sill: 0.2,
      kind: Kind.Loft,
      panesX: 3,
      panesY: 3,
      trim: -0.2,
      bandEvery: 0,
      ground: 0,
      cornice: 0.8,
      glass: GLASS.warm,
      reflect: 0.3,
    },
    spread: { bay: 0.6, w: 0.06, trim: 0.2 },
  },
  stone: {
    variants: 7,
    base: {
      bay: 3.4,
      floor: 3.9,
      w: 0.52,
      h: 0.6,
      sill: 0.22,
      kind: Kind.Punched,
      panesX: 2,
      panesY: 1,
      trim: -0.22,
      bandEvery: 4,
      ground: 0,
      cornice: 1.3,
      glass: GLASS.dark,
      reflect: 0.35,
    },
    spread: { bay: 0.5, floor: 0.3, w: 0.1, h: 0.06, trim: 0.25, bandEvery: 2, cornice: 0.6 },
  },
  piers: {
    variants: 4,
    base: {
      bay: 2.7,
      floor: 3.8,
      w: 0.38,
      h: 0.82,
      sill: 0.08,
      kind: Kind.Piers,
      panesX: 1,
      panesY: 2,
      trim: -0.38,
      bandEvery: 0,
      ground: 0,
      cornice: 1.6,
      glass: GLASS.dark,
      reflect: 0.4,
    },
    spread: { bay: 0.4, w: 0.06, trim: 0.15 },
  },
  ribbon: {
    variants: 4,
    base: {
      bay: 4.5,
      floor: 3.7,
      w: 0.98,
      h: 0.5,
      sill: 0.3,
      kind: Kind.Ribbon,
      panesX: 3,
      panesY: 1,
      trim: -0.1,
      bandEvery: 0,
      ground: 0,
      cornice: 0.5,
      glass: GLASS.blue,
      reflect: 0.55,
    },
    spread: { h: 0.08, trim: 0.15 },
  },
  glass: {
    variants: 8,
    base: {
      bay: 1.8,
      floor: 4.0,
      w: 0.92,
      h: 0.76,
      sill: 0.14,
      kind: Kind.Curtain,
      panesX: 1,
      panesY: 1,
      trim: 0.12,
      bandEvery: 0,
      ground: 0,
      cornice: 0,
      glass: GLASS.blue,
      reflect: 0.8,
    },
    spread: { bay: 1.2, floor: 0.3, h: 0.12, trim: 0.25, reflect: 0.15 },
  },
  parking: {
    variants: 2,
    base: {
      bay: 8,
      floor: 3.0,
      w: 0.96,
      h: 0.42,
      sill: 0.34,
      kind: Kind.Parking,
      panesX: 1,
      panesY: 1,
      trim: -0.15,
      bandEvery: 0,
      ground: 0,
      cornice: 0,
      glass: '#15181c',
      reflect: 0,
    },
    spread: { bay: 2, h: 0.06 },
  },
  landmark: {
    variants: 1,
    base: {
      bay: 3.8,
      floor: 5.2,
      w: 0.34,
      h: 0.56,
      sill: 0.22,
      kind: Kind.Punched,
      panesX: 1,
      panesY: 2,
      trim: 0.35,
      bandEvery: 2,
      ground: 0,
      cornice: 1.5,
      glass: GLASS.dark,
      reflect: 0.2,
    },
    spread: {},
  },
};
/** Glass colours curtain walls pick from (the base colour is one of them). */
const CURTAIN_GLASS = [GLASS.blue, GLASS.green, GLASS.silver, GLASS.dark, GLASS.bronze];
/** Share of low and mid-rise buildings with a shopfront ground floor, and its height range (m). */
const SHOPFRONT_SHARE = 0.55;
const SHOPFRONT_M = [4.2, 5.2] as const;

/** Every preset, preset 0 = no windows; and each family's preset indices. */
const { list: PRESETS, byFamily } = presets();

function presets(): { list: Preset[]; byFamily: Record<Family, number[]> } {
  const rng = createRng(1682);
  const none: Preset = { ...FAMILIES.brick.base, w: 0, h: 0 };
  const list: Preset[] = [none];
  const byFamily = {} as Record<Family, number[]>;
  for (const [name, fam] of Object.entries(FAMILIES) as [Family, (typeof FAMILIES)[Family]][]) {
    byFamily[name] = [];
    for (let v = 0; v < fam.variants; v++) {
      const p: Preset = { ...fam.base };
      for (const [k, amt] of Object.entries(fam.spread) as [keyof Preset, number][]) {
        const jitter = (rng.next() * 2 - 1) * amt;
        (p[k] as number) =
          k === 'bandEvery'
            ? Math.max(0, Math.round(p.bandEvery + jitter))
            : (p[k] as number) + jitter;
      }
      if (name === 'brick' || name === 'stone') {
        p.panesX = rng.next() < 0.5 ? 1 : 2;
        p.panesY = rng.next() < 0.6 ? 2 : 1;
        if (rng.next() < SHOPFRONT_SHARE)
          p.ground = SHOPFRONT_M[0] + rng.next() * (SHOPFRONT_M[1] - SHOPFRONT_M[0]);
      }
      if (name === 'glass') p.glass = CURTAIN_GLASS[v % CURTAIN_GLASS.length]!;
      if (name === 'ribbon' || name === 'piers') p.ground = rng.next() < 0.5 ? SHOPFRONT_M[1] : 0;
      byFamily[name].push(list.length);
      list.push(p);
    }
  }
  return { list, byFamily };
}

/** Texels per preset in the texture (rows = presets). */
const TEXELS = 4;

/** The preset table as a float texture: 4 texels per row, one row per preset. */
function presetTexture(): DataTexture {
  const data = new Float32Array(PRESETS.length * TEXELS * 4);
  const c = new Color();
  PRESETS.forEach((p, i) => {
    c.set(p.glass);
    data.set(
      [
        ...[p.bay, p.floor, p.w, p.h],
        ...[p.sill, p.kind, p.panesX, p.panesY],
        ...[p.trim, p.bandEvery, p.ground, p.cornice],
        ...[c.r, c.g, c.b, p.reflect],
      ],
      i * TEXELS * 4,
    );
  });
  const t = new DataTexture(data, TEXELS, PRESETS.length, RGBAFormat, FloatType);
  t.minFilter = t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

const PALETTES = {
  brick: [
    '#8f5a45',
    '#9b6a52',
    '#a0705a',
    '#80544a',
    '#b08068',
    '#a58b73',
    '#94725e',
    '#7a4a3c',
    '#b59274',
  ],
  stone: ['#c9bfae', '#bdb3a2', '#d6cdbd', '#aaa292', '#b8ae9c', '#cfc8bb', '#e0d6c2', '#a39580'],
  concrete: ['#a8a6a0', '#b5b2aa', '#9c9a94', '#bcb8ae', '#8e8c86'],
  /** Curtain walls: the colour of the frames and spandrels between the glass. */
  glass: ['#7d93a6', '#6c8397', '#8fa3b3', '#5f7488', '#9aa8b0', '#768a8f', '#3f4a52', '#a9b3b8'],
  flatRoof: ['#77736d', '#8a857d', '#6d6b67', '#9b968c', '#b9b6ae', '#827c73'],
} as const;
const FAMILY_PALETTE: Record<Family, readonly string[]> = {
  brick: PALETTES.brick,
  loft: PALETTES.brick,
  stone: PALETTES.stone,
  piers: PALETTES.stone,
  ribbon: PALETTES.concrete,
  glass: PALETTES.glass,
  parking: PALETTES.concrete,
  landmark: PALETTES.stone,
};
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
  /** Facade preset index (NO_WINDOWS for none). */
  style: number;
  wall: Color;
  roof: Color;
}

/**
 * What a facade averages to from far away: the share of the wall that is window, and the glass
 * colour. Low-detail buildings bake this into their wall colour instead of drawing windows.
 */
export function facadeAverage(style: number): { coverage: number; glass: Color } {
  const p = PRESETS[style];
  if (!p || style === NO_WINDOWS) return { coverage: 0, glass: new Color() };
  return { coverage: Math.min(1, p.w * p.h) * WIN_STRENGTH, glass: new Color(p.glass) };
}

/** Preset and colours for a solid. `rng` is seeded per building so the look is stable. */
export function lookOf(s: SolidRecord, rng: Rng, landmark: boolean): Look {
  const family = landmark ? 'landmark' : familyOf(s.facade, s.h, rng);
  const style = rng.pick(byFamily[family]);
  const jitter = 1 + (rng.next() * 2 - 1) * JITTER;
  const palette = s.facade === 'concrete' ? PALETTES.concrete : FAMILY_PALETTE[family];
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

/** Preset and wall colour for a backdrop cell of height `h` (no tags there: the height roll only). */
export function backdropLook(h: number, rng: Rng): { style: number; wall: Color } {
  const family = familyOf(undefined, h, rng);
  return {
    style: rng.pick(byFamily[family]),
    wall: new Color(rng.pick(FAMILY_PALETTE[family])).multiplyScalar(
      1 + (rng.next() * 2 - 1) * JITTER,
    ),
  };
}

function familyOf(hint: FacadeHint | undefined, h: number, rng: Rng): Family {
  const r = rng.next();
  switch (hint) {
    case 'glass':
      return 'glass';
    case 'brick':
      return r < 0.85 ? 'brick' : 'loft';
    case 'stone':
      return r < 0.75 ? 'stone' : 'piers';
    case 'concrete':
      return r < 0.6 ? 'ribbon' : 'stone';
    case 'parking':
      return 'parking';
  }
  if (h < LOW_RISE_M) return r < 0.7 ? 'brick' : r < 0.82 ? 'loft' : 'stone';
  if (h < HIGH_RISE_M)
    return r < 0.3
      ? 'brick'
      : r < 0.42
        ? 'loft'
        : r < 0.72
          ? 'stone'
          : r < 0.84
            ? 'ribbon'
            : r < 0.93
              ? 'piers'
              : 'glass';
  return r < 0.55 ? 'glass' : r < 0.72 ? 'piers' : r < 0.86 ? 'stone' : 'ribbon';
}

/** Backdrop boxes carry one colour per instance; their tops are pulled toward this roof grey. */
const BOX_ROOF = new Color('#827d75');
const BOX_ROOF_MIX = 0.7;
/** Blinds and curtains: a few windows are lighter inside. */
const BLINDS = new Color('#cfc3a8');
const BLINDS_SHARE = 0.18;
/** Shopfront awnings. */
const AWNINGS = ['#8c2f2f', '#2f5d3f', '#2f4a7a', '#7a5a2f', '#3a3a3a'].map((c) => new Color(c));
/** Sky reflected in glass: haze at the horizon, blue overhead, dark street below (Scene's sky). */
const SKY_HORIZON = new Color('#c9d3db');
const SKY_ZENITH = new Color('#5b8fcc');
const STREET = new Color('#3b3e44');
/** How much the window colour replaces the wall. */
const WIN_STRENGTH = 0.9;
const WIN_ROUGHNESS = 0.25;
/** A plinth at the foot of masonry walls (m) and how much darker it is. */
const PLINTH_M = 0.9;
const PLINTH_SHADE = 0.78;

const glsl = (c: Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
const f = (x: number) => x.toFixed(3);

let sharedTexture: DataTexture | null = null;

/**
 * Patch a MeshStandardMaterial to draw facades from the `aFacade` attribute:
 * (distance along the wall m, windows from y m, windows to y m, preset). Chains any earlier patch.
 * With `instancedBoxes`, the facade is worked out in the shader instead, for an InstancedMesh of
 * unit boxes standing on the ground (the backdrop), with the preset in a per-instance `aStyle`.
 */
export function withWindows<M extends Material>(
  material: M,
  { instancedBoxes = false }: { instancedBoxes?: boolean } = {},
): M {
  sharedTexture ??= presetTexture();
  const presetsUniform = { value: sharedTexture };
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev(shader, renderer);
    shader.uniforms.uFacadePresets = presetsUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `${instancedBoxes ? 'attribute float aStyle;' : 'attribute vec4 aFacade;'}
        uniform sampler2D uFacadePresets;
        varying vec4 vFacade;
        varying float vFacadeY;
        flat varying vec4 vP0;
        flat varying vec4 vP1;
        flat varying vec4 vP2;
        flat varying vec4 vP3;
        void main() {`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        ${
          instancedBoxes
            ? `{
          vec4 w = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vFacadeY = w.y;
          float top = instanceMatrix[1][1];
          // Sides: distance along the face; tops: no windows, roof tint (preset -1).
          vFacade = objectNormal.y > 0.5
            ? vec4(0.0, 0.0, 0.0, -1.0)
            : vec4(abs(objectNormal.x) > 0.5 ? w.z : w.x, ${f(WINDOWS_FROM_M)}, top - ${f(WINDOWS_BELOW_EAVES_M)}, aStyle);
        }`
            : `vFacade = aFacade;
        vFacadeY = (modelMatrix * vec4(transformed, 1.0)).y;`
        }
        {
          int row = int(max(vFacade.w, 0.0) + 0.5);
          vP0 = texelFetch(uFacadePresets, ivec2(0, row), 0);
          vP1 = texelFetch(uFacadePresets, ivec2(1, row), 0);
          vP2 = texelFetch(uFacadePresets, ivec2(2, row), 0);
          vP3 = texelFetch(uFacadePresets, ivec2(3, row), 0);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `varying vec4 vFacade;
        varying float vFacadeY;
        flat varying vec4 vP0;
        flat varying vec4 vP1;
        flat varying vec4 vP2;
        flat varying vec4 vP3;
        float winHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        // Antialiased 1 inside [a, b] (width in cell units per pixel: w).
        float band(float x, float a, float b, float w) {
          return smoothstep(a - w, a + w, x) - smoothstep(b - w, b + w, x);
        }
        // Glazing bars: 0 on a bar, 1 in a pane (x, y in window units 0..1).
        float panes(vec2 l, vec2 n, vec2 w) {
          vec2 g = abs(fract(l * n + 0.5) - 0.5) / n; // distance to the nearest bar
          vec2 bar = vec2(0.035) + w;
          vec2 m = smoothstep(bar - w, bar + w, g);
          return (n.x > 1.5 ? m.x : 1.0) * (n.y > 1.5 ? m.y : 1.0);
        }
        void main() {
          float winMask = 0.0;
          float glassMask = 0.0;
          float glassReflect = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (vFacade.w < -0.5) diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(BOX_ROOF)}, ${f(BOX_ROOF_MIX)});
        if (vFacade.w > 0.5 && vFacadeY < vFacade.z + ${f(WINDOWS_BELOW_EAVES_M)} + 0.05) {
          vec3 wall = diffuseColor.rgb;
          float bay = vP0.x, floorH = vP0.y, ww = vP0.z, wh = vP0.w;
          float sill = vP1.x, kind = vP1.y;
          float trim = vP2.x, bandEvery = vP2.y, ground = vP2.z, cornice = vP2.w;
          vec3 glassCol = vP3.rgb;
          float reflectivity = vP3.a;
          float u = vFacade.x;
          float y = vFacadeY;
          float top = vFacade.z + ${f(WINDOWS_BELOW_EAVES_M)};
          float base = vFacade.y - ${f(WINDOWS_FROM_M)};
          vec3 trimCol = trim > 0.0 ? mix(wall, vec3(0.93, 0.9, 0.84), trim) : wall * (1.0 + trim);
          float px = max(fwidth(u), fwidth(y)); // metres per pixel
          float far = clamp(px * 3.0 / min(bay * ww, floorH * wh) - 0.3, 0.0, 1.0);
          float detail = 1.0 - far;
          vec3 col = wall;
          bool masonry = kind != ${f(Kind.Curtain)} && kind != ${f(Kind.Parking)};

          // Plinth and cornice.
          if (masonry && y < base + ${f(PLINTH_M)}) col *= ${f(PLINTH_SHADE)};
          if (cornice > 0.0 && y > top - cornice) {
            col = mix(col, trimCol, detail);
            if (y < top - cornice + 0.25) col *= mix(1.0, 0.7, detail); // shadow line under it
          }

          float rowsFrom = vFacade.y + ground;
          if (ground > 0.0 && y > base && y < base + ground) {
            // Shopfront: big panes between thin piers, an awning band above.
            float cu = u / 6.0;
            float fx = fract(cu);
            float lx = band(fx, 0.06, 0.94, px / 6.0);
            float ly = band(y - base, 0.35, ground - 1.1, px);
            float shop = lx * ly * panes(vec2(fx, 0.5), vec2(3.0, 1.0), vec2(px / 6.0));
            int awning = int(floor(winHash(vec2(floor(cu), 7.0)) * 5.0));
            vec3 aw = ${glsl(AWNINGS[0]!)};
            ${AWNINGS.slice(1)
              .map((c, i) => `if (awning == ${i + 1}) aw = ${glsl(c)};`)
              .join('\n            ')}
            float awn = band(y - base, ground - 0.95, ground - 0.3, px) * lx;
            col = mix(col, aw, awn * detail);
            winMask = max(winMask, mix(shop, 0.6, far));
          } else if (y > rowsFrom && y < vFacade.z) {
            vec2 cell = vec2(u / bay, (y - rowsFrom) / floorH);
            vec2 fr = fract(cell);
            vec2 w = max(fwidth(cell), vec2(1e-4));
            float x0 = 0.5 - ww * 0.5, x1 = 0.5 + ww * 0.5;
            float mx = band(fr.x, x0, x1, w.x);
            float my = band(fr.y, sill, sill + wh, w.y);
            float win = mx * my;
            vec2 l = vec2((fr.x - x0) / ww, (fr.y - sill) / wh);
            float glazing = panes(l, vP1.zw, w / vec2(ww, wh));
            // Frame around each window and bands between floors, in the trim colour.
            float tw = 0.06;
            float frame = band(fr.x, x0 - tw, x1 + tw, w.x) * band(fr.y, sill - tw, sill + wh + tw, w.y) - win;
            if (kind == ${f(Kind.Punched)} || kind == ${f(Kind.Loft)}) col = mix(col, trimCol, clamp(frame, 0.0, 1.0) * detail);
            if (bandEvery > 0.5 && mod(floor(cell.y), bandEvery) < 0.5) col = mix(col, trimCol, band(fr.y, 0.0, 0.08, w.y) * detail);
            // Piers: the panel between windows in a column is recessed (darker).
            if (kind == ${f(Kind.Piers)}) col = mix(col, wall * 0.62, mx * (1.0 - my) * detail);
            float pane = win * glazing;
            winMask = max(winMask, mix(pane, ww * wh, far));
          }

          // Glass: per-window tint, some blinds, fading to the average far away.
          vec2 cellId = floor(vec2(u / bay, (y - rowsFrom) / floorH));
          float hsh = winHash(cellId + vec2(vFacade.w * 13.0, 0.0));
          vec3 glassHere = glassCol * mix(0.8, 1.3, hsh);
          if (kind != ${f(Kind.Parking)} && hsh > ${f(1 - BLINDS_SHARE)}) glassHere = mix(glassHere, ${glsl(BLINDS)}, 0.55 * detail);
          col = mix(col, glassHere, winMask * ${f(WIN_STRENGTH)});
          glassMask = winMask;
          glassReflect = reflectivity;
          diffuseColor.rgb = col;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, ${f(WIN_ROUGHNESS)}, glassMask);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // Fake sky reflection in the glass: stronger at grazing angles, changes as the camera moves.
          vec3 v = normalize(vViewPosition);
          vec3 n = normalize(normal);
          vec3 r = reflect(-v, n);
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float sky = dot(r, upV);
          vec3 env = sky > 0.0
            ? mix(${glsl(SKY_HORIZON)}, ${glsl(SKY_ZENITH)}, clamp(sky * 1.6, 0.0, 1.0))
            : mix(${glsl(SKY_HORIZON)}, ${glsl(STREET)}, clamp(-sky * 3.0, 0.0, 1.0));
          float fres = 0.15 + 0.85 * pow(1.0 - clamp(dot(v, n), 0.0, 1.0), 4.0);
          outgoingLight = mix(outgoingLight, env, glassMask * glassReflect * fres);
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `${prevKey()}|facades-v2${instancedBoxes ? '-boxes' : ''}`;
  return material;
}

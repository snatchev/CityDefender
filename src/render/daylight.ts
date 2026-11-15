import { Color, MathUtils, Vector3, type Object3D } from 'three';
import data from '../data/daylight.json';
import type { DaylightKey, DaylightTable } from '../data/schema';

/**
 * Time of day (Pass 10b): each wave has an hour (daylight.json `waveHours`), and keyframes by hour
 * say how everything is lit then. At the start of a wave's prep the sky eases forward in time to the
 * new hour over a few seconds; it holds still during an assault. The hour is always derived from the
 * wave number (never saved), so a resumed run comes back at the right time of day.
 *
 * Render-only. Everything that is lit reads `daylight()` (Daylight.tsx moves the lights, the sky and
 * the fog; facades.ts the windows; lighting.ts `preLit` the unlit ground). Other renderers that want
 * "how dark is it" (bug glow, muzzle flashes) read `nightAmount()`: 0 by day, 1 at night, cheap to
 * call every frame.
 */

export const DAYLIGHT = data as DaylightTable;

export interface DaylightState {
  /** Hour of day, 0 ≤ hour < 24. */
  hour: number;
  /** Unit vector toward the key light (the sun, the moon at night), world space (x east, z south). */
  sunDir: Vector3;
  /** Linear colours; intensities apart. */
  sunColor: Color;
  sunIntensity: number;
  shadowIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  skyZenith: Color;
  skyHorizon: Color;
  haze: Color;
  fogNearM: number;
  fogFarM: number;
  glowColor: Color;
  glowStrength: number;
  windowsLit: number;
  lamps: number;
  night: number;
}

interface ParsedKey {
  hour: number;
  elevation: number;
  azimuth: number;
  colors: Record<ColorField, Color>;
  numbers: Record<NumberField, number>;
}
const COLOR_FIELDS = [
  'sunColor',
  'hemiSky',
  'hemiGround',
  'skyZenith',
  'skyHorizon',
  'haze',
  'glowColor',
] as const;
type ColorField = (typeof COLOR_FIELDS)[number];
const NUMBER_FIELDS = [
  'sunIntensity',
  'shadowIntensity',
  'hemiIntensity',
  'fogNearM',
  'fogFarM',
  'glowStrength',
  'windowsLit',
  'lamps',
  'night',
] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];

function parseKey(k: DaylightKey): ParsedKey {
  return {
    hour: k.hour,
    elevation: k.sunElevationDeg,
    azimuth: k.sunAzimuthDeg,
    colors: Object.fromEntries(COLOR_FIELDS.map((f) => [f, new Color(k[f])])) as Record<
      ColorField,
      Color
    >,
    numbers: Object.fromEntries(NUMBER_FIELDS.map((f) => [f, k[f]])) as Record<NumberField, number>,
  };
}

const wrap24 = (h: number) => ((h % 24) + 24) % 24;

/**
 * The two keyframes around `hour` and how far between them (0..1), across midnight: before the
 * first key of the day, or after the last, it blends from the last key into the next day's first.
 * `hours` must be increasing and within [0, 24).
 */
export function bracket(
  hours: readonly number[],
  hour: number,
): { a: number; b: number; t: number } {
  const n = hours.length;
  const h = wrap24(hour);
  let a = n - 1;
  for (let i = 0; i < n; i++) if (hours[i]! <= h) a = i;
  const b = (a + 1) % n;
  const span = wrap24(hours[b]! - hours[a]!) || 24;
  return { a, b, t: wrap24(h - hours[a]!) / span };
}

/** Hours from `from` forward to `to` (0 ≤ result < 24): time only runs forward, through midnight. */
export function hoursForward(from: number, to: number): number {
  return wrap24(to - from);
}

/** Shortest-arc blend of two compass bearings (degrees). */
export function lerpBearing(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * t) % 360) + 360) % 360;
}

export function newDaylightState(): DaylightState {
  return {
    hour: 0,
    sunDir: new Vector3(0, 1, 0),
    sunColor: new Color(),
    sunIntensity: 0,
    shadowIntensity: 0,
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiIntensity: 0,
    skyZenith: new Color(),
    skyHorizon: new Color(),
    haze: new Color(),
    fogNearM: 1,
    fogFarM: 2,
    glowColor: new Color(),
    glowStrength: 0,
    windowsLit: 0,
    lamps: 0,
    night: 0,
  };
}

/** Unit vector toward a light at this elevation and compass bearing (x east, z south, y up). */
export function directionOf(elevationDeg: number, azimuthDeg: number, out: Vector3): Vector3 {
  const el = MathUtils.degToRad(elevationDeg);
  const az = MathUtils.degToRad(azimuthDeg);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

/** How everything is lit at `hour`, written into `out`. */
export function sampleDaylight(
  keys: readonly ParsedKey[],
  hour: number,
  out: DaylightState,
): DaylightState {
  const { a, b, t } = bracket(
    keys.map((k) => k.hour),
    hour,
  );
  const ka = keys[a]!;
  const kb = keys[b]!;
  out.hour = wrap24(hour);
  for (const f of COLOR_FIELDS) out[f].copy(ka.colors[f]).lerp(kb.colors[f], t);
  for (const f of NUMBER_FIELDS) out[f] = ka.numbers[f] + (kb.numbers[f] - ka.numbers[f]) * t;
  directionOf(
    ka.elevation + (kb.elevation - ka.elevation) * t,
    lerpBearing(ka.azimuth, kb.azimuth, t),
    out.sunDir,
  );
  return out;
}

export const PARSED_KEYS: readonly ParsedKey[] = DAYLIGHT.keys.map(parseKey);

/** The hour of wave `wave` (0-based) in `city`; midday if the city has no table. */
export function hourForWave(city: string | null, wave: number): number {
  const hours = city ? DAYLIGHT.waveHours[city] : undefined;
  if (!hours || hours.length === 0) return 12;
  return hours[MathUtils.clamp(wave, 0, hours.length - 1)]!;
}

// ---- The running clock (one per page) ----

const state = sampleDaylight(PARSED_KEYS, hourForWave(null, 0), newDaylightState());
const clock = {
  hour: NaN,
  /** A transition: from this hour, this many hours forward, `t` of the way (1: done). */
  from: 0,
  span: 0,
  t: 1,
  wave: -1,
  phase: '',
  override: null as number | null,
  version: 0,
};

/** The current lighting. Don't modify; read `daylightVersion()` to know when it changed. */
export function daylight(): Readonly<DaylightState> {
  return state;
}

/** 0 by day, 1 at night (and in between at dusk and dawn). Cheap; fine to call every frame. */
export function nightAmount(): number {
  return state.night;
}

/** Bumped whenever the lighting changes, so consumers can redo derived colours only then. */
export function daylightVersion(): number {
  return clock.version;
}

/** True while the sky is easing to a new hour. */
export function daylightMoving(): boolean {
  return clock.t < 1;
}

/** Pin the hour (dev hook), or follow the waves again (null). */
export function setDaylightHour(hour: number | null): void {
  clock.override = hour === null ? null : wrap24(hour);
  clock.t = 1;
}

export function daylightOverride(): number | null {
  return clock.override;
}

/**
 * Advance the clock by `dt` seconds of real time. The sky eases forward to a new wave's hour only
 * when that wave's prep follows the previous wave's debrief or grant; any other change (load,
 * resume, restart, a dev jump) snaps to the hour. Returns whether the lighting changed.
 */
export function stepDaylight(
  dt: number,
  city: string | null,
  wave: number,
  phase: string,
): boolean {
  const target = clock.override ?? hourForWave(city, wave);
  const fromRound = clock.phase === 'debrief' || clock.phase === 'grant';
  if (
    clock.override === null &&
    wave === clock.wave + 1 &&
    fromRound &&
    phase === 'prep' &&
    !Number.isNaN(clock.hour)
  ) {
    clock.from = clock.hour;
    clock.span = hoursForward(clock.hour, target);
    clock.t = 0;
  }
  clock.wave = wave;
  clock.phase = phase;

  let hour: number;
  if (clock.t < 1 && clock.override === null) {
    const s = phase === 'assault' ? DAYLIGHT.assaultCatchUpS : DAYLIGHT.transitionS;
    clock.t = Math.min(1, clock.t + dt / s);
    hour = wrap24(clock.from + clock.span * MathUtils.smootherstep(clock.t, 0, 1));
    if (clock.t >= 1) hour = target;
  } else {
    clock.t = 1;
    hour = target;
  }
  if (hour === clock.hour) return false;
  clock.hour = hour;
  sampleDaylight(PARSED_KEYS, hour, state);
  clock.version++;
  return true;
}

// ---- Sun shadows: the city is static, so the shadow map is redrawn only on request ----

let shadowDirty = true;
const casters = new Set<Object3D>();

/** Redraw the sun's shadow map on the next frame (the sun moved, buildings changed or squashed). */
export function requestShadowUpdate(): void {
  shadowDirty = true;
}

/** Whether a redraw was requested since the last call (and clear it). */
export function takeShadowUpdate(): boolean {
  const d = shadowDirty;
  shadowDirty = false;
  return d;
}

/** Objects whose bounds the shadow camera must cover (the level's buildings, City Hall). */
export function registerShadowCaster(o: Object3D): () => void {
  casters.add(o);
  shadowDirty = true;
  return () => {
    casters.delete(o);
    shadowDirty = true;
  };
}

export function shadowCasters(): ReadonlySet<Object3D> {
  return casters;
}

/**
 * Shadow casters live on this layer only. three's shadow pass picks casters by the viewing camera's
 * layers, so Daylight.tsx lets the camera see this layer only in the frame the map is redrawn; the
 * casters' material writes neither colour nor depth, so they never show.
 */
export const SHADOW_LAYER = 1;

import { Color, Vector3 } from 'three';
import { daylight, type DaylightState } from './daylight';

const UP = new Vector3(0, 1, 0);

/**
 * The colour a flat, upward-facing matte surface of this albedo ends up with under the scene's
 * lights at the current time of day (daylight.ts), for an unlit material (D053): the backdrop ground
 * and the lane lines are one colour anyway, and lighting them per pixel would cost a full-screen
 * shading pass. Same maths as three's physically based lights:
 * albedo / π × (sun · cos + hemisphere sky). Recompute when `daylightVersion()` changes.
 */
export function preLit(
  albedo: string | Color,
  light: Readonly<DaylightState> = daylight(),
  out = new Color(),
): Color {
  const cos = Math.max(0, UP.dot(light.sunDir));
  const sky = out
    .copy(light.hemiSky)
    .multiplyScalar(light.hemiIntensity)
    .add(SUN.copy(light.sunColor).multiplyScalar(light.sunIntensity * cos));
  return sky.multiply(ALBEDO.set(albedo)).multiplyScalar(1 / Math.PI);
}
const SUN = new Color();
const ALBEDO = new Color();

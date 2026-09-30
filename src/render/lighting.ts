import { Color, Vector3 } from 'three';

/** The scene's lights (Scene.tsx): a hemisphere sky/ground light and a late-morning sun. */
export const HEMI_SKY = '#f4f1ea';
export const HEMI_GROUND = '#5b5347';
export const HEMI_INTENSITY = 1.1;
/** Late-morning sun from the south-east (the directional light). */
export const SUN_POSITION: [number, number, number] = [900, 1100, 700];
export const SUN_INTENSITY = 1.8;

/**
 * The colour a flat, upward-facing matte surface of this albedo ends up with under the scene's
 * lights, for an unlit material (D053): the ground planes are one colour anyway, and lighting them per
 * pixel cost a full-screen shading pass each. Same maths as three's physically based lights:
 * albedo / π × (sun · cos + hemisphere sky).
 */
export function preLit(albedo: string): Color {
  const up = new Vector3(0, 1, 0);
  const cos = Math.max(0, up.dot(new Vector3(...SUN_POSITION).normalize()));
  const light = new Color(HEMI_SKY)
    .multiplyScalar(HEMI_INTENSITY)
    .add(new Color(1, 1, 1).multiplyScalar(SUN_INTENSITY * cos));
  return new Color(albedo).multiply(light).multiplyScalar(1 / Math.PI);
}

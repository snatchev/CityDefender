import type { Camera, Vector3 } from 'three';

/** What we use of the default camera controls (drei MapControls with `makeDefault`). */
export interface OrbitControlsLike {
  target: Vector3;
  update(): void;
}

/** R3F types `state.controls` loosely; this names the shape the render code relies on. */
export function orbitControls(controls: unknown): OrbitControlsLike | null {
  return (controls as OrbitControlsLike | null) ?? null;
}

/**
 * Zoom compensation reference: beyond this camera distance (m) units grow in proportion, so they
 * keep a readable size on screen when zoomed out instead of shrinking to a pixel.
 */
export const ZOOM_REF_M = 300;

/** Distance from the camera to the point it orbits (ZOOM_REF_M until the controls exist). */
export function viewDistance(camera: Camera, controls: unknown): number {
  const c = orbitControls(controls);
  return c ? camera.position.distanceTo(c.target) : ZOOM_REF_M;
}

/**
 * Size multiplier for a unit at this view distance: 1 up close, growing linearly past ZOOM_REF_M.
 * `share` < 1 gives a unit only part of the compensation (towers are big to start with).
 */
export function zoomScale(distM: number, share = 1): number {
  return 1 + Math.max(0, distM / ZOOM_REF_M - 1) * share;
}

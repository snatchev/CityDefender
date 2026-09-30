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

/** A camera placement around a point on the ground: distance, pitch above the ground, yaw (degrees). */
export interface Framing {
  target: [x: number, z: number];
  distM: number;
  pitchDeg: number;
  /** Yaw as in `CameraView`: 0 = camera south of the target looking north. */
  yawDeg: number;
}

/**
 * Frame a route (world x/z points) so all of it is on screen (D049): look across its long axis
 * (screens are wider than tall), from whichever side is closer to the current yaw, at `pitchDeg`,
 * far enough back that its length fits the width and its depth the height, times `margin`.
 */
export function frameRoute(
  points: readonly (readonly [number, number])[],
  opts: {
    fovDeg: number;
    aspect: number;
    pitchDeg: number;
    margin: number;
    yawDeg: number;
    /** Share of the screen width covered on the left (the HUD panel): the route is fitted beside it. */
    coveredLeft?: number;
  },
): Framing {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const mz = points.reduce((s, p) => s + p[1], 0) / n;
  let cxx = 0;
  let czz = 0;
  let cxz = 0;
  for (const [x, z] of points) {
    cxx += (x - mx) ** 2;
    czz += (z - mz) ** 2;
    cxz += (x - mx) * (z - mz);
  }
  // Long axis u (principal component) and the axis across it, v.
  const a = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  const u = [Math.cos(a), Math.sin(a)] as const;
  const v = [-u[1], u[0]] as const;
  let [a0, a1, b0, b1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [x, z] of points) {
    const pa = (x - mx) * u[0] + (z - mz) * u[1];
    const pb = (x - mx) * v[0] + (z - mz) * v[1];
    [a0, a1, b0, b1] = [Math.min(a0, pa), Math.max(a1, pa), Math.min(b0, pb), Math.max(b1, pb)];
  }
  const ca = (a0 + a1) / 2;
  const cb = (b0 + b1) / 2;
  const target: [number, number] = [mx + u[0] * ca + v[0] * cb, mz + u[1] * ca + v[1] * cb];

  // The camera sits off to one side of the long axis: offset direction ±v. Yaw is measured from +z.
  const yawA = (Math.atan2(v[0], v[1]) * 180) / Math.PI;
  const yawB = yawA + 180;
  const turn = (y: number) => Math.abs(((((y - opts.yawDeg) % 360) + 540) % 360) - 180);
  const yawDeg = turn(yawA) <= turn(yawB) ? yawA : yawB;

  const tanV = Math.tan((opts.fovDeg * Math.PI) / 360);
  const pitch = (opts.pitchDeg * Math.PI) / 180;
  const halfLength = ((a1 - a0) / 2) * opts.margin;
  const halfDepth = ((b1 - b0) / 2) * opts.margin;
  const covered = opts.coveredLeft ?? 0;
  const tanH = tanV * opts.aspect;
  const distM = Math.max(halfLength / (tanH * (1 - covered)), (halfDepth * Math.sin(pitch)) / tanV);
  // Aim left of the route's centre so it sits in the middle of the uncovered part of the screen.
  const yaw = (yawDeg * Math.PI) / 180;
  const shift = distM * tanH * covered;
  target[0] -= Math.cos(yaw) * shift;
  target[1] += Math.sin(yaw) * shift;
  return { target, distM, pitchDeg: opts.pitchDeg, yawDeg };
}

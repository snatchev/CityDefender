/** Optional camera placement: distance (m), pitch above the ground and yaw (degrees). */
export interface CameraView {
  distM?: number;
  pitchDeg?: number;
  yawDeg?: number;
}

/**
 * The camera, as seen from outside the Canvas (minimap, dev hook). Filled in by
 * render/CameraBridge.tsx; `view` is rewritten every frame (read it, don't subscribe to it).
 */
export const cameraBridge = {
  /** Centre the view on a tile (null until the scene is up). */
  focusTile: null as ((tx: number, ty: number, view?: CameraView) => void) | null,
  /**
   * Glide to look at a world point (x, y, z) from a view, over `seconds`; mouse or keyboard camera
   * input takes over at once (null until the scene is up).
   */
  flyTo: null as
    | ((target: [number, number, number], view: Required<CameraView>, seconds: number) => void)
    | null,
  view: {
    /** Tile under the orbit target. */
    tx: 0,
    ty: 0,
    /** Ground-plane direction the camera looks, radians in tile axes (atan2(dy, dx)). */
    yaw: -Math.PI / 2,
    distM: 0,
  },
};

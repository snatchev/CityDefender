import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { MathUtils, Spherical } from 'three';
import { cameraBridge } from '../cameraBridge';
import { tileToWorld, worldToTile, type TileFrame } from './coords';
import { orbitControls } from './view';

/**
 * Connects the camera to code outside the Canvas (minimap, dev hook) through `cameraBridge`:
 * installs `focusTile` (centre the view on a tile's top surface, optionally with a new distance,
 * pitch and yaw) and publishes the current view (focus tile, yaw, distance) every frame.
 */
export function CameraBridge({
  frame,
  heights,
  width,
}: {
  frame: TileFrame;
  heights: Float32Array;
  width: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = orbitControls(useThree((s) => s.controls));

  useEffect(() => {
    if (!controls) return;
    cameraBridge.focusTile = (tx, ty, view) => {
      const [x, z] = tileToWorld(frame, tx, ty);
      const y = heights[ty * width + tx] ?? 0; // aim at the roof, so a centre click picks this tile
      const offset = camera.position.clone().sub(controls.target);
      if (view) {
        // Spherical placement: yaw 0 = camera south of the target looking north.
        const s = new Spherical().setFromVector3(offset);
        if (view.distM !== undefined) s.radius = view.distM;
        if (view.pitchDeg !== undefined) s.phi = MathUtils.degToRad(90 - view.pitchDeg);
        if (view.yawDeg !== undefined) s.theta = MathUtils.degToRad(view.yawDeg);
        offset.setFromSpherical(s);
      }
      controls.target.set(x, y, z);
      camera.position.set(x, y, z).add(offset);
      controls.update();
    };
    return () => {
      cameraBridge.focusTile = null;
    };
  }, [camera, controls, frame, heights, width]);

  useFrame(() => {
    if (!controls) return;
    const t = controls.target;
    const [tx, ty] = worldToTile(frame, t.x, t.z);
    const v = cameraBridge.view;
    v.tx = tx;
    v.ty = ty;
    // Direction the camera looks, projected on the ground (tile x = world x, tile y = world z).
    v.yaw = Math.atan2(t.z - camera.position.z, t.x - camera.position.x);
    v.distM = camera.position.distanceTo(t);
  });

  return null;
}

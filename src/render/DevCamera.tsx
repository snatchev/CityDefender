import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { Vector3 } from 'three';
import { registerFocus } from '../debug/devHook';
import { tileToWorld, type TileFrame } from './coords';

/**
 * Dev only: lets `__cd.focusTile(tx, ty)` centre the camera on a tile's top surface, keeping the view angle
 * and distance, so an agent can put a street under the screen centre and click it with real input.
 */
export function DevCamera({
  frame,
  heights,
  width,
}: {
  frame: TileFrame;
  heights: Float32Array;
  width: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: Vector3;
    update(): void;
  } | null;

  useEffect(() => {
    if (!controls) return;
    registerFocus((tx, ty) => {
      const [x, z] = tileToWorld(frame, tx, ty);
      const y = heights[ty * width + tx] ?? 0; // aim at the roof, so a centre click picks this tile
      const offset = camera.position.clone().sub(controls.target);
      controls.target.set(x, y, z);
      camera.position.set(x, y, z).add(offset);
      controls.update();
    });
    return () => registerFocus(null);
  }, [camera, controls, frame, heights, width]);

  return null;
}

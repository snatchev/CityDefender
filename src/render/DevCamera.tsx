import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { Vector3 } from 'three';
import { registerFocus } from '../debug/devHook';
import { tileToWorld, type TileFrame } from './coords';

/**
 * Dev only: lets `__cd.focusTile(tx, ty)` centre the camera on a tile, keeping the current view angle
 * and distance, so an agent can put a street under the screen centre and click it with real input.
 */
export function DevCamera({ frame }: { frame: TileFrame }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: Vector3;
    update(): void;
  } | null;

  useEffect(() => {
    if (!controls) return;
    registerFocus((tx, ty) => {
      const [x, z] = tileToWorld(frame, tx, ty);
      const offset = camera.position.clone().sub(controls.target);
      controls.target.set(x, 0, z);
      camera.position.set(x, 0, z).add(offset);
      controls.update();
    });
    return () => registerFocus(null);
  }, [camera, controls, frame]);

  return null;
}

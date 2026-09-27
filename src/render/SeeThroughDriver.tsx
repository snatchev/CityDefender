import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';
import { usePlan } from '../ui/planStore';
import { tileToWorld, type TileFrame } from './coords';
import { updateSeeThrough } from './seeThrough';
import { orbitControls } from './view';

/** Feeds the see-through cutaway (seeThrough.ts) with the camera, orbit target and hovered tile. */
export function SeeThroughDriver({ frame }: { frame: TileFrame }) {
  const cursor = useRef(new Vector3());
  useFrame(({ camera, controls }) => {
    const c = orbitControls(controls);
    if (!c) return;
    const ghost = usePlan.getState().ghost; // read, not subscribed: no re-render
    let hovered: Vector3 | null = null;
    if (ghost) {
      const [x, z] = tileToWorld(frame, ghost.tx, ghost.ty);
      hovered = cursor.current.set(x, 0, z);
    }
    updateSeeThrough(camera.position, c.target, hovered);
  });
  return null;
}

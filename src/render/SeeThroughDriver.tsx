import { useFrame } from '@react-three/fiber';
import { updateSeeThrough } from './seeThrough';
import { orbitControls } from './view';

/** Feeds the see-through cutaway (seeThrough.ts) with the camera and its orbit target, every frame. */
export function SeeThroughDriver() {
  useFrame(({ camera, controls }) => {
    const c = orbitControls(controls);
    if (c) updateSeeThrough(camera.position, c.target);
  });
  return null;
}

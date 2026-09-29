import { useFrame } from '@react-three/fiber';
import { cursorCutaway } from './pointer';
import { updateSeeThrough } from './seeThrough';
import { orbitControls } from './view';

/**
 * Feeds the see-through cutaway (seeThrough.ts) with the camera, the orbit target and, while a
 * build tool is picked, the point under the mouse at street level (not the picked or snapped tile,
 * which would feed back into picking).
 */
export function SeeThroughDriver() {
  useFrame(({ camera, controls }) => {
    const c = orbitControls(controls);
    if (!c) return;
    updateSeeThrough(camera.position, c.target, cursorCutaway());
  });
  return null;
}

import { useFrame } from '@react-three/fiber';
import { Vector2, type PerspectiveCamera } from 'three';
import { updateSeeThrough } from './seeThrough';
import { orbitControls } from './view';

const size = new Vector2();

/**
 * Feeds the see-through cutaways (seeThrough.ts) with the camera, its orbit target and the drawing
 * buffer size, every frame.
 */
export function SeeThroughDriver() {
  useFrame(({ camera, controls, gl }) => {
    const c = orbitControls(controls);
    gl.getDrawingBufferSize(size);
    if (c) updateSeeThrough(camera as PerspectiveCamera, c.target, size.x, size.y);
  });
  return null;
}

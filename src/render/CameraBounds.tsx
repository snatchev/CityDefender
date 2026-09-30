import { useFrame, useThree } from '@react-three/fiber';
import { uvToWorld, type TileFrame } from './coords';
import { orbitControls } from './view';

/**
 * Keeps the view on the map (Stefan, D047): the point the camera orbits can't leave the level's
 * rectangle. Runs after the mouse and keyboard controls have moved things each frame; when the
 * target is past an edge, target and camera slide back together, so the view angle and distance
 * don't change and panning simply stops at the edge.
 */
export function CameraBounds({
  frame,
  width,
  height,
}: {
  frame: TileFrame;
  width: number;
  height: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = orbitControls(useThree((s) => s.controls));

  useFrame(() => {
    if (!controls) return;
    const [x0, z0] = uvToWorld(frame, 0, 0);
    const [x1, z1] = uvToWorld(frame, width, height);
    const t = controls.target;
    const dx = Math.min(x1, Math.max(x0, t.x)) - t.x;
    const dz = Math.min(z1, Math.max(z0, t.z)) - t.z;
    if (dx === 0 && dz === 0) return;
    t.x += dx;
    t.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
    controls.update();
  });

  return null;
}

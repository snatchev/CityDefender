import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, Spherical, Vector3, type EventDispatcher } from 'three';
import { cameraBridge } from '../cameraBridge';
import { tileToWorld, worldToTile, type TileFrame } from './coords';
import { orbitControls } from './view';

/** Camera keys (KeyboardCamera) that take over from a flight. */
const CAMERA_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);

interface Flight {
  fromTarget: Vector3;
  toTarget: Vector3;
  from: Spherical;
  to: Spherical;
  startS: number;
  seconds: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Connects the camera to code outside the Canvas (minimap, dev hook, route focus) through
 * `cameraBridge`: installs `focusTile` (centre the view on a tile's top surface, optionally with a
 * new distance, pitch and yaw) and `flyTo` (glide there instead), and publishes the current view
 * (focus tile, yaw, distance) every frame.
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
  const clock = useThree((s) => s.clock);
  const flight = useRef<Flight | null>(null);

  useEffect(() => {
    if (!controls) return;
    // Any camera input of the player's own ends a flight where it is.
    const stop = () => (flight.current = null);
    const onKey = (e: KeyboardEvent) => {
      if (CAMERA_KEYS.has(e.code)) stop();
    };
    const dispatcher = controls as unknown as EventDispatcher<{ start: object }>;
    dispatcher.addEventListener('start', stop);
    window.addEventListener('keydown', onKey);
    cameraBridge.flyTo = (target, view, seconds) => {
      const to = new Spherical(
        view.distM,
        MathUtils.degToRad(90 - view.pitchDeg),
        MathUtils.degToRad(view.yawDeg),
      );
      const from = new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      // Turn the short way round.
      to.theta =
        from.theta +
        MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, 2 * Math.PI) -
        Math.PI;
      flight.current = {
        fromTarget: controls.target.clone(),
        toTarget: new Vector3(...target),
        from,
        to,
        startS: clock.elapsedTime,
        seconds,
      };
    };
    return () => {
      dispatcher.removeEventListener('start', stop);
      window.removeEventListener('keydown', onKey);
      cameraBridge.flyTo = null;
    };
  }, [camera, controls, clock]);

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
      flight.current = null;
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
    const f = flight.current;
    if (f) {
      const k = easeInOut(Math.min(1, (clock.elapsedTime - f.startS) / f.seconds));
      const s = new Spherical(
        MathUtils.lerp(f.from.radius, f.to.radius, k),
        MathUtils.lerp(f.from.phi, f.to.phi, k),
        MathUtils.lerp(f.from.theta, f.to.theta, k),
      );
      controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
      camera.position.setFromSpherical(s).add(controls.target);
      controls.update();
      if (k >= 1) flight.current = null;
    }
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

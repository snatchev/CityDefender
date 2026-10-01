import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, Spherical, Vector3, type EventDispatcher } from 'three';
import { cameraBridge } from '../cameraBridge';
import { worldToTile, type TileFrame } from './coords';
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
 * Connects the camera to code outside the Canvas (minimap, dev hook, rail, cutscenes) through
 * `cameraBridge`: installs `flyTo` (glide to a view of a point) and publishes the current view
 * (focus tile, yaw, distance) every frame. `focusTile` belongs to the rail (RailCamera.tsx).
 */
export function CameraBridge({ frame }: { frame: TileFrame }) {
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
    cameraBridge.flying = flight.current !== null;
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

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { orbitControls } from './view';

/** Pan speed as a fraction of the camera's distance to its target, per second (zoomed out = faster). */
const PAN_PER_S = 0.9;
/** Orbit speed around the target, radians per second. */
const ROTATE_RAD_PER_S = 1.4;

/** Key → action, by physical key (`KeyboardEvent.code`), so it works on any keyboard layout. */
const ACTIONS: Record<string, 'forward' | 'back' | 'left' | 'right' | 'rotLeft' | 'rotRight'> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  KeyQ: 'rotLeft',
  KeyE: 'rotRight',
};

const UP = new Vector3(0, 1, 0);

/** True when a key press belongs to a text field or control, not the game. */
function typingInto(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Keyboard camera: WASD pans along the ground relative to the view, Q/E orbit left/right around the
 * point being looked at. Works alongside the mouse MapControls (moves both camera and target, then
 * lets the controls update). Held keys are read in useFrame; they're cleared when the window loses
 * focus so a key can't get stuck.
 */
export function KeyboardCamera() {
  const camera = useThree((s) => s.camera);
  const controls = orbitControls(useThree((s) => s.controls));
  const held = useRef(new Set<string>());
  /** Keys released since the last frame; they still act for that frame, so a quick tap nudges. */
  const released = useRef(new Set<string>());
  const tmp = useRef({ forward: new Vector3(), right: new Vector3(), move: new Vector3() });

  useEffect(() => {
    const keys = held.current;
    const done = released.current;
    const down = (e: KeyboardEvent) => {
      if (!(e.code in ACTIONS) || e.ctrlKey || e.metaKey || e.altKey || typingInto(e.target))
        return;
      keys.add(ACTIONS[e.code]!);
      done.delete(ACTIONS[e.code]!);
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code in ACTIONS) done.add(ACTIONS[e.code]!);
    };
    const clear = () => {
      keys.clear();
      done.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useFrame((_, delta) => {
    const keys = held.current;
    if (keys.size === 0 || !controls) return;
    const dt = Math.min(delta, 0.1);
    const { forward, right, move } = tmp.current;
    const target = controls.target;

    // Pan on the ground plane, relative to where the camera is looking.
    forward.subVectors(target, camera.position).setY(0).normalize();
    right.crossVectors(forward, UP).normalize();
    const x = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    const z = (keys.has('forward') ? 1 : 0) - (keys.has('back') ? 1 : 0);
    if (x !== 0 || z !== 0) {
      const speed = PAN_PER_S * camera.position.distanceTo(target) * dt;
      move
        .copy(right)
        .multiplyScalar(x)
        .addScaledVector(forward, z)
        .normalize()
        .multiplyScalar(speed);
      camera.position.add(move);
      target.add(move);
    }

    // Orbit around the target.
    const r = (keys.has('rotLeft') ? 1 : 0) - (keys.has('rotRight') ? 1 : 0);
    if (r !== 0) {
      move.subVectors(camera.position, target).applyAxisAngle(UP, r * ROTATE_RAD_PER_S * dt);
      camera.position.copy(target).add(move);
    }
    controls.update();
    for (const k of released.current) keys.delete(k);
    released.current.clear();
  });

  return null;
}

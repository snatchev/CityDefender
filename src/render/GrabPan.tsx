import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { MOUSE, Plane, Raycaster, Vector2, Vector3, type EventDispatcher } from 'three';
import { orbitControls } from './view';

/**
 * Grab panning (Stefan: panning felt like half speed on the trackpad). Left-drag on the map holds
 * on to the street point under the pointer and keeps it under the pointer, like dragging a paper
 * map, at any tilt or zoom. The stock MapControls pan moves a fixed distance per pixel at the orbit
 * target, which on a tilted view drags the ground slower than the pointer (by the sine of the
 * pitch: about half speed at 30°). MapControls keeps zoom, rotate (right drag, or left drag with
 * Ctrl, Cmd or Shift: Ctrl-click is how a Mac trackpad rotates) and touch.
 */

/** OrbitControls ignores a mouse button mapped to -1 (three has no named constant for it). */
const NO_BUTTON = -1 as MOUSE;

interface ButtonMap {
  mouseButtons: { LEFT?: MOUSE | null; MIDDLE?: MOUSE | null; RIGHT?: MOUSE | null };
}
export function GrabPan() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = orbitControls(useThree((s) => s.controls));

  useEffect(() => {
    if (!controls) return;
    const el = gl.domElement;
    const ground = new Plane(new Vector3(0, 1, 0), 0);
    const ray = new Raycaster();
    const ndc = new Vector2();
    let grabbed: Vector3 | null = null;
    let pointerId = -1;

    const groundUnder = (e: PointerEvent): Vector3 | null => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      // Several pointer moves can arrive between frames (trackpads especially), and each one moves
      // the camera: refresh its matrix, or later moves would cast from where it was last drawn.
      camera.updateMatrixWorld();
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(ground, new Vector3());
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      // This runs before MapControls sees the press (capture phase). With a modifier, hand the drag
      // to MapControls: a left "pan" with Ctrl/Cmd/Shift is its rotate. Otherwise it's ours.
      const modified = e.ctrlKey || e.metaKey || e.shiftKey;
      (controls as unknown as ButtonMap).mouseButtons.LEFT = modified ? MOUSE.PAN : NO_BUTTON;
      if (modified) return;
      grabbed = groundUnder(e);
      if (!grabbed) return;
      pointerId = e.pointerId;
      // Let anything listening (a camera flight in progress) know the player took the camera.
      (controls as unknown as EventDispatcher<{ start: object }>).dispatchEvent({ type: 'start' });
    };
    const move = (e: PointerEvent) => {
      if (!grabbed || e.pointerId !== pointerId) return;
      const now = groundUnder(e);
      if (!now) return; // pointer above the horizon
      const shift = grabbed.clone().sub(now).setY(0);
      camera.position.add(shift);
      controls.target.add(shift);
      controls.update();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === pointerId) grabbed = null;
    };
    el.addEventListener('pointerdown', down, { capture: true });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down, { capture: true });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [camera, gl, controls]);

  return null;
}

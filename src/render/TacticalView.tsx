import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, Spherical } from 'three';
import { cameraBridge } from '../cameraBridge';
import { usePlan } from '../ui/planStore';
import { orbitControls } from './view';

/** Tactical view camera: near top-down, and never closer than this so the board reads. */
export const TACTICAL_PITCH_DEG = 80;
const TACTICAL_MIN_DIST_M = 350;
/** Tilt to return to if the view was never tilted before tactical was switched on. */
const DEFAULT_PITCH_DEG = 42;
const FLY_S = 0.6;

/**
 * Tactical view (D050): when it's switched on, glide to look almost straight down at the same spot
 * (same heading, zoomed out to at least a readable distance); when it's switched off, glide back to
 * the tilt from before. The buildings' squash is done by Scene (display heights and mesh scale).
 */
export function TacticalView() {
  const camera = useThree((s) => s.camera);
  const controls = orbitControls(useThree((s) => s.controls));
  const tactical = usePlan((p) => p.tactical);
  const savedPitch = useRef(DEFAULT_PITCH_DEG);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!controls) return;
    const s = new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const pitchDeg = 90 - MathUtils.radToDeg(s.phi);
    const yawDeg = MathUtils.radToDeg(s.theta);
    if (tactical) savedPitch.current = pitchDeg;
    const t = controls.target;
    cameraBridge.flyTo?.(
      [t.x, 0, t.z],
      {
        distM: tactical ? Math.max(TACTICAL_MIN_DIST_M, s.radius) : s.radius,
        pitchDeg: tactical ? TACTICAL_PITCH_DEG : savedPitch.current,
        yawDeg,
      },
      FLY_S,
    );
  }, [tactical, camera, controls]);

  return null;
}

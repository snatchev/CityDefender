import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import { cameraBridge } from '../cameraBridge';
import { usePlan } from '../ui/planStore';
import { indexToWorld, type TileFrame } from './coords';
import { setRouteCutaway } from './seeThrough';
import { TACTICAL_PITCH_DEG } from './TacticalView';
import { frameRoute, orbitControls } from './view';

/** Framing for a focused route: steep enough to look down between buildings, with room around it. */
const PITCH_DEG = 55;
const MARGIN = 1.3;
/** The status panel covers about this much of the screen's left side. */
const HUD_LEFT_SHARE = 0.25;
const FLY_S = 0.9;
const MIN_DIST_M = 140;
const MAX_DIST_M = 2400;
/** The cleared band follows the route a little above the street, where the bugs are. */
const ROUTE_Y_M = 1;

/**
 * Route focus (D049): when a route is clicked (planning.ts `focusRouteAt`), glide the camera to frame
 * all of it and fade whatever stands in front of it (seeThrough.ts route cutaway). The cutaway keeps
 * following the route as walls reroute it and as the camera moves, until the focus is cleared.
 */
export function RouteFocus({ frame, width }: { frame: TileFrame; width: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = orbitControls(useThree((s) => s.controls));
  const focus = usePlan((s) => s.focus);
  const tactical = usePlan((s) => s.tactical);
  const routes = usePlan((s) => s.routes);
  const route = focus ? routes.find((r) => r.station === focus.station) : undefined;

  // Corners only: a route is long straight runs, and the shader takes a limited number of points.
  const points = useMemo(() => {
    if (!route) return null;
    const out: Vector3[] = [];
    const at = (k: number) => indexToWorld(frame, width, route.tiles[k]!);
    for (let k = 0; k < route.tiles.length; k++) {
      const [x, z] = at(k);
      if (k > 0 && k + 1 < route.tiles.length) {
        const [px, pz] = at(k - 1);
        const [nx, nz] = at(k + 1);
        if ((x - px) * (nz - z) - (z - pz) * (nx - x) === 0) continue; // straight on
      }
      out.push(new Vector3(x, ROUTE_Y_M, z));
    }
    return out;
  }, [route, frame, width]);

  const latest = useRef(points);
  useEffect(() => {
    latest.current = points;
    setRouteCutaway(points);
  }, [points]);
  // Read at click time only: toggling tactical view moves the camera itself (TacticalView).
  const tacticalNow = useRef(tactical);
  useEffect(() => {
    tacticalNow.current = tactical;
  }, [tactical]);
  useEffect(() => () => setRouteCutaway(null), []);

  // Fly only when a route is clicked (seq changes), not when walls reroute the focused one.
  const seq = focus?.seq;
  useEffect(() => {
    const pts = latest.current;
    if (seq === undefined || !controls || !pts || pts.length < 2) return;
    const off = camera.position.clone().sub(controls.target);
    const yawDeg = (Math.atan2(off.x, off.z) * 180) / Math.PI;
    const f = frameRoute(
      pts.map((p) => [p.x, p.z] as const),
      {
        fovDeg: camera.fov,
        aspect: camera.aspect,
        pitchDeg: tacticalNow.current ? TACTICAL_PITCH_DEG : PITCH_DEG,
        margin: MARGIN,
        yawDeg,
        coveredLeft: HUD_LEFT_SHARE,
      },
    );
    const distM = Math.min(MAX_DIST_M, Math.max(MIN_DIST_M, f.distM));
    cameraBridge.flyTo?.([f.target[0], 0, f.target[1]], { ...f, distM }, FLY_S);
  }, [seq, camera, controls]);

  return null;
}

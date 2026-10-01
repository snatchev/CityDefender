import { useEffect, useMemo } from 'react';
import { Vector3 } from 'three';
import { usePlan } from '../ui/planStore';
import { indexToWorld, type TileFrame } from './coords';
import { setRouteCutaway } from './seeThrough';

/** The cleared band follows the route a little above the street, where the bugs are. */
const ROUTE_Y_M = 1;

/**
 * The active track's line of sight (D049, D054): whatever stands in front of the route the camera
 * rides fades almost completely (seeThrough.ts route cutaway), following it as walls reroute it and
 * as the camera moves. The rail camera (RailCamera.tsx) does the moving.
 */
export function RouteFocus({ frame, width }: { frame: TileFrame; width: number }) {
  const focus = usePlan((s) => s.focus);
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

  useEffect(() => {
    setRouteCutaway(points);
  }, [points]);
  useEffect(() => () => setRouteCutaway(null), []);

  return null;
}

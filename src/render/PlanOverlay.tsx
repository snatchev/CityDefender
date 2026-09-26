import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { game } from '../game';
import { usePlan, type Route } from '../ui/planStore';
import { BARRICADE_HEIGHT_M, barricadeBox } from './Barricades';
import { tileToWorld, type TileFrame } from './coords';

const ROUTE_Y = 1.2;
/** Height of the detour meter above the hovered tile. */
const LABEL_Y = 32;
const ROUTE_COLOR = '#f28c28';
const GHOST_COLOR = '#35c4e8';
const INVALID_COLOR = '#e5484d';

/**
 * Planning overlay: the selected station's current route, and for the hovered street tile a ghost
 * barricade, the route the bugs would take with it, and the detour meter (DESIGN §3.1, §10.1).
 * Re-renders only when the plan store changes (hovered tile / field change), never per frame.
 */
export function PlanOverlay({ frame }: { frame: TileFrame }) {
  const route = usePlan((s) => s.route);
  const ghost = usePlan((s) => s.ghost);
  const width = game.world.map?.width ?? 1;

  const toXZ = (i: number) => {
    const tx = i % width;
    return tileToWorld(frame, tx, (i - tx) / width);
  };
  const [lx, lz] = ghost ? tileToWorld(frame, ghost.tx, ghost.ty) : [0, 0];
  const labelPos: [number, number, number] = [lx, LABEL_Y, lz];

  return (
    <group>
      {route && <RouteLine route={route} frame={frame} width={width} color={ROUTE_COLOR} />}
      {ghost?.route && (
        <RouteLine route={ghost.route} frame={frame} width={width} color={GHOST_COLOR} dashed />
      )}
      {ghost?.tiles.map((i) => {
        const [x, z] = toXZ(i);
        const [sx, sz] = barricadeBox(ghost.axis);
        return (
          <mesh key={i} position={[x, BARRICADE_HEIGHT_M / 2, z]}>
            <boxGeometry args={[sx, BARRICADE_HEIGHT_M, sz]} />
            <meshBasicMaterial color={GHOST_COLOR} transparent opacity={0.55} />
          </mesh>
        );
      })}
      {ghost && (
        <Html
          position={labelPos}
          center
          className="detour-label"
          style={{ color: ghost.error ? INVALID_COLOR : undefined }}
        >
          {ghostLabel(ghost.error, ghost.detourM, ghost.route)}
        </Html>
      )}
    </group>
  );
}

function ghostLabel(error: string | null, detourM: number, route: Route | null): string {
  if (error === 'already barricaded') return 'right-click to remove';
  if (error) return error;
  if (!route) return '';
  if (route.siege) return 'bugs will break through a barricade';
  if (detourM === 0) return 'no change';
  return `${detourM > 0 ? '+' : ''}${Math.round(detourM)} m`;
}

function RouteLine({
  route,
  frame,
  width,
  color,
  dashed = false,
}: {
  route: Route;
  frame: TileFrame;
  width: number;
  color: string;
  dashed?: boolean;
}) {
  const points = useMemo(
    () =>
      route.tiles.map((i): [number, number, number] => {
        const tx = i % width;
        const [x, z] = tileToWorld(frame, tx, (i - tx) / width);
        return [x, ROUTE_Y, z];
      }),
    [route, frame, width],
  );
  return (
    <Line
      points={points}
      color={color}
      lineWidth={3}
      dashed={dashed}
      dashSize={6}
      gapSize={4}
      transparent
      opacity={0.9}
    />
  );
}

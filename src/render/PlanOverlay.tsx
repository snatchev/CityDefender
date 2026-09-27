import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { game } from '../game';
import { usePlan, type Ghost, type Route } from '../ui/planStore';
import { BARRICADE_HEIGHT_M, barricadeBox } from './Barricades';
import { tileToWorld, type TileFrame } from './coords';

const ROUTE_Y = 1.2;
/** Height of the preview label above the hovered tile. */
const LABEL_Y = 32;
const ROUTE_COLOR = '#f28c28';
const GHOST_COLOR = '#35c4e8';
const INVALID_COLOR = '#e5484d';
const RANGE_Y = 0.6;

/**
 * Planning overlay: the current routes from this wave's stations, and a preview for the hovered tile:
 * on a street a ghost barricade, the routes the bugs would take with it and the detour meter
 * (DESIGN §3.1, §10.1); on a rooftop the MG Nest's range disc projected on the street (§10.3).
 * Re-renders only when the plan store changes, never per frame.
 */
export function PlanOverlay({ frame }: { frame: TileFrame }) {
  const routes = usePlan((s) => s.routes);
  const ghost = usePlan((s) => s.ghost);
  const width = game.world.map?.width ?? 1;
  const [lx, lz] = ghost ? tileToWorld(frame, ghost.tx, ghost.ty) : [0, 0];

  return (
    <group>
      {routes.map((r) => (
        <RouteLine key={r.station} route={r} frame={frame} width={width} color={ROUTE_COLOR} />
      ))}
      {ghost?.kind === 'barricade' &&
        ghost.routes.map((r) => (
          <RouteLine
            key={r.station}
            route={r}
            frame={frame}
            width={width}
            color={GHOST_COLOR}
            dashed
          />
        ))}
      {ghost?.kind === 'barricade' &&
        ghost.tiles.map((i) => {
          const tx = i % width;
          const [x, z] = tileToWorld(frame, tx, (i - tx) / width);
          const [sx, sz] = barricadeBox(ghost.axis);
          return (
            <mesh key={i} position={[x, BARRICADE_HEIGHT_M / 2, z]}>
              <boxGeometry args={[sx, BARRICADE_HEIGHT_M, sz]} />
              <meshBasicMaterial color={GHOST_COLOR} transparent opacity={0.55} />
            </mesh>
          );
        })}
      {ghost?.kind === 'tower' && (
        <mesh position={[lx, RANGE_Y, lz]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[ghost.rangeM - 1.5, ghost.rangeM, 64]} />
          <meshBasicMaterial
            color={ghost.error ? INVALID_COLOR : GHOST_COLOR}
            transparent
            opacity={0.8}
          />
        </mesh>
      )}
      {ghost && (
        <Html
          position={[lx, LABEL_Y, lz]}
          center
          className="detour-label"
          style={{ color: ghost.error ? INVALID_COLOR : undefined }}
        >
          {ghostLabel(ghost)}
        </Html>
      )}
    </group>
  );
}

function ghostLabel(ghost: Ghost): string {
  if (ghost.error === 'already barricaded') return 'right-click to remove';
  if (ghost.error) return ghost.error;
  if (ghost.kind === 'tower') return 'MG Nest';
  if (ghost.routes.some((r) => r.siege)) return 'bugs will break through a barricade';
  if (ghost.detourM === 0) return 'no change';
  return `${ghost.detourM > 0 ? '+' : ''}${Math.round(ghost.detourM)} m`;
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

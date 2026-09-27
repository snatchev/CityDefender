import { Html, Line } from '@react-three/drei';
import { useMemo } from 'react';
import { game } from '../game';
import { usePlan, type Ghost, type Route } from '../ui/planStore';
import { BARRICADE_HEIGHT_M, barricadeBox } from './Barricades';
import { indexToWorld, tileToWorld, type TileFrame } from './coords';

const ROUTE_Y = 1.2;
/** Height of the preview label above the hovered tile. */
const LABEL_Y = 32;
const ROUTE_COLOR = '#f28c28';
const GHOST_COLOR = '#35c4e8';
const INVALID_COLOR = '#e5484d';
const RANGE_Y = 0.6;
/** Range disc of an existing (hovered or selected) tower. */
const RANGE_COLOR = '#2fb4ff';
const RANGE_FILL_OPACITY = 0.12;

/**
 * Planning overlay: the current routes from this wave's stations, and a preview for the hovered tile:
 * on a street a ghost barricade, the routes the bugs would take with it and the detour meter
 * (DESIGN §3.1, §10.1); on a rooftop the MG Nest's range disc projected on the street (§10.3).
 * Re-renders only when the plan store changes, never per frame.
 */
export function PlanOverlay({ frame }: { frame: TileFrame }) {
  const routes = usePlan((s) => s.routes);
  const ghost = usePlan((s) => s.ghost);
  const selected = usePlan((s) => s.selected);
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
          const [x, z] = indexToWorld(frame, width, i);
          const [sx, sz] = barricadeBox(ghost.axis);
          return (
            <mesh key={i} position={[x, BARRICADE_HEIGHT_M / 2, z]}>
              <boxGeometry args={[sx, BARRICADE_HEIGHT_M, sz]} />
              <meshBasicMaterial color={GHOST_COLOR} transparent opacity={0.55} />
            </mesh>
          );
        })}
      {ghost?.kind === 'tower' && (
        <RangeDisc
          frame={frame}
          tx={ghost.tx}
          ty={ghost.ty}
          rangeM={ghost.rangeM}
          minRangeM={ghost.minRangeM}
          color={ghost.error ? INVALID_COLOR : ghost.sellValue !== null ? RANGE_COLOR : GHOST_COLOR}
        />
      )}
      {selected && (
        <RangeDisc
          frame={frame}
          tx={selected.tx}
          ty={selected.ty}
          rangeM={selected.rangeM}
          minRangeM={selected.minRangeM}
          color={RANGE_COLOR}
          filled
        />
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
  if (ghost.kind === 'barricade' && ghost.upgradeCost !== null && !ghost.error) {
    return `upgrade $${ghost.upgradeCost}`;
  }
  if (ghost.sellValue !== null) return `right-click: sell $${ghost.sellValue}`;
  if (ghost.error) return ghost.error;
  if (ghost.kind === 'tower') return ghost.name;
  if (ghost.routes.some((r) => r.siege)) return 'bugs will break through a barricade';
  if (ghost.detourM === 0) return 'no change';
  return `${ghost.detourM > 0 ? '+' : ''}${Math.round(ghost.detourM)} m`;
}

/** A tower's range projected on the street (DESIGN §10.3): a ring, optionally with a faint fill. */
function RangeDisc({
  frame,
  tx,
  ty,
  rangeM,
  minRangeM,
  color,
  filled = false,
}: {
  frame: TileFrame;
  tx: number;
  ty: number;
  rangeM: number;
  /** Inner "can't hit" radius of raised towers, drawn as a dashed-looking thin ring. */
  minRangeM: number;
  color: string;
  filled?: boolean;
}) {
  const [x, z] = tileToWorld(frame, tx, ty);
  return (
    <group position={[x, RANGE_Y, z]} rotation-x={-Math.PI / 2}>
      <mesh>
        <ringGeometry args={[rangeM - 1.5, rangeM, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
      {minRangeM > 0 && (
        <mesh>
          <ringGeometry args={[Math.max(0, minRangeM - 0.8), minRangeM, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
      )}
      {filled && (
        <mesh>
          <ringGeometry args={[minRangeM, rangeM, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={RANGE_FILL_OPACITY}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
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
        const [x, z] = indexToWorld(frame, width, i);
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

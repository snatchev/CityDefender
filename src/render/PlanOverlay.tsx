import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group, Mesh } from 'three';
import { game } from '../game';
import type { TowerType } from '../sim/towers';
import { usePlan, type Ghost, type Route } from '../ui/planStore';
import { BARRICADE_HEIGHT_M, barricadeBox } from './Barricades';
import { indexToWorld, tileToWorld, type TileFrame } from './coords';
import { TOWER_ZOOM_SHARE, towerColor, towerGeometry } from './Towers';
import { viewDistance, zoomScale } from './view';

const ROUTE_Y = 1.2;
/** Height of the preview label above the hovered tile's roof (or the street). */
const LABEL_Y = 32;
/** The see-through tower preview and its pulsing ring on the snapped spot. */
const GHOST_TOWER_OPACITY = 0.7;
const GHOST_RING_INNER_M = 7;
const GHOST_RING_OUTER_M = 11;
const GHOST_RING_PULSE = 0.12;
const GHOST_RING_HZ = 1.5;
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
 * (DESIGN §3.1, §10.1); with a tower tool, a see-through model of the tower on the spot the pointer
 * snapped to, with its range disc (§10.3). Re-renders only when the plan store changes; only the
 * ghost tower's zoom scale and ring pulse update per frame (refs, no React state).
 */
export function PlanOverlay({ frame, heights }: { frame: TileFrame; heights: Float32Array }) {
  const routes = usePlan((s) => s.routes);
  const ghost = usePlan((s) => s.ghost);
  const selected = usePlan((s) => s.selected);
  const width = game.world.map?.width ?? 1;
  const [lx, lz] = ghost ? tileToWorld(frame, ghost.tx, ghost.ty) : [0, 0];
  const labelY = LABEL_Y + (ghost ? (heights[ghost.ty * width + ghost.tx] ?? 0) : 0);
  const label = ghost ? ghostLabel(ghost) : null;

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
      {ghost?.kind === 'tower' && ghost.sellValue === null && (
        <GhostTower
          frame={frame}
          heights={heights}
          width={width}
          tx={ghost.tx}
          ty={ghost.ty}
          type={ghost.type}
          color={ghost.error ? INVALID_COLOR : towerColor(ghost.type)}
        />
      )}
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
      {label && (
        <Html
          position={[lx, labelY, lz]}
          center
          className="detour-label"
          style={{ color: ghost?.error ? INVALID_COLOR : undefined }}
        >
          {label}
        </Html>
      )}
    </group>
  );
}

/** The floating preview label, or null for none (a placeable tower speaks for itself). */
function ghostLabel(ghost: Ghost): string | null {
  if (ghost.kind === 'barricade' && ghost.upgradeCost !== null && !ghost.error) {
    return `upgrade $${ghost.upgradeCost}`;
  }
  if (ghost.sellValue !== null) return `right-click: sell $${ghost.sellValue}`;
  if (ghost.error) return ghost.error;
  if (ghost.kind === 'tower') return null;
  if (ghost.routes.some((r) => r.siege)) return 'bugs will break through a barricade';
  if (ghost.detourM === 0) return 'no change';
  return `${ghost.detourM > 0 ? '+' : ''}${Math.round(ghost.detourM)} m`;
}

/** A see-through model of the tower on the spot it would be built, over a pulsing ring. */
function GhostTower({
  frame,
  heights,
  width,
  tx,
  ty,
  type,
  color,
}: {
  frame: TileFrame;
  heights: Float32Array;
  width: number;
  tx: number;
  ty: number;
  type: TowerType;
  color: string;
}) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const geometry = useMemo(() => towerGeometry(type), [type]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const [x, z] = tileToWorld(frame, tx, ty);
  const roof = heights[ty * width + tx] ?? 0;

  useFrame(({ camera, controls }) => {
    const zoom = zoomScale(viewDistance(camera, controls), TOWER_ZOOM_SHARE);
    group.current?.scale.setScalar(zoom);
    const pulse =
      1 + GHOST_RING_PULSE * Math.sin((performance.now() / 1000) * GHOST_RING_HZ * 2 * Math.PI);
    ring.current?.scale.setScalar(pulse);
  });

  return (
    <group ref={group} position={[x, roof, z]}>
      <mesh geometry={geometry} renderOrder={5}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={GHOST_TOWER_OPACITY}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.4} renderOrder={5}>
        <ringGeometry args={[GHOST_RING_INNER_M, GHOST_RING_OUTER_M, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
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

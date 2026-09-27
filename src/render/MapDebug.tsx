import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import type { MapSlots } from '../sim/slots';
import { TILE_M } from '../sim/constants';
import { indexToWorld, type TileFrame } from './coords';

const Y = 0.35;
const NODE_COLOR = new Color('#ff3b30');
const STATION_COLOR = new Color('#f28c28');
const MANHOLE_COLOR = new Color('#111111');

/**
 * Map debug overlay (toggle with M): every street tile tinted by its street segment (block face),
 * intersections red, stations orange, manholes black. For checking the street graph by eye.
 */
export function MapDebug({
  slots,
  frame,
  width,
}: {
  slots: MapSlots;
  frame: TileFrame;
  width: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const cells = useMemo(() => {
    const out: { i: number; color: Color }[] = [];
    slots.segments.forEach((s) => {
      const color = new Color().setHSL((((s.id * 0.618034) % 1) + 1) % 1, 0.7, 0.55);
      for (const i of s.tiles) out.push({ i, color });
    });
    for (const n of slots.nodes) {
      for (const i of n.tiles) out.push({ i, color: n.station ? STATION_COLOR : NODE_COLOR });
    }
    for (const i of slots.manholes) out.push({ i, color: MANHOLE_COLOR });
    return out;
  }, [slots]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    cells.forEach(({ i, color }, k) => {
      const [x, z] = indexToWorld(frame, width, i);
      o.position.set(x, Y, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.setScalar(TILE_M * 0.9);
      o.updateMatrix();
      mesh.setMatrixAt(k, o.matrix);
      mesh.setColorAt(k, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, frame, width]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]}>
      <planeGeometry />
      <meshBasicMaterial transparent opacity={0.75} depthWrite={false} />
    </instancedMesh>
  );
}

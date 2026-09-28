import { useLayoutEffect, useRef } from 'react';
import { Object3D, type InstancedMesh } from 'three';
import type { MapSlots } from '../sim/slots';
import { TOWERS } from '../sim/towers';
import { usePlan } from '../ui/planStore';
import { indexToWorld, type TileFrame } from './coords';

const COLOR = '#5fd0ff';
const PAD_SIZE_M = 3.2;
const PAD_LIFT_M = 0.4;
const CORNER_RADIUS_M = 1.8;
const CORNER_Y = 0.25;
const OPACITY = 0.55;
/** With a tower tool picked, the spots that tower can use are drawn this much bigger and brighter. */
const ACTIVE_SCALE = 2.2;
const ACTIVE_OPACITY = 0.9;

/**
 * Where towers can go (DESIGN §4.1): a small diamond on each roof pad and a dot on each street
 * corner. With a tower tool picked, only the spots that tower can use show, bigger and brighter.
 * Rewritten only when the map or the tool changes (a tower simply stands on top of its marker).
 */
export function SlotMarkers({
  slots,
  frame,
  width,
  heights,
}: {
  slots: MapSlots;
  frame: TileFrame;
  width: number;
  heights: Float32Array;
}) {
  const pads = useRef<InstancedMesh>(null);
  const corners = useRef<InstancedMesh>(null);
  const tool = usePlan((p) => p.tool);
  const towerSlots = tool?.kind === 'tower' ? TOWERS[tool.type].slots : null;
  const scale = towerSlots ? ACTIVE_SCALE : 1;
  const opacity = towerSlots ? ACTIVE_OPACITY : OPACITY;

  useLayoutEffect(() => {
    const o = new Object3D();
    const write = (
      mesh: InstancedMesh | null,
      tiles: number[],
      y: (i: number) => number,
      spin: number,
    ) => {
      if (!mesh) return;
      tiles.forEach((t, k) => {
        const [x, z] = indexToWorld(frame, width, t);
        o.position.set(x, y(t), z);
        o.rotation.set(-Math.PI / 2, 0, spin);
        o.scale.setScalar(scale);
        o.updateMatrix();
        mesh.setMatrixAt(k, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    write(pads.current, slots.pads, (t) => heights[t]! + PAD_LIFT_M, Math.PI / 4);
    write(corners.current, slots.corners, () => CORNER_Y, 0);
    if (pads.current) pads.current.visible = !towerSlots || towerSlots.includes('pad');
    if (corners.current) corners.current.visible = !towerSlots || towerSlots.includes('corner');
  }, [slots, frame, width, heights, scale, towerSlots]);

  return (
    <>
      <instancedMesh ref={pads} args={[undefined, undefined, slots.pads.length]}>
        <planeGeometry args={[PAD_SIZE_M, PAD_SIZE_M]} />
        <meshBasicMaterial color={COLOR} transparent opacity={opacity} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={corners} args={[undefined, undefined, slots.corners.length]}>
        <circleGeometry args={[CORNER_RADIUS_M, 16]} />
        <meshBasicMaterial color={COLOR} transparent opacity={opacity} depthWrite={false} />
      </instancedMesh>
    </>
  );
}

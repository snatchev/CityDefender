import { useLayoutEffect, useRef } from 'react';
import { Object3D, type InstancedMesh } from 'three';
import type { MapSlots } from '../sim/slots';
import { indexToWorld, type TileFrame } from './coords';

const COLOR = '#5fd0ff';
const PAD_SIZE_M = 3.2;
const PAD_LIFT_M = 0.4;
const CORNER_RADIUS_M = 1.8;
const CORNER_Y = 0.25;
const OPACITY = 0.55;

/**
 * Where towers can go (DESIGN §4.1): a small diamond on each roof pad and a dot on each street
 * corner. Static: written once when the map loads (a tower simply stands on top of its marker).
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
        o.updateMatrix();
        mesh.setMatrixAt(k, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    write(pads.current, slots.pads, (t) => heights[t]! + PAD_LIFT_M, Math.PI / 4);
    write(corners.current, slots.corners, () => CORNER_Y, 0);
  }, [slots, frame, width, heights]);

  return (
    <>
      <instancedMesh ref={pads} args={[undefined, undefined, slots.pads.length]}>
        <planeGeometry args={[PAD_SIZE_M, PAD_SIZE_M]} />
        <meshBasicMaterial color={COLOR} transparent opacity={OPACITY} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={corners} args={[undefined, undefined, slots.corners.length]}>
        <circleGeometry args={[CORNER_RADIUS_M, 16]} />
        <meshBasicMaterial color={COLOR} transparent opacity={OPACITY} depthWrite={false} />
      </instancedMesh>
    </>
  );
}

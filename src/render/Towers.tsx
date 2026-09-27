import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  Object3D,
  type InstancedMesh,
  type LineSegments,
  type Vector3,
} from 'three';
import { game } from '../game';
import { tileToWorld, type TileFrame } from './coords';
import { ZOOM_REF_M } from './Mobs';

const MAX_TOWERS = 256;
const RADIUS_M = 5.5;
const HEIGHT_M = 10;
/** Defence blue (DESIGN §11), self-lit so towers read against the rooftops. */
const COLOR = '#2fb4ff';
/** Glowing ring on the roof around each tower. */
const RING_INNER_M = 7;
const RING_OUTER_M = 11;
const RING_OPACITY = 0.55;
const TRACER_COLOR = '#fff2b0';
/** A tracer stays visible this many ticks after its shot. */
const TRACER_TICKS = 1;
/** Mob centre height for tracer endpoints (matches the mob sphere radius). */
const MOB_Y = 3.5;
/** Towers get half the mobs' zoom compensation (they're bigger to start with). */
const ZOOM_SHARE = 0.5;

/**
 * MG Nests on their roofs (a self-lit body plus a glowing roof ring, both instanced), plus tracer lines from each tower to its last target
 * (one LineSegments buffer rewritten per frame). Reads `game.world` directly, never React state.
 */
export function Towers({ frame, heights }: { frame: TileFrame; heights: Float32Array }) {
  const bodies = useRef<InstancedMesh>(null);
  const rings = useRef<InstancedMesh>(null);
  const tracers = useRef<LineSegments>(null);
  const dummy = useRef(new Object3D());

  useLayoutEffect(() => {
    tracers.current?.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(MAX_TOWERS * 6), 3),
    );
  }, []);

  useFrame(({ camera, controls }) => {
    const mesh = bodies.current;
    const ring = rings.current;
    const lines = tracers.current;
    const map = game.world.map;
    if (!mesh || !ring || !lines || !map) return;
    const o = dummy.current;
    const pos = lines.geometry.getAttribute('position') as BufferAttribute;
    const towers = game.world.towers;
    const n = Math.min(towers.length, MAX_TOWERS);
    const target = (controls as unknown as { target?: Vector3 } | null)?.target;
    const dist = target ? camera.position.distanceTo(target) : ZOOM_REF_M;
    const zoom = 1 + Math.max(0, dist / ZOOM_REF_M - 1) * ZOOM_SHARE;
    let segs = 0;
    for (let i = 0; i < n; i++) {
      const t = towers[i]!;
      const [x, z] = tileToWorld(frame, t.tx, t.ty);
      const roof = heights[t.ty * map.width + t.tx]!;
      o.position.set(x, roof + (HEIGHT_M * zoom) / 2, z);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(zoom);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      o.position.set(x, roof + 0.3, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      ring.setMatrixAt(i, o.matrix);
      const shot = t.lastShot;
      if (shot && game.world.tick - shot.tick <= TRACER_TICKS) {
        const [mx, mz] = tileToWorld(frame, shot.x, shot.y);
        pos.setXYZ(segs * 2, x, roof + HEIGHT_M * zoom, z);
        pos.setXYZ(segs * 2 + 1, mx, MOB_Y * Math.max(1, dist / ZOOM_REF_M), mz); // mob centre, zoom-scaled
        segs++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    ring.count = n;
    ring.instanceMatrix.needsUpdate = true;
    pos.needsUpdate = true;
    lines.geometry.setDrawRange(0, segs * 2);
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, MAX_TOWERS]} frustumCulled={false}>
        <cylinderGeometry args={[RADIUS_M, RADIUS_M * 1.2, HEIGHT_M, 12]} />
        <meshStandardMaterial color={COLOR} emissive={COLOR} emissiveIntensity={0.6} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, MAX_TOWERS]} frustumCulled={false}>
        <ringGeometry args={[RING_INNER_M, RING_OUTER_M, 32]} />
        <meshBasicMaterial
          color={COLOR}
          transparent
          opacity={RING_OPACITY}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <lineSegments ref={tracers} frustumCulled={false}>
        <bufferGeometry />
        <lineBasicMaterial color={TRACER_COLOR} />
      </lineSegments>
    </>
  );
}

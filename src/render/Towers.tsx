import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { BufferAttribute, Object3D, type InstancedMesh, type LineSegments } from 'three';
import { game } from '../game';
import { tileToWorld, type TileFrame } from './coords';

const MAX_TOWERS = 256;
const RADIUS_M = 4;
const HEIGHT_M = 7;
const COLOR = '#2b8cbe';
const TRACER_COLOR = '#ffe8a3';
/** A tracer stays visible this many ticks after its shot. */
const TRACER_TICKS = 1;
/** Mob centre height for tracer endpoints (matches the mob sphere radius). */
const MOB_Y = 2.2;

/**
 * MG Nests as one InstancedMesh on their roofs, plus tracer lines from each tower to its last target
 * (one LineSegments buffer rewritten per frame). Reads `game.world` directly, never React state.
 */
export function Towers({ frame, heights }: { frame: TileFrame; heights: Float32Array }) {
  const bodies = useRef<InstancedMesh>(null);
  const tracers = useRef<LineSegments>(null);
  const dummy = useRef(new Object3D());

  useLayoutEffect(() => {
    tracers.current?.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(MAX_TOWERS * 6), 3),
    );
  }, []);

  useFrame(() => {
    const mesh = bodies.current;
    const lines = tracers.current;
    const map = game.world.map;
    if (!mesh || !lines || !map) return;
    const o = dummy.current;
    const pos = lines.geometry.getAttribute('position') as BufferAttribute;
    const towers = game.world.towers;
    const n = Math.min(towers.length, MAX_TOWERS);
    let segs = 0;
    for (let i = 0; i < n; i++) {
      const t = towers[i]!;
      const [x, z] = tileToWorld(frame, t.tx, t.ty);
      const roof = heights[t.ty * map.width + t.tx]!;
      o.position.set(x, roof + HEIGHT_M / 2, z);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      const shot = t.lastShot;
      if (shot && game.world.tick - shot.tick <= TRACER_TICKS) {
        const [mx, mz] = tileToWorld(frame, shot.x, shot.y);
        pos.setXYZ(segs * 2, x, roof + HEIGHT_M, z);
        pos.setXYZ(segs * 2 + 1, mx, MOB_Y, mz);
        segs++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    pos.needsUpdate = true;
    lines.geometry.setDrawRange(0, segs * 2);
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, MAX_TOWERS]} frustumCulled={false}>
        <cylinderGeometry args={[RADIUS_M, RADIUS_M * 1.2, HEIGHT_M, 12]} />
        <meshStandardMaterial color={COLOR} emissive={COLOR} emissiveIntensity={0.35} />
      </instancedMesh>
      <lineSegments ref={tracers} frustumCulled={false}>
        <bufferGeometry />
        <lineBasicMaterial color={TRACER_COLOR} />
      </lineSegments>
    </>
  );
}

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Object3D, type InstancedMesh } from 'three';
import mobsData from '../data/mobs.json';
import { game } from '../game';
import { TICK_DT, TILE_M } from '../sim/constants';
import { tileToWorld, type TileFrame } from './coords';

/** Upper bound on mobs drawn at once (instance buffer size). */
const MAX_MOBS = 2048;
const RADIUS_M = 2.2;
const COLOR = '#d7263d';
/** Mobs are spread up to this far from the tile centre line so a swarm doesn't render as one ball. */
const SPREAD_M = 2.5;

/**
 * All crawlers as one InstancedMesh. Reads `game.world.mobs` every frame (never React state) and
 * interpolates each mob forward by the fraction of a tick the stepper has banked, so motion is smooth
 * at 60 fps although the sim ticks at 20 Hz.
 */
export function Mobs({ frame }: { frame: TileFrame }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = dummy.current;
    const alpha = game.stepper.paused ? 0 : game.stepper.alpha;
    const mobs = game.world.mobs;
    const n = Math.min(mobs.length, MAX_MOBS);
    for (let i = 0; i < n; i++) {
      const m = mobs[i]!;
      const perTick = (mobsData[m.type].speedMps * TICK_DT) / TILE_M;
      const t = Math.min(1, m.t + perTick * alpha);
      const [x, z] = tileToWorld(
        frame,
        m.fromX + (m.toX - m.fromX) * t,
        m.fromY + (m.toY - m.fromY) * t,
      );
      const [ox, oz] = spread(m.id);
      o.position.set(x + ox, RADIUS_M, z + oz);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_MOBS]} frustumCulled={false}>
      <sphereGeometry args={[RADIUS_M, 12, 8]} />
      <meshStandardMaterial color={COLOR} emissive={COLOR} emissiveIntensity={0.35} />
    </instancedMesh>
  );
}

/** Stable per-mob offset from its id (render only; the sim doesn't know about it). */
function spread(id: number): [number, number] {
  const a = Math.sin(id * 12.9898) * 43758.5453;
  const b = Math.sin(id * 78.233) * 12345.6789;
  return [(a - Math.floor(a) - 0.5) * 2 * SPREAD_M, (b - Math.floor(b) - 0.5) * 2 * SPREAD_M];
}

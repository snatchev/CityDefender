import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  IcosahedronGeometry,
  Object3D,
  RingGeometry,
  type InstancedMesh,
} from 'three';
import { game } from '../game';
import { createRng } from '../sim/rng';
import { tileToWorld, type TileFrame } from './coords';

/**
 * Bugs bursting out of a station (branch down-the-street, D054): a shock ring along the street, a
 * cloud of dust and chunks of pavement flung into the air. Plays when a station starts spawning,
 * and again when a breach cutscene looks at it. Render only, wall-clock time (plays while paused).
 */

const BURST_S = 2.4;
const MAX_BURSTS = 6;
const DEBRIS_PER = 18;
const DUST_PER = 10;
const GRAVITY = 24;
const RING_M = [3, 30] as const;
const RING_S = 0.9;
const RING_COLOR = new Color('#ffb04a');
const DUST_COLOR = new Color('#8f8273');
const DEBRIS_COLORS = ['#3b3e44', '#55585e', '#6b5f52', '#ff9a3c'].map((c) => new Color(c));

const queue: { station: number; at: number }[] = [];

/** Play a burst at a station (now). */
export function queueBurst(station: number): void {
  queue.push({ station, at: performance.now() });
  if (queue.length > MAX_BURSTS) queue.shift();
}

export function StationBursts({ frame }: { frame: TileFrame }) {
  const rings = useRef<InstancedMesh>(null);
  const debris = useRef<InstancedMesh>(null);
  const dust = useRef<InstancedMesh>(null);
  const geo = useMemo(
    () => ({
      ring: new RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2),
      chunk: new BoxGeometry(1, 0.6, 0.8),
      puff: new IcosahedronGeometry(1, 1),
    }),
    [],
  );
  const o = useMemo(() => new Object3D(), []);
  const c = useMemo(() => new Color(), []);

  useFrame(() => {
    if (!rings.current || !debris.current || !dust.current) return;
    const map = game.world.map;
    const now = performance.now();
    let nr = 0;
    let nd = 0;
    let np = 0;
    for (const b of queue) {
      const t = (now - b.at) / 1000;
      const spawn = map?.spawns[b.station];
      if (t > BURST_S || !spawn) continue;
      const [x, z] = tileToWorld(frame, spawn[0], spawn[1]);
      const rng = createRng(Math.floor(b.at));

      // Shock ring along the street.
      if (t < RING_S) {
        const k = t / RING_S;
        o.position.set(x, 0.4, z);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(RING_M[0] + (RING_M[1] - RING_M[0]) * Math.sqrt(k));
        o.updateMatrix();
        rings.current.setMatrixAt(nr, o.matrix);
        rings.current.setColorAt(nr, c.copy(RING_COLOR).multiplyScalar(1 - k));
        nr++;
      }

      // Pavement chunks: ballistic, tumbling, resting where they land.
      for (let i = 0; i < DEBRIS_PER; i++) {
        const a = rng.next() * Math.PI * 2;
        const out = 4 + rng.next() * 9;
        const up = 9 + rng.next() * 12;
        const land = (2 * up) / GRAVITY;
        const tt = Math.min(t, land);
        o.position.set(
          x + Math.cos(a) * out * tt,
          Math.max(0.3, up * tt - 0.5 * GRAVITY * tt * tt),
          z + Math.sin(a) * out * tt,
        );
        o.rotation.set(tt * (3 + rng.next() * 6), tt * 4, tt * (2 + rng.next() * 5));
        o.scale.setScalar((0.6 + rng.next() * 1.1) * (t > BURST_S - 0.4 ? (BURST_S - t) / 0.4 : 1));
        o.updateMatrix();
        debris.current.setMatrixAt(nd, o.matrix);
        debris.current.setColorAt(
          nd,
          DEBRIS_COLORS[Math.floor(rng.next() * DEBRIS_COLORS.length)]!,
        );
        nd++;
      }

      // Dust: billows up and out, then thins away.
      for (let i = 0; i < DUST_PER; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.next() * 6;
        const k = t / BURST_S;
        o.position.set(
          x + Math.cos(a) * (r + 8 * k),
          1 + 7 * k + rng.next() * 3,
          z + Math.sin(a) * (r + 8 * k),
        );
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(1.2 + 4.5 * Math.sqrt(k) * (0.7 + rng.next() * 0.6));
        o.updateMatrix();
        dust.current.setMatrixAt(np, o.matrix);
        dust.current.setColorAt(np, c.copy(DUST_COLOR).multiplyScalar(0.3 * (1 - k)));
        np++;
      }
    }
    for (const [mesh, n] of [
      [rings.current, nr],
      [debris.current, nd],
      [dust.current, np],
    ] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={rings} args={[geo.ring, undefined, MAX_BURSTS]} frustumCulled={false}>
        <meshBasicMaterial transparent blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <instancedMesh
        ref={debris}
        args={[geo.chunk, undefined, MAX_BURSTS * DEBRIS_PER]}
        frustumCulled={false}
      >
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh
        ref={dust}
        args={[geo.puff, undefined, MAX_BURSTS * DUST_PER]}
        frustumCulled={false}
      >
        {/* Additive toward black fades it out; soft and cheap. */}
        <meshBasicMaterial transparent blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

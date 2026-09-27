import { CameraShake } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, type ComponentRef } from 'react';
import { AdditiveBlending, Color, Object3D, type InstancedMesh } from 'three';
import { game, renderAlpha } from '../game';
import rulesData from '../data/rules.json';
import { TICK_DT } from '../sim/constants';
import type { FxEvent } from '../sim/world';
import { tileToWorld, type TileFrame } from './coords';

const MAX_POPS = 256;
/** A death pop expands and fades over this long. */
const POP_S = 0.35;
const POP_START_M = 3;
const POP_END_M = 11;
const POP_COLOR = new Color('#e6ff9a');
const BLACK = new Color('#000000');
/** Shake strength when a barricade breaks (drei CameraShake intensity, decays to 0). */
const BREAK_SHAKE = 0.9;
/** Shake when a bug reaches City Hall: small at full Integrity, growing as it runs out. */
const GOAL_SHAKE_MIN = 0.25;
const GOAL_SHAKE_MAX = 0.8;

/**
 * Feedback effects driven by `world.fx` (DESIGN §10 "readable feedback", §10.4 siege drama):
 * - death pop: an additive burst that grows and fades where a bug died,
 * - screen shake when a barricade is destroyed, and when a bug reaches City Hall (stronger as
 *   Integrity runs low; City Hall itself flashes in CityHall.tsx).
 * Reads the sim every frame; never sets React state.
 */
export function Effects({ frame }: { frame: TileFrame }) {
  const pops = useRef<InstancedMesh>(null);
  const shake = useRef<ComponentRef<typeof CameraShake>>(null);
  /** Newest event tick already reacted to, per event list. */
  const seen = useRef({ breaks: -1, goalHits: -1 });
  /** `resetWorld` replaces `world.fx`, so a new object means a restart: forget old events. */
  const seenFx = useRef<object | null>(null);
  const dummy = useRef(new Object3D());
  const color = useRef(new Color());

  useFrame(() => {
    const world = game.world;
    const mesh = pops.current;
    if (!mesh) return;
    // Sim time since each event, including the fraction of a tick already rendered.
    const now = (world.tick + renderAlpha()) * TICK_DT;
    const o = dummy.current;
    let n = 0;
    for (const e of world.fx.kills) {
      const age = now - e.tick * TICK_DT;
      if (age < 0 || age > POP_S || n >= MAX_POPS) continue;
      const k = age / POP_S;
      const [x, z] = tileToWorld(frame, e.x, e.y);
      o.position.set(x, POP_START_M, z);
      o.scale.setScalar(POP_START_M + (POP_END_M - POP_START_M) * k);
      o.updateMatrix();
      mesh.setMatrixAt(n, o.matrix);
      // Additive blending: fading toward black fades the pop out.
      mesh.setColorAt(n, color.current.copy(POP_COLOR).lerp(BLACK, k));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    if (seenFx.current !== world.fx) {
      seenFx.current = world.fx;
      seen.current = { breaks: -1, goalHits: -1 };
    }
    const bump = (strength: number) => {
      const s = shake.current;
      if (s) s.setIntensity(Math.max(s.getIntensity(), strength)); // rapid hits keep it going
    };
    if (isNew(world.fx.barricadeBreaks, seen.current, 'breaks')) bump(BREAK_SHAKE);
    if (isNew(world.fx.goalHits, seen.current, 'goalHits')) {
      const lost = 1 - world.integrity / rulesData.startIntegrity;
      bump(GOAL_SHAKE_MIN + (GOAL_SHAKE_MAX - GOAL_SHAKE_MIN) * lost);
    }
  });

  return (
    <>
      <instancedMesh ref={pops} args={[undefined, undefined, MAX_POPS]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial transparent blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <CameraShake
        ref={shake}
        intensity={0}
        decay
        decayRate={1.4}
        maxYaw={0.02}
        maxPitch={0.02}
        maxRoll={0.015}
        yawFrequency={12}
        pitchFrequency={12}
        rollFrequency={10}
      />
    </>
  );
}

/** True (and remembered) when `events` has an event newer than the last one seen under `key`. */
function isNew<K extends string>(events: FxEvent[], seen: Record<K, number>, key: K): boolean {
  const last = events[events.length - 1];
  if (!last || last.tick <= seen[key]) return false;
  seen[key] = last.tick;
  return true;
}

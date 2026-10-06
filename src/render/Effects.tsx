import { CameraShake } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, type ComponentRef } from 'react';
import { AdditiveBlending, Color, Object3D, Vector3, type InstancedMesh } from 'three';
import { cameraBridge } from '../cameraBridge';
import { game, renderAlpha } from '../game';
import rulesData from '../data/rules.json';
import { TICK_DT } from '../sim/constants';
import type { FxEvent } from '../sim/world';
import { tileToWorld, type TileFrame } from './coords';
import { slowMotion } from './slowMotion';

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
 * Combat juice (D059): a camera kick when something heavy fires or lands near the camera, full
 * within KICK_NEAR_M and fading out by KICK_FAR_M. Shots by tower type; shells and pulses where
 * they land.
 */
const SHOT_KICK: Partial<Record<string, number>> = { railgun: 0.5, mortar: 0.2 };
const SPLASH_KICK: Partial<Record<string, number>> = { mortar: 0.4, flak: 0.15 };
const PULSE_KICK = 0.45;
const KICK_NEAR_M = 40;
const KICK_FAR_M = 220;
/** A boss or elite dies: a jolt (felt from further away) and a moment of slow motion. */
const BIG_KILL = {
  boss: { shake: 0.9, slowS: 1.2, factor: 0.2 },
  elite: { shake: 0.6, slowS: 0.8, factor: 0.3 },
};
const BIG_KILL_FAR_M = 600;

/**
 * Feedback effects driven by `world.fx` (DESIGN §10 "readable feedback", §10.4 siege drama):
 * - death pop: an additive burst that grows and fades where a bug died,
 * - screen shake when a barricade is destroyed, and when a bug reaches City Hall (stronger as
 *   Integrity runs low; City Hall itself flashes in CityHall.tsx),
 * - combat juice (D059): a kick when a Railgun or Mortar fires, or a shell or Seismic Pulse goes
 *   off, near the camera; a jolt and a moment of slow motion when a boss or elite dies (not
 *   during a cutscene or while paused).
 * Reads the sim every frame; never sets React state.
 */
export function Effects({ frame }: { frame: TileFrame }) {
  const pops = useRef<InstancedMesh>(null);
  const shake = useRef<ComponentRef<typeof CameraShake>>(null);
  /** Newest event tick already reacted to, per event list. */
  const seen = useRef({ breaks: -1, goalHits: -1, kills: -1, splashes: -1, pulses: -1 });
  /** Last shot tick already kicked for, per tower. */
  const shots = useRef(new Map<number, number>());
  const at = useRef(new Vector3());
  /** `resetWorld` replaces `world.fx`, so a new object means a restart: forget old events. */
  const seenFx = useRef<object | null>(null);
  const dummy = useRef(new Object3D());
  const color = useRef(new Color());

  useFrame(({ camera }) => {
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
      seen.current = { breaks: -1, goalHits: -1, kills: -1, splashes: -1, pulses: -1 };
      shots.current.clear();
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

    // Combat juice: how close (0..1) an event's tile position is to the camera.
    const near = (x: number, y: number, farM = KICK_FAR_M) => {
      const [wx, wz] = tileToWorld(frame, x, y); // same convention as the death pops
      const d = camera.position.distanceTo(at.current.set(wx, 0, wz));
      return Math.min(1, Math.max(0, 1 - (d - KICK_NEAR_M) / (farM - KICK_NEAR_M)));
    };
    for (const t of world.towers) {
      const kick = SHOT_KICK[t.type];
      const shot = t.lastShot;
      if (!kick || !shot || shot.tick <= (shots.current.get(t.id) ?? -1)) continue;
      shots.current.set(t.id, shot.tick);
      bump(kick * near(t.tx, t.ty));
    }
    for (const e of fresh(world.fx.splashes, seen.current, 'splashes'))
      bump((SPLASH_KICK[e.source] ?? 0) * near(e.x, e.y));
    for (const e of fresh(world.fx.pulses, seen.current, 'pulses'))
      bump(PULSE_KICK * near(e.x, e.y));
    for (const e of fresh(world.fx.kills, seen.current, 'kills')) {
      if (!e.big) continue;
      const big = BIG_KILL[e.big];
      bump(big.shake * Math.max(0.4, near(e.x, e.y, BIG_KILL_FAR_M)));
      if (!cameraBridge.cinematic && game.stepper.timeScale > 0) slowMotion(big.slowS, big.factor);
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

/** The events in `events` newer than the last one seen under `key` (remembering the newest). */
function fresh<E extends FxEvent, K extends string>(
  events: E[],
  seen: Record<K, number>,
  key: K,
): E[] {
  const since = seen[key];
  const out = events.filter((e) => e.tick > since);
  const last = events[events.length - 1];
  if (last) seen[key] = Math.max(since, last.tick);
  return out;
}

/** True (and remembered) when `events` has an event newer than the last one seen under `key`. */
function isNew<K extends string>(events: FxEvent[], seen: Record<K, number>, key: K): boolean {
  const last = events[events.length - 1];
  if (!last || last.tick <= seen[key]) return false;
  seen[key] = last.tick;
  return true;
}

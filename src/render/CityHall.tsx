import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Color, type MeshStandardMaterial } from 'three';
import { game, renderAlpha } from '../game';
import { TICK_DT } from '../sim/constants';

/**
 * Real proportions (m): the main block is ~48 m high and ~150 m square (drawn smaller so the ring
 * road stays visible), the tower rises to ~155 m, and William Penn tops out at 167 m.
 */
const BASE_M = 48;
const BASE_W_M = 110;
const TOWER_W_M = 26;
const TOWER_TOP_M = 155;
const STATUE_M = 12;
/** How long City Hall glows red after a bug reaches it. */
const FLASH_S = 0.6;
const FLASH_COLOR = new Color('#ff2a1a');
const FLASH_INTENSITY = 1.4;

/**
 * Stand-in for the goal until the real landmark model (Pass 10): base, tower and gold Penn statue.
 * Flashes red whenever a bug reaches it (DESIGN §10: readable feedback), reading `world.fx.goalHits`.
 */
export function CityHall() {
  const mats = useRef<(MeshStandardMaterial | null)[]>([]);

  useFrame(() => {
    const world = game.world;
    const last = world.fx.goalHits[world.fx.goalHits.length - 1];
    const age = last ? (world.tick + renderAlpha() - last.tick) * TICK_DT : Infinity;
    const glow = Math.max(0, 1 - age / FLASH_S) * FLASH_INTENSITY;
    for (const m of mats.current) {
      if (!m) continue;
      m.emissive.copy(FLASH_COLOR);
      m.emissiveIntensity = glow;
    }
  });

  const mat = (i: number) => (m: MeshStandardMaterial | null) => {
    mats.current[i] = m;
  };
  return (
    <group>
      <mesh position={[0, BASE_M / 2, 0]}>
        <boxGeometry args={[BASE_W_M, BASE_M, BASE_W_M]} />
        <meshStandardMaterial ref={mat(0)} color="#efe9dc" />
      </mesh>
      <mesh position={[0, BASE_M + (TOWER_TOP_M - BASE_M) / 2, 0]}>
        <boxGeometry args={[TOWER_W_M, TOWER_TOP_M - BASE_M, TOWER_W_M]} />
        <meshStandardMaterial ref={mat(1)} color="#e4dccb" />
      </mesh>
      <mesh position={[0, TOWER_TOP_M + STATUE_M / 2, 0]}>
        <coneGeometry args={[4, STATUE_M, 8]} />
        <meshStandardMaterial ref={mat(2)} color="#d69e2e" metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

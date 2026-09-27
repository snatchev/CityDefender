import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  Object3D,
  SphereGeometry,
  type BufferGeometry,
  type InstancedMesh,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { game } from '../game';
import type { TileMap } from '../sim/map';
import type { Tower, TowerType } from '../sim/towers';
import { tileToWorld, type TileFrame } from './coords';
import { viewDistance, zoomScale } from './view';

const MAX_TOWERS = 256;
/** Glowing ring on the roof around each tower. */
const RING_INNER_M = 7;
const RING_OUTER_M = 11;
const RING_OPACITY = 0.55;
/** Towers get half the mobs' zoom compensation (they're bigger to start with). */
export const TOWER_ZOOM_SHARE = 0.5;
/** Tier 2 towers are drawn this much bigger, with a wider ring. */
const TIER_SCALE = [1, 1.2] as const;
const TIER_RING_SCALE = [1, 1.35] as const;
/** How fast a tower turns toward its target (fraction of the remaining angle per second). */
const TURN_RATE = 10;

interface TowerLook {
  color: string;
  /** Height of the muzzle above the roof (m, at scale 1): where shots start. */
  muzzleM: number;
  geometry: () => BufferGeometry;
}

/**
 * How each tower type looks (DESIGN §7, §11). Distinct silhouettes and colours from the same cool,
 * self-lit family so the defence reads apart from the bugs. Models face +z, which turns to the target.
 */
const LOOKS: Record<TowerType, TowerLook> = {
  mgNest: { color: '#2fb4ff', muzzleM: 9, geometry: mgGeometry },
  mortar: { color: '#ff7a45', muzzleM: 10, geometry: mortarGeometry },
  cryo: { color: '#aef0ff', muzzleM: 8, geometry: cryoGeometry },
  railgun: { color: '#a970ff', muzzleM: 6.5, geometry: railgunGeometry },
};

export function towerColor(type: TowerType): string {
  return LOOKS[type].color;
}

/** Where a tower's shots start, in world coordinates. */
export function towerMuzzle(
  frame: TileFrame,
  map: TileMap,
  heights: Float32Array,
  t: Tower,
  zoom: number,
): [number, number, number] {
  const [x, z] = tileToWorld(frame, t.tx, t.ty);
  const roof = heights[t.ty * map.width + t.tx]!;
  return [x, roof + LOOKS[t.type].muzzleM * zoom * TIER_SCALE[t.tier]!, z];
}

/** All towers, one layer per type. */
export function Towers({ frame, heights }: { frame: TileFrame; heights: Float32Array }) {
  /** Current heading per tower id, eased toward its last target (render-only state). */
  const yaws = useRef(new Map<number, number>());
  return (
    <>
      {(Object.keys(LOOKS) as TowerType[]).map((type) => (
        <TowerLayer key={type} type={type} frame={frame} heights={heights} yaws={yaws.current} />
      ))}
    </>
  );
}

/**
 * One tower type on its roofs or corners: a self-lit body that turns toward its last target plus a
 * glowing ring on the ground, both instanced. Reads `game.world` directly, never React state.
 */
function TowerLayer({
  type,
  frame,
  heights,
  yaws,
}: {
  type: TowerType;
  frame: TileFrame;
  heights: Float32Array;
  yaws: Map<number, number>;
}) {
  const look = LOOKS[type];
  const bodies = useRef<InstancedMesh>(null);
  const rings = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());
  const geometry = useMemo(() => look.geometry(), [look]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera, controls }, delta) => {
    const mesh = bodies.current;
    const ring = rings.current;
    const map = game.world.map;
    if (!mesh || !ring || !map) return;
    const o = dummy.current;
    const zoom = zoomScale(viewDistance(camera, controls), TOWER_ZOOM_SHARE);
    const ease = 1 - Math.exp(-TURN_RATE * delta);
    let n = 0;
    for (const t of game.world.towers) {
      if (t.type !== type || n >= MAX_TOWERS) continue;
      const [x, z] = tileToWorld(frame, t.tx, t.ty);
      const roof = heights[t.ty * map.width + t.tx]!;
      let yaw = yaws.get(t.id) ?? 0;
      if (t.lastShot) {
        const [sx, sz] = tileToWorld(frame, t.lastShot.x, t.lastShot.y);
        const want = Math.atan2(sx - x, sz - z);
        yaw += wrapAngle(want - yaw) * ease;
        yaws.set(t.id, yaw);
      }
      o.position.set(x, roof, z);
      o.rotation.set(0, yaw, 0);
      o.scale.setScalar(zoom * TIER_SCALE[t.tier]!);
      o.updateMatrix();
      mesh.setMatrixAt(n, o.matrix);
      o.position.set(x, roof + 0.3, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.setScalar(zoom * TIER_RING_SCALE[t.tier]!);
      o.updateMatrix();
      ring.setMatrixAt(n, o.matrix);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    ring.count = n;
    ring.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={bodies} args={[geometry, undefined, MAX_TOWERS]} frustumCulled={false}>
        <meshStandardMaterial color={look.color} emissive={look.color} emissiveIntensity={0.55} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, MAX_TOWERS]} frustumCulled={false}>
        <ringGeometry args={[RING_INNER_M, RING_OUTER_M, 32]} />
        <meshBasicMaterial
          color={look.color}
          transparent
          opacity={RING_OPACITY}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Tower models: simple merged primitives, base at y = 0, facing +z. Real models come in Pass 10.

/** MG Nest: a squat turret with a short barrel. */
function mgGeometry(): BufferGeometry {
  const base = new CylinderGeometry(5.5, 6.6, 8, 12);
  base.translate(0, 4, 0);
  const barrel = new BoxGeometry(1.4, 1.4, 7);
  barrel.translate(0, 8.5, 4);
  return merge([base, barrel]);
}

/** Mortar: a wide low base with a fat tube angled up and forward. */
function mortarGeometry(): BufferGeometry {
  const base = new CylinderGeometry(6.5, 7.5, 4, 12);
  base.translate(0, 2, 0);
  const tube = new CylinderGeometry(2.6, 2.9, 10, 10);
  tube.rotateX(0.6);
  tube.translate(0, 7.5, 2.2);
  return merge([base, tube]);
}

/** Cryo Sprayer: a tank with a round head and a nozzle. */
function cryoGeometry(): BufferGeometry {
  const tank = new CylinderGeometry(4, 4.5, 6, 12);
  tank.translate(0, 3, 0);
  const head = new SphereGeometry(4.2, 12, 8);
  head.translate(0, 7, 0);
  const nozzle = new CylinderGeometry(1, 1.6, 6, 8);
  nozzle.rotateX(Math.PI / 2);
  nozzle.translate(0, 7.5, 5);
  return merge([tank, head, nozzle]);
}

/** Railgun: a low block with twin long rails. */
function railgunGeometry(): BufferGeometry {
  const base = new BoxGeometry(8, 4, 8);
  base.translate(0, 2, 0);
  const mount = new BoxGeometry(4, 3, 5);
  mount.translate(0, 5.5, 0);
  const railL = new BoxGeometry(0.9, 1.4, 18);
  railL.translate(-1, 6.5, 6);
  const railR = railL.clone();
  railR.translate(2, 0, 0);
  return merge([base, mount, railL, railR]);
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) throw new Error('tower geometry: merge failed');
  return merged;
}

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
} from 'three';
import { game, renderAlpha } from '../game';
import { TICK_DT } from '../sim/constants';
import type { TileMap } from '../sim/map';
import type { Tower, TowerType } from '../sim/towers';
import { usePlan } from '../ui/planStore';
import { tileToWorld, type TileFrame } from './coords';
import { nightAmount } from './daylight';
import { instancedGeometry, model, restGeometry } from './models/library';
import { Motion } from './models/parts';
import { withPartMotion } from './models/partMotion';
import { viewDistance, zoomScale } from './view';

const MAX_TOWERS = 256;
/** Glowing ring on the roof around each tower. */
const RING_INNER_M = 7;
const RING_OUTER_M = 11;
const RING_OPACITY = 0.55;
/** Towers get half the mobs' zoom compensation (they're bigger to start with). */
export const TOWER_ZOOM_SHARE = 0.5;
/** Tier 2 towers are drawn bigger, tier 3 (a chosen branch) bigger still, with wider rings. */
const TIER_SCALE = [1, 1.2, 1.35] as const;
const TIER_RING_SCALE = [1, 1.35, 1.6] as const;
/** How fast a tower turns toward its target (fraction of the remaining angle per second). */
const TURN_RATE = 10;
/** Recoil: a kick part jumps back on firing, then eases home at this rate (1/s of sim time). */
const KICK_RECOVER = 9;
/** Self-lit share of a tower's own colours, and its glowing strips by day and by night. */
const SELF_LIT_DAY = 0.22;
const SELF_LIT_NIGHT = 0.3;
const GLOW_DAY = 0.7;
const GLOW_NIGHT = 1.5;
/** Selected tower: an inverted-hull outline this thick (m at scale 1), in this colour. */
const OUTLINE_M = 0.45;
const OUTLINE_COLOR = '#ffffff';

/** Accent colour per type (the HUD uses it too); the models are painted in it (D060). */
const COLORS: Record<TowerType, string> = {
  mgNest: '#2fb4ff',
  mortar: '#ff7a45',
  cryo: '#aef0ff',
  railgun: '#a970ff',
  flak: '#9fd66b',
  tesla: '#f5f06a',
  seismic: '#d99a5b',
};

export function towerColor(type: TowerType): string {
  return COLORS[type];
}

/** A fresh copy of a tower type's model at rest (base at y = 0, facing +z); the caller disposes it. */
export function towerGeometry(type: TowerType): BufferGeometry {
  return restGeometry(model('towers', type));
}

/** Tower model scale for a tier (tier 2 is drawn bigger). */
export function towerTierScale(tier: number): number {
  return TIER_SCALE[tier as 0 | 1 | 2] ?? TIER_SCALE[2];
}

/** What the renderer needs from a tower model beyond its geometry. */
interface TowerRig {
  /** Shots start here (model space, at rest). */
  muzzle: Vector3;
  /** Does anything turn to the target? (A tower with no turret keeps its kick parts unturned.) */
  turns: boolean;
  /** Unit vector from the muzzle back toward the kick part's joint: the recoil direction. */
  kickDir: Vector3;
}

const rigs = new Map<TowerType, TowerRig>();

function towerRig(type: TowerType): TowerRig {
  let r = rigs.get(type);
  if (r) return r;
  const b = model('towers', type).baked;
  const muzzle = new Vector3(...(b.nodes.muzzle ?? [0, 0, 0]));
  const kick = Object.entries(b.motions).find(([, m]) => m.kind === Motion.kick)?.[0];
  const kickDir = kick
    ? new Vector3(...b.nodes[kick]!).sub(muzzle).normalize()
    : new Vector3(0, 0, -1);
  const turns = Object.values(b.motions).some((m) => m.kind === Motion.turret);
  r = { muzzle, turns, kickDir };
  rigs.set(type, r);
  return r;
}

/** Current heading per tower id, eased toward its last target (render-only state). */
const yaws = new Map<number, number>();

/** Where a tower's shots start, in world coordinates: its model's muzzle, turned with the turret. */
export function towerMuzzle(
  frame: TileFrame,
  map: TileMap,
  heights: Float32Array,
  t: Tower,
  zoom: number,
): [number, number, number] {
  const [x, z] = tileToWorld(frame, t.tx, t.ty);
  const roof = heights[t.ty * map.width + t.tx]!;
  const rig = towerRig(t.type);
  const k = zoom * towerTierScale(t.tier);
  const yaw = rig.turns ? (yaws.get(t.id) ?? 0) : 0;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const m = rig.muzzle;
  return [x + (m.x * c + m.z * s) * k, roof + m.y * k, z + (-m.x * s + m.z * c) * k];
}

/** All towers, one layer per type. */
export function Towers({ frame, heights }: { frame: TileFrame; heights: Float32Array }) {
  const selectedId = usePlan((s) => s.selected?.id ?? null);
  return (
    <>
      {(Object.keys(COLORS) as TowerType[]).map((type) => (
        <TowerLayer
          key={type}
          type={type}
          frame={frame}
          heights={heights}
          selectedId={selectedId}
        />
      ))}
    </>
  );
}

/**
 * One tower type on its roofs or corners, instanced: the model (its turret turning toward the last
 * target, barrels kicking back on each shot, dishes and rings spinning; models/partMotion.ts), a
 * glowing ring on the roof, and, for the selected tower, an outline (an inverted hull of the same
 * animated model, drawn behind it). Reads `game.world` directly, never React state.
 */
function TowerLayer({
  type,
  frame,
  heights,
  selectedId,
}: {
  type: TowerType;
  frame: TileFrame;
  heights: Float32Array;
  selectedId: number | null;
}) {
  const color = COLORS[type];
  const bodies = useRef<InstancedMesh>(null);
  const rings = useRef<InstancedMesh>(null);
  const outline = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());
  const res = useMemo(() => {
    const rig = towerRig(type);
    const geometry = instancedGeometry(model('towers', type));
    const anim = new InstancedBufferAttribute(new Float32Array(MAX_TOWERS * 4), 4);
    anim.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aAnim', anim);
    const lit = withPartMotion(
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }),
      {
        animated: true,
        glow: true,
        selfLit: SELF_LIT_DAY,
        glowScale: GLOW_DAY,
        kickDir: rig.kickDir,
      },
    );
    const hull = withPartMotion(new MeshBasicMaterial({ color: OUTLINE_COLOR, side: BackSide }), {
      animated: true,
      hull: OUTLINE_M,
      kickDir: rig.kickDir,
    });
    return { rig, geometry, anim, lit, hull };
  }, [type]);
  useEffect(
    () => () => {
      res.geometry.dispose();
      res.lit.material.dispose();
      res.hull.material.dispose();
    },
    [res],
  );

  useFrame(({ camera, controls }, delta) => {
    const mesh = bodies.current;
    const ring = rings.current;
    const hull = outline.current;
    const map = game.world.map;
    if (!mesh || !ring || !hull || !map) return;
    const o = dummy.current;
    const zoom = zoomScale(viewDistance(camera, controls), TOWER_ZOOM_SHARE);
    const ease = 1 - Math.exp(-TURN_RATE * delta);
    const now = (game.world.tick + renderAlpha()) * TICK_DT;
    const night = nightAmount();
    res.lit.uniforms.uSelfLit.value = SELF_LIT_DAY + (SELF_LIT_NIGHT - SELF_LIT_DAY) * night;
    res.lit.uniforms.uGlow.value = GLOW_DAY + (GLOW_NIGHT - GLOW_DAY) * night;
    const anim = res.anim.array as Float32Array;
    // The selected tower goes first: the outline shares the geometry's per-instance attributes,
    // so its one instance reads instance 0's turret and kick.
    const list = game.world.towers.filter((t) => t.type === type);
    const sel = list.findIndex((t) => t.id === selectedId);
    if (sel > 0) [list[0], list[sel]] = [list[sel]!, list[0]!];
    let n = 0;
    for (const t of list) {
      if (n >= MAX_TOWERS) break;
      const [x, z] = tileToWorld(frame, t.tx, t.ty);
      const roof = heights[t.ty * map.width + t.tx]!;
      let yaw = yaws.get(t.id) ?? 0;
      if (t.lastShot && res.rig.turns) {
        const [sx, sz] = tileToWorld(frame, t.lastShot.x, t.lastShot.y);
        const want = Math.atan2(sx - x, sz - z);
        yaw += wrapAngle(want - yaw) * ease;
        yaws.set(t.id, yaw);
      }
      const age = t.lastShot ? now - t.lastShot.tick * TICK_DT : Infinity;
      anim[n * 4] = res.rig.turns ? yaw : 0;
      anim[n * 4 + 1] = age >= 0 ? Math.exp(-KICK_RECOVER * age) : 0;
      anim[n * 4 + 2] = (t.id * 0.618034) % 1;
      anim[n * 4 + 3] = 0;
      const scale = zoom * towerTierScale(t.tier);
      o.position.set(x, roof, z);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(scale);
      o.updateMatrix();
      mesh.setMatrixAt(n, o.matrix);
      if (n === 0) hull.setMatrixAt(0, o.matrix);
      o.position.set(x, roof + 0.3, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.setScalar(zoom * (TIER_RING_SCALE[t.tier] ?? TIER_RING_SCALE[2]));
      o.updateMatrix();
      ring.setMatrixAt(n, o.matrix);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    ring.count = n;
    ring.instanceMatrix.needsUpdate = true;
    hull.count = sel >= 0 && n > 0 ? 1 : 0;
    hull.instanceMatrix.needsUpdate = true;
    res.anim.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        name="towerBody"
        ref={bodies}
        args={[res.geometry, res.lit.material, MAX_TOWERS]}
        frustumCulled={false}
        receiveShadow
      />
      <instancedMesh
        name="towerOutline"
        ref={outline}
        args={[res.geometry, res.hull.material, 1]}
        frustumCulled={false}
      />
      <instancedMesh ref={rings} args={[undefined, undefined, MAX_TOWERS]} frustumCulled={false}>
        <ringGeometry args={[RING_INNER_M, RING_OUTER_M, 32]} />
        <meshBasicMaterial
          color={color}
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

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  GreaterDepth,
  Object3D,
  SphereGeometry,
  type BufferGeometry,
  type InstancedMesh,
  type MeshBasicMaterial,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { game, renderAlpha } from '../game';
import { TICK_DT, TILE_M } from '../sim/constants';
import { mobSpeedMps, type Mob, type MobType } from '../sim/mobs';
import { tileToWorld, type TileFrame } from './coords';
import { viewDistance, zoomScale } from './view';

/** Upper bound on mobs of one type drawn at once (instance buffer size). */
const MAX_MOBS = 2048;
/** Colour for a mob hit in the last tick (hit flash). */
const HIT_COLOR = new Color('#ffffff');
/** Tint while slowed by Cryo. */
const SLOW_COLOR = new Color('#9fe8ff');
const HALO_SCALE = 2;
/**
 * The halo is for reading bugs from far away; up close it would bury their shapes. Its opacity
 * ramps from HALO_OPACITY_NEAR at zoom scale 1 to HALO_OPACITY at HALO_FULL_ZOOM and beyond.
 */
const HALO_OPACITY = 0.22;
const HALO_OPACITY_NEAR = 0.03;
const HALO_FULL_ZOOM = 2.5;
const XRAY_OPACITY = 0.75;
/** Mobs are spread up to this far from the tile centre line so a swarm doesn't render as one ball. */
const SPREAD_M = 2.5;

interface MobLook {
  /** Rough body radius (m): halo size, HP bar height, tracer target height. */
  radiusM: number;
  color: string;
  /** Flat colour for the part hidden behind buildings (x-ray silhouette). */
  xray: string;
  geometry: () => BufferGeometry;
}

/** How each mob type looks (DESIGN §6, §11): acid-green skittering swarm, gold armored beetles. */
const LOOKS: Record<MobType, MobLook> = {
  skitterling: { radiusM: 3.5, color: '#7dff3a', xray: '#c6ff4d', geometry: () => bugGeometry(1) },
  beetle: { radiusM: 5.5, color: '#ffc93a', xray: '#ffe07a', geometry: () => beetleGeometry() },
};

export function mobRadiusM(type: MobType): number {
  return LOOKS[type].radiusM;
}

/** All mobs, one layer per type. */
export function Mobs({ frame }: { frame: TileFrame }) {
  return (
    <>
      {(Object.keys(LOOKS) as MobType[]).map((type) => (
        <MobLayer key={type} type={type} frame={frame} />
      ))}
    </>
  );
}

/**
 * One mob type, drawn as three InstancedMeshes that share one matrix per mob:
 * - the body (self-lit, flashes white when hit, ice-blue while slowed), facing where it walks,
 * - a soft additive halo around it (a cheap glow until real bloom in Pass 10),
 * - an x-ray silhouette: the same body in a flat colour, drawn only where something is in front
 *   of it (depth test "greater"), so bugs stay visible behind buildings.
 * Reads `game.world.mobs` every frame (never React state) and interpolates each mob forward by the
 * fraction of a tick the stepper has banked, so motion is smooth at 60 fps with a 20 Hz sim.
 */
function MobLayer({ type, frame }: { type: MobType; frame: TileFrame }) {
  const look = LOOKS[type];
  const body = useRef<InstancedMesh>(null);
  const halo = useRef<InstancedMesh>(null);
  const xray = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());
  const tint = useRef(new Color());
  const baseColor = useMemo(() => new Color(look.color), [look.color]);
  const geometry = useMemo(() => look.geometry(), [look]);
  const sphere = useMemo(() => new SphereGeometry(look.radiusM, 16, 12), [look.radiusM]);
  useEffect(
    () => () => {
      geometry.dispose();
      sphere.dispose();
    },
    [geometry, sphere],
  );

  useFrame(({ camera, controls }) => {
    const b = body.current;
    const h = halo.current;
    const x = xray.current;
    if (!b || !h || !x) return;
    const o = dummy.current;
    const world = game.world;
    const alpha = renderAlpha();
    const zoom = zoomScale(viewDistance(camera, controls));
    const haloK = Math.min(1, (zoom - 1) / (HALO_FULL_ZOOM - 1));
    (h.material as MeshBasicMaterial).opacity =
      HALO_OPACITY_NEAR + (HALO_OPACITY - HALO_OPACITY_NEAR) * haloK;
    let n = 0;
    for (const m of world.mobs) {
      if (m.type !== type || n >= MAX_MOBS) continue;
      const [wx, wz] = mobWorldXZ(m, frame, alpha);
      o.position.set(wx, look.radiusM * 0.6 * zoom, wz);
      o.rotation.set(0, mobYaw(m, frame), 0);
      o.scale.setScalar(zoom);
      o.updateMatrix();
      b.setMatrixAt(n, o.matrix);
      x.setMatrixAt(n, o.matrix);
      const slowed = world.tick < m.slowUntilTick;
      const c = world.tick - m.lastHitTick <= 1 ? HIT_COLOR : slowed ? SLOW_COLOR : baseColor;
      b.setColorAt(n, tint.current.copy(c));
      o.scale.setScalar(HALO_SCALE * zoom);
      o.updateMatrix();
      h.setMatrixAt(n, o.matrix);
      n++;
    }
    for (const mesh of [b, h, x]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        name="mobBody"
        ref={body}
        args={[geometry, undefined, MAX_MOBS]}
        frustumCulled={false}
      >
        <meshStandardMaterial emissive={look.color} emissiveIntensity={0.25} roughness={0.5} />
      </instancedMesh>
      <instancedMesh
        name="mobHalo"
        ref={halo}
        args={[sphere, undefined, MAX_MOBS]}
        frustumCulled={false}
      >
        <meshBasicMaterial
          color={look.color}
          transparent
          opacity={HALO_OPACITY}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        name="mobXray"
        ref={xray}
        args={[geometry, undefined, MAX_MOBS]}
        frustumCulled={false}
        renderOrder={10}
      >
        <meshBasicMaterial
          color={look.xray}
          transparent
          opacity={XRAY_OPACITY}
          depthFunc={GreaterDepth}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
}

/** Where a mob is drawn this frame: interpolated along its step, plus its stable spread offset. */
export function mobWorldXZ(m: Mob, frame: TileFrame, alpha: number): [number, number] {
  const perTick = (mobSpeedMps(game.world, m) * TICK_DT) / TILE_M;
  const t = Math.min(1, m.t + perTick * alpha);
  const [wx, wz] = tileToWorld(
    frame,
    m.fromX + (m.toX - m.fromX) * t,
    m.fromY + (m.toY - m.fromY) * t,
  );
  const [ox, oz] = spread(m.id);
  return [wx + ox, wz + oz];
}

/** Heading (rotation about y) of a mob walking from its `from` tile to its `to` tile. */
function mobYaw(m: Mob, frame: TileFrame): number {
  if (m.fromX === m.toX && m.fromY === m.toY) return 0;
  const [ax, az] = tileToWorld(frame, m.fromX, m.fromY);
  const [bx, bz] = tileToWorld(frame, m.toX, m.toY);
  return Math.atan2(bx - ax, bz - az); // models face +z
}

/** Stable per-mob offset from its id (render only; the sim doesn't know about it). */
function spread(id: number): [number, number] {
  const a = Math.sin(id * 12.9898) * 43758.5453;
  const b = Math.sin(id * 78.233) * 12345.6789;
  return [(a - Math.floor(a) - 0.5) * 2 * SPREAD_M, (b - Math.floor(b) - 0.5) * 2 * SPREAD_M];
}

/** Six splayed legs for a body of half-width `hx` and half-length `hz`, facing +z. */
function legs(hx: number, hz: number, len: number, thick: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      const leg = new BoxGeometry(len, thick, thick);
      leg.translate((side * len) / 2, 0, 0);
      leg.rotateZ(side * -0.45); // down toward the street
      leg.rotateY(side * k * 0.5); // fan forward and back
      leg.translate(side * hx * 0.7, 0, k * hz * 0.55);
      out.push(leg);
    }
  }
  return out;
}

/** Skitterling: long thin body, round head, six long legs. About 8 m long at scale 1. */
function bugGeometry(scale: number): BufferGeometry {
  const body = new SphereGeometry(1, 12, 8);
  body.scale(1.7 * scale, 1.2 * scale, 3 * scale);
  const head = new SphereGeometry(1.25 * scale, 10, 8);
  head.translate(0, 0.3 * scale, 3.4 * scale);
  return merge([body, head, ...legs(1.7 * scale, 3 * scale, 3.6 * scale, 0.45 * scale)]);
}

/** Carapace Beetle: a wide, tall armored dome, small head, short thick legs. */
function beetleGeometry(): BufferGeometry {
  const shell = new SphereGeometry(1, 14, 10);
  shell.scale(4, 2.8, 5.2);
  const ridge = new BoxGeometry(0.8, 0.8, 9);
  ridge.translate(0, 2.7, 0);
  const head = new SphereGeometry(1.8, 10, 8);
  head.translate(0, 0.2, 5.4);
  return merge([shell, ridge, head, ...legs(4, 5.2, 3, 1)]);
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) throw new Error('mob geometry: merge failed');
  return merged;
}

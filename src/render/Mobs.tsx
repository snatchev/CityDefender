import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  SphereGeometry,
  GreaterDepth,
  Object3D,
  type InstancedMesh,
  type Vector3,
} from 'three';
import mobsData from '../data/mobs.json';
import { game } from '../game';
import { TICK_DT, TILE_M } from '../sim/constants';
import { tileToWorld, type TileFrame } from './coords';

/** Upper bound on mobs drawn at once (instance buffer size). */
const MAX_MOBS = 2048;
const RADIUS_M = 3.5;
/** Acid green: bright, readable against the muted city (DESIGN §11). */
const COLOR = new Color('#7dff3a');
/** Colour for a mob hit in the last tick (hit flash). */
const HIT_COLOR = new Color('#ffffff');
const HALO_SCALE = 2;
const HALO_OPACITY = 0.22;
/** Flat colour for the part of a mob hidden behind buildings (x-ray silhouette). */
const XRAY_COLOR = '#c6ff4d';
const XRAY_OPACITY = 0.75;
/**
 * Zoom compensation: beyond this camera distance (m) mobs grow in proportion, so they keep a readable
 * size on screen when zoomed out instead of shrinking to a pixel. Up close they are true size.
 */
export const ZOOM_REF_M = 300;
/** Mobs are spread up to this far from the tile centre line so a swarm doesn't render as one ball. */
const SPREAD_M = 2.5;

/**
 * All crawlers, drawn as three InstancedMeshes that share one matrix per mob:
 * - the body (bright, self-lit, flashes white when hit),
 * - a soft additive halo around it (a cheap glow until real bloom in Pass 10),
 * - an x-ray silhouette: the same sphere in a flat colour, drawn only where something is in front
 *   of it (depth test "greater"), so bugs stay visible behind buildings.
 * Reads `game.world.mobs` every frame (never React state) and interpolates each mob forward by the
 * fraction of a tick the stepper has banked, so motion is smooth at 60 fps with a 20 Hz sim.
 */
export function Mobs({ frame }: { frame: TileFrame }) {
  const body = useRef<InstancedMesh>(null);
  const halo = useRef<InstancedMesh>(null);
  const xray = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());
  /** One sphere shared by body, halo and x-ray (they differ only in material and scale). */
  const sphere = useMemo(() => new SphereGeometry(RADIUS_M, 16, 12), []);
  useEffect(() => () => sphere.dispose(), [sphere]);

  useFrame(({ camera, controls }) => {
    const b = body.current;
    const h = halo.current;
    const x = xray.current;
    if (!b || !h || !x) return;
    const o = dummy.current;
    const alpha = game.stepper.paused ? 0 : game.stepper.alpha;
    const mobs = game.world.mobs;
    const n = Math.min(mobs.length, MAX_MOBS);
    const target = (controls as unknown as { target?: Vector3 } | null)?.target;
    const zoom = Math.max(
      1,
      (target ? camera.position.distanceTo(target) : ZOOM_REF_M) / ZOOM_REF_M,
    );
    for (let i = 0; i < n; i++) {
      const m = mobs[i]!;
      const perTick = (mobsData[m.type].speedMps * TICK_DT) / TILE_M;
      const t = Math.min(1, m.t + perTick * alpha);
      const [wx, wz] = tileToWorld(
        frame,
        m.fromX + (m.toX - m.fromX) * t,
        m.fromY + (m.toY - m.fromY) * t,
      );
      const [ox, oz] = spread(m.id);
      o.position.set(wx + ox, RADIUS_M * zoom, wz + oz);
      o.scale.setScalar(zoom);
      o.updateMatrix();
      b.setMatrixAt(i, o.matrix);
      x.setMatrixAt(i, o.matrix);
      b.setColorAt(i, game.world.tick - m.lastHitTick <= 1 ? HIT_COLOR : COLOR);
      o.scale.setScalar(HALO_SCALE * zoom);
      o.updateMatrix();
      h.setMatrixAt(i, o.matrix);
    }
    for (const mesh of [b, h, x]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={body} args={[sphere, undefined, MAX_MOBS]} frustumCulled={false}>
        <meshStandardMaterial emissive={COLOR} emissiveIntensity={0.6} />
      </instancedMesh>
      <instancedMesh ref={halo} args={[sphere, undefined, MAX_MOBS]} frustumCulled={false}>
        <meshBasicMaterial
          color={COLOR}
          transparent
          opacity={HALO_OPACITY}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={xray}
        args={[sphere, undefined, MAX_MOBS]}
        frustumCulled={false}
        renderOrder={10}
      >
        <meshBasicMaterial
          color={XRAY_COLOR}
          transparent
          opacity={XRAY_OPACITY}
          depthFunc={GreaterDepth}
          depthWrite={false}
        />
      </instancedMesh>
    </>
  );
}

/** Stable per-mob offset from its id (render only; the sim doesn't know about it). */
function spread(id: number): [number, number] {
  const a = Math.sin(id * 12.9898) * 43758.5453;
  const b = Math.sin(id * 78.233) * 12345.6789;
  return [(a - Math.floor(a) - 0.5) * 2 * SPREAD_M, (b - Math.floor(b) - 0.5) * 2 * SPREAD_M];
}

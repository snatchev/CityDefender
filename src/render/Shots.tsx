import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  ConeGeometry,
  DoubleSide,
  Object3D,
  Vector3,
  type InstancedMesh,
  type LineSegments,
} from 'three';
import { game, renderAlpha } from '../game';
import { TICK_DT } from '../sim/constants';
import { towerTier } from '../sim/towers';
import { towerColor, towerMuzzle, TOWER_ZOOM_SHARE } from './Towers';
import { tileToWorld, type TileFrame } from './coords';
import { viewDistance, zoomScale } from './view';

const MAX_SHOTS = 256;
/** Shots aim at this height above the street (m at scale 1): about a bug's middle. */
const TARGET_Y_M = 2.5;
const TRACER_COLOR = '#fff2b0';
/** How long each kind of shot stays visible, in sim seconds. */
const TRACER_S = 0.05;
const BEAM_S = 0.3;
const SPRAY_S = 0.2;
const SPLASH_S = 0.5;
const BEAM_WIDTH_M = 2.2;
const SHELL_RADIUS_M = 2;
/** Shell arc apex above the straight line, as a fraction of the distance flown. */
const SHELL_ARC = 0.35;
const BLACK = new Color('#000000');

/**
 * Tower shots, drawn from the sim every frame (never React state):
 * - MG Nest: a one-tick tracer line to its target,
 * - Railgun: a thick violet beam that thins out,
 * - Cryo: an icy cone from the nozzle to the target, sized by the tower's cone angle,
 * - Mortar: glowing shells arcing to their impact point, then an expanding ring on the street.
 * Additive colours fade toward black, which fades them out.
 */
export function Shots({ frame, heights }: { frame: TileFrame; heights: Float32Array }) {
  const tracers = useRef<LineSegments>(null);
  const beams = useRef<InstancedMesh>(null);
  const sprays = useRef<InstancedMesh>(null);
  const shells = useRef<InstancedMesh>(null);
  const splashes = useRef<InstancedMesh>(null);
  const tmp = useRef({ o: new Object3D(), a: new Vector3(), b: new Vector3(), c: new Color() });
  /** Cone with its apex at the origin opening toward +z, length 1 and base radius 1. */
  const cone = useMemo(() => {
    const g = new ConeGeometry(1, 1, 20, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 0.5);
    return g;
  }, []);
  const colors = useMemo(
    () => ({ rail: new Color(towerColor('railgun')), cryo: new Color(towerColor('cryo')) }),
    [],
  );

  useLayoutEffect(() => {
    tracers.current?.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(MAX_SHOTS * 6), 3),
    );
    return () => cone.dispose();
  }, [cone]);

  useFrame(({ camera, controls }) => {
    const lines = tracers.current;
    const beam = beams.current;
    const spray = sprays.current;
    const shell = shells.current;
    const splash = splashes.current;
    const world = game.world;
    const map = world.map;
    if (!lines || !beam || !spray || !shell || !splash || !map) return;
    const { o, a, b, c } = tmp.current;
    const dist = viewDistance(camera, controls);
    const towerZoom = zoomScale(dist, TOWER_ZOOM_SHARE);
    const targetY = TARGET_Y_M * zoomScale(dist);
    const now = (world.tick + renderAlpha()) * TICK_DT;
    const pos = lines.geometry.getAttribute('position') as BufferAttribute;
    let nLines = 0;
    let nBeams = 0;
    let nSprays = 0;

    for (const t of world.towers) {
      const shot = t.lastShot;
      if (!shot) continue;
      const age = now - shot.tick * TICK_DT;
      const [mx, my, mz] = towerMuzzle(frame, map, heights, t, towerZoom);
      const [sx, sz] = tileToWorld(frame, shot.x, shot.y);
      if (t.type === 'mgNest' && age <= TRACER_S && nLines < MAX_SHOTS) {
        pos.setXYZ(nLines * 2, mx, my, mz);
        pos.setXYZ(nLines * 2 + 1, sx, targetY, sz);
        nLines++;
      } else if (t.type === 'railgun' && age <= BEAM_S && nBeams < MAX_SHOTS) {
        const k = age / BEAM_S;
        a.set(mx, my, mz);
        b.set(sx, targetY, sz);
        o.position.copy(a).lerp(b, 0.5);
        o.lookAt(b);
        const w = BEAM_WIDTH_M * towerZoom * (1 - k);
        o.scale.set(w, w, a.distanceTo(b));
        o.updateMatrix();
        beam.setMatrixAt(nBeams, o.matrix);
        beam.setColorAt(nBeams, c.copy(colors.rail).lerp(BLACK, k * k));
        nBeams++;
      } else if (t.type === 'cryo' && age <= SPRAY_S && nSprays < MAX_SHOTS) {
        const k = age / SPRAY_S;
        const coneDeg = towerTier(t).coneDeg ?? 0;
        a.set(mx, my, mz);
        b.set(sx, targetY, sz);
        o.position.copy(a);
        o.lookAt(b);
        const len = a.distanceTo(b);
        const r = len * Math.tan(((coneDeg / 2) * Math.PI) / 180);
        o.scale.set(r, r, len);
        o.updateMatrix();
        spray.setMatrixAt(nSprays, o.matrix);
        spray.setColorAt(nSprays, c.copy(colors.cryo).multiplyScalar(0.5).lerp(BLACK, k));
        nSprays++;
      }
    }

    // Mortar shells in flight: a parabola from the muzzle to the impact point.
    let nShells = 0;
    for (const s of world.shells) {
      if (nShells >= MAX_SHOTS) break;
      const tower = world.towers.find((t) => t.id === s.towerId);
      const k = Math.min(
        1,
        Math.max(0, (now / TICK_DT - s.firedTick) / (s.landTick - s.firedTick)),
      );
      if (tower) {
        const [mx, my, mz] = towerMuzzle(frame, map, heights, tower, towerZoom);
        a.set(mx, my, mz);
      } else {
        const [fx, fz] = tileToWorld(frame, s.fromX, s.fromY);
        a.set(fx, 0, fz);
      }
      const [ix, iz] = tileToWorld(frame, s.x, s.y);
      b.set(ix, 0, iz);
      const arc = SHELL_ARC * a.distanceTo(b);
      o.position.copy(a).lerp(b, k);
      o.position.y += 4 * arc * k * (1 - k);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(SHELL_RADIUS_M * towerZoom);
      o.updateMatrix();
      shell.setMatrixAt(nShells, o.matrix);
      nShells++;
    }

    // Splash rings where shells landed.
    let nSplash = 0;
    for (const e of world.fx.splashes) {
      const age = now - e.tick * TICK_DT;
      if (age < 0 || age > SPLASH_S || nSplash >= MAX_SHOTS) continue;
      const k = age / SPLASH_S;
      const [x, z] = tileToWorld(frame, e.x, e.y);
      o.position.set(x, 0.8, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.setScalar(e.radiusM * (0.35 + 0.65 * Math.sqrt(k)));
      o.updateMatrix();
      splash.setMatrixAt(nSplash, o.matrix);
      splash.setColorAt(nSplash, c.set(towerColor('mortar')).lerp(BLACK, k));
      nSplash++;
    }

    pos.needsUpdate = true;
    lines.geometry.setDrawRange(0, nLines * 2);
    for (const [mesh, n] of [
      [beam, nBeams],
      [spray, nSprays],
      [shell, nShells],
      [splash, nSplash],
    ] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  const additive = { transparent: true, blending: AdditiveBlending, depthWrite: false } as const;
  return (
    <>
      <lineSegments ref={tracers} frustumCulled={false}>
        <bufferGeometry />
        <lineBasicMaterial color={TRACER_COLOR} />
      </lineSegments>
      <instancedMesh ref={beams} args={[undefined, undefined, MAX_SHOTS]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial {...additive} />
      </instancedMesh>
      <instancedMesh ref={sprays} args={[cone, undefined, MAX_SHOTS]} frustumCulled={false}>
        <meshBasicMaterial {...additive} side={DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={shells} args={[undefined, undefined, MAX_SHOTS]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color={towerColor('mortar')} />
      </instancedMesh>
      <instancedMesh ref={splashes} args={[undefined, undefined, MAX_SHOTS]} frustumCulled={false}>
        <ringGeometry args={[0.85, 1, 48]} />
        <meshBasicMaterial {...additive} />
      </instancedMesh>
    </>
  );
}

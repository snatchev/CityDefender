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
import { TICK_DT, TILE_M } from '../sim/constants';
import { TOWERS, towerTier, type TowerType } from '../sim/towers';
import type { SplashFx } from '../sim/world';
import { BARRICADE_HEIGHT_M } from './Barricades';
import { FLIER_AIM_Y_M, mobWorldXZ } from './Mobs';
import { towerColor, towerMuzzle, TOWER_ZOOM_SHARE } from './Towers';
import { tileToWorld, type TileFrame } from './coords';
import { viewDistance, zoomScale } from './view';

const MAX_SHOTS = 256;
/** Line segments shared by tracers, lightning and acid spit. */
const MAX_SEGMENTS = 4096;
/** Shots aim at this height above the street (m at scale 1): about a bug's middle. */
const TARGET_Y_M = 2.5;
const TRACER_COLOR = new Color('#fff2b0');
const SPIT_COLOR = new Color('#2ef2c9');
/** How long each kind of shot stays visible, in sim seconds. */
const TRACER_S = 0.05;
const BEAM_S = 0.3;
const SPRAY_S = 0.2;
const BOLT_S = 0.15;
const SPIT_S = 0.25;
const SPLASH_S = 0.5;
const PULSE_S = 0.7;
const BEAM_WIDTH_M = 2.2;
const SHELL_RADIUS_M = 2;
/** Shell arc apex above the straight line, as a fraction of the distance flown. */
const SHELL_ARC = 0.35;
/** Lightning: kinks per jump and how far (m) each kink may stray from the straight line. */
const BOLT_KINKS = 4;
const BOLT_JITTER_M = 3;
const BLACK = new Color('#000000');
const BURN_COLOR = new Color('#ff5a1f');
/** Burning ground flickers this fast (Hz) around its base brightness. */
const BURN_FLICKER_HZ = 7;

/**
 * Tower shots, drawn from the sim every frame (never React state):
 * - MG Nest: a one-tick tracer line to its target,
 * - Railgun: a thick violet beam that thins out,
 * - Cryo: an icy cone from the nozzle to the target, sized by the tower's cone angle,
 * - Tesla: a jagged lightning bolt through every mob the chain hit,
 * - Mortar and Flak: glowing shells arcing to their impact point, then an expanding ring,
 * - Seismic Pulse: a wide ring rolling out over the street,
 * - Acid Spitter: a stream of acid from the spitter to the barricade it's melting.
 * Shots at fliers aim up to flying height. Additive colours fade toward black, which fades them out.
 */
export function Shots({ frame, heights }: { frame: TileFrame; heights: Float32Array }) {
  const lines = useRef<LineSegments>(null);
  const beams = useRef<InstancedMesh>(null);
  const sprays = useRef<InstancedMesh>(null);
  const shells = useRef<InstancedMesh>(null);
  const rings = useRef<InstancedMesh>(null);
  const burns = useRef<InstancedMesh>(null);
  const tmp = useRef({
    o: new Object3D(),
    a: new Vector3(),
    b: new Vector3(),
    p: new Vector3(),
    c: new Color(),
  });
  /** Cone with its apex at the origin opening toward +z, length 1 and base radius 1. */
  const cone = useMemo(() => {
    const g = new ConeGeometry(1, 1, 20, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, 0.5);
    return g;
  }, []);
  const colors = useMemo(
    () => ({
      rail: new Color(towerColor('railgun')),
      cryo: new Color(towerColor('cryo')),
      tesla: new Color(towerColor('tesla')),
    }),
    [],
  );

  useLayoutEffect(() => {
    const g = lines.current?.geometry;
    g?.setAttribute('position', new BufferAttribute(new Float32Array(MAX_SEGMENTS * 6), 3));
    g?.setAttribute('color', new BufferAttribute(new Float32Array(MAX_SEGMENTS * 6), 3));
    return () => cone.dispose();
  }, [cone]);

  useFrame(({ camera, controls }) => {
    const seg = lines.current;
    const beam = beams.current;
    const spray = sprays.current;
    const shell = shells.current;
    const ring = rings.current;
    const burn = burns.current;
    const world = game.world;
    const map = world.map;
    if (!seg || !beam || !spray || !shell || !ring || !burn || !map) return;
    const { o, a, b, p, c } = tmp.current;
    const dist = viewDistance(camera, controls);
    const towerZoom = zoomScale(dist, TOWER_ZOOM_SHARE);
    const groundY = TARGET_Y_M * zoomScale(dist);
    const aimY = (air: boolean) => (air ? FLIER_AIM_Y_M + groundY : groundY);
    const now = (world.tick + renderAlpha()) * TICK_DT;
    const pos = seg.geometry.getAttribute('position') as BufferAttribute;
    const col = seg.geometry.getAttribute('color') as BufferAttribute;
    let nSeg = 0;
    const line = (from: Vector3, to: Vector3, color: Color) => {
      if (nSeg >= MAX_SEGMENTS) return;
      pos.setXYZ(nSeg * 2, from.x, from.y, from.z);
      pos.setXYZ(nSeg * 2 + 1, to.x, to.y, to.z);
      col.setXYZ(nSeg * 2, color.r, color.g, color.b);
      col.setXYZ(nSeg * 2 + 1, color.r, color.g, color.b);
      nSeg++;
    };
    let nBeams = 0;
    let nSprays = 0;

    for (const t of world.towers) {
      const shot = t.lastShot;
      if (!shot) continue;
      const age = now - shot.tick * TICK_DT;
      const [mx, my, mz] = towerMuzzle(frame, map, heights, t, towerZoom);
      const [sx, sz] = tileToWorld(frame, shot.x, shot.y);
      a.set(mx, my, mz);
      b.set(sx, aimY(shot.air), sz);
      if (t.type === 'mgNest' && age <= TRACER_S) {
        line(a, b, TRACER_COLOR);
      } else if (t.type === 'railgun' && age <= BEAM_S && nBeams < MAX_SHOTS) {
        const k = age / BEAM_S;
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
        o.position.copy(a);
        o.lookAt(b);
        const len = a.distanceTo(b);
        const r = len * Math.tan(((coneDeg / 2) * Math.PI) / 180);
        o.scale.set(r, r, len);
        o.updateMatrix();
        spray.setMatrixAt(nSprays, o.matrix);
        spray.setColorAt(nSprays, c.copy(colors.cryo).multiplyScalar(0.5).lerp(BLACK, k));
        nSprays++;
      } else if (t.type === 'tesla' && age <= BOLT_S) {
        // A jagged bolt: muzzle → first target → each jump. Kinks are seeded by the shot tick so
        // the bolt holds still for its short life instead of fizzing every frame.
        c.copy(colors.tesla).lerp(BLACK, age / BOLT_S);
        let seed = shot.tick * 7919 + t.id;
        const jitter = () => {
          seed = (seed * 16807) % 2147483647;
          return ((seed / 2147483647) * 2 - 1) * BOLT_JITTER_M * towerZoom;
        };
        a.set(mx, my, mz);
        for (const hitAt of t.lastChain) {
          const [hx, hz] = tileToWorld(frame, hitAt.x, hitAt.y);
          b.set(hx, aimY(hitAt.air), hz);
          let from = a.clone();
          for (let k = 1; k <= BOLT_KINKS; k++) {
            p.copy(a).lerp(b, k / BOLT_KINKS);
            if (k < BOLT_KINKS) p.add({ x: jitter(), y: jitter(), z: jitter() } as Vector3);
            line(from, p, c);
            from = p.clone();
          }
          a.copy(b);
        }
      }
    }

    // Acid spit from spitters to the barricade they're melting.
    c.copy(SPIT_COLOR);
    for (const m of world.mobs) {
      const s = m.lastSpit;
      if (!s || now - s.tick * TICK_DT > SPIT_S) continue;
      const [x, z] = mobWorldXZ(m, frame, renderAlpha());
      const [bx, bz] = tileToWorld(frame, s.x, s.y);
      a.set(x, groundY * 1.5, z);
      b.set(bx, BARRICADE_HEIGHT_M, bz);
      line(a, b, c);
    }

    // Shells in flight: a parabola from the muzzle to the impact point (up in the air for flak).
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
      b.set(ix, s.targets.includes('ground') ? 0 : aimY(true), iz);
      const arc = SHELL_ARC * a.distanceTo(b);
      o.position.copy(a).lerp(b, k);
      o.position.y += 4 * arc * k * (1 - k);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(SHELL_RADIUS_M * towerZoom);
      o.updateMatrix();
      shell.setMatrixAt(nShells, o.matrix);
      shell.setColorAt(nShells, c.set(towerColor(s.towerType)));
      nShells++;
    }

    // Rings: shell bursts (on the street, or in the air for flak) and seismic pulses.
    let nRings = 0;
    const addRing = (e: SplashFx, life: number, y: number) => {
      const age = now - e.tick * TICK_DT;
      if (age < 0 || age > life || nRings >= MAX_SHOTS) return;
      const k = age / life;
      const [x, z] = tileToWorld(frame, e.x, e.y);
      o.position.set(x, y, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.setScalar(e.radiusM * (0.35 + 0.65 * Math.sqrt(k)));
      o.updateMatrix();
      ring.setMatrixAt(nRings, o.matrix);
      ring.setColorAt(nRings, c.set(towerColor(e.source as TowerType)).lerp(BLACK, k));
      nRings++;
    };
    for (const e of world.fx.splashes) {
      addRing(
        e,
        SPLASH_S,
        TOWERS[e.source as TowerType].targets.includes('ground') ? 0.8 : aimY(true),
      );
    }
    for (const e of world.fx.pulses) addRing(e, PULSE_S, 0.6);

    // Burning ground (Incendiary mortar): a flickering disc over the splash area.
    let nBurns = 0;
    for (const f of world.fires) {
      if (nBurns >= MAX_SHOTS) break;
      const [x, z] = tileToWorld(frame, f.x, f.y);
      o.position.set(x, 0.5, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.setScalar(f.radiusTiles * TILE_M);
      o.updateMatrix();
      burn.setMatrixAt(nBurns, o.matrix);
      const flicker = 0.35 + 0.15 * Math.sin(now * BURN_FLICKER_HZ * 2 * Math.PI + f.x * 3.1);
      burn.setColorAt(nBurns, c.copy(BURN_COLOR).multiplyScalar(flicker));
      nBurns++;
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    seg.geometry.setDrawRange(0, nSeg * 2);
    for (const [mesh, n] of [
      [beam, nBeams],
      [spray, nSprays],
      [shell, nShells],
      [ring, nRings],
      [burn, nBurns],
    ] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  const additive = { transparent: true, blending: AdditiveBlending, depthWrite: false } as const;
  return (
    <>
      <lineSegments ref={lines} frustumCulled={false}>
        <bufferGeometry />
        <lineBasicMaterial vertexColors />
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
        <meshBasicMaterial />
      </instancedMesh>
      <instancedMesh ref={burns} args={[undefined, undefined, MAX_SHOTS]} frustumCulled={false}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial {...additive} side={DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, MAX_SHOTS]} frustumCulled={false}>
        <ringGeometry args={[0.85, 1, 48]} />
        <meshBasicMaterial {...additive} side={DoubleSide} />
      </instancedMesh>
    </>
  );
}

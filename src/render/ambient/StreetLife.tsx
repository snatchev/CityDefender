import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DataTexture,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerStreetLife } from '../../debug/devHook';
import { game, renderAlpha } from '../../game';
import { createRng } from '../../sim/rng';
import type { TileFrame } from '../coords';
import { DAYLIGHT, daylight, daylightVersion } from '../daylight';
import { mobWorldXZ } from '../Mobs';
import { orbitControls, zoomScale } from '../view';
import { StreetLife } from './life';

/** Drawn a little larger than life so they read from the usual camera height. */
const CAR_SCALE = 1.3;
const PERSON_SCALE = 1.7;
/** Share of the mobs' zoom compensation (view.ts) cars and people get when zoomed out. */
const ZOOM_SHARE = 0.25;
const CAR_COLORS = [
  '#e8e6e1',
  '#1f2226',
  '#8a8f96',
  '#a3262a',
  '#2a4f86',
  '#f2c230',
  '#f2c230',
  '#3d5e44',
  '#c9c2b0',
];
const SHIRT_COLORS = [
  '#c0392b',
  '#2e86c1',
  '#27ae60',
  '#f1c40f',
  '#8e44ad',
  '#ecf0f1',
  '#34495e',
  '#e67e22',
  '#16a085',
];
const SKIN = '#e0b48a';
/** Trees whose tile gets a wall are hidden; checked this often (s). */
const TREE_CHECK_S = 0.5;

/** Solid-coloured parts merged into one geometry with a vertex colour per part. */
function parts(list: [BufferGeometry, string][]): BufferGeometry {
  const c = new Color();
  const geos = list.map(([g, color]) => {
    const n = g.index ? g.toNonIndexed() : g;
    c.set(color);
    const col = new Float32Array(n.attributes.position!.count * 3);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    n.setAttribute('color', new BufferAttribute(col, 3));
    n.deleteAttribute('uv');
    return n;
  });
  return mergeGeometries(geos)!;
}

function carGeometry(): BufferGeometry {
  return parts([
    [new BoxGeometry(1.8, 0.8, 4.2).translate(0, 0.65, 0), '#ffffff'],
    [new BoxGeometry(1.6, 0.6, 2.2).translate(0, 1.35, -0.2), '#5b6470'],
    [new BoxGeometry(1.7, 0.35, 0.1).translate(0, 0.6, 2.12), '#fff7d6'], // headlights side
  ]);
}

function bodyGeometry(): BufferGeometry {
  return parts([
    [new BoxGeometry(0.45, 0.75, 0.3).translate(0, 1.05, 0), '#ffffff'],
    [new BoxGeometry(0.4, 0.7, 0.26).translate(0, 0.35, 0), '#3b4250'],
  ]);
}

function treeGeometry(): BufferGeometry {
  return parts([
    [new CylinderGeometry(0.18, 0.25, 3, 5).translate(0, 1.5, 0), '#6b4f3a'],
    [new IcosahedronGeometry(2.1, 0).translate(0, 4.4, 0), '#5f8f4e'],
  ]);
}

const LAMP = DAYLIGHT.lamps;
/** A lamp head that is off: dark glass. */
const LAMP_OFF = new Color('#34363a');
const LAMP_POLE = '#3a3d42';

/** Pole and arm, the arm reaching along +z (rotated toward the street per lamp). */
function lampGeometry(): BufferGeometry {
  return parts([
    [
      new CylinderGeometry(0.09, 0.13, LAMP.heightM, 5).translate(0, LAMP.heightM / 2, 0),
      LAMP_POLE,
    ],
    [
      new BoxGeometry(0.08, 0.08, LAMP.armM).translate(0, LAMP.heightM - 0.05, LAMP.armM / 2),
      LAMP_POLE,
    ],
  ]);
}

/** The pool of light on the street under a lamp head: a flat quad with a soft radial falloff. */
function poolTexture(): DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const v = Math.round(255 * Math.max(0, 1 - r * r) ** 2);
      data.set([v, v, v, 255], (y * n + x) * 4);
    }
  const t = new DataTexture(data, n, n);
  t.needsUpdate = true;
  return t;
}

/**
 * Street life (D052): instanced cars, people (body + head) and trees driven by `StreetLife`. Moves in
 * real time while the game runs and freezes when it's paused. Never pickable (no pointer handlers).
 */
export function StreetLifeLayer({ frame }: { frame: TileFrame }) {
  const map = game.world.map;
  const slots = game.world.slots;
  const life = useMemo(() => {
    if (!map || !slots) return null;
    const rng = createRng(1776);
    return new StreetLife(map, slots, frame, () => rng.next());
  }, [map, slots, frame]);
  useEffect(() => {
    if (import.meta.env.DEV) registerStreetLife(life);
  }, [life]);

  const cars = useRef<InstancedMesh>(null);
  const bodies = useRef<InstancedMesh>(null);
  const heads = useRef<InstancedMesh>(null);
  const trees = useRef<InstancedMesh>(null);
  const lamps = useRef<InstancedMesh>(null);
  const lampHeads = useRef<InstancedMesh>(null);
  const lampPools = useRef<InstancedMesh>(null);
  const geo = useMemo(
    () => ({
      car: carGeometry(),
      body: bodyGeometry(),
      head: new OctahedronGeometry(0.2, 1).translate(0, 1.62, 0),
      tree: treeGeometry(),
      lamp: lampGeometry(),
      lampHead: new BoxGeometry(0.35, 0.16, 0.7).translate(0, LAMP.heightM - 0.15, LAMP.armM),
      lampPool: new PlaneGeometry(LAMP.poolRadiusM * 2, LAMP.poolRadiusM * 2)
        .rotateX(-Math.PI / 2)
        .translate(0, 0.1, LAMP.armM),
    }),
    [],
  );
  const mats = useMemo(
    () => ({
      colored: new MeshLambertMaterial({ vertexColors: true }),
      skin: new MeshLambertMaterial({ color: SKIN }),
      // Street lamps (Pass 10b): unlit heads that glow at night, and an additive pool of light on
      // the street under each (no real lights). Both follow `daylight().lamps`.
      lampHead: new MeshBasicMaterial({ color: LAMP_OFF }),
      lampPool: new MeshBasicMaterial({
        map: poolTexture(),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose());
      mats.lampPool.map?.dispose();
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geo, mats],
  );

  // Colours, and the trees, once.
  useLayoutEffect(() => {
    if (!life) return;
    const rng = createRng(1787);
    const c = new Color();
    life.cars.forEach((_, i) => cars.current?.setColorAt(i, c.set(rng.pick(CAR_COLORS))));
    life.people.forEach((_, i) => bodies.current?.setColorAt(i, c.set(rng.pick(SHIRT_COLORS))));
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    life.trees.forEach((t, i) => {
      q.setFromAxisAngle(up, rng.next() * Math.PI * 2);
      m.compose(new Vector3(t.x, 0, t.z), q, new Vector3(t.scale, t.scale, t.scale));
      trees.current?.setMatrixAt(i, m);
      trees.current?.setColorAt(i, c.setScalar(t.shade));
    });
    life.lamps.forEach((l, i) => {
      q.setFromAxisAngle(up, Math.atan2(l.dx, l.dz));
      m.compose(new Vector3(l.x, 0, l.z), q, new Vector3(1, 1, 1));
      for (const mesh of [lamps.current, lampHeads.current, lampPools.current])
        mesh?.setMatrixAt(i, m);
    });
    for (const mesh of [lamps.current, lampHeads.current, lampPools.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    for (const mesh of [cars.current, bodies.current, trees.current]) {
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
    trees.current?.computeBoundingSphere();
  }, [life]);

  const tmp = useMemo(
    () => ({
      m: new Matrix4(),
      q: new Quaternion(),
      p: new Vector3(),
      s: new Vector3(),
      up: new Vector3(0, 1, 0),
      bugs: [] as [number, number][],
      treeClock: 0,
      daylight: -1,
    }),
    [],
  );

  useFrame(({ camera, controls }, delta) => {
    if (!life || !cars.current || !bodies.current || !heads.current || !trees.current) return;
    if (tmp.daylight !== daylightVersion()) {
      tmp.daylight = daylightVersion();
      const on = daylight().lamps;
      mats.lampHead.color
        .set(LAMP.color)
        .multiplyScalar(LAMP.headIntensity)
        .lerp(LAMP_OFF, 1 - on);
      mats.lampPool.color.set(LAMP.color).multiplyScalar(LAMP.poolIntensity * on);
      if (lampPools.current) lampPools.current.visible = on > 0.01;
    }
    const world = game.world;
    const running = game.stepper.timeScale > 0;
    if (running) {
      const alpha = renderAlpha();
      tmp.bugs.length = 0;
      for (const mob of world.mobs) tmp.bugs.push(mobWorldXZ(mob, frame, alpha));
      life.update(Math.min(delta, 0.1), tmp.bugs, world.barricadeAt);
    }
    const c = orbitControls(controls);
    const zoom = zoomScale(c ? camera.position.distanceTo(c.target) : 300, ZOOM_SHARE);
    const { m, q, p, s, up } = tmp;

    life.cars.forEach((car, i) => {
      q.setFromAxisAngle(up, car.yaw);
      m.compose(p.set(car.x, 0, car.z), q, s.setScalar(CAR_SCALE * zoom));
      cars.current!.setMatrixAt(i, m);
    });
    life.people.forEach((person, i) => {
      const hidden = person.hidden > 0;
      q.setFromAxisAngle(up, person.yaw);
      m.compose(
        p.set(person.x, StreetLife.bob(person), person.z),
        q,
        s.setScalar(hidden ? 0 : PERSON_SCALE * zoom),
      );
      bodies.current!.setMatrixAt(i, m);
      heads.current!.setMatrixAt(i, m);
    });
    cars.current.instanceMatrix.needsUpdate = true;
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;

    // Trees under a wall step aside (hidden) until it's gone.
    tmp.treeClock -= delta;
    if (tmp.treeClock <= 0) {
      tmp.treeClock = TREE_CHECK_S;
      let changed = false;
      life.trees.forEach((t, i) => {
        trees.current!.getMatrixAt(i, m);
        m.decompose(p, q, s);
        const want = world.barricadeAt[t.tile] ? 0 : t.scale;
        if (Math.abs(s.x - want) > 1e-3) {
          m.compose(p, q, s.setScalar(want));
          trees.current!.setMatrixAt(i, m);
          changed = true;
        }
      });
      if (changed) trees.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (!life) return null;
  return (
    <group name="streetLife">
      <instancedMesh
        ref={cars}
        args={[geo.car, mats.colored, life.cars.length]}
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={bodies}
        args={[geo.body, mats.colored, life.people.length]}
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={heads}
        args={[geo.head, mats.skin, life.people.length]}
        frustumCulled={false}
      />
      <instancedMesh ref={trees} args={[geo.tree, mats.colored, life.trees.length]} receiveShadow />
      <instancedMesh ref={lamps} args={[geo.lamp, mats.colored, life.lamps.length]} receiveShadow />
      <instancedMesh ref={lampHeads} args={[geo.lampHead, mats.lampHead, life.lamps.length]} />
      <instancedMesh
        ref={lampPools}
        args={[geo.lampPool, mats.lampPool, life.lamps.length]}
        visible={false}
      />
    </group>
  );
}

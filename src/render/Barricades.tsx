import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  MeshStandardMaterial,
  Object3D,
  type InstancedMesh,
} from 'three';
import { game } from '../game';
import { BARRICADES, type BarricadeType } from '../sim/barricades';
import { TILE_M } from '../sim/constants';
import { indexToWorld, type TileFrame } from './coords';
import { instancedGeometry, model } from './models/library';
import { withPartMotion } from './models/partMotion';

/** Upper bound on tiles of one barricade type drawn at once. */
const MAX_TILES = 1024;
/** Height of the placement preview box and of the spot spitters aim their acid at. */
export const BARRICADE_HEIGHT_M = 2.5;
/** Thickness along the street of the placement preview box (the sim's barricade is one tile thick). */
export const BARRICADE_THICK_M = 3;
/** Damage tint: the module shifts toward this red as its HP drops, up to this much. */
const BROKEN = new Color('#b3261e');
const BROKEN_MAX = 0.8;

/** Size of one barricade tile's preview box, [x, z], for a barricade spanning `axis`. */
export function barricadeBox(axis: 'x' | 'y'): [number, number] {
  return axis === 'x' ? [TILE_M, BARRICADE_THICK_M] : [BARRICADE_THICK_M, TILE_M];
}

/** All barricades and spike strips, one layer per type. */
export function Barricades({ frame }: { frame: TileFrame }) {
  return (
    <>
      {(Object.keys(BARRICADES) as BarricadeType[]).map((type) => (
        <BarricadeLayer key={type} type={type} frame={frame} />
      ))}
    </>
  );
}

/**
 * One barricade type: its model (public/models/barricades, one module exactly one tile wide, built
 * to tile along its X) once per tile, turned so the modules line up along the barricade's axis into
 * one continuous wall. The whole module shifts toward red as the barricade's HP drops (the "crack
 * tint"). Read from `game.world` every frame, never React state.
 */
function BarricadeLayer({ type, frame }: { type: BarricadeType; frame: TileFrame }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());
  const res = useMemo(() => {
    const geometry = instancedGeometry(model('barricades', type));
    const tint = new InstancedBufferAttribute(new Float32Array(MAX_TILES * 4), 4);
    tint.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aTint', tint);
    const lit = withPartMotion(new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), {
      tint: true,
      glow: true,
    });
    return { geometry, tint, lit };
  }, [type]);
  useEffect(
    () => () => {
      res.geometry.dispose();
      res.lit.material.dispose();
    },
    [res],
  );

  useFrame(() => {
    const mesh = ref.current;
    const map = game.world.map;
    if (!mesh || !map) return;
    const o = dummy.current;
    const tint = res.tint.array as Float32Array;
    let n = 0;
    const draw = (
      b: (typeof game.world.barricades)[number] | (typeof game.world.traps)[number],
    ) => {
      if (b.type !== type) return;
      const k = BROKEN_MAX * (1 - Math.max(0, Math.min(1, b.hp / b.maxHp)));
      // A module spans its X: along world x for an 'x' barricade, along world z for a 'y' one.
      o.rotation.set(0, b.axis === 'x' ? 0 : Math.PI / 2, 0);
      o.scale.setScalar(1);
      for (const i of b.tiles) {
        if (n >= MAX_TILES) break;
        const [x, z] = indexToWorld(frame, map.width, i);
        o.position.set(x, 0, z);
        o.updateMatrix();
        mesh.setMatrixAt(n, o.matrix);
        tint.set([BROKEN.r, BROKEN.g, BROKEN.b, k], n * 4);
        n++;
      }
    };
    for (const b of game.world.barricades) draw(b);
    for (const b of game.world.traps) draw(b);
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    res.tint.needsUpdate = true;
  });

  return (
    <instancedMesh
      name="barricade"
      ref={ref}
      args={[res.geometry, res.lit.material, MAX_TILES]}
      frustumCulled={false}
      receiveShadow
    />
  );
}

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import { game } from '../game';
import type { BarricadeType } from '../sim/barricades';
import { TILE_M } from '../sim/constants';
import { indexToWorld, type TileFrame } from './coords';

/** Upper bound on barricade tiles drawn at once. */
const MAX_TILES = 1024;
export const BARRICADE_HEIGHT_M = 2.5;
/** Thickness along the street (a barricade is one tile thick in the sim, drawn thinner). */
export const BARRICADE_THICK_M = 3;
const BROKEN = new Color('#b3261e');

/** Per type (DESIGN §8): healthy colour and size relative to the sawhorse. */
const LOOKS: Record<BarricadeType, { color: Color; height: number; thick: number }> = {
  sawhorse: { color: new Color('#f2c14e'), height: 1, thick: 1 },
  jersey: { color: new Color('#c9c4b8'), height: 1.5, thick: 1.4 },
};

/** Size of one barricade tile's box, [x, z], for a barricade spanning `axis`. */
export function barricadeBox(axis: 'x' | 'y'): [number, number] {
  return axis === 'x' ? [TILE_M, BARRICADE_THICK_M] : [BARRICADE_THICK_M, TILE_M];
}

/**
 * All barricades as one InstancedMesh, one box per tile. Read from `game.world` every frame; the
 * colour shifts from the type's colour (police yellow, concrete) to red as HP drops (the "crack tint").
 */
export function Barricades({ frame }: { frame: TileFrame }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());
  const color = useRef(new Color());

  useFrame(() => {
    const mesh = ref.current;
    const map = game.world.map;
    if (!mesh || !map) return;
    const o = dummy.current;
    let n = 0;
    for (const b of game.world.barricades) {
      const look = LOOKS[b.type];
      const [bx, bz] = barricadeBox(b.axis);
      const [sx, sz] = b.axis === 'x' ? [bx, bz * look.thick] : [bx * look.thick, bz];
      const h = BARRICADE_HEIGHT_M * look.height;
      color.current.copy(BROKEN).lerp(look.color, Math.max(0, b.hp / b.maxHp));
      for (const i of b.tiles) {
        if (n >= MAX_TILES) break;
        const [x, z] = indexToWorld(frame, map.width, i);
        o.position.set(x, h / 2, z);
        o.scale.set(sx, h, sz);
        o.updateMatrix();
        mesh.setMatrixAt(n, o.matrix);
        mesh.setColorAt(n, color.current);
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX_TILES]} frustumCulled={false}>
      <boxGeometry />
      <meshStandardMaterial />
    </instancedMesh>
  );
}

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Color, Object3D, Vector3, type InstancedMesh } from 'three';
import { game, renderAlpha } from '../game';
import { type TileFrame } from './coords';
import { mobCentreY, mobRadiusM, mobWorldXZ } from './Mobs';
import { isBuried } from '../sim/mobs';
import { viewDistance, zoomScale } from './view';

const MAX_BARS = 1024;
const WIDTH_M = 12;
const HEIGHT_M = 2.2;
/** Gap between the top of the mob and its bar. */
const GAP_M = 3.5;
const BACK_COLOR = '#1b1d22';
const FULL = new Color('#7dff3a');
const EMPTY = new Color('#ff3b30');

/**
 * HP bars, only on damaged mobs (DESIGN §10.10): camera-facing quads, a dark back and a fill that
 * shrinks from the right and shifts green → red. Drawn on top (no depth test) like the x-ray.
 */
export function HpBars({ frame }: { frame: TileFrame }) {
  const back = useRef<InstancedMesh>(null);
  const fill = useRef<InstancedMesh>(null);
  const dummy = useRef(new Object3D());
  const tmp = useRef({ right: new Vector3(), color: new Color() });

  useFrame(({ camera, controls }) => {
    const b = back.current;
    const f = fill.current;
    if (!b || !f) return;
    const o = dummy.current;
    const { right, color } = tmp.current;
    const zoom = zoomScale(viewDistance(camera, controls));
    const alpha = renderAlpha();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    o.quaternion.copy(camera.quaternion);
    let n = 0;
    for (const m of game.world.mobs) {
      if (m.hp >= m.maxHp || m.hp <= 0 || n >= MAX_BARS || isBuried(game.world, m)) continue;
      const frac = m.hp / m.maxHp;
      const [x, z] = mobWorldXZ(m, frame, alpha);
      const y = mobCentreY(m, zoom) + (1.4 * mobRadiusM(m.type) + GAP_M) * zoom;
      o.position.set(x, y, z);
      o.scale.set(WIDTH_M * zoom, HEIGHT_M * zoom, 1);
      o.updateMatrix();
      b.setMatrixAt(n, o.matrix);
      // Fill: shrink toward the left edge.
      o.position.addScaledVector(right, (-(1 - frac) * WIDTH_M * zoom) / 2);
      o.scale.set(WIDTH_M * zoom * frac, HEIGHT_M * zoom, 1);
      o.updateMatrix();
      f.setMatrixAt(n, o.matrix);
      f.setColorAt(n, color.copy(EMPTY).lerp(FULL, frac));
      n++;
    }
    b.count = n;
    f.count = n;
    b.instanceMatrix.needsUpdate = true;
    f.instanceMatrix.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh
        ref={back}
        args={[undefined, undefined, MAX_BARS]}
        frustumCulled={false}
        renderOrder={20}
      >
        <planeGeometry />
        <meshBasicMaterial color={BACK_COLOR} depthTest={false} transparent opacity={0.8} />
      </instancedMesh>
      <instancedMesh
        ref={fill}
        args={[undefined, undefined, MAX_BARS]}
        frustumCulled={false}
        renderOrder={21}
      >
        <planeGeometry />
        <meshBasicMaterial depthTest={false} transparent />
      </instancedMesh>
    </>
  );
}

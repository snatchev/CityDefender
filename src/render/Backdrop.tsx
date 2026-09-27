import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, MeshStandardMaterial, Object3D, type InstancedMesh } from 'three';
import type { BackdropFileV0, BackdropLayer } from '../sim/cityFile';
import { TILE_M } from '../sim/constants';
import { buildingColor } from './buildingMesh';
import { uvToWorld, type TileFrame } from './coords';
import { withSeeThrough } from './seeThrough';

/** Ground beyond the level (slightly lighter than street asphalt, so the play area stands out). */
const GROUND = '#5a5e63';
/** Backdrop buildings are washed toward this haze colour, more for coarser (farther) layers. */
const HAZE = new Color('#c9d3db');
const HAZE_PER_LAYER = [0.18, 0.32];
/** The ground reaches far past the backdrop so it fades into the fog instead of ending in an edge. */
const GROUND_SIZE_M = 30000;
/**
 * The backdrop ground runs under the playable map too. It sits well below the level's asphalt and is
 * pushed back further with a polygon offset, so the two never z-fight (flickering streets) at distance.
 */
const GROUND_Y = -3;
/** Per-cell brightness jitter (±), so merged cells don't read as a uniform carpet. */
const JITTER = 0.06;

/**
 * The decorative city beyond the playable level (D027): each backdrop layer as one InstancedMesh of
 * boxes at their (compressed) heights, over a ground plane covering the whole extent. Static; never
 * pickable; the sim doesn't know it exists.
 */
export function Backdrop({ file, frame }: { file: BackdropFileV0; frame: TileFrame }) {
  const outer = file.layers[file.layers.length - 1]!;
  const [x0, z0] = uvToWorld(frame, outer.u0, outer.v0);
  const w = outer.width * outer.cellTiles * TILE_M;
  const d = outer.height * outer.cellTiles * TILE_M;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[x0 + w / 2, GROUND_Y, z0 + d / 2]}>
        <planeGeometry args={[GROUND_SIZE_M, GROUND_SIZE_M]} />
        <meshStandardMaterial
          color={GROUND}
          polygonOffset
          polygonOffsetFactor={4}
          polygonOffsetUnits={4}
        />
      </mesh>
      {file.layers.map((l, k) => (
        <LayerBoxes key={k} layer={l} frame={frame} haze={HAZE_PER_LAYER[k] ?? 0.4} />
      ))}
    </group>
  );
}

function LayerBoxes({
  layer,
  frame,
  haze,
}: {
  layer: BackdropLayer;
  frame: TileFrame;
  haze: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const material = useMemo(() => withSeeThrough(new MeshStandardMaterial()), []);
  useEffect(() => () => material.dispose(), [material]);
  const cells = useMemo(() => {
    const out: { cx: number; cy: number; h: number }[] = [];
    layer.rows.forEach((row, cy) => {
      row.split(',').forEach((v, cx) => {
        const h = Number(v); // real metres (D029)
        if (h > 0) out.push({ cx, cy, h });
      });
    });
    return out;
  }, [layer]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const c = new Color();
    const size = layer.cellTiles * TILE_M;
    cells.forEach(({ cx, cy, h }, i) => {
      const [x, z] = uvToWorld(
        frame,
        layer.u0 + (cx + 0.5) * layer.cellTiles,
        layer.v0 + (cy + 0.5) * layer.cellTiles,
      );
      o.position.set(x, h / 2, z);
      o.scale.set(size, h, size);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      const jitter = 1 + (hash(cx, cy) - 0.5) * 2 * JITTER;
      mesh.setColorAt(i, buildingColor(h, c).lerp(HAZE, haze).multiplyScalar(jitter));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, layer, frame, haze]);

  if (cells.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, material, cells.length]}>
      <boxGeometry />
    </instancedMesh>
  );
}

/** Stable pseudo-random value in [0, 1) for a cell. */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

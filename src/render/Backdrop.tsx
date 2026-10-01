import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  type InstancedMesh,
} from 'three';
import type { BackdropFileV0, BackdropLayer } from '../sim/cityFile';
import { TILE_M } from '../sim/constants';
import { uvToWorld, type TileFrame } from './coords';
import { backdropLook, facadeAverage, withWindows } from './facades';
import { preLit } from './lighting';
import { createRng } from '../sim/rng';
import { afterDepthPass, backdropId, fadingOccluders, seeThroughDepthMaterial } from './seeThrough';

/** Ground beyond the level (slightly lighter than street asphalt, so the play area stands out). */
const GROUND = '#5a5e63';
/** Backdrop buildings are washed toward this haze colour, more for coarser (farther) layers. */
const HAZE = new Color('#c9d3db');
const HAZE_PER_LAYER = [0.18, 0.32];
const ROUGHNESS = 0.9;
/** The ground reaches far past the backdrop so it fades into the fog instead of ending in an edge. */
const GROUND_SIZE_M = 30000;
/**
 * The backdrop ground runs under the playable map too. It sits well below the level's asphalt and is
 * pushed back further with a polygon offset, so the two never z-fight (flickering streets) at distance.
 */
const GROUND_Y = -3;

/**
 * The decorative city beyond the playable level (D027): each backdrop layer as one InstancedMesh of
 * boxes at their (compressed) heights, over a ground plane covering the whole extent. Static; never
 * pickable; the sim doesn't know it exists.
 */
export function Backdrop({
  file,
  frame,
  heightScale,
  nSolids,
}: {
  file: BackdropFileV0;
  frame: TileFrame;
  /** The level's building count: the near backdrop's occluder ids come after them (seeThrough.ts). */
  nSolids: number;
  /** Boxes are drawn at this share of their height (tactical view, D050); the ground stays put. */
  heightScale: number;
}) {
  const outer = file.layers[file.layers.length - 1]!;
  const [x0, z0] = uvToWorld(frame, outer.u0, outer.v0);
  const w = outer.width * outer.cellTiles * TILE_M;
  const d = outer.height * outer.cellTiles * TILE_M;
  const groundColor = useMemo(() => preLit(GROUND), []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[x0 + w / 2, GROUND_Y, z0 + d / 2]}>
        <planeGeometry args={[GROUND_SIZE_M, GROUND_SIZE_M]} />
        <meshBasicMaterial
          color={groundColor}
          polygonOffset
          polygonOffsetFactor={4}
          polygonOffsetUnits={4}
        />
      </mesh>
      <group name="backdrop" scale-y={heightScale}>
        {file.layers.map((l, k) => (
          <LayerBoxes
            key={k}
            layer={l}
            frame={frame}
            haze={HAZE_PER_LAYER[k] ?? 0.4}
            detailed={k === 0}
            nSolids={nSolids}
          />
        ))}
      </group>
    </group>
  );
}

function LayerBoxes({
  layer,
  frame,
  haze,
  detailed,
  nSolids,
}: {
  layer: BackdropLayer;
  frame: TileFrame;
  haze: number;
  /**
   * The nearest layer gets windows and the see-through cutaway; farther layers are plain boxes in
   * their windows' average colour (D053): cheap, and at that distance the same picture.
   */
  detailed: boolean;
  nSolids: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const depthRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(), []);
  // The detailed layer's boxes fade when in the way of the track (seeThrough.ts, D055); while any
  // does, it draws behind a depth pre-pass that does the discarding (D053).
  const material = useMemo(
    () =>
      detailed
        ? withWindows(new MeshStandardMaterial({ roughness: ROUGHNESS }), { instancedBoxes: true })
        : new MeshLambertMaterial(),
    [detailed],
  );
  const afterDepth = useMemo(
    () =>
      detailed
        ? afterDepthPass(
            withWindows(new MeshStandardMaterial({ roughness: ROUGHNESS }), {
              instancedBoxes: true,
            }),
          )
        : null,
    [detailed],
  );
  const depthMaterial = useMemo(() => (detailed ? seeThroughDepthMaterial() : null), [detailed]);
  useEffect(
    () => () => {
      material.dispose();
      afterDepth?.dispose();
      depthMaterial?.dispose();
      geometry.dispose();
    },
    [material, afterDepth, depthMaterial, geometry],
  );
  const cells = useMemo(() => backdropCells(layer), [layer]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const styles = new Float32Array(cells.length);
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
      // Same palettes and window styles as the level (facades.ts), washed toward the haze.
      const look = backdropLook(h, createRng(cx * 7919 + cy * 104729 + layer.width));
      styles[i] = look.style;
      if (!detailed) {
        const avg = facadeAverage(look.style);
        look.wall.lerp(avg.glass, avg.coverage);
      }
      mesh.setColorAt(i, look.wall.lerp(HAZE, haze));
    });
    mesh.geometry.setAttribute('aStyle', new InstancedBufferAttribute(styles, 1));
    mesh.geometry.setAttribute(
      'aOcc',
      new InstancedBufferAttribute(
        Float32Array.from(cells, (_, k) => (detailed ? backdropId(nSolids, k) : 0)),
        1,
      ),
    );
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    const depth = depthRef.current;
    if (depth) {
      depth.instanceMatrix = mesh.instanceMatrix; // same boxes, shared buffer
      depth.computeBoundingSphere();
    }
  }, [cells, layer, frame, haze, detailed, nSolids]);

  useFrame(() => {
    const mesh = ref.current;
    const depth = depthRef.current;
    if (!mesh || !depth || !afterDepth) return;
    const first = backdropId(nSolids, 0);
    let fading = false;
    for (const id of fadingOccluders()) if (id >= first) fading = true;
    depth.visible = fading;
    mesh.material = fading ? afterDepth : material;
  });

  if (cells.length === 0) return null;
  return (
    <>
      <instancedMesh ref={ref} args={[geometry, material, cells.length]} />
      {depthMaterial && (
        <instancedMesh
          ref={depthRef}
          args={[geometry, depthMaterial, cells.length]}
          renderOrder={-1}
        />
      )}
    </>
  );
}

/** A backdrop layer's buildings: grid cell and height (real metres, D029), in drawing order. */
export function backdropCells(layer: BackdropLayer): { cx: number; cy: number; h: number }[] {
  const out: { cx: number; cy: number; h: number }[] = [];
  layer.rows.forEach((row, cy) => {
    row.split(',').forEach((v, cx) => {
      const h = Number(v);
      if (h > 0) out.push({ cx, cy, h });
    });
  });
  return out;
}

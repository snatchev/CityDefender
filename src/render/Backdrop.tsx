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
import {
  fadingOccluders,
  GHOST_COLOR_ORDER,
  GHOST_DEPTH_ORDER,
  ghostMaterials,
  hideWhenFaded,
} from './seeThrough';

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
  firstId,
}: {
  file: BackdropFileV0;
  frame: TileFrame;
  /** The near backdrop's boxes are see-through occluders `firstId`, `firstId + 1`, … (seeThrough.ts). */
  firstId: number;
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
            firstId={firstId}
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
  firstId,
}: {
  layer: BackdropLayer;
  frame: TileFrame;
  haze: number;
  /**
   * The nearest layer gets windows and turns see-through where it hides the track (D055); farther
   * layers are plain boxes in their windows' average colour (D053): cheap, and at that distance the
   * same picture.
   */
  detailed: boolean;
  firstId: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  const ghostDepthRef = useRef<InstancedMesh>(null);
  const ghostColorRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(), []);
  // The detailed layer's boxes turn see-through where they hide the track (seeThrough.ts, D055).
  const material = useMemo(
    () =>
      detailed
        ? hideWhenFaded(
            withWindows(new MeshStandardMaterial({ roughness: ROUGHNESS }), {
              instancedBoxes: true,
            }),
          )
        : new MeshLambertMaterial(),
    [detailed],
  );
  const ghost = useMemo(
    () =>
      detailed
        ? ghostMaterials(
            withWindows(new MeshStandardMaterial({ roughness: ROUGHNESS }), {
              instancedBoxes: true,
            }),
          )
        : null,
    [detailed],
  );
  useEffect(
    () => () => {
      material.dispose();
      ghost?.depth.dispose();
      ghost?.color.dispose();
      geometry.dispose();
    },
    [material, ghost, geometry],
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
        Float32Array.from(cells, (_, k) => (detailed ? firstId + k : 0)),
        1,
      ),
    );
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    for (const g of [ghostDepthRef.current, ghostColorRef.current]) {
      if (!g) continue;
      // Same boxes and colours, shared buffers.
      g.instanceMatrix = mesh.instanceMatrix;
      g.instanceColor = mesh.instanceColor;
      g.computeBoundingSphere();
    }
  }, [cells, layer, frame, haze, detailed, firstId]);

  useFrame(() => {
    if (!ghost) return;
    let fading = false;
    for (const id of fadingOccluders()) if (id >= firstId) fading = true;
    for (const g of [ghostDepthRef.current, ghostColorRef.current]) if (g) g.visible = fading;
  });

  if (cells.length === 0) return null;
  return (
    <>
      <instancedMesh ref={ref} args={[geometry, material, cells.length]} />
      {ghost && (
        <>
          <instancedMesh
            ref={ghostDepthRef}
            args={[geometry, ghost.depth, cells.length]}
            renderOrder={GHOST_DEPTH_ORDER}
            visible={false}
          />
          <instancedMesh
            ref={ghostColorRef}
            args={[geometry, ghost.color, cells.length]}
            renderOrder={GHOST_COLOR_ORDER}
            visible={false}
          />
        </>
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

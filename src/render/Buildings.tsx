import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Group, Mesh, MeshStandardMaterial, Sphere, Vector3 } from 'three';
import type { SolidRecord } from '../sim/cityFile';
import { solidsGeometry } from './buildingMesh';
import { uvToWorld, type TileFrame } from './coords';
import { withWindows } from './facades';
import {
  fadingOccluders,
  GHOST_COLOR_ORDER,
  GHOST_DEPTH_ORDER,
  ghostMaterials,
  hideWhenFaded,
  occluderIds,
} from './seeThrough';

/** Buildings are split into square chunks this big (m) so far and off-screen ones cost less (D053). */
const CHUNK_M = 128;
/** Chunks whose nearest point is within this of the camera get full detail (m). */
const DETAIL_NEAR_M = 650;
/** Facades and roofs are matte; windows get their own, lower roughness (facades.ts). */
const ROUGHNESS = 0.9;

interface Chunk {
  near: Mesh;
  far: Mesh;
  /** The same geometry with the ghost materials: drawn only while one of its buildings fades. */
  nearGhost: Mesh[];
  farGhost: Mesh[];
  sphere: Sphere;
  /** Some building in it is fading this frame. */
  fading: boolean;
}

/**
 * The level's buildings (D053), drawn in chunks with two levels of detail: near chunks with windows,
 * parapets and rooftop boxes; far chunks with plain walls in their windows' average colour. Chunks
 * off screen are frustum-culled.
 *
 * Buildings in the way of the track turn into ghosts (seeThrough.ts, D055): the normal materials
 * leave them out, and a chunk with a fading building also draws its ghost pass.
 */
export function Buildings({
  solids,
  coordScale,
  frame,
  keepClear,
  heightScale,
}: {
  solids: readonly SolidRecord[];
  coordScale: number;
  frame: TileFrame;
  keepClear: readonly (readonly [number, number])[];
  heightScale: number;
}) {
  const mats = useMemo(() => {
    const base = () => new MeshStandardMaterial({ vertexColors: true, roughness: ROUGHNESS });
    return {
      near: hideWhenFaded(withWindows(base())),
      far: hideWhenFaded(base()),
      ghost: ghostMaterials(true),
    };
  }, []);
  useEffect(
    () => () => {
      mats.near.dispose();
      mats.far.dispose();
      mats.ghost.depth.dispose();
      mats.ghost.color.dispose();
    },
    [mats],
  );

  const { group, chunks, chunksOf } = useMemo(() => {
    const { ofSolid } = occluderIds(solids);
    const buckets = new Map<string, { list: SolidRecord[]; ids: number[] }>();
    solids.forEach((s, i) => {
      const r = s.rings[0]!;
      const [x, z] = uvToWorld(frame, r[0]! / coordScale, r[1]! / coordScale);
      const key = `${Math.floor(x / CHUNK_M)},${Math.floor(z / CHUNK_M)}`;
      const b = buckets.get(key) ?? { list: [], ids: [] };
      b.list.push(s);
      b.ids.push(ofSolid[i]!);
      buckets.set(key, b);
    });
    const group = new Group();
    group.name = 'buildings';
    const chunks: Chunk[] = [];
    const chunksOf = new Map<number, Chunk[]>();
    for (const { list, ids } of buckets.values()) {
      const near = new Mesh(
        solidsGeometry(list, coordScale, frame, { keepClear, detail: 'high', ids }),
        mats.near,
      );
      const far = new Mesh(
        solidsGeometry(list, coordScale, frame, { detail: 'low', ids }),
        mats.far,
      );
      near.geometry.computeBoundingSphere();
      const sphere = near.geometry.boundingSphere!.clone();
      const ghostOf = (geometry: Mesh['geometry']) => {
        const depth = new Mesh(geometry, mats.ghost.depth);
        const color = new Mesh(geometry, mats.ghost.color);
        depth.renderOrder = GHOST_DEPTH_ORDER;
        color.renderOrder = GHOST_COLOR_ORDER;
        return [depth, color];
      };
      const nearGhost = ghostOf(near.geometry);
      const farGhost = ghostOf(far.geometry);
      group.add(near, far, ...nearGhost, ...farGhost);
      const chunk = { near, far, nearGhost, farGhost, sphere, fading: false };
      chunks.push(chunk);
      for (const id of new Set(ids)) chunksOf.set(id, [...(chunksOf.get(id) ?? []), chunk]);
    }
    return { group, chunks, chunksOf };
  }, [solids, coordScale, frame, keepClear, mats]);
  useEffect(
    () => () =>
      chunks.forEach((c) => {
        c.near.geometry.dispose();
        c.far.geometry.dispose();
      }),
    [chunks],
  );

  const centre = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    for (const c of chunks) c.fading = false;
    for (const id of fadingOccluders()) for (const c of chunksOf.get(id) ?? []) c.fading = true;
    for (const c of chunks) {
      centre.copy(c.sphere.center).multiply(group.scale);
      const r = c.sphere.radius;
      const near = camera.position.distanceTo(centre) - r < DETAIL_NEAR_M;
      c.near.visible = near;
      c.far.visible = !near;
      for (const m of c.nearGhost) m.visible = near && c.fading;
      for (const m of c.farGhost) m.visible = !near && c.fading;
    }
  });

  return <primitive object={group} scale-y={heightScale} />;
}

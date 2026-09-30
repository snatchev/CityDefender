import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Group, Mesh, MeshStandardMaterial, Sphere, Vector3 } from 'three';
import type { SolidRecord } from '../sim/cityFile';
import { solidsGeometry } from './buildingMesh';
import { uvToWorld, type TileFrame } from './coords';
import { withWindows } from './facades';
import { afterDepthPass, cutawayMayTouch, seeThroughDepthMaterial } from './seeThrough';

/** Buildings are split into square chunks this big (m) so far and off-screen ones cost less (D053). */
const CHUNK_M = 128;
/** Chunks whose nearest point is within this of the camera get full detail (m). */
const DETAIL_NEAR_M = 650;
/** Facades and roofs are matte; windows get their own, lower roughness (facades.ts). */
const ROUGHNESS = 0.9;

interface Chunk {
  near: Mesh;
  far: Mesh;
  /** Depth-only copies that do the cutaway's `discard` first (see the component doc). */
  nearDepth: Mesh;
  farDepth: Mesh;
  sphere: Sphere;
}

/**
 * The level's buildings (D053), drawn in chunks with two levels of detail: near chunks with windows,
 * parapets and rooftop boxes; far chunks with plain walls in their windows' average colour. Chunks
 * off screen are frustum-culled.
 *
 * The see-through cutaway dithers with `discard`, and a shader that may discard stops the GPU from
 * skipping hidden surfaces, so the full facade shader would run for every wall behind every other
 * one (measured: ~3 ms of a 5.4 ms frame at street level). Chunks the cutaway may reach are
 * therefore drawn in two passes: a cheap depth-only pass that does the discarding, then the full
 * material without discard, drawing only where its depth matches. Chunks it can't reach draw once.
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
      near: withWindows(base()),
      nearAfterDepth: afterDepthPass(withWindows(base())),
      far: base(),
      farAfterDepth: afterDepthPass(base()),
      depth: seeThroughDepthMaterial(),
    };
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const { group, chunks } = useMemo(() => {
    const buckets = new Map<string, SolidRecord[]>();
    for (const s of solids) {
      const r = s.rings[0]!;
      const [x, z] = uvToWorld(frame, r[0]! / coordScale, r[1]! / coordScale);
      const key = `${Math.floor(x / CHUNK_M)},${Math.floor(z / CHUNK_M)}`;
      const list = buckets.get(key);
      if (list) list.push(s);
      else buckets.set(key, [s]);
    }
    const group = new Group();
    group.name = 'buildings';
    const chunks: Chunk[] = [];
    for (const list of buckets.values()) {
      const near = new Mesh(
        solidsGeometry(list, coordScale, frame, { keepClear, detail: 'high' }),
        mats.near,
      );
      const far = new Mesh(solidsGeometry(list, coordScale, frame, { detail: 'low' }), mats.far);
      near.geometry.computeBoundingSphere();
      const sphere = near.geometry.boundingSphere!.clone();
      const nearDepth = new Mesh(near.geometry, mats.depth);
      const farDepth = new Mesh(far.geometry, mats.depth);
      // Depth first: opaque objects are drawn in renderOrder order before front-to-back sorting.
      nearDepth.renderOrder = farDepth.renderOrder = -1;
      group.add(near, far, nearDepth, farDepth);
      chunks.push({ near, far, nearDepth, farDepth, sphere });
    }
    return { group, chunks };
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
    for (const c of chunks) {
      centre.copy(c.sphere.center).multiply(group.scale);
      const r = c.sphere.radius;
      const near = camera.position.distanceTo(centre) - r < DETAIL_NEAR_M;
      const cut = cutawayMayTouch(centre, r);
      c.near.visible = near;
      c.far.visible = !near;
      c.nearDepth.visible = near && cut;
      c.farDepth.visible = !near && cut;
      c.near.material = cut ? mats.nearAfterDepth : mats.near;
      c.far.material = cut ? mats.farAfterDepth : mats.far;
    }
  });

  return <primitive object={group} scale-y={heightScale} />;
}

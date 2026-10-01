import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Group, Mesh, MeshStandardMaterial, Sphere, Vector3 } from 'three';
import type { SolidRecord } from '../sim/cityFile';
import { solidsGeometry } from './buildingMesh';
import { uvToWorld, type TileFrame } from './coords';
import { withWindows } from './facades';
import { afterDepthPass, buildingId, fadingOccluders, seeThroughDepthMaterial } from './seeThrough';

/** Buildings are split into square chunks this big (m) so far and off-screen ones cost less (D053). */
const CHUNK_M = 128;
/** Chunks whose nearest point is within this of the camera get full detail (m). */
const DETAIL_NEAR_M = 650;
/** Facades and roofs are matte; windows get their own, lower roughness (facades.ts). */
const ROUGHNESS = 0.9;

interface Chunk {
  near: Mesh;
  far: Mesh;
  /** Depth-only copies that do the fade's `discard` first (see the component doc). */
  nearDepth: Mesh;
  farDepth: Mesh;
  sphere: Sphere;
  /** Some building in it is fading this frame. */
  fading: boolean;
}

/**
 * The level's buildings (D053), drawn in chunks with two levels of detail: near chunks with windows,
 * parapets and rooftop boxes; far chunks with plain walls in their windows' average colour. Chunks
 * off screen are frustum-culled.
 *
 * Buildings in the way of the track fade out (seeThrough.ts, D055) by dithering with `discard`, and
 * a shader that may discard stops the GPU from skipping hidden surfaces, so the full facade shader
 * would run for every wall behind every other one (measured: ~3 ms of a 5.4 ms frame at street
 * level). Chunks with a fading building are therefore drawn in two passes: a cheap depth-only pass
 * that does the discarding, then the full material without discard, drawing only where its depth
 * matches. All other chunks draw once, with no discard at all.
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

  const { group, chunks, chunkOf } = useMemo(() => {
    const buckets = new Map<string, { list: SolidRecord[]; ids: number[] }>();
    solids.forEach((s, i) => {
      const r = s.rings[0]!;
      const [x, z] = uvToWorld(frame, r[0]! / coordScale, r[1]! / coordScale);
      const key = `${Math.floor(x / CHUNK_M)},${Math.floor(z / CHUNK_M)}`;
      const b = buckets.get(key) ?? { list: [], ids: [] };
      b.list.push(s);
      b.ids.push(buildingId(i));
      buckets.set(key, b);
    });
    const group = new Group();
    group.name = 'buildings';
    const chunks: Chunk[] = [];
    const chunkOf = new Map<number, Chunk>();
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
      const nearDepth = new Mesh(near.geometry, mats.depth);
      const farDepth = new Mesh(far.geometry, mats.depth);
      // Depth first: opaque objects are drawn in renderOrder order before front-to-back sorting.
      nearDepth.renderOrder = farDepth.renderOrder = -1;
      group.add(near, far, nearDepth, farDepth);
      const chunk = { near, far, nearDepth, farDepth, sphere, fading: false };
      chunks.push(chunk);
      for (const id of ids) chunkOf.set(id, chunk);
    }
    return { group, chunks, chunkOf };
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
    for (const id of fadingOccluders()) {
      const c = chunkOf.get(id);
      if (c) c.fading = true;
    }
    for (const c of chunks) {
      centre.copy(c.sphere.center).multiply(group.scale);
      const r = c.sphere.radius;
      const near = camera.position.distanceTo(centre) - r < DETAIL_NEAR_M;
      const cut = c.fading;
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

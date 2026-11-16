import {
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BARRICADES } from '../../sim/barricades';
import { MOBS } from '../../sim/mobs';
import { TOWERS } from '../../sim/towers';
import { bakeModel, type BakedModel, type ModelFamily, type PartIn } from './parts';

/**
 * The model library: GLBs from `public/models/<family>/<id>.glb` (D060), each merged at load into
 * one BufferGeometry whose vertex attributes carry what the shader animates (`parts.ts`):
 *
 * - `position`, `normal`, `color` (base colour, linear), `aGlow` (emission × strength),
 * - `aPivot` (the part's joint), `aPart` (motion kind, phase, amp, side), `aTintSlot` (props),
 *   `aSmoothN` (welded normals, for an outline hull).
 *
 * Load once, up front (`preloadModels`, awaited with the city in game.ts), then read synchronously
 * with `getModel` from render code: no Suspense, no pop-in. In the single-file preview the GLBs are
 * inlined as base64 in `window.__CD_INLINE__` (scripts/inline-build.mjs), like the city files.
 */
export interface Model {
  path: string;
  family: ModelFamily;
  id: string;
  baked: BakedModel;
  /**
   * Shared geometry; do not dispose and do not add instance attributes to it: wrap it with
   * `instancedGeometry` first.
   */
  geometry: BufferGeometry;
}

/** `models/bugs/skitterling.glb` (relative to the site root, like the city files). */
export function modelPath(family: ModelFamily, id: string): string {
  return `models/${family}/${id}.glb`;
}

/** Every model the game itself needs: one per bug, tower and barricade type in src/data. */
export function gameModelPaths(): string[] {
  return [
    ...Object.keys(MOBS).map((id) => modelPath('bugs', id)),
    ...Object.keys(TOWERS).map((id) => modelPath('towers', id)),
    ...Object.keys(BARRICADES).map((id) => modelPath('barricades', id)),
  ];
}

const cache = new Map<string, Model>();
const pending = new Map<string, Promise<Model>>();

/**
 * Load (once) and bake these models. Resolves when all are ready for `getModel`. A model that fails
 * to load is reported (console error, so the HUD's error panel shows it) and left out: the game
 * still runs, and `hasModel` says what's missing.
 */
export async function preloadModels(paths: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(paths.map(loadModel));
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`model ${paths[i]!}:`, r.reason);
  });
}

/** Whether a model loaded. */
export function hasModel(path: string): boolean {
  return cache.has(path);
}

/** A loaded model. Throws if it wasn't preloaded (a bug in the caller, not a loading state). */
export function getModel(path: string): Model {
  const m = cache.get(path);
  if (!m) throw new Error(`model ${path} was not preloaded (preloadModels)`);
  return m;
}

/** Shortcut for `getModel(modelPath(family, id))`. */
export function model(family: ModelFamily, id: string): Model {
  return getModel(modelPath(family, id));
}

function loadModel(path: string): Promise<Model> {
  const done = cache.get(path);
  if (done) return Promise.resolve(done);
  let p = pending.get(path);
  if (!p) {
    p = (async () => {
      const buffer = await readGlb(path);
      const gltf = await new GLTFLoader().parseAsync(buffer, '');
      const [, family, file] = path.split('/') as [string, ModelFamily, string];
      const baked = bakeModel(family, partsFromGltf(gltf.scene));
      const m: Model = {
        path,
        family,
        id: file.replace(/\.glb$/, ''),
        baked,
        geometry: geometryFromBaked(baked),
      };
      cache.set(path, m);
      return m;
    })().finally(() => pending.delete(path));
    pending.set(path, p);
  }
  return p;
}

async function readGlb(path: string): Promise<ArrayBuffer> {
  const inline = typeof window !== 'undefined' ? window.__CD_INLINE__?.[path] : undefined;
  if (typeof inline === 'string') {
    const bin = atob(inline);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  const res = await fetch(import.meta.env.BASE_URL + path);
  if (!res.ok) throw new Error(`loading ${path}: HTTP ${res.status} (npm run models:build?)`);
  return res.arrayBuffer();
}

/**
 * A parsed glTF scene → parts: each top-level node is one part (its translation is the joint, its
 * extras its motion overrides); its meshes, in model space, one primitive per material.
 */
export function partsFromGltf(scene: Object3D): PartIn[] {
  scene.updateMatrixWorld(true);
  const parts: PartIn[] = [];
  const p = new Vector3();
  const nm = new Matrix3();
  for (const node of scene.children) {
    const part: PartIn = {
      name: node.name,
      pivot: [node.position.x, node.position.y, node.position.z],
      extras: node.userData,
      primitives: [],
    };
    node.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const g = o.geometry as BufferGeometry;
      const mat = o.material as MeshStandardMaterial;
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const positions = new Float32Array(pos.count * 3);
      const normals = new Float32Array(pos.count * 3);
      nm.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        positions.set([p.x, p.y, p.z], i * 3);
        if (nor) {
          p.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
          normals.set([p.x, p.y, p.z], i * 3);
        }
      }
      const e = mat.emissive;
      const k = mat.emissiveIntensity ?? 1;
      const tint = /^tint(\d*)$/.exec(mat.name ?? '');
      part.primitives.push({
        positions,
        normals,
        indices: g.index ? g.index.array : null,
        color: [mat.color.r, mat.color.g, mat.color.b],
        glow: e ? [e.r * k, e.g * k, e.b * k] : [0, 0, 0],
        tintSlot: tint ? Number(tint[1] || 1) : 0,
      });
    });
    parts.push(part);
  }
  return parts;
}

function geometryFromBaked(b: BakedModel): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(b.position, 3));
  g.setAttribute('normal', new BufferAttribute(b.normal, 3));
  g.setAttribute('color', new BufferAttribute(b.color, 3));
  g.setAttribute('aGlow', new BufferAttribute(b.glow, 3));
  g.setAttribute('aPivot', new BufferAttribute(b.pivot, 3));
  g.setAttribute('aPart', new BufferAttribute(b.part, 4));
  g.setAttribute('aTintSlot', new BufferAttribute(b.tintSlot, 1));
  g.setAttribute('aSmoothN', new BufferAttribute(b.smoothNormal, 3));
  const nv = b.position.length / 3;
  g.setIndex(new BufferAttribute(nv < 65536 ? Uint16Array.from(b.index) : b.index, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * A geometry of its own that shares the model's vertex buffers (no copy), for an InstancedMesh to
 * hang its per-instance attributes on. Disposing it is safe: three re-uploads shared buffers that
 * another geometry still uses.
 */
export function instancedGeometry(m: Model): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(m.geometry.attributes)) g.setAttribute(name, attr);
  g.setIndex(m.geometry.index);
  g.boundingBox = m.geometry.boundingBox;
  g.boundingSphere = m.geometry.boundingSphere;
  return g;
}

/** A standalone copy of a model in its rest pose (for previews such as the placement ghost). */
export function restGeometry(m: Model): BufferGeometry {
  return m.geometry.clone();
}

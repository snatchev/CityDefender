#!/usr/bin/env node
// Inspect a model GLB and check it against the contract in tools/models/README.md.
//   node tools/models/check.mjs public/models/bugs/skitterling.glb [more.glb ...]
//   --quiet   print only problems (used by build.sh)
// Kind and id come from the path (.../<kind>/<id>.glb); sizes and budgets from lib/contract.json.
// The file is glTF space: +Y up, the model faces +Z, its left is +X.
// Exit code 1 if any file breaks the contract.
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = JSON.parse(readFileSync(join(HERE, 'lib', 'contract.json'), 'utf8'));
const NAME_RE = /^[A-Za-z0-9_]+$/;
const SIDED_RE = /^(leg|wing|jaw)_([LR])\d*$/;
const PROP_SIDED_RE = /^(arm|leg)_([LR])$/;
const MOVING_RE = /^(leg_|wing_|jaw_|sway_|seg_|pulse_|turret|kick|spin|arm_)/;
const EPS = 0.05;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Parse a GLB container: 12-byte header, then a JSON chunk and an optional BIN chunk. */
function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  if (buf.readUInt32LE(4) !== 2) throw new Error(`GLB version ${buf.readUInt32LE(4)}, expected 2`);
  let off = 12;
  let json;
  let bin;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

/** Read an accessor as an array of tuples (only what models use: float and unsigned ints). */
function readAccessor(gltf, bin, index) {
  const acc = gltf.accessors[index];
  const view = gltf.bufferViews[acc.bufferView];
  const n = COMPONENTS[acc.type];
  const size = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[acc.componentType];
  const read = {
    5126: (o) => bin.readFloatLE(o),
    5125: (o) => bin.readUInt32LE(o),
    5123: (o) => bin.readUInt16LE(o),
    5121: (o) => bin.readUInt8(o),
  }[acc.componentType];
  const stride = view.byteStride || n * size;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const t = [];
    for (let c = 0; c < n; c++) t.push(read(base + i * stride + c * size));
    out.push(t);
  }
  return out;
}

const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const hex = (rgb) =>
  '#' +
  rgb
    .slice(0, 3)
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const f2 = (x) => (Math.abs(x) < 0.005 ? 0 : x).toFixed(2);
const vec = (v) => `(${v.map(f2).join(', ')})`;

/** Rotate v by quaternion q = [x, y, z, w]. */
function rotate(q, v) {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

function inspect(path, quiet) {
  const errors = [];
  const warnings = [];
  const lines = [];
  const { json: g, bin } = readGlb(path);
  const kind = basename(dirname(path));
  const id = basename(path, '.glb');
  const spec = CONTRACT[kind]?.[id];
  if (!spec) errors.push(`${kind}/${id} is not in lib/contract.json`);
  const tol = CONTRACT.tolerance;

  // file-level rules
  for (const key of ['animations', 'skins', 'cameras', 'textures', 'images', 'samplers']) {
    if (g[key]?.length) errors.push(`has ${key} (${g[key].length})`);
  }
  if (g.extensionsUsed?.includes('KHR_lights_punctual')) errors.push('has lights');
  const scene = g.scenes[g.scene ?? 0];
  const nodes = g.nodes ?? [];
  const roots = new Set(scene.nodes);
  if (roots.size !== nodes.length) errors.push('not every node is at the top level of the scene');

  // materials
  const mats = g.materials ?? [];
  if (mats.length > 6) errors.push(`${mats.length} materials, at most 6`);
  const emissive = [];
  lines.push('materials:');
  for (const m of mats) {
    const pbr = m.pbrMetallicRoughness ?? {};
    const base = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const em = m.emissiveFactor ?? [0, 0, 0];
    const strength = m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
    const glows = em.some((c) => c > 0);
    if (glows) emissive.push(m.name);
    if (m.name?.startsWith('light_') && !glows)
      errors.push(`material ${m.name}: a light_ material needs an emission colour`);
    if (m.name === 'tint' || m.name === 'tint2') {
      if (base.slice(0, 3).some((c) => Math.abs(c - 1) > 1e-3))
        errors.push(`material ${m.name}: must be white (the game tints it per instance)`);
      if (glows) errors.push(`material ${m.name}: tinted materials do not glow`);
    }
    if (
      pbr.baseColorTexture ||
      m.normalTexture ||
      m.emissiveTexture ||
      m.occlusionTexture ||
      pbr.metallicRoughnessTexture
    )
      errors.push(`material ${m.name}: uses a texture`);
    if ((m.alphaMode ?? 'OPAQUE') !== 'OPAQUE' || base[3] < 1)
      errors.push(`material ${m.name}: transparent`);
    if (!NAME_RE.test(m.name ?? ''))
      errors.push(`material ${m.name}: names are letters, digits and _ only`);
    lines.push(
      `  ${(m.name ?? '?').padEnd(14)} base ${hex(base)}  rough ${f2(pbr.roughnessFactor ?? 1)}  metal ${f2(pbr.metallicFactor ?? 1)}` +
        (glows ? `  emissive ${hex(em)} x ${f2(strength)}` : ''),
    );
  }

  // nodes
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  let total = 0;
  let maxTintEdge = 0;
  const byName = new Map();
  lines.push('nodes (name, translation = pivot, triangles, extras):');
  for (const n of nodes) {
    byName.set(n.name, n);
    const t = n.translation ?? [0, 0, 0];
    const r = n.rotation ?? [0, 0, 0, 1];
    const s = n.scale ?? [1, 1, 1];
    if (!NAME_RE.test(n.name ?? ''))
      errors.push(`node ${n.name}: names are letters, digits and _ only`);
    if (n.children?.length) errors.push(`node ${n.name}: has children (top level only)`);
    if (n.skin !== undefined) errors.push(`node ${n.name}: skinned`);
    if (n.camera !== undefined) errors.push(`node ${n.name}: camera`);
    if (Math.abs(r[3]) < 1 - 1e-5 || s.some((x) => Math.abs(x - 1) > 1e-5))
      errors.push(`node ${n.name}: rotation/scale not applied`);
    for (const [k, v] of Object.entries(n.extras ?? {})) {
      if (k === 'phase' && !(v >= 0 && v <= 1))
        errors.push(`node ${n.name}: phase ${v} outside 0..1`);
      else if (k === 'amp' && !(v >= 0 && v <= 2))
        errors.push(`node ${n.name}: amp ${v} outside 0..2`);
      else if (k !== 'phase' && k !== 'amp')
        errors.push(`node ${n.name}: extra '${k}' (only phase, amp)`);
    }
    let tris = 0;
    const nlo = [Infinity, Infinity, Infinity];
    const nhi = [-Infinity, -Infinity, -Infinity];
    if (n.mesh !== undefined) {
      const mesh = g.meshes[n.mesh];
      if (mesh.weights?.length || mesh.primitives.some((p) => p.targets?.length))
        errors.push(`node ${n.name}: morph targets`);
      for (const p of mesh.primitives) {
        if ((p.mode ?? 4) !== 4)
          errors.push(`node ${n.name}: primitive mode ${p.mode} (triangles only)`);
        if (p.attributes.NORMAL === undefined) errors.push(`node ${n.name}: no normals`);
        if (p.attributes.COLOR_0 !== undefined) errors.push(`node ${n.name}: vertex colours`);
        if (p.material === undefined) errors.push(`node ${n.name}: a primitive without a material`);
        const count =
          p.indices !== undefined
            ? g.accessors[p.indices].count
            : g.accessors[p.attributes.POSITION].count;
        tris += count / 3;
        if (p.indices !== undefined && mats[p.material]?.name === 'tint') {
          const pos = readAccessor(g, bin, p.attributes.POSITION);
          const idx = readAccessor(g, bin, p.indices).map((x) => x[0]);
          for (let i = 0; i < idx.length; i += 3)
            for (let k = 0; k < 3; k++) {
              const a = pos[idx[i + k]];
              const b = pos[idx[i + ((k + 1) % 3)]];
              maxTintEdge = Math.max(
                maxTintEdge,
                Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
              );
            }
        }
        for (const v of readAccessor(g, bin, p.attributes.POSITION)) {
          const w = rotate(r, [v[0] * s[0], v[1] * s[1], v[2] * s[2]]).map((c, i) => c + t[i]);
          for (let i = 0; i < 3; i++) {
            nlo[i] = Math.min(nlo[i], w[i]);
            nhi[i] = Math.max(nhi[i], w[i]);
          }
        }
      }
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], nlo[i]);
        hi[i] = Math.max(hi[i], nhi[i]);
      }
      n._lo = nlo;
    }
    total += tris;
    const what = n.mesh !== undefined ? `${String(tris).padStart(5)} tris` : '    empty';
    const extras = n.extras ? '  ' + JSON.stringify(n.extras) : '';
    lines.push(`  ${n.name.padEnd(18)} ${vec(t).padEnd(24)} ${what}${extras}`);
  }
  const dim = hi.map((h, i) => h - lo[i]);
  lines.push(`total: ${total} triangles, ${nodes.length} nodes, ${mats.length} materials`);
  lines.push(`bounds (glTF x, y, z): ${vec(lo)} .. ${vec(hi)}  size ${dim.map(f2).join(' x ')} m`);

  if (spec?.tris && total > spec.tris) errors.push(`${total} triangles, budget ${spec.tris}`);
  const sizeCheck = (label, got, want) => {
    if (got > want * tol.over + 1e-6)
      errors.push(`${label} ${f2(got)} m, table says ${want} (max ${f2(want * tol.over)})`);
    else if (got < want * tol.under)
      errors.push(`${label} ${f2(got)} m, table says ${want} (min ${f2(want * tol.under)})`);
  };
  // glTF: x = left (+X), y = up, z = forward (+Z). Length runs along z.
  const [dx, dy, dz] = dim;
  if (kind === 'bugs') {
    const flier = !!spec?.flier;
    if (spec) {
      const [L, W, H] = spec.size;
      sizeCheck('length (z)', dz, L);
      sizeCheck('width (x)', dx, W);
      sizeCheck('height (y)', dy, H);
    }
    if (!flier && Math.abs(lo[1]) > EPS)
      errors.push(`lowest point y = ${f2(lo[1])}; a walker stands on y = 0`);
    for (const n of nodes) {
      const m = SIDED_RE.exec(n.name);
      if (/^(leg|wing|jaw)_/.test(n.name) && !m)
        errors.push(`${n.name}: sided parts are named like leg_L1, wing_R1, jaw_L`);
      const x = (n.translation ?? [0, 0, 0])[0];
      if (m && ((m[2] === 'L' && x <= 0) || (m[2] === 'R' && x >= 0)))
        errors.push(`${n.name}: pivot x = ${f2(x)}; L parts sit at +X, R parts at -X`);
      if (n.name.startsWith('leg_') && n._lo && !flier && Math.abs(n._lo[1]) > EPS)
        errors.push(`${n.name}: foot at y = ${f2(n._lo[1])}, should touch y = 0`);
    }
    const jaws = nodes.filter((n) => n.name.startsWith('jaw_'));
    if (jaws.length && jaws.some((n) => (n.translation ?? [0, 0, 0])[2] <= 0))
      warnings.push('jaws are not at +Z: the bug should face +Z in the file');
    if (!emissive.length) warnings.push('no emissive material (bugs have glowing eyes)');
  } else if (kind === 'towers') {
    if (spec) {
      const [across, height] = spec.size;
      if (spec.forward) {
        sizeCheck('width (x)', dx, across);
        if (hi[2] > spec.forward * tol.over)
          errors.push(`reaches ${f2(hi[2])} m forward, table says ${spec.forward}`);
        if (-lo[2] > (across / 2) * tol.over)
          errors.push(`reaches ${f2(-lo[2])} m back, max ${f2((across / 2) * tol.over)}`);
      } else sizeCheck('footprint', Math.max(dx, dz), across);
      sizeCheck('height (y)', dy, height);
    }
    if (Math.abs(lo[1]) > EPS)
      errors.push(`lowest point y = ${f2(lo[1])}; a tower stands on y = 0`);
    const muzzle = byName.get('muzzle');
    if (!muzzle || muzzle.mesh !== undefined) errors.push("needs an empty node named 'muzzle'");
    else if ((muzzle.translation ?? [0, 0, 0])[2] <= 0)
      warnings.push('muzzle is not at +Z: the tower should point +Z in the file');
    for (const n of nodes) {
      const t = n.translation ?? [0, 0, 0];
      if (n.name.startsWith('turret') && Math.hypot(t[0], t[2]) > EPS)
        errors.push(
          `${n.name}: pivot (${f2(t[0])}, ${f2(t[2])}) in x/z; a turret turns about the model origin`,
        );
    }
    if (!emissive.length) warnings.push('no emissive material (towers have glowing accent strips)');
  } else if (kind === 'barricades') {
    if (Math.abs(lo[0] + 4) > 0.01 || Math.abs(hi[0] - 4) > 0.01)
      errors.push(
        `spans x = ${lo[0].toFixed(3)} .. ${hi[0].toFixed(3)}; a module spans exactly -4 .. +4`,
      );
    if (Math.abs(lo[2] + hi[2]) / 2 > 0.1)
      errors.push(`depth not centred on z = 0 (${f2(lo[2])} .. ${f2(hi[2])})`);
    if (Math.abs(lo[1]) > EPS)
      errors.push(`lowest point y = ${f2(lo[1])}; a barricade stands on y = 0`);
    if (spec) {
      sizeCheck('depth (z)', dz, spec.size[1]);
      sizeCheck('height (y)', dy, spec.size[2]);
    }
    for (const n of nodes)
      if (MOVING_RE.test(n.name)) errors.push(`${n.name}: barricades have no moving parts`);
  } else if (kind === 'props') {
    const [L, W, H] = spec?.size ?? [null, null, null];
    if (L) sizeCheck('length (z)', dz, L);
    if (W) sizeCheck('width (x)', dx, W);
    if (H) sizeCheck('height (y)', dy, H);
    if (Math.abs(lo[1]) > EPS) errors.push(`lowest point y = ${f2(lo[1])}; a prop stands on y = 0`);
    for (const part of spec?.parts ?? [])
      if (!byName.has(part)) errors.push(`needs a part named '${part}'`);
    for (const t of spec?.tints ?? [])
      if (!mats.some((m) => m.name === t)) errors.push(`needs a material named '${t}' (white)`);
    for (const n of nodes) {
      const m = PROP_SIDED_RE.exec(n.name);
      const x = (n.translation ?? [0, 0, 0])[0];
      if (/^(arm|leg)_/.test(n.name) && !m)
        errors.push(`${n.name}: a person's limbs are arm_L, arm_R, leg_L, leg_R`);
      if (m && ((m[2] === 'L' && x <= 0) || (m[2] === 'R' && x >= 0)))
        errors.push(`${n.name}: pivot x = ${f2(x)}; L parts sit at +X, R parts at -X`);
      if (spec?.static && MOVING_RE.test(n.name))
        errors.push(`${n.name}: ${id} has no moving parts`);
    }
    if (spec?.maxEdge) {
      lines.push(`longest edge on a tint triangle: ${f2(maxTintEdge)} m (max ${spec.maxEdge})`);
      if (maxTintEdge > spec.maxEdge + 1e-6)
        errors.push(
          `a tint triangle has a ${f2(maxTintEdge)} m edge; max ${spec.maxEdge}, so the panels can dent`,
        );
    }
  } else
    errors.push(
      `unknown kind '${kind}' (the file must sit in bugs/, towers/, barricades/ or props/)`,
    );

  if (!quiet || errors.length) {
    console.log(`${kind}/${id}  (${path})`);
    if (!quiet) for (const l of lines) console.log(l);
  }
  for (const w of warnings) console.log(`  warning: ${w}`);
  for (const e of errors) console.log(`  ERROR: ${e}`);
  if (!quiet) console.log(errors.length ? `${errors.length} contract errors` : 'contract ok');
  return errors.length === 0;
}

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('usage: node tools/models/check.mjs [--quiet] public/models/<kind>/<id>.glb ...');
  process.exit(2);
}
let ok = true;
for (const f of files) {
  try {
    ok = inspect(f, quiet) && ok;
  } catch (e) {
    console.log(`${f}: ${e.message}`);
    ok = false;
  }
  if (!quiet && files.length > 1) console.log('');
}
process.exit(ok ? 0 : 1);

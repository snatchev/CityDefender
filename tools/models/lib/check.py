"""The contract from tools/models/README.md, checked on the Blender scene before export.

check.mjs checks the same rules on the exported .glb. Sizes and budgets live in contract.json,
which both read.
"""

import json
import re
from pathlib import Path

import bpy
from mathutils import Vector

from .shapes import world_matrix

CONTRACT = json.loads((Path(__file__).parent / "contract.json").read_text())
NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")
SIDED_RE = re.compile(r"^(leg|wing|jaw)_([LR])\d*$")
PROP_SIDED_RE = re.compile(r"^(arm|leg)_([LR])$")
MOVING = ("leg_", "wing_", "jaw_", "sway_", "seg_", "pulse_", "turret", "kick", "spin", "arm_")
EPS = 0.05  # metres


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def world_bbox(objs):
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        mw = world_matrix(o)
        for v in o.data.vertices:
            p = mw @ v.co
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def check(kind, model_id, flier=None):
    """Return (errors, warnings, stats). Expects modifiers and transforms already applied."""
    errors, warnings = [], []
    spec = CONTRACT.get(kind, {}).get(model_id)
    if spec is None:
        errors.append(f"{kind}/{model_id} is not in lib/contract.json (add its size and budget there)")
        spec = {}
    tol = CONTRACT["tolerance"]
    objs = list(bpy.context.scene.objects)
    meshes = [o for o in objs if o.type == "MESH"]
    empties = [o for o in objs if o.type == "EMPTY"]

    # objects: types, names, hierarchy, transforms, data
    for o in objs:
        if o.type not in ("MESH", "EMPTY"):
            errors.append(f"{o.name}: {o.type} objects are not allowed (only meshes and empties)")
        if not NAME_RE.match(o.name):
            errors.append(f"{o.name}: names are letters, digits and _ only")
        if o.parent is not None:
            errors.append(f"{o.name}: parented to {o.parent.name} (top level only)")
        if o.animation_data is not None:
            errors.append(f"{o.name}: has animation data")
        if any(abs(a) > 1e-6 for a in o.rotation_euler) or any(abs(s - 1) > 1e-6 for s in o.scale):
            errors.append(f"{o.name}: rotation/scale not applied")
        for k in o.keys():
            if k not in ("phase", "amp"):
                errors.append(f"{o.name}: custom property {k!r} (only phase and amp are allowed)")
        if "phase" in o and not 0 <= o["phase"] <= 1:
            errors.append(f"{o.name}: phase {o['phase']} outside 0..1")
        if "amp" in o and not 0 <= o["amp"] <= 2:
            errors.append(f"{o.name}: amp {o['amp']} outside 0..2")
    for o in meshes:
        me = o.data
        if me.shape_keys:
            errors.append(f"{o.name}: has shape keys")
        if o.modifiers:
            errors.append(f"{o.name}: modifiers not applied")
        if me.color_attributes:
            errors.append(f"{o.name}: has vertex colours")
        if not me.polygons:
            errors.append(f"{o.name}: has no faces")
        used = set(v for p in me.polygons for v in p.vertices)
        if len(used) != len(me.vertices):
            errors.append(f"{o.name}: {len(me.vertices) - len(used)} loose vertices")
        if not me.materials or any(m is None for m in me.materials):
            errors.append(f"{o.name}: has an empty material slot (every part needs a material)")

    # materials
    mats = {m.name: m for o in meshes for m in o.data.materials if m}
    if len(mats) > 6:
        errors.append(f"{len(mats)} materials ({', '.join(mats)}); at most 6")
    emissive = []
    for m in mats.values():
        if not NAME_RE.match(m.name):
            errors.append(f"material {m.name}: names are letters, digits and _ only")
        nodes = m.node_tree.nodes if m.use_nodes else []
        kinds = sorted(n.type for n in nodes)
        if kinds != ["BSDF_PRINCIPLED", "OUTPUT_MATERIAL"]:
            errors.append(f"material {m.name}: must be one Principled BSDF and the output, has {kinds}")
            continue
        bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
        if any(i.is_linked for i in bsdf.inputs):
            errors.append(f"material {m.name}: has linked inputs (flat values only)")
        if bsdf.inputs["Alpha"].default_value < 1:
            errors.append(f"material {m.name}: transparent")
        glows = bsdf.inputs["Emission Strength"].default_value > 0 and any(bsdf.inputs["Emission Color"].default_value[:3])
        if glows:
            emissive.append(m.name)
        if m.name.startswith("light_") and not glows:
            errors.append(f"material {m.name}: a light_ material needs an emission colour and strength")
        if m.name in ("tint", "tint2"):
            if any(abs(c - 1) > 1e-3 for c in bsdf.inputs["Base Color"].default_value[:3]):
                errors.append(f"material {m.name}: must be white (the game multiplies it by a colour per instance)")
            if glows:
                errors.append(f"material {m.name}: tinted materials do not glow")

    tris = sum(triangles(o) for o in meshes)
    budget = spec.get("tris")
    if budget and tris > budget:
        errors.append(f"{tris} triangles, budget {budget}")

    lo, hi = world_bbox(meshes) if meshes else (Vector(), Vector())
    dim = hi - lo
    names = {o.name for o in objs}

    def size_check(label, got, want):
        if got > want * tol["over"] + 1e-6:
            errors.append(f"{label} {got:.2f} m, table says {want} (max {want * tol['over']:.2f})")
        elif got < want * tol["under"]:
            errors.append(f"{label} {got:.2f} m, table says {want} (min {want * tol['under']:.2f})")

    flier = spec.get("flier", False) if flier is None else flier
    if kind == "bugs":
        if "size" in spec:
            L, W, H = spec["size"]
            size_check("length (Y)", dim.y, L)
            size_check("width (X)", dim.x, W)
            size_check("height (Z)", dim.z, H)
        if not flier and abs(lo.z) > EPS:
            errors.append(f"lowest point z = {lo.z:.2f}; a walker stands on z = 0")
        for o in meshes + empties:
            m = SIDED_RE.match(o.name)
            if o.name.startswith(("leg_", "wing_", "jaw_")) and not m:
                errors.append(f"{o.name}: sided parts are named like leg_L1, wing_R1, jaw_L")
            if m:
                x = o.location.x
                if (m.group(2) == "L" and x <= 0) or (m.group(2) == "R" and x >= 0):
                    errors.append(f"{o.name}: pivot x = {x:.2f}; L parts sit at +X, R parts at -X")
            if o.name.startswith("leg_") and o.type == "MESH" and not flier:
                llo, _ = world_bbox([o])
                if abs(llo.z) > EPS:
                    errors.append(f"{o.name}: foot at z = {llo.z:.2f}, should touch z = 0")
        if not emissive:
            warnings.append("no emissive material (bugs have glowing eyes)")
    elif kind == "towers":
        if "size" in spec:
            across, height = spec["size"]
            fwd = spec.get("forward")
            if fwd:
                size_check("width (X)", dim.x, across)
                if -lo.y > fwd * tol["over"]:
                    errors.append(f"reaches {-lo.y:.2f} m forward, table says {fwd}")
                if hi.y > across / 2 * tol["over"]:
                    errors.append(f"reaches {hi.y:.2f} m back, max {across / 2 * tol['over']:.2f}")
            else:
                size_check("footprint", max(dim.x, dim.y), across)
            size_check("height (Z)", dim.z, height)
        if abs(lo.z) > EPS:
            errors.append(f"lowest point z = {lo.z:.2f}; a tower stands on z = 0")
        muzzle = [o for o in objs if o.name == "muzzle"]
        if not muzzle or muzzle[0].type != "EMPTY":
            errors.append("needs an Empty named 'muzzle' at the barrel tip")
        elif muzzle[0].location.y >= 0:
            warnings.append(f"muzzle at y = {muzzle[0].location.y:.2f}; the tower points -Y at rest")
        for o in objs:
            if o.name.startswith("turret") and Vector(o.location[:2]).length > EPS:
                errors.append(f"{o.name}: pivot {tuple(round(c, 2) for c in o.location[:2])}; a turret turns about the model origin")
        if not emissive:
            warnings.append("no emissive material (towers have glowing accent strips)")
    elif kind == "barricades":
        if abs(lo.x + 4) > 0.01 or abs(hi.x - 4) > 0.01:
            errors.append(f"spans x = {lo.x:.3f} .. {hi.x:.3f}; a module spans exactly -4 .. +4")
        if abs(lo.y + hi.y) / 2 > 0.1:
            errors.append(f"depth not centred on y = 0 ({lo.y:.2f} .. {hi.y:.2f})")
        if abs(lo.z) > EPS:
            errors.append(f"lowest point z = {lo.z:.2f}; a barricade stands on z = 0")
        if "size" in spec:
            _, D, H = spec["size"]
            size_check("depth (Y)", dim.y, D)
            size_check("height (Z)", dim.z, H)
        for o in objs:
            if o.name.startswith(MOVING):
                errors.append(f"{o.name}: barricades have no moving parts")
    elif kind == "props":
        L, W, H = spec.get("size", (None, None, None))
        for label, got, want in (("length (Y)", dim.y, L), ("width (X)", dim.x, W), ("height (Z)", dim.z, H)):
            if want:
                size_check(label, got, want)
        if abs(lo.z) > EPS:
            errors.append(f"lowest point z = {lo.z:.2f}; a prop stands on z = 0")
        for part in spec.get("parts", []):
            if part not in names:
                errors.append(f"needs a part named {part!r}")
        for t in spec.get("tints", []):
            if t not in mats:
                errors.append(f"needs a material named {t!r} (white, tinted by the game)")
        for o in objs:
            m = PROP_SIDED_RE.match(o.name)
            if o.name.startswith(("arm_", "leg_")) and not m:
                errors.append(f"{o.name}: a person's limbs are arm_L, arm_R, leg_L, leg_R")
            if m and ((m.group(2) == "L" and o.location.x <= 0) or (m.group(2) == "R" and o.location.x >= 0)):
                errors.append(f"{o.name}: pivot x = {o.location.x:.2f}; L parts sit at +X, R parts at -X")
            if spec.get("static") and o.name.startswith(MOVING):
                errors.append(f"{o.name}: {model_id} has no moving parts")
        max_edge = spec.get("maxEdge")
        if max_edge:
            longest = 0.0
            for o in meshes:
                me = o.data
                tint = [i for i, mm in enumerate(me.materials) if mm and mm.name == "tint"]
                me.calc_loop_triangles()
                for tri in me.loop_triangles:  # the triangles the GLB will hold
                    if tri.material_index in tint:
                        vs = [me.vertices[v].co for v in tri.vertices]
                        longest = max(longest, *((vs[i] - vs[i - 1]).length for i in range(3)))
            if longest > max_edge + 1e-6:
                errors.append(f"a tint triangle has a {longest:.2f} m edge; max {max_edge}, so the panels can dent")
    else:
        errors.append(f"unknown kind {kind!r} (bugs, towers, barricades)")

    stats = {"tris": tris, "size": tuple(round(d, 2) for d in dim), "lo": tuple(round(c, 2) for c in lo),
             "hi": tuple(round(c, 2) for c in hi), "materials": len(mats), "emissive": emissive,
             "objects": len(objs), "names": sorted(names)}
    return errors, warnings, stats

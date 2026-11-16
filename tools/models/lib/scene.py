"""Scene lifecycle: begin() a model, finish() it (bake, check, export GLB + .blend + preview)."""

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

from . import check as _check
from .preview import render_preview
from .shapes import apply_modifiers

MODELS = Path(__file__).resolve().parents[1]  # tools/models
ROOT = MODELS.parents[1]  # repo root
KINDS = ("bugs", "towers", "barricades", "props")

_current = {}


class ContractError(Exception):
    """The model breaks tools/models/README.md's contract."""


def begin(script_file):
    """Start a model: an empty factory scene. Pass __file__; kind and id come from its path
    (tools/models/bugs/skitterling.py -> kind 'bugs', id 'skitterling')."""
    path = Path(script_file).resolve()
    kind, model_id = path.parent.name, path.stem
    if kind not in KINDS:
        raise ValueError(f"model scripts live in {', '.join(KINDS)}/, not {path.parent}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    _current.update(kind=kind, id=model_id)
    return kind, model_id


def _bake(obj):
    """Apply modifiers, rotation and scale (location stays: it is the pivot); smooth + sharp edges."""
    if obj.type != "MESH":
        if obj.type == "EMPTY":
            obj.rotation_euler = (0, 0, 0)
            obj.scale = (1, 1, 1)
        return
    apply_modifiers(obj)
    if obj.parent is not None:
        return  # check() reports it
    rs = Matrix.LocRotScale(None, obj.rotation_euler, obj.scale)
    if rs != Matrix.Identity(4):
        obj.data.transform(rs)
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)
    me = obj.data
    me.shade_smooth()
    sharp = float(obj.get("_sharp", 40.0))
    me.set_sharp_from_angle(angle=math.radians(max(sharp, 0.01)))
    for k in [k for k in obj.keys() if k.startswith("_")]:
        del obj[k]


def export_glb(path):
    """Export the scene as GLB with the contract's settings (names from Blender 4.5's exporter RNA)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_yup=True,  # Blender Z-up, faces -Y  ->  glTF Y-up, faces +Z
        export_apply=True,  # apply modifiers (already applied by finish, kept as a safety net)
        export_normals=True,
        export_texcoords=False,  # no textures in this contract
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_vertex_color="NONE",
        export_attributes=False,
        export_extras=True,  # object custom properties (phase, amp) -> node.extras
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_gpu_instances=False,
        use_selection=False,
        use_visible=False,
        use_renderable=False,
        use_active_collection=False,
        export_hierarchy_flatten_objs=False,
        export_draco_mesh_compression_enable=False,
    )


def finish(flier=None, preview=True):
    """Bake every object, check the contract (raises on a violation), then write
    public/models/<kind>/<id>.glb, tools/models/blend/<id>.blend and tools/models/previews/<id>.png.

    flier: override contract.json's 'flier' flag (a flier's body centre is at the origin; its feet
    need not touch z = 0).
    """
    if not _current:
        raise RuntimeError("call begin(__file__) first")
    kind, model_id = _current["kind"], _current["id"]
    objs = list(bpy.context.scene.objects)
    for o in objs:
        _bake(o)
    bpy.context.view_layer.update()

    errors, warnings, stats = _check.check(kind, model_id, flier)
    for w in warnings:
        print(f"[{model_id}] warning: {w}")
    if errors:
        msg = "\n".join(f"  - {e}" for e in errors)
        raise ContractError(f"[{model_id}] CONTRACT VIOLATION ({len(errors)}):\n{msg}")

    glb = ROOT / "public" / "models" / kind / f"{model_id}.glb"
    export_glb(glb)
    blend = MODELS / "blend" / f"{model_id}.blend"
    blend.parent.mkdir(exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0  # no .blend1 backups
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), check_existing=False, compress=True)

    sx, sy, sz = stats["size"]
    print(f"[{model_id}] OK  {stats['tris']} tris  {sx} x {sy} x {sz} m (x, y, z)  "
          f"{stats['objects']} objects  {stats['materials']} materials  -> {glb.relative_to(ROOT)}")
    if preview:
        spec = _check.CONTRACT.get(kind, {}).get(model_id, {})
        png = MODELS / "previews" / f"{model_id}.png"
        is_flier = spec.get("flier", False) if flier is None else flier
        render_preview(png, model_id, f"{sx} x {sy} x {sz} m   {stats['tris']} tris", objs, is_flier, tile_x=kind == "barricades")
        print(f"[{model_id}] preview -> {png.relative_to(ROOT)}")
    sys.stdout.flush()
    return stats

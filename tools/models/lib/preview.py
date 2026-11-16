"""Preview render: one PNG with three orthographic views (3/4 front-left, left side, top).

Rendered with EEVEE (BLENDER_EEVEE_NEXT), which works with --background on Apple Silicon (Metal).
The ground has darker lines every 5 m; the top view adds faint 1 m lines. Emissive parts glow
through a compositor bloom. Preview objects are added after export and never saved. Props' `tint`
and `tint2` materials (white in the GLB, coloured per instance by the game) are drawn in sample
colours, TINT_SAMPLES.

Size: each PNG is 1200 x 400, 8-bit RGB, no dither, maximum compression: about 100-150 kB. The
fine grid costs bytes on slanted views (anti-aliased diagonal lines), so only the top view has it.
"""

import math
import os
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

VIEW_PX = 400
TINT_SAMPLES = {"tint": "#d2553f", "tint2": "#e2a77f"}  # shirt / car paint, skin
BACKGROUND = (0.32, 0.33, 0.35)  # linear grey


def _emission_mat(name, rgb, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1)
    em.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


def _grid_material(name, fine):
    """Light grey ground with darker lines every 5 m (and faint 1 m lines if fine), world space."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.9
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])

    def math_node(op, a, b=None):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                nt.links.new(x, n.inputs[i])
        return n.outputs[0]

    def line(axis, period, width):  # 1 within width/2 of a multiple of period, else 0
        frac = math_node("FRACT", math_node("ADD", math_node("MULTIPLY", axis, 1 / period), 0.5))
        d = math_node("MULTIPLY", math_node("ABSOLUTE", math_node("SUBTRACT", frac, 0.5)), period)
        return math_node("LESS_THAN", d, width / 2)

    def grid(period, width):
        return math_node("MAXIMUM", line(sep.outputs["X"], period, width), line(sep.outputs["Y"], period, width))

    shade = math_node("SUBTRACT", 0.55, math_node("MULTIPLY", grid(5, 0.14), 0.22))
    if fine:
        shade = math_node("SUBTRACT", shade, math_node("MULTIPLY", grid(1, 0.05), 0.07))
    rgb = nt.nodes.new("ShaderNodeCombineColor")
    for i in range(3):
        nt.links.new(shade, rgb.inputs[i])
    nt.links.new(rgb.outputs[0], bsdf.inputs["Base Color"])
    return m


def _setup_scene(ground_z, extent):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.eevee.taa_render_samples = 32
    sc.render.resolution_x = sc.render.resolution_y = VIEW_PX
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.dither_intensity = 0  # dither noise made the PNGs several times bigger
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.view_settings.view_transform = "Standard"  # hex colours come out as authored
    sc.view_settings.look = "None"

    world = bpy.data.worlds.new("_preview_world")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (*BACKGROUND, 1)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = world

    def sun(name, rot, strength, shadow):
        light = bpy.data.lights.new(name, "SUN")
        light.energy = strength
        light.angle = math.radians(3)
        light.use_shadow = shadow
        o = bpy.data.objects.new(name, light)
        o.rotation_euler = [math.radians(a) for a in rot]
        sc.collection.objects.link(o)

    sun("_key", (40, 0, -35), 3.2, True)  # from front-left, high
    sun("_fill", (60, 0, 150), 0.8, False)  # from behind-right
    sun("_rim", (100, 0, 90), 0.5, False)

    ground = bpy.data.meshes.new("_ground")
    s = extent * 40
    ground.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    g = bpy.data.objects.new("_ground", ground)
    g.location.z = ground_z - 0.01
    ground.materials.append(_grid_material("_grid_5m", fine=False))  # slot 0: 3/4 and side views
    ground.materials.append(_grid_material("_grid_1m", fine=True))  # slot 1: top view
    sc.collection.objects.link(g)

    # bloom on emissive parts
    sc.use_nodes = True
    nt = sc.node_tree
    rl = next(n for n in nt.nodes if n.type == "R_LAYERS")
    comp = next(n for n in nt.nodes if n.type == "COMPOSITE")
    glare = nt.nodes.new("CompositorNodeGlare")
    glare.glare_type = "FOG_GLOW"
    glare.quality = "HIGH"
    glare.threshold = 1.2
    glare.size = 7
    nt.links.new(rl.outputs["Image"], glare.inputs["Image"])
    nt.links.new(glare.outputs["Image"], comp.inputs["Image"])


def _camera(name, direction, up, target, scale):
    """Orthographic camera looking along -direction at target."""
    cam = bpy.data.cameras.new(name)
    cam.type = "ORTHO"
    cam.ortho_scale = scale
    cam.clip_start = 0.1
    cam.clip_end = 1000
    o = bpy.data.objects.new(name, cam)
    d = Vector(direction).normalized()
    o.location = Vector(target) + d * 200
    o.rotation_euler = _look(d, Vector(up))
    bpy.context.scene.collection.objects.link(o)
    return o


def _look(d, up):
    from mathutils import Matrix

    z = d  # camera +Z points away from what it looks at
    x = up.cross(z).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed().to_euler()


def _label(cam, lines, scale, size=0.06):
    """Black text in the top-left corner of the camera's view."""
    mat = _emission_mat("_label", (0.02, 0.02, 0.02))
    objs = []
    for i, text in enumerate(lines):
        curve = bpy.data.curves.new(f"_label{i}", "FONT")
        curve.body = text
        curve.size = scale * (size if i == 0 else size * 0.7)
        curve.materials.append(mat)
        o = bpy.data.objects.new(f"_label{i}", curve)
        o.parent = cam
        y = scale / 2 - scale * 0.03 - scale * size * (1 + 1.05 * i)
        o.location = (-scale / 2 + scale * 0.03, y, -1)
        bpy.context.scene.collection.objects.link(o)
        objs.append(o)
    return objs


def _read_png(path):
    img = bpy.data.images.load(str(path))
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def write_png(path, arr):
    """Save an (h, w, 4) float array (rows bottom to top, Blender's order) as PNG."""
    h, w, _ = arr.shape
    img = bpy.data.images.new("_out", w, h, alpha=False)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    sc = bpy.context.scene
    sc.view_settings.view_transform = "Standard"  # save_render applies it: Standard leaves sRGB pixels as they are
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0
    sc.view_settings.gamma = 1
    settings = sc.render.image_settings
    settings.file_format = "PNG"
    settings.color_mode = "RGB"
    settings.color_depth = "8"
    settings.compression = 100
    img.save_render(str(path), scene=bpy.context.scene)  # honours the settings above (8-bit RGB)
    bpy.data.images.remove(img)


def _neighbours(meshes, step=8.0):
    """Barricades: grey-tinted copies of the module at x -8 and +8, to show how it tiles."""
    tint = bpy.data.materials.new("_neighbour")
    tint.use_nodes = True
    next(n for n in tint.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.25, 0.25, 0.27, 1)
    out = []
    for o in meshes:
        for dx in (-step, step):
            c = o.copy()
            c.data = o.data.copy()
            c.location.x += dx
            for i in range(len(c.data.materials)):
                c.data.materials[i] = tint if dx < 0 else c.data.materials[i]
            bpy.context.scene.collection.objects.link(c)
            out.append(c)
    return out


def render_preview(out_path, title, subtitle, objs, flier=False, tile_x=False):
    """Render three views of `objs` (the model's objects) side by side into out_path.
    tile_x: also draw the module's neighbours at x -8 (grey) and +8 (coloured), for barricades."""
    from .check import world_bbox

    meshes = [o for o in objs if o.type == "MESH"]
    lo, hi = world_bbox(meshes)
    centre = (lo + hi) / 2
    ground_z = min(0.0, lo.z) if not flier else lo.z - 1.0
    extent = max((hi - lo).length / 2, 1.0)
    _setup_scene(ground_z, extent)
    for name, hex_str in TINT_SAMPLES.items():
        m = bpy.data.materials.get(name)
        if m is not None:
            from .materials import linear

            bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            bsdf.inputs["Base Color"].default_value = linear(hex_str)
    neighbours = _neighbours(meshes) if tile_x else []

    scale = extent * 2.25
    views = [
        ("3/4 front-left", (1.0, -1.25, 0.95), (0, 0, 1)),
        ("left side", (1, 0, 0.25), (0, 0, 1)),
        ("top (front up)", (0, 0, 1), (0, -1, 0)),
    ]
    out = Path(out_path)
    tmp = []
    sc = bpy.context.scene
    for i, (name, direction, up) in enumerate(views):
        cam = _camera(f"_cam{i}", direction, up, centre, scale)
        labels = _label(cam, [title, subtitle] if i == 0 else [name], scale)
        sc.camera = cam
        bpy.data.objects["_ground"].data.polygons[0].material_index = 1 if i == 2 else 0
        for o in neighbours:
            o.hide_render = i == 1  # not in the side view, where they would stack up behind
        p = out.with_name(f".{out.stem}_{i}.png")
        sc.render.filepath = str(p)
        bpy.ops.render.render(write_still=True)
        tmp.append(p)
        for o in labels:
            o.hide_render = True
    arr = np.concatenate([_read_png(p) for p in tmp], axis=1)
    write_png(out, arr)
    for p in tmp:
        os.remove(p)

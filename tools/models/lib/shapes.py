"""Shape helpers: each makes one mesh object, in world coordinates, origin where the caller says.

Conventions shared by every helper:
- `at` is where the shape's centre goes (world, metres). Blender axes: Z up, the model faces -Y,
  its left is +X.
- `rot` is an XYZ Euler rotation in degrees about the shape's centre. It is baked into the mesh,
  so the object itself always has rotation 0 and scale 1.
- `pivot` is the object origin (the animation pivot). Default: the shape's centre (`at`), or the
  first point for `limb`. Pass a world point to put it elsewhere, e.g. pivot=(x, y, 0).
- `sharp` is the auto-smooth angle in degrees: edges sharper than this are shaded flat. Default 40.
  Use `sharp=0` for a fully faceted look (bug shells), 180 for fully smooth.
- `mat` is a material from lib.materials (or a list, see `paint`).
"""

import math
import re

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

DEFAULT_SHARP = 40.0


# ----------------------------------------------------------------------------------------------
# internals


def _xform(at, rot):
    return Matrix.Translation(Vector(at)) @ Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()


def _object(name, bm, mat, pivot, sharp):
    """Turn a bmesh (world coordinates) into an object whose origin is `pivot`."""
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if obj.name != name:
        raise ValueError(f"an object named {name!r} already exists")
    if mat is not None:
        for m in mat if isinstance(mat, (list, tuple)) else [mat]:
            me.materials.append(m)
    obj["_sharp"] = float(sharp)
    set_origin(obj, pivot)
    return obj


def world_matrix(obj):
    """The object's world matrix from its own location/rotation/scale. (obj.matrix_world is stale
    until the depsgraph updates, which never happens on its own while a script runs.)"""
    return Matrix.LocRotScale(obj.location, obj.rotation_euler, obj.scale)


def _frame(direction, up=Vector((0, 0, 1))):
    """Two unit vectors perpendicular to `direction` (u roughly 'sideways', v roughly 'up')."""
    d = direction.normalized()
    ref = up if abs(d.dot(up)) < 0.95 else Vector((1, 0, 0))
    u = d.cross(ref).normalized()
    v = u.cross(d).normalized()
    return u, v


def _loft(bm, rings, sides, cap_start=True, cap_end=True, twist=0.0):
    """Connect rings of `sides` vertices. rings: list of (centre, u, v, rx, ry).

    A ring with rx == ry == 0 collapses to a single point (a pointed tip).
    """
    loops = []
    for c, u, v, rx, ry in rings:
        if rx == 0 and ry == 0:
            loops.append([bm.verts.new(c)])
            continue
        ring = []
        for i in range(sides):
            a = 2 * math.pi * i / sides + math.radians(twist)
            ring.append(bm.verts.new(c + u * (math.cos(a) * rx) + v * (math.sin(a) * ry)))
        loops.append(ring)
    for a, b in zip(loops, loops[1:]):
        if len(a) == 1 and len(b) == 1:
            raise ValueError("two pointed rings in a row")
        for i in range(sides):
            j = (i + 1) % sides
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], b[0], a[j]))
            else:
                bm.faces.new((a[i], b[i], b[j], a[j]))
    if cap_start and len(loops[0]) > 1:
        bm.faces.new(list(reversed(loops[0])))
    if cap_end and len(loops[-1]) > 1:
        bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def _bevel(obj, width, segments=1, angle=30):
    if width <= 0:
        return
    m = obj.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    m.harden_normals = False


# ----------------------------------------------------------------------------------------------
# shapes


def box(name, size, at=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, top=(1, 1), mat=None, pivot=None, sharp=DEFAULT_SHARP):
    """A box `size` = (x, y, z) metres centred at `at`.

    bevel: chamfer width on the edges (metres, 1 segment, applied at finish).
    top: (sx, sy) scale of the top face relative to the bottom: (0.6, 0.6) makes a frustum, a wedge
    with (1, 0.2).
    """
    bm = bmesh.new()
    sx, sy, sz = (s / 2 for s in size)
    rings = []
    for z, (kx, ky) in ((-sz, (1, 1)), (sz, top)):
        rings.append([Vector((x * sx * kx, y * sy * ky, z)) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    m = _xform(at, rot)
    vs = [[bm.verts.new(m @ p) for p in r] for r in rings]
    bm.faces.new(list(reversed(vs[0])))
    bm.faces.new(vs[1])
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vs[0][i], vs[0][j], vs[1][j], vs[1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _object(name, bm, mat, pivot if pivot is not None else at, sharp)
    _bevel(obj, bevel)
    return obj


def cylinder(name, r, h, at=(0, 0, 0), rot=(0, 0, 0), r2=None, sides=8, bevel=0.0, mat=None, pivot=None, sharp=DEFAULT_SHARP, caps=True):
    """A cylinder along Z (before `rot`), radius r, height h, centred at `at`.

    r2: top radius (frustum); r2=0 makes a cone with a pointed tip. sides: number of facets.
    To lay it along Y (a barrel pointing forward) use rot=(90, 0, 0): the top (r2) end then points -Y.
    """
    r2 = r if r2 is None else r2
    m = _xform(at, rot)
    mr = m.to_3x3()
    u, v = mr @ Vector((1, 0, 0)), mr @ Vector((0, 1, 0))
    c0, c1 = m @ Vector((0, 0, -h / 2)), m @ Vector((0, 0, h / 2))
    bm = bmesh.new()
    _loft(bm, [(c0, u, v, r, r), (c1, u, v, r2, r2)], sides, caps, caps, twist=180 / sides)
    obj = _object(name, bm, mat, pivot if pivot is not None else at, sharp)
    _bevel(obj, bevel)
    return obj


def cone(name, r, h, at=(0, 0, 0), rot=(0, 0, 0), sides=8, mat=None, pivot=None, sharp=DEFAULT_SHARP, cap=True):
    """A cone along Z, base radius r, height h, centred at `at`, tip at +Z (before `rot`).
    cap=False leaves the base open (for a spike sunk into a body: saves the hidden triangles)."""
    return cylinder(name, r, h, at, rot, r2=0, sides=sides, mat=mat, pivot=pivot, sharp=sharp, caps=cap)


def ellipsoid(name, radii, at=(0, 0, 0), rot=(0, 0, 0), segments=8, rings=6, ico=0, deform=None, mat=None, pivot=None, sharp=DEFAULT_SHARP, poles="Z"):
    """A sphere stretched to `radii` = (rx, ry, rz), centred at `at`.

    segments/rings: UV sphere resolution (8x6 = 80 triangles). ico=1 or 2 uses an icosphere instead
    (80 / 320 triangles), which gives an even, faceted shell with sharp=0.
    deform: optional f(Vector) -> Vector applied to each vertex after stretching, before `rot` and
    `at` (local coordinates, centre at 0). Use it to taper, flatten the belly, pull out a point.
    poles: the axis the UV sphere's poles lie on, "Z" (default), "Y" or "X". With poles="Y" on a
    long body the rings run around it like an insect's segments (paint alternate rings for bands)
    and the ends come to a point.
    """
    bm = bmesh.new()
    if ico:
        bmesh.ops.create_icosphere(bm, subdivisions=ico, radius=1.0)
    else:
        bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0)
    m = _xform(at, rot)
    swap = {"Z": lambda c: c, "Y": lambda c: Vector((c.x, -c.z, c.y)), "X": lambda c: Vector((c.z, c.y, -c.x))}[poles]
    for vert in bm.verts:
        c = swap(vert.co)
        p = Vector((c.x * radii[0], c.y * radii[1], c.z * radii[2]))
        if deform:
            p = Vector(deform(p))
        vert.co = m @ p
    return _object(name, bm, mat, pivot if pivot is not None else at, sharp)


def limb(name, points, radii, sides=4, mat=None, pivot=None, sharp=DEFAULT_SHARP, flat=1.0, twist=45.0, floor=None):
    """A tapered tube through `points` (world), e.g. hip -> knee -> foot. Origin at points[0].

    radii: one radius per point; 0 at the last point gives a pointed tip (a claw).
    sides: 3-6 facets around (4 is a diamond profile with twist=45, cheap and reads well).
    flat: squash the cross-section (0.6 = flatter, blade-like legs).
    Each ring is perpendicular to the average direction of its two segments, so knees don't pinch.
    floor: clamp vertices below this z up to it (floor=0 gives a slanted leg a flat sole on the ground).
    """
    pts = [Vector(p) for p in points]
    if len(pts) != len(radii) or len(pts) < 2:
        raise ValueError("limb needs at least 2 points and one radius per point")
    rings = []
    for i, p in enumerate(pts):
        d_in = (p - pts[i - 1]).normalized() if i > 0 else None
        d_out = (pts[i + 1] - p).normalized() if i < len(pts) - 1 else None
        d = d_in + d_out if d_in is not None and d_out is not None else (d_in if d_out is None else d_out)
        u, v = _frame(d)
        rings.append((p, u, v, radii[i], radii[i] * flat))
    bm = bmesh.new()
    _loft(bm, rings, sides, twist=twist)
    if floor is not None:
        for vert in bm.verts:
            vert.co.z = max(vert.co.z, floor)
    return _object(name, bm, mat, pivot if pivot is not None else pts[0], sharp)


def hull(name, sections, mat=None, pivot=(0, 0, 0), sharp=DEFAULT_SHARP, inset=(False, False)):
    """A body lofted through cross-sections along Y, mirrored across X: car bodies, vans, buses.

    sections: [(y, [(x, z), ...]), ...] front (-Y) to back. Each list is the right half of the
    cross-section (x >= 0), from the bottom centre (x = 0) round to the top centre (x = 0); every
    section has the same number of points. The ends are closed with a fan from their centre, so no
    face spans the whole width. Keep the sections and the points close (about 1 m) wherever the
    surface must deform (the game dents car panels in the vertex shader).
    inset: (front, back); True adds a ring halfway in on that end's cap, so a big flat end (a van's
    back doors) has no long edges either. Costs 2 triangles per section point.
    """
    n = len(sections[0][1])
    if any(len(pts) != n for _, pts in sections) or n < 3:
        raise ValueError("every section needs the same number of points (at least 3)")
    bm = bmesh.new()
    rings = []
    for y, pts in sections:
        half = [Vector((x, y, z)) for x, z in pts]
        other = [Vector((-p.x, y, p.z)) for p in reversed(half[1:-1])]
        rings.append([bm.verts.new(p) for p in half + other])
    m = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(m):
            j = (i + 1) % m
            bm.faces.new((a[i], a[j], b[j], b[i]))
    for ring, half in ((rings[0], inset[0]), (rings[-1], inset[1])):
        centre = sum((v.co for v in ring), Vector()) / m
        if half:
            inner = [bm.verts.new(centre.lerp(v.co, 0.5)) for v in ring]
            for i in range(m):
                j = (i + 1) % m
                bm.faces.new((ring[i], ring[j], inner[j], inner[i]))
            ring = inner
        c = bm.verts.new(centre)
        for i in range(m):
            bm.faces.new((c, ring[i], ring[(i + 1) % m]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, mat, pivot, sharp)


# ----------------------------------------------------------------------------------------------
# object operations


def set_origin(obj, point):
    """Move the object's origin (its animation pivot) to a world point; the geometry stays put."""
    p = Vector(point)
    offset = p - obj.location
    obj.data.transform(Matrix.Translation(-offset))
    obj.location = obj.location + offset
    return obj


def side_name(name):
    """'leg_L1' -> 'leg_R1', 'jaw_R' -> 'jaw_L', 'sway_antenna_L' -> 'sway_antenna_R'."""
    out, n = re.subn(r"(?<=_)([LR])(?=\d|_|$)", lambda m: "R" if m.group(1) == "L" else "L", name, count=1)
    if n == 0:
        raise ValueError(f"{name!r} has no _L/_R side marker to swap")
    return out


def mirror(obj, name=None):
    """Copy `obj` to the other side of the model (mirrored across X) as a separate object.

    The copy gets the mirrored pivot, flipped normals fixed, the same materials, modifiers and custom
    properties, and the name with L and R swapped (leg_L1 -> leg_R1) unless `name` is given.
    """
    new_name = name or side_name(obj.name)
    me = obj.data.copy()
    me.name = new_name
    me.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    copy = bpy.data.objects.new(new_name, me)
    bpy.context.scene.collection.objects.link(copy)
    if copy.name != new_name:
        raise ValueError(f"an object named {new_name!r} already exists")
    copy.location = (-obj.location.x, obj.location.y, obj.location.z)
    for k in obj.keys():
        copy[k] = obj[k]
    for mod in obj.modifiers:
        m = copy.modifiers.new(mod.name, mod.type)
        for prop in mod.bl_rna.properties:
            if not prop.is_readonly and prop.identifier not in ("name", "type"):
                try:
                    setattr(m, prop.identifier, getattr(mod, prop.identifier))
                except (AttributeError, TypeError):
                    pass
    return copy


def apply_modifiers(obj):
    """Bake the object's modifiers into its mesh (finish() does this for every object)."""
    if not obj.modifiers:
        return obj
    dg = bpy.context.evaluated_depsgraph_get()
    old = obj.data
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    obj.modifiers.clear()
    obj.data = me
    me.name = obj.name
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def join(name, objs, pivot=None):
    """Merge several objects into one named `name` (materials kept, modifiers applied first).

    pivot: the merged object's origin; default the first object's origin.
    """
    objs = list(objs)
    for o in objs:
        apply_modifiers(o)
    bpy.context.view_layer.update()  # join reads matrix_world
    target = objs[0]
    p = Vector(pivot) if pivot is not None else target.location.copy()
    sharp = min(o.get("_sharp", DEFAULT_SHARP) for o in objs)
    with bpy.context.temp_override(active_object=target, selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    target.name = name
    target.data.name = name
    target["_sharp"] = sharp
    return set_origin(target, p)


def paint(obj, mat, where):
    """Give some faces of `obj` another material. where: f(face_centre: Vector (world)) -> bool.

    Example: paint(body, dark, lambda c: c.z < 0.8) for a darker belly.
    """
    me = obj.data
    if mat.name not in [m.name for m in me.materials if m]:
        me.materials.append(mat)
    idx = [m.name for m in me.materials].index(mat.name)
    mw = world_matrix(obj)
    for poly in me.polygons:
        if where(mw @ poly.center):
            poly.material_index = idx
    return obj


def cut(obj, normal, offsets):
    """Cut the mesh along parallel planes {p : normal . p = d} for each d in offsets (world).

    Adds edges only (no new parts), so paint() can then colour bands: stripes, panel lines.
    Example: cut(board, (1, 0, 1), [k * 0.8 for k in range(-6, 7)]) for 45 degree stripes.
    """
    n = Vector(normal).normalized()
    raw = Vector(normal).length
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    loc = obj.location
    for d in offsets:
        d = d / raw  # offsets are in the units of the given (unnormalised) normal
        co = n * d - loc  # a point on the plane, in object space
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=n, dist=1e-5)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def props(obj, phase=None, amp=None):
    """Set the optional motion overrides the game reads: phase (0..1), amp (0..2)."""
    if phase is not None:
        obj["phase"] = float(phase)
    if amp is not None:
        obj["amp"] = float(amp)
    return obj


def empty(name, at):
    """An Empty (a named point), e.g. the tower's `muzzle` at the barrel tip."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.5
    e.location = at
    bpy.context.scene.collection.objects.link(e)
    return e

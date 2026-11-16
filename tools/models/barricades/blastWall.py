"""Blast wall: a tall steel-grey slab with raked buttress ribs on both faces, a dark steel frame
(posts at the panel seams, a top lip), a yellow-and-black hazard stripe along the foot and bolts.
Panel seams sit at x = 0 and the module ends; stripes repeat every 2 m so the row is continuous.
8 x 6 x 8 m, <= 600 tris."""

import sys
from pathlib import Path

import bmesh
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403
from lib.shapes import _object  # noqa: E402

begin(__file__)

steel = mat("steel", "#5a5f66", rough=0.6, metal=0.4)
frame = mat("frame", "#363a40", rough=0.55, metal=0.5)
yellow = mat("yellow", "#f2c14e", rough=0.55)
black = mat("black", "#1e1f22", rough=0.7)

SLAB = 1.0  # half thickness of the slab
H = 7.4  # slab height; the lip takes it to 8


def wedge(name, x0, x1, pts):
    """A triangular prism from x0 to x1 whose cross-section is `pts` = [(y, z), ...] (3 points)."""
    bm = bmesh.new()
    a = [bm.verts.new(Vector((x0, y, z))) for y, z in pts]
    b = [bm.verts.new(Vector((x1, y, z))) for y, z in pts]
    bm.faces.new(list(reversed(a)))
    bm.faces.new(b)
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, steel, (0, 0, 0), 40)


parts = [box("slab", (8.0, 2 * SLAB, H), at=(0, 0, H / 2), mat=steel)]
parts.append(box("lip", (8.0, 2.8, 0.6), at=(0, 0, H + 0.3), mat=steel))
# frame posts at the panel seams (half posts at the module ends: neighbours complete them)
parts.append(box("post0", (0.4, 2 * SLAB + 0.25, H), at=(0, 0, H / 2), mat=frame))
for s in (-1, 1):
    parts.append(box(f"postE{s}", (0.2, 2 * SLAB + 0.25, H), at=(s * 3.9, 0, H / 2), mat=frame))

# raked buttress ribs on both faces, centred in each 4 m panel
for x in (-2.0, 2.0):
    for s in (-1, 1):
        parts.append(wedge(f"rib{x}{s}", x - 0.4, x + 0.4, [(s * SLAB, 0), (s * 3.0, 0), (s * SLAB, 6.4)]))

# hazard stripe along the foot, 45 degrees, 2 m period (8 m = 4 whole periods)
STRIPE = 1.0
for s in (-1, 1):
    b = box(f"haz{s}", (8.0, 0.08, 0.9), at=(0, s * (SLAB + 0.03), 0.45), mat=yellow)
    cut(b, (1, 0, 1), [k * STRIPE for k in range(-4, 10)])
    paint(b, black, lambda c: int((c.x + c.z) // STRIPE) % 2 == 1)
    parts.append(b)

# bolts: two rows on each face, clear of the ribs and posts
for s in (-1, 1):
    for x in (-3.2, -0.8, 0.8, 3.2):
        for z in (2.4, 6.6):
            parts.append(box(f"bolt{x}{z}{s}", (0.2, 0.1, 0.2), at=(x, s * (SLAB + 0.04), z), mat=frame))

join("blastWall", parts, pivot=(0, 0, 0))
finish()

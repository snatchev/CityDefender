"""Tesla coil: a tall slim electric pylon. A square deck with transformer boxes and insulator
stacks, a tapering column carrying three yellow rings that shrink toward the top, and a glowing
ball electrode. 7 m across, 15 m tall, <= 2500 tris."""

import math
import sys
from pathlib import Path

import bmesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403
from lib.shapes import _object  # noqa: E402

begin(__file__)

ACCENT = "#f5f06a"
paint_ = mat("paint", ACCENT, rough=0.5, metal=0.2)
dark = gunmetal()
metal = steel()
glow = accent_glow(ACCENT)
ball_mat = mat("ball", ACCENT, rough=0.2, emit=True, strength=3.0)


def torus(name, R, r, z, mat_, major=14, minor=6):
    """A ring of major radius R and tube radius r lying flat at height z, centred on the axis."""
    bm = bmesh.new()
    rows = []
    for i in range(major):
        a = 2 * math.pi * i / major
        row = []
        for j in range(minor):
            b = 2 * math.pi * j / minor + math.pi / minor
            rad = R + r * math.cos(b)
            row.append(bm.verts.new((rad * math.cos(a), rad * math.sin(a), z + r * math.sin(b))))
        rows.append(row)
    for i in range(major):
        for j in range(minor):
            i2, j2 = (i + 1) % major, (j + 1) % minor
            bm.faces.new((rows[i][j], rows[i][j2], rows[i2][j2], rows[i2][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, mat_, (0, 0, z), 40.0)


# ---- base (fixed): deck, transformer boxes, insulator stacks, column --------------------------
p = [box("plate", (6.6, 6.6, 0.6), at=(0, 0, 0.3), bevel=0.15, mat=dark)]
p.append(box("deck", (5.6, 5.6, 0.35), at=(0, 0, 0.77), top=(0.94, 0.94), bevel=0.1, mat=paint_))
for sx in (1, -1):
    for sy in (1, -1):
        cx, cy = sx * 2.3, sy * 2.3
        # transformer box at each corner, with cooling fins and a glowing slot
        p.append(box(f"xf{sx}{sy}", (1.7, 1.7, 1.9), at=(cx, cy, 1.9), top=(0.9, 0.9), bevel=0.1, mat=paint_))
        p.append(box(f"xflid{sx}{sy}", (1.8, 1.8, 0.25), at=(cx, cy, 2.95), bevel=0.06, mat=dark))
        p.append(box(f"xfglow{sx}{sy}", (0.12, 0.9, 0.3), at=(cx + sx * 0.86, cy, 1.9), mat=glow))
        # insulator stack: three flared discs on a post, leaning to the column
        for k in range(3):
            p.append(cylinder(f"ins{sx}{sy}{k}", 0.5 - k * 0.04, 0.22, at=(cx * (0.92 - k * 0.12), cy * (0.92 - k * 0.12), 3.2 + k * 0.32), r2=0.42, sides=8, mat=metal))
    # struts from the box tops up to the column: guy cables
p.append(cylinder("col_foot", 1.7, 1.2, at=(0, 0, 1.4), r2=1.2, sides=8, bevel=0.1, mat=dark))
p.append(cylinder("col_collar", 1.4, 0.35, at=(0, 0, 2.15), sides=8, mat=paint_))
p.append(cylinder("column", 1.0, 10.0, at=(0, 0, 7.0), r2=0.5, sides=8, mat=metal))
for sx in (1, -1):
    for sy in (1, -1):
        p.append(limb(f"cable{sx}{sy}", [(sx * 2.3, sy * 2.3, 3.0), (sx * 0.7, sy * 0.7, 6.0)], (0.1, 0.1), sides=4, mat=dark))
p.append(cylinder("neck", 0.7, 0.8, at=(0, 0, 12.4), r2=0.45, sides=8, mat=dark))
p.append(cylinder("neck_glow", 0.52, 0.3, at=(0, 0, 11.9), sides=8, mat=glow))
p.append(cylinder("cup", 1.1, 0.35, at=(0, 0, 12.9), r2=0.5, sides=10, mat=dark))
join("base", p, pivot=(0, 0, 0))

# ---- three stacked rings: smaller toward the top, each spins on the column's axis --------------
for idx, (R, z) in enumerate(((3.1, 5.4), (2.35, 8.0), (1.6, 10.3)), start=1):
    parts = [torus(f"ring{idx}", R, 0.34, z, paint_)]
    # four radial spokes carry the ring on the column; a bright arc segment marks the spin
    for k in range(4):
        a = math.radians(k * 90 + 45)
        parts.append(limb(f"spoke{idx}{k}", [(0.4 * math.cos(a), 0.4 * math.sin(a), z), ((R - 0.2) * math.cos(a), (R - 0.2) * math.sin(a), z)], (0.2, 0.14), sides=4, mat=metal))
    parts.append(box(f"node{idx}", (0.7, 0.7, 0.7), at=(R, 0, z), rot=(0, 0, 0), bevel=0.06, mat=glow))
    parts.append(box(f"nodeb{idx}", (0.7, 0.7, 0.7), at=(-R, 0, z), bevel=0.06, mat=glow))
    parts.append(cylinder(f"hub{idx}", 0.8, 0.4, at=(0, 0, z), sides=8, mat=dark))
    join(f"spin_ring_{idx}", parts, pivot=(0, 0, z))

# ---- electrode: a glowing ball on the cup -------------------------------------------------------
BALL_Z = 13.65
ball = ellipsoid("ball", (1.35, 1.35, 1.35), at=(0, 0, BALL_Z), segments=12, rings=8, sharp=180, mat=ball_mat)
spike = cone("spike", 0.2, 0.7, at=(0, 0, BALL_Z + 1.55), sides=6, mat=metal)
join("electrode", [ball, spike], pivot=(0, 0, BALL_Z))

empty("muzzle", (0, -0.01, BALL_Z))

finish()

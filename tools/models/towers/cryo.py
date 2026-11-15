"""Cryo Sprayer: pressurised tanks with a nozzle. A hexagonal pad carrying three insulated upright
tanks round a central column, hoses up to a swivel, and a rotating head with a flared spray horn and
frost fins. Pale ice blue with glowing cyan strips. 10 m across, 11 m tall, <= 2500 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

ACCENT = "#aef0ff"
CYAN = "#2fe6ff"
paint_ = mat("paint", ACCENT, rough=0.35, metal=0.1)
ice = mat("ice", "#6fb8dc", rough=0.3, metal=0.2)
dark = gunmetal()
metal = steel()
glow = mat("cyan_glow", CYAN, rough=0.3, emit=True, strength=2.5)

PAD = 0.6  # top of the base plate
TANK_H = 5.8
TANK_R = 1.65
HEAD_Z = 8.3  # bottom of the rotating head
COL_TOP = 7.55

# ---- base (fixed): pad, tanks, column, hoses, frost crystals -----------------------------------
parts = [
    cylinder("plate", 5.0, PAD, at=(0, 0, PAD / 2), sides=6, bevel=0.15, mat=dark),
    cylinder("pad_top", 4.5, 0.2, at=(0, 0, PAD + 0.1), sides=6, mat=ice),
    cylinder("column", 1.0, COL_TOP - PAD, at=(0, 0, (COL_TOP + PAD) / 2), sides=8, mat=metal),
    cylinder("collar", 1.7, 0.45, at=(0, 0, COL_TOP + 0.2), r2=1.45, sides=10, bevel=0.06, mat=dark),
    cylinder("collar_glow", 1.5, 0.1, at=(0, 0, COL_TOP + 0.46), sides=10, mat=glow),
    cylinder("manifold", 3.9, 0.35, at=(0, 0, PAD + 0.5), sides=6, mat=metal),
]
tank_pos = [(0.0, 2.55), (-2.3, -1.3), (2.3, -1.3)]
for i, (tx, ty) in enumerate(tank_pos):
    z0 = PAD + 0.2
    parts += [
        cylinder(f"tank{i}", TANK_R, TANK_H, at=(tx, ty, z0 + TANK_H / 2), sides=10, mat=paint_),
        ellipsoid(f"dome{i}", (TANK_R, TANK_R, 0.95), at=(tx, ty, z0 + TANK_H), segments=10, rings=4, mat=paint_),
        cylinder(f"foot{i}", TANK_R + 0.2, 0.5, at=(tx, ty, z0 + 0.25), sides=10, mat=dark),
        cylinder(f"band_a{i}", TANK_R + 0.1, 0.35, at=(tx, ty, z0 + 1.9), sides=10, mat=dark),
        cylinder(f"band_b{i}", TANK_R + 0.1, 0.35, at=(tx, ty, z0 + 4.5), sides=10, mat=dark),
        cylinder(f"valve{i}", 0.45, 0.6, at=(tx, ty, z0 + TANK_H + 1.0), sides=6, mat=metal),
        cylinder(f"valve_cap{i}", 0.7, 0.2, at=(tx, ty, z0 + TANK_H + 1.4), sides=6, mat=dark),
    ]
    # glowing level strip on the tank's outward face, between the two bands
    ox, oy = (tx, ty) if (tx or ty) else (0, 1)
    n = math.hypot(ox, oy)
    ox, oy = ox / n, oy / n
    parts.append(box(f"level{i}", (0.4, 0.3, 1.9), at=(tx + ox * (TANK_R + 0.02), ty + oy * (TANK_R + 0.02), z0 + 3.2),
                     rot=(0, 0, math.degrees(math.atan2(-ox, oy))), mat=glow))
    # hose from the valve to the column, arching just under the head's swivel
    parts.append(limb(f"hose{i}", [(tx, ty, 7.75), (tx * 0.65, ty * 0.65, 7.95), (ox * 1.1, oy * 1.1, 7.5)], (0.26, 0.26, 0.26), sides=6, mat=ice))
# frost crystals round the rim, between the tanks
for k, th in enumerate([60, 120, 180, 240, 300, 360, 30, 150, 270]):
    a = math.radians(th)
    r = 4.0 if k < 6 else 3.1
    h = 3.2 if k < 6 else 1.8
    parts.append(cone(f"crystal{k}", 0.75 if k < 6 else 0.45, h, at=(r * math.sin(a), -r * math.cos(a), PAD + h / 2 - 0.05),
                      rot=(8 * math.cos(a), 8 * math.sin(a), 0), sides=4, mat=paint_ if k < 6 else ice))
join("base", parts, pivot=(0, 0, 0))

# ---- turret: the head ---------------------------------------------------------------------------
HZ = HEAD_Z + 1.0  # head body centre
t = [
    cylinder("swivel", 1.75, 0.5, at=(0, 0, HEAD_Z + 0.25), sides=10, bevel=0.06, mat=dark),
    box("head", (3.2, 3.6, 1.9), at=(0, 0.2, HZ + 0.2), top=(0.85, 0.65), bevel=0.15, mat=paint_),
    box("head_low", (3.5, 3.0, 0.5), at=(0, 0.2, HEAD_Z + 0.65), bevel=0.08, mat=dark),
    box("head_glow", (0.15, 2.2, 0.4), at=(1.62, 0.2, HZ + 0.1), mat=glow),
    box("head_glow2", (0.15, 2.2, 0.4), at=(-1.62, 0.2, HZ + 0.1), mat=glow),
    cylinder("gauge", 0.6, 0.4, at=(0.0, 1.0, HZ + 1.35), sides=8, mat=metal),
    cylinder("gauge_face", 0.4, 0.1, at=(0.0, 1.0, HZ + 1.6), sides=8, mat=glow),
    box("compressor", (2.4, 1.1, 1.3), at=(0, 2.4, HZ - 0.1), top=(0.8, 0.9), bevel=0.1, mat=metal),
]
# frost fins: swept plates fanned out at the back and sides of the head
for s in (1, -1):
    t.append(box(f"fin_side{s}", (0.22, 2.6, 1.6), at=(s * 2.05, 0.9, HZ + 0.9), rot=(-12, 0, s * 16), top=(1, 0.5), bevel=0.05, mat=ice))
    t.append(box(f"fin_back{s}", (0.22, 2.4, 1.8), at=(s * 0.95, 2.7, HZ + 1.55), rot=(-22, 0, s * -8), top=(1, 0.5), bevel=0.05, mat=ice))
join("turret", t, pivot=(0, 0, HEAD_Z))

# ---- kick_nozzle: the flared spray horn, jumps back when it sprays -----------------------------
NZ = HZ + 0.15  # axis height
Y0 = -1.9
LEN = 3.6
tip = Y0 - LEN
k = [
    cylinder("neck", 0.85, 1.2, at=(0, Y0 + 0.4, NZ), rot=(90, 0, 0), sides=10, bevel=0.05, mat=metal),
    cylinder("horn", 0.9, LEN, at=(0, Y0 - LEN / 2, NZ), rot=(90, 0, 0), r2=2.2, sides=12, mat=paint_),
    cylinder("lip", 2.4, 0.4, at=(0, tip + 0.1, NZ), rot=(90, 0, 0), sides=12, bevel=0.06, mat=dark),
    cylinder("throat", 1.6, 0.1, at=(0, tip - 0.12, NZ), rot=(90, 0, 0), sides=12, mat=glow),
    cylinder("ring_a", 1.35, 0.3, at=(0, Y0 - 1.3, NZ), rot=(90, 0, 0), sides=12, mat=dark),
    cylinder("ring_b", 1.75, 0.3, at=(0, Y0 - 2.4, NZ), rot=(90, 0, 0), sides=12, mat=dark),
]
join("kick_nozzle", k, pivot=(0, Y0, NZ))

empty("muzzle", (0, tip - 0.2, NZ))

finish()

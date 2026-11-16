"""Mortar: a big gun pointing at the sky. A wide low octagonal plate with an orange recoil ring,
a sandbag wall round the back, a rack of spare shells, a rotating yoke and a short fat tube raised
60 degrees. 15 m across, 12 m tall, <= 2500 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

ACCENT = "#ff7a45"
DARK_ACCENT, _, LIGHT_ACCENT = shades(ACCENT, dark=0.6)
paint_ = mat("paint", ACCENT, rough=0.5, metal=0.2)
bags = mat("bags", "#d4562a", rough=0.9)
dark = gunmetal()
metal = steel()
glow = accent_glow(ACCENT)

# trunnion (tube pivot) and the tube axis: 60 degrees above horizontal, pointing -Y
P = (0.0, 0.0, 5.7)
ELEV = 60
D = (0.0, -math.cos(math.radians(ELEV)), math.sin(math.radians(ELEV)))


def along(t, off=(0, 0, 0)):
    return (P[0] + D[0] * t + off[0], P[1] + D[1] * t + off[1], P[2] + D[2] * t + off[2])


TILT = 90 - ELEV  # rot X that points a cylinder's +Z along D

# ---- base (fixed) ------------------------------------------------------------------------------
parts = [
    cylinder("plate", 8.0, 0.6, at=(0, 0, 0.3), sides=8, bevel=0.2, mat=dark),
    cylinder("ring_out", 6.7, 0.5, at=(0, 0, 0.8), sides=12, mat=paint_),
    cylinder("ring_in", 5.4, 0.55, at=(0, 0, 0.85), sides=12, mat=dark),
    cylinder("pedestal", 2.6, 2.1, at=(0, 0, 1.9), r2=2.0, sides=12, mat=metal),
    cylinder("pedestal_skirt", 3.4, 0.5, at=(0, 0, 1.3), r2=2.5, sides=12, mat=dark),
]
for k in range(8):  # glowing studs set in the dark ring
    b = math.radians(k * 45 + 22.5)
    parts.append(box(f"stud{k}", (1.6, 0.35, 0.16), at=(4.6 * math.sin(b), -4.6 * math.cos(b), 1.16), rot=(0, 0, k * 45 + 22.5), mat=glow))
# bolts round the plate rim
for k in range(0):
    b = math.radians(k * 45)
    parts.append(cylinder(f"bolt{k}", 0.3, 0.3, at=(7.0 * math.sin(b), -7.0 * math.cos(b), 0.7), sides=6, mat=metal))
# sandbag wall: two courses from -110 to +110 degrees round the back (+Y), open at the front
for course, (n, z, R, a0, a1) in enumerate([(9, 1.45, 6.4, 78, 282), (6, 2.2, 6.4, 100, 260)]):
    for i in range(n):
        th = a0 + (a1 - a0) * i / (n - 1)  # 0 = front (-Y)
        a = math.radians(th)
        parts.append(ellipsoid(f"bag{course}_{i}", (1.55, 0.95, 0.6), at=(R * math.sin(a), -R * math.cos(a), z + 0.25), rot=(0, 0, th),
                               segments=5, rings=3, mat=bags, sharp=60))
# spare shells in a rack between the sandbags and the pedestal
parts.append(box("rack_base", (6.2, 2.0, 0.35), at=(0, 4.1, 1.55), bevel=0.08, mat=dark))
parts.append(box("rack_rail", (6.2, 0.25, 0.3), at=(0, 4.1, 3.25), bevel=0.05, mat=dark))
for i in range(5):
    x = -2.4 + i * 1.2
    parts.append(cylinder(f"shell{i}", 0.55, 1.7, at=(x, 4.1, 2.55), sides=6, mat=metal))
    parts.append(cone(f"shell_tip{i}", 0.55, 1.1, at=(x, 4.1, 3.95), sides=6, mat=paint_))
    parts.append(cylinder(f"shell_band{i}", 0.58, 0.25, at=(x, 4.1, 2.1), sides=6, mat=paint_))
join("base", parts, pivot=(0, 0, 0))

# ---- turret: turntable, yoke cheeks, trunnion hubs, elevation strut -----------------------------
TZ = 3.0  # top of the pedestal
t = [
    cylinder("table", 3.7, 0.7, at=(0, 0, TZ + 0.35), sides=12, bevel=0.1, mat=dark),
    cylinder("table_top", 3.3, 0.4, at=(0, 0, TZ + 0.9), sides=12, mat=paint_),
]
for s in (1, -1):
    t += [
        # yoke cheek: a tall plate, sloped front edge, orange
        box(f"cheek{s}", (0.75, 3.6, 4.2), at=(s * 2.85, 0.2, TZ + 2.8), top=(1, 0.6), bevel=0.12, mat=paint_),
        cylinder(f"hub{s}", 0.95, 0.5, at=(s * 3.35, 0, P[2]), rot=(0, 90, 0), sides=10, bevel=0.06, mat=metal),
        cylinder(f"hub_cap{s}", 0.45, 0.3, at=(s * 3.7, 0, P[2]), rot=(0, 90, 0), sides=8, mat=glow),
        box(f"brace{s}", (1.2, 3.2, 0.5), at=(s * 2.3, 0.1, TZ + 1.3), bevel=0.08, mat=dark),
        # recoil buffer: a short piston lying alongside the tube
        cylinder(f"buffer{s}", 0.32, 3.2, at=(s * 2.4, -0.9, P[2] - 2.0), rot=(90, 0, 0), sides=6, mat=metal),
    ]
t.append(limb("strut", [(0, 1.2, TZ + 0.9), (0, 0.9, P[2] - 1.4)], (0.38, 0.3), sides=6, mat=metal))
t.append(box("back_plate", (4.2, 0.5, 2.2), at=(0, 2.0, TZ + 1.9), rot=(-14, 0, 0), top=(0.8, 1), bevel=0.1, mat=paint_))
t.append(box("hatch", (1.5, 1.5, 0.35), at=(0, 1.2, TZ + 1.3), bevel=0.06, mat=dark))
join("turret", t, pivot=(0, 0, TZ))

# ---- kick_tube: the barrel, jumps back down its own axis when it fires --------------------------
TUBE_LEN = 8.0
MOUTH = 6.5  # distance of the mouth from the trunnion
k = [
    cylinder("tube", 1.85, TUBE_LEN, at=along(2.5), rot=(TILT, 0, 0), r2=2.1, sides=12, mat=paint_),
    cylinder("breech", 2.1, 0.9, at=along(-1.45), rot=(TILT, 0, 0), r2=1.6, sides=12, bevel=0.08, mat=dark),
    cylinder("mouth_ring", 2.35, 0.55, at=along(MOUTH - 0.15), rot=(TILT, 0, 0), sides=12, bevel=0.07, mat=metal),
    cylinder("mouth_glow", 1.5, 0.1, at=along(MOUTH + 0.14), rot=(TILT, 0, 0), sides=12, mat=dark),
]
for tt in (0.6, 2.4, 4.2):
    k.append(cylinder(f"band{tt}", 2.0 + 0.02 * tt, 0.5, at=along(tt), rot=(TILT, 0, 0), sides=12, mat=dark))
# a lifting handle and a sight on top of the tube
k.append(box("sight", (0.5, 1.1, 0.5), at=along(1.6, (0, 0, 1.9)), rot=(-ELEV + 90 - 90 + 0, 0, 0), bevel=0.06, mat=dark))
join("kick_tube", k, pivot=P)

empty("muzzle", along(MOUTH + 0.2))

finish()

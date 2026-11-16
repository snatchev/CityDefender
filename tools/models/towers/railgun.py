"""Railgun: a long needle. A small square base, a low sleek rotating body with capacitor banks at the
back and two parallel rails reaching 15 m forward with a glowing violet strip between them.
9 m wide, 8 m tall, rails 15 m forward, <= 2500 tris."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

ACCENT = "#a970ff"
DARK_ACCENT, _, _ = shades(ACCENT, dark=0.55)
paint_ = mat("paint", ACCENT, rough=0.4, metal=0.3)
deep = mat("deep", DARK_ACCENT, rough=0.45, metal=0.3)
dark = gunmetal()
metal = steel()
glow = accent_glow(ACCENT)

TIP = -15.0
AX = 5.0  # axis height of the rails

# ---- base (fixed): square plate, step, pedestal ---------------------------------------------
parts = [
    box("plate", (8.6, 8.2, 0.6), at=(0, 0, 0.3), bevel=0.3, mat=dark),
    box("plate_inlay", (7.4, 7.0, 0.2), at=(0, 0, 0.65), bevel=0.1, mat=paint_),
    box("plate_core", (5.0, 5.0, 0.25), at=(0, 0, 0.8), bevel=0.1, mat=dark),
    box("pedestal", (3.4, 3.4, 2.6), at=(0, 0, 1.9), top=(0.7, 0.7), bevel=0.15, mat=metal),
]
for sx in (1, -1):
    for sy in (1, -1):
        parts.append(cylinder(f"bolt{sx}{sy}", 0.3, 0.3, at=(sx * 3.7, sy * 3.5, 0.75), sides=6, mat=metal))
    parts.append(box(f"plate_glow{sx}", (0.18, 3.0, 0.14), at=(sx * 3.1, 0, 0.78), mat=glow))
join("base", parts, pivot=(0, 0, 0))

# ---- turret: sleek body, capacitor banks at the back ---------------------------------------
TZ = 3.2
t = [
    cylinder("ring", 2.2, 0.5, at=(0, 0, TZ + 0.1), sides=8, bevel=0.08, mat=dark),
    ellipsoid("hull", (2.0, 4.3, 1.3), at=(0, 0.0, AX - 0.2), segments=10, rings=6, poles="Y", mat=paint_),
    box("deck", (3.4, 6.4, 0.55), at=(0, 0.4, TZ + 0.55), bevel=0.1, top=(0.8, 1), mat=dark),
    box("spine", (0.9, 5.0, 0.4), at=(0, 0.2, AX + 1.0), bevel=0.08, mat=deep),
    box("spine_glow", (0.3, 3.2, 0.12), at=(0, 0.0, AX + 1.25), mat=glow),
    box("breech", (2.4, 1.2, 1.8), at=(0, -2.4, AX), top=(0.7, 0.9), bevel=0.1, mat=deep),
    box("sight", (0.6, 1.2, 0.6), at=(-0.9, -0.9, AX + 1.2), bevel=0.06, mat=dark),
    box("back_plate", (3.6, 0.5, 2.0), at=(0, 4.1, AX - 0.2), rot=(14, 0, 0), top=(0.8, 1), bevel=0.1, mat=paint_),
]
# capacitor banks: two rows of upright cells at the back, one taller; glowing caps
for s in (1, -1):
    for row, (y, h) in enumerate([(2.5, 3.5), (0.9, 2.5)]):
        x = s * 2.45
        z0 = TZ + 0.8
        t += [
            cylinder(f"cell{s}{row}", 0.95, h, at=(x, y, z0 + h / 2), sides=8, bevel=0.05, mat=paint_),
            cylinder(f"cell_band{s}{row}", 1.02, 0.3, at=(x, y, z0 + 0.6), sides=8, mat=dark),
            cylinder(f"cell_cap{s}{row}", 0.7, 0.35, at=(x, y, z0 + h + 0.15), sides=8, mat=metal),
            cylinder(f"cell_core{s}{row}", 0.4, 0.15, at=(x, y, z0 + h + 0.38), sides=8, mat=glow),
        ]
    t.append(limb(f"cable{s}", [(s * 2.2, 2.0, TZ + 4.0), (s * 1.4, 1.3, AX + 1.6), (s * 0.7, -0.6, AX + 0.8)], (0.22, 0.2, 0.2), sides=6, mat=metal))
    t.append(box(f"cheek{s}", (0.5, 3.4, 1.4), at=(s * 1.2, -2.6, AX - 0.9), bevel=0.08, mat=dark))
join("turret", t, pivot=(0, 0, TZ))

# ---- kick_rails: two long rails, a violet strip between, braces ---------------------------------
RL = 14.0  # rail length, from y = -1 to the tip
YC = TIP + RL / 2
k = []
for s in (1, -1):
    k += [
        box(f"rail{s}", (0.8, RL, 1.4), at=(s * 0.95, YC, AX), bevel=0.1, mat=dark),
        box(f"rail_top{s}", (0.72, RL - 0.4, 0.2), at=(s * 0.95, YC, AX + 0.8), bevel=0.04, mat=paint_),
        box(f"rail_tip{s}", (0.8, 0.9, 0.9), at=(s * 0.95, TIP + 0.45, AX), top=(0.8, 0.3), mat=metal),
    ]
k.append(box("strip", (0.7, RL - 0.8, 0.22), at=(0, YC - 0.1, AX + 0.2), mat=glow))
k.append(box("floor", (1.1, RL - 1.2, 0.9), at=(0, YC, AX - 0.5), bevel=0.05, mat=deep))
for y in (-2.5, -5.5, -8.5, -11.5, -14.2):
    k.append(box(f"brace{y}", (3.0, 0.45, 1.9 if y > -14 else 1.4), at=(0, y, AX - 0.15), bevel=0.08, mat=metal))
    k.append(box(f"brace_glow{y}", (1.0, 0.1, 0.12), at=(0, y - 0.25, AX + 0.98), mat=glow))
join("kick_rails", k, pivot=(0, -1.0, AX))

empty("muzzle", (0, TIP, AX))

finish()

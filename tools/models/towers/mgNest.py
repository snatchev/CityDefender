"""MG nest: a rooftop machine-gun emplacement. An octagonal deck plate ringed by sloped blue armour
panels, a steel pedestal, and on it a turret with a gun shield and twin barrels.
13 m across, 10 m tall, <= 2500 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

ACCENT = "#2fb4ff"
DARK_ACCENT, _, _ = shades(ACCENT)
paint_ = mat("paint", ACCENT, rough=0.5, metal=0.2)
dark = gunmetal()
metal = steel()
glow = accent_glow(ACCENT)

GUN_Z = 6.6  # barrel axis height
TURRET_Z = 4.4  # top of the pedestal: where the turret sits

# ---- base (fixed): deck plate, armour ring, pedestal -------------------------------------------
parts = [cylinder("plate", 6.5, 0.6, at=(0, 0, 0.3), sides=8, bevel=0.15, mat=dark)]
R, PANEL_H = 5.75, 2.6
for k in range(8):
    th = k * 45  # 0 = straight ahead (-Y)
    a = math.radians(th)
    centre = (R * math.sin(a), -R * math.cos(a), 0.6 + PANEL_H / 2)
    parts.append(box(f"panel{k}", (4.35, 0.55, PANEL_H), at=centre, rot=(12, 0, th), bevel=0.12, mat=paint_))
    # a glowing strip along the top edge of every other panel
    if k % 2 == 0:
        top = (R * 1.08 * math.sin(a), -R * 1.08 * math.cos(a), 0.6 + PANEL_H - 0.05)
        parts.append(box(f"strip{k}", (2.6, 0.2, 0.22), at=top, rot=(12, 0, th), mat=glow))
    # bolt heads on the deck between panels
    b = math.radians(th + 22.5)
    parts.append(cylinder(f"bolt{k}", 0.28, 0.3, at=(6.0 * math.sin(b), -6.0 * math.cos(b), 0.7), sides=6, mat=metal))
parts.append(cylinder("pedestal", 1.05, TURRET_Z - 0.6, at=(0, 0, (TURRET_Z + 0.6) / 2), r2=0.8, sides=8, mat=metal))
parts.append(cylinder("flange", 2.0, 0.5, at=(0, 0, 0.85), r2=1.2, sides=8, mat=dark))
join("base", parts, pivot=(0, 0, 0))

# ---- turret (turns about the model origin) ------------------------------------------------------
t = [
    cylinder("ring", 2.3, 0.5, at=(0, 0, TURRET_Z + 0.25), sides=12, bevel=0.08, mat=dark),
    # receiver: a wedge-nosed box, blue on top
    box("receiver", (3.0, 4.6, 2.2), at=(0, 0.4, GUN_Z), top=(0.8, 0.85), bevel=0.15, mat=paint_),
    box("receiver_low", (3.3, 4.8, 0.9), at=(0, 0.4, GUN_Z - 1.45), bevel=0.1, mat=dark),
    # gun shield: a wide sloped plate with wings swept back
    box("shield", (5.6, 0.45, 3.1), at=(0, -2.1, GUN_Z + 0.2), rot=(-14, 0, 0), top=(0.8, 1), bevel=0.12, mat=paint_),
    # side wings: inner edge on the shield's edge, swept back
    box("wingL", (1.9, 0.4, 2.5), at=(2.65 + 0.8, -2.1 + 0.5, GUN_Z), rot=(-10, 0, 32), bevel=0.1, mat=paint_),
    box("wingR", (1.9, 0.4, 2.5), at=(-2.65 - 0.8, -2.1 + 0.5, GUN_Z), rot=(-10, 0, -32), bevel=0.1, mat=paint_),
    box("shield_glow", (3.6, 0.15, 0.25), at=(0, -2.5, GUN_Z + 1.25), rot=(-14, 0, 0), mat=glow),
    # ammo box on the left, feed chute to the receiver
    box("ammo", (1.4, 2.2, 1.5), at=(2.3, 1.1, GUN_Z - 0.45), bevel=0.12, mat=dark),
    box("ammo_lid", (1.5, 2.3, 0.3), at=(2.3, 1.1, GUN_Z + 0.4), bevel=0.08, mat=paint_),
    box("ammo_glow", (0.15, 1.7, 0.5), at=(3.02, 1.1, GUN_Z - 0.45), mat=glow),
    # sight block and a short mast on top
    box("sight", (0.7, 1.4, 0.6), at=(-0.7, -0.6, GUN_Z + 1.3), bevel=0.08, mat=dark),
    cylinder("mast", 0.09, 1.9, at=(0.8, 1.6, GUN_Z + 1.9), sides=4, mat=metal),
]
join("turret", t, pivot=(0, 0, TURRET_Z))

# ---- barrels (kick back when firing) -----------------------------------------------------------
TIP_Y = -7.0
b = []
for x in (0.6, -0.6):
    b += [
        cylinder(f"jacket{x}", 0.48, 2.6, at=(x, -3.3, GUN_Z), rot=(90, 0, 0), sides=8, bevel=0.06, mat=dark),
        cylinder(f"barrel{x}", 0.26, 2.7, at=(x, -5.5, GUN_Z), rot=(90, 0, 0), sides=6, mat=metal),
        cylinder(f"hider{x}", 0.32, 0.6, at=(x, TIP_Y + 0.3, GUN_Z), rot=(90, 0, 0), r2=0.42, sides=6, mat=dark),
    ]
join("kick_barrels", b, pivot=(0, -2.0, GUN_Z))

empty("muzzle", (0, TIP_Y, GUN_Z))

finish()

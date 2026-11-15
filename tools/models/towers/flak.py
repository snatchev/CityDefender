"""Flak battery: anti-aircraft gun. A round deck with four stabiliser legs, a rotating mount with a
gunner's shield, ammunition drums and four long barrels raised at 55 degrees, and a radar dish that
turns on its own mast at the back. 14 m across, 12 m tall, <= 2500 tris."""

import math
import sys
from mathutils import Vector
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

ACCENT = "#9fd66b"
paint_ = mat("paint", ACCENT, rough=0.55, metal=0.15)
dark = gunmetal()
metal = steel()
glow = accent_glow(ACCENT)

TURRET_Z = 3.4  # top of the pedestal: where the mount sits
ELEV = 55.0
DIR = Vector((0, -math.cos(math.radians(ELEV)), math.sin(math.radians(ELEV))))
BREECH = Vector((0, 1.6, 4.9))  # middle of the barrel cluster at the breech
RAD_Y = 5.6  # radar mast position

# ---- base (fixed): deck, stabiliser legs, pedestal, radar mast ---------------------------------
p = [cylinder("plate", 6.9, 0.6, at=(0, 0, 0.3), sides=16, mat=dark)]
p.append(cylinder("deck", 5.2, 0.35, at=(0, 0, 0.75), r2=4.6, sides=16, mat=paint_))
for k in range(4):
    th = 45 + k * 90
    a = math.radians(th)
    s, c = math.sin(a), -math.cos(a)
    # leg: a sloped arm from the pedestal out to a foot pad on the deck edge
    p.append(limb(f"leg{k}", [(2.6 * s, 2.6 * c, 2.2), (5.6 * s, 5.6 * c, 0.9)], (0.65, 0.5), sides=4, flat=1.0, mat=paint_))
    p.append(box(f"pad{k}", (1.8, 1.8, 0.35), at=(5.8 * s, 5.8 * c, 0.75), rot=(0, 0, th), mat=metal))
    p.append(cylinder(f"jack{k}", 0.3, 0.5, at=(5.8 * s, 5.8 * c, 1.1), sides=6, mat=dark))
    # bolts on the deck
    b = math.radians(th + 45)
p.append(cylinder("pedestal", 3.1, 2.4, at=(0, 0, 1.2 + 0.4), r2=2.5, sides=12, bevel=0.1, mat=paint_))
p.append(cylinder("pedestal_band", 3.2, 0.35, at=(0, 0, 1.2), sides=12, mat=dark))
p.append(box("pedestal_glow", (0.9, 0.12, 0.25), at=(0, -2.9, 2.0), rot=(-8, 0, 0), mat=glow))
# radar mast: footing and a slim tower with a lattice brace
p.append(cylinder("mast_foot", 0.9, 0.7, at=(0, RAD_Y, 1.0), r2=0.55, sides=8, mat=dark))
p.append(cylinder("mast", 0.3, 5.3, at=(0, RAD_Y, 4.0), sides=6, mat=metal))
p.append(box("mast_box", (1.0, 0.8, 0.8), at=(0, RAD_Y + 0.1, 2.2), mat=dark))
for sx in (1, -1):
    p.append(limb(f"brace{sx}", [(sx * 1.4, RAD_Y + 0.4, 0.9), (sx * 0.2, RAD_Y, 3.8)], (0.14, 0.1), sides=4, mat=metal))
join("base", p, pivot=(0, 0, 0))

# ---- turret (turns about the model origin): ring, cheeks, shield, drums, seat ------------------
t = [
    cylinder("ring", 3.5, 0.5, at=(0, 0, TURRET_Z + 0.25), sides=16, bevel=0.1, mat=dark),
    cylinder("deck_t", 3.25, 0.4, at=(0, 0, TURRET_Z + 0.7), r2=3.0, sides=16, mat=metal),
    cylinder("hub", 1.5, 1.4, at=(0, 0.2, TURRET_Z + 1.6), r2=1.2, sides=8, mat=dark),
]
for sx in (1, -1):
    # side cheeks that carry the trunnions
    t.append(box(f"cheek{sx}", (0.7, 3.4, 3.0), at=(sx * 2.5, 0.6, 5.0), top=(1, 0.7), bevel=0.1, mat=paint_))
    t.append(cylinder(f"trunnion{sx}", 0.5, 0.45, at=(sx * 2.95, 0.9, 5.2), rot=(0, 90, 0), sides=8, mat=metal))
    # ammunition drum on the outside of each cheek, with a feed chute to the breech
    t.append(cylinder(f"drum{sx}", 1.15, 2.0, at=(sx * 3.85, 0.6, 4.6), rot=(90, 0, 0), sides=8, mat=paint_))
    t.append(cylinder(f"drum_band{sx}", 1.22, 0.3, at=(sx * 3.85, 0.6, 4.6), rot=(90, 0, 0), sides=8, mat=dark))
    t.append(cylinder(f"drum_cap{sx}", 0.65, 0.15, at=(sx * 3.85, -0.45, 4.6), rot=(90, 0, 0), sides=8, mat=metal))
    t.append(box(f"drum_glow{sx}", (0.15, 0.9, 0.2), at=(sx * 5.0, 0.6, 4.6), mat=glow))
    t.append(box(f"chute{sx}", (1.2, 0.5, 0.5), at=(sx * 3.0, 1.3, 5.4), rot=(0, 0, 0), mat=dark))
    # gunner's shield wing, swept back
    t.append(box(f"wing{sx}", (1.6, 0.35, 2.2), at=(sx * 3.1, -1.7, 4.8), rot=(-12, 0, sx * 38), top=(0.85, 1), mat=paint_))
# gunner's shield: a wide plate sloped back, with a glowing sight slit
t.append(box("shield", (5.2, 0.5, 3.6), at=(0, -2.1, 5.3), rot=(-16, 0, 0), top=(0.85, 1), bevel=0.12, mat=paint_))
t.append(box("shield_glow", (2.4, 0.12, 0.28), at=(0, -2.45, 6.55), rot=(-16, 0, 0), mat=glow))
t.append(box("shield_lip", (5.4, 0.8, 0.35), at=(0, -2.5, 3.9), mat=dark))
# gunner's seat and back rest, behind the breech
t.append(box("seat", (1.5, 1.4, 0.5), at=(0, 2.8, 4.9), mat=dark))
t.append(box("backrest", (1.7, 0.4, 1.3), at=(0, 3.5, 5.6), rot=(-12, 0, 0), mat=paint_))
t.append(cylinder("seat_post", 0.2, 1.1, at=(0, 2.8, 4.3), sides=6, mat=metal))
join("turret", t, pivot=(0, 0, TURRET_Z))

# ---- barrels (kick back when firing): four tubes in two pairs on a cradle ----------------------
LEN = 8.8
b = []
for x in (1.25, -1.25):
    for dx in (0.45, -0.45):
        p0 = Vector((x + dx, BREECH.y, BREECH.z))
        p1 = p0 + DIR * LEN
        b.append(limb(f"tube{x}_{dx}", [p0, p1], (0.4, 0.3), sides=6, mat=dark))
        brake = p1 - DIR * 0.45
        b.append(cylinder(f"brake{x}_{dx}", 0.36, 0.9, at=tuple(brake), rot=(90 - ELEV, 0, 0), r2=0.36, sides=8, mat=metal))
        b.append(cylinder(f"coll{x}_{dx}", 0.42, 0.35, at=tuple(p0 + DIR * 4.4), rot=(90 - ELEV, 0, 0), sides=8, mat=metal))
# cradle sleeves clamp each pair together
for x in (1.25, -1.25):
    c = Vector((x, BREECH.y, BREECH.z)) + DIR * 1.6
    b.append(box(f"cradle{x}", (1.9, 1.3, 2.6), at=tuple(c), rot=(90 - ELEV, 0, 0), bevel=0.1, mat=paint_))
    c2 = Vector((x, BREECH.y, BREECH.z)) + DIR * 3.8
    b.append(box(f"clamp{x}", (1.9, 1.0, 0.5), at=tuple(c2), rot=(90 - ELEV, 0, 0), mat=dark))
c = Vector((0, BREECH.y, BREECH.z)) + DIR * 0.7
b.append(box("breech", (4.2, 1.5, 1.2), at=tuple(c), rot=(90 - ELEV, 0, 0), bevel=0.12, mat=dark))
c = Vector((0, BREECH.y, BREECH.z)) + DIR * 1.6
b.append(box("crossbar", (4.3, 0.5, 0.7), at=tuple(c + Vector((0, 0, 0.2))), rot=(90 - ELEV, 0, 0), mat=metal))
join("kick_barrels", b, pivot=tuple(BREECH))
tip = BREECH + DIR * (LEN + 0.4)
empty("muzzle", tuple(tip))

# ---- radar (spins all the time about its own vertical axis) ------------------------------------
RZ = 6.9
r = [
    cylinder("r_hub", 0.55, 0.5, at=(0, RAD_Y, RZ + 0.25), sides=8, mat=dark),
    cylinder("r_arm", 0.12, 1.4, at=(0, RAD_Y - 0.55, RZ + 1.25), rot=(-30, 0, 0), sides=4, mat=metal),
    cylinder("r_horn", 0.18, 0.4, at=(0, RAD_Y - 1.1, RZ + 1.9), r2=0.3, sides=6, mat=glow),
    cylinder("r_dish", 0.4, 0.8, at=(0, RAD_Y + 0.15, RZ + 1.15), rot=(-30, 0, 0), r2=1.8, sides=12, mat=paint_),
    box("r_back", (0.5, 0.5, 0.7), at=(0, RAD_Y + 0.45, RZ + 0.75), rot=(-30, 0, 0), mat=dark),
]
join("spin_radar", r, pivot=(0, RAD_Y, RZ))

finish()

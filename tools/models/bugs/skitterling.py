"""Skitterling: the swarm bug. Low, fast, nasty: a flat wedge head with hooked mandibles, a small
thorax, a pointed abdomen, and six long spidery legs with high knees. 9 x 8 x 3 m, <= 500 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

DARK, GREEN, LIGHT = shades("#7dff3a")
skin = mat("skin", GREEN, rough=0.45)
under = mat("under", DARK, rough=0.6)
claw = chitin()
eye = eye_glow()

# ---- body: head, thorax, abdomen (rigid, one object) -----------------------------------------
# a flat wedge of a head, carried low; the abdomen rides high behind it (a pouncing stance)
head = ellipsoid("head", (1.2, 1.05, 0.58), at=(0, -2.75, 1.15), segments=8, rings=5, sharp=0, mat=skin,
                 deform=lambda p: (p.x * (1 - 0.3 * max(0, -p.y)), p.y, p.z + 0.25 * max(0, p.y)))
thorax = ellipsoid("thorax", (1.15, 1.25, 0.75), at=(0, -1.15, 1.45), segments=8, rings=5, sharp=0, mat=skin)


def abdomen_shape(p):
    # taper to a point at the back and lift the tail
    t = max(0.0, p.y / 2.6)
    k = 1 - 0.75 * t * t
    return (p.x * k, p.y, p.z * k + 0.55 * t * t)


# poles along Y: the rings run around the abdomen like segments, and the tail comes to a point
abdomen = ellipsoid("abdomen", (1.75, 2.6, 1.05), at=(0, 1.75, 1.65), segments=8, rings=7, sharp=0, mat=skin,
                    deform=abdomen_shape, poles="Y")
RING = [1.75 - 2.6 * math.cos(math.pi * k / 7) for k in range(8)]  # ring boundaries along y
paint(abdomen, under, lambda c: RING[4] < c.y < RING[5])  # one dark band
eye_l = ellipsoid("eye_L", (0.3, 0.3, 0.24), at=(0.6, -3.3, 1.45), segments=5, rings=3, sharp=0, mat=eye)
eye_r = mirror(eye_l)
# three hooked spines along the back of the abdomen
spines = [cone(f"spine{i}", 0.32 - 0.05 * i, 1.1 - 0.15 * i, at=(0, y, z), rot=(-35, 0, 0), sides=4, cap=False, mat=claw)
          for i, (y, z) in enumerate([(0.55, 2.75), (1.55, 2.8), (2.55, 2.55)])]
body = join("body", [abdomen, thorax, head, eye_l, eye_r, *spines], pivot=(0, 0, 1.5))
paint(body, under, lambda c: c.z < 1.15)  # darker belly

# ---- legs: hip on the thorax side, high knee, foot on z = 0 ------------------------------------
#        hip (x, y, z)        knee                  ankle                 foot (tip)
LEGS = [
    ((0.85, -1.75, 1.3), (2.3, -2.9, 2.7), (3.4, -3.6, 1.3), (3.75, -3.95, 0.0)),  # 1: reaches forward
    ((0.95, -1.15, 1.3), (2.55, -1.0, 2.75), (3.7, -0.85, 1.3), (4.0, -0.8, 0.0)),  # 2: straight out
    ((0.85, -0.55, 1.3), (2.3, 0.75, 2.6), (3.3, 1.9, 1.25), (3.6, 2.4, 0.0)),  # 3: trails back
]
for i, pts in enumerate(LEGS, start=1):
    leg = limb(f"leg_L{i}", pts, (0.42, 0.26, 0.15, 0.0), sides=4, mat=under)
    paint(leg, claw, lambda c: c.z < 0.9)  # chitin claw tip
    mirror(leg)

# ---- mandibles: hinge at the side of the mouth, hook inward ------------------------------------
jaw = limb("jaw_L", [(0.5, -3.3, 1.0), (1.1, -4.0, 0.9), (0.2, -4.55, 0.75)], (0.3, 0.2, 0.0),
           sides=4, mat=claw, flat=0.6)
mirror(jaw)

# ---- antennae: swept back over the head ---------------------------------------------------------
ant = limb("sway_antenna_L", [(0.35, -3.2, 1.75), (0.9, -3.75, 2.55), (1.55, -3.2, 3.0)], (0.13, 0.08, 0.0),
           sides=3, mat=skin)
props(ant, amp=1.2)
mirror(ant)

finish()

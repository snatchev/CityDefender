"""Wasp Drone: a flier. A slim dart: small head, round thorax, a pinched waist, a long striped
abdomen curving down to a black stinger, and two pairs of long swept-back wings forming an X from
above. Body centre at the world origin. 7 x 9 x 3 m, <= 500 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

DARK, MAG, LIGHT = shades("#ff4fd8")
skin = mat("skin", MAG, rough=0.4)
band = mat("band", "#2a1030", rough=0.5)
claw = chitin()
eye = eye_glow()
wingm = mat("wing", "#ffd0f4", rough=0.25)

# ---- body (rigid): head, thorax, waist, abdomen, tucked legs -----------------------------------
head = ellipsoid("head", (0.85, 0.8, 0.7), at=(0, -3.0, 0.1), segments=8, rings=5, sharp=0, mat=skin,
                 deform=lambda p: (p.x, p.y * (1 + 0.2 * (p.y < 0)), p.z * (0.8 if p.z < 0 else 1)))
thorax = ellipsoid("thorax", (1.05, 1.25, 0.95), at=(0, -1.55, 0.2), segments=8, rings=5, sharp=0, mat=skin)
waist = ellipsoid("waist", (0.32, 0.55, 0.32), at=(0, -0.35, 0.05), segments=6, rings=3, sharp=0, mat=claw)


def abdomen_shape(p):
    t = (p.y + 2.0) / 4.0  # 0 at the waist, 1 at the tail
    k = 1 - 0.78 * t * t * t
    return (p.x * k, p.y, p.z * k - 1.15 * t * t)


abdomen = ellipsoid("abdomen", (1.0, 2.0, 0.95), at=(0, 1.35, 0.3), segments=8, rings=8, sharp=0, mat=skin,
                    deform=abdomen_shape, poles="Y")
RING = [1.35 - 2.0 * math.cos(math.pi * k / 8) for k in range(9)]
for k in (1, 3, 5, 7):
    paint(abdomen, band, lambda c, a=RING[k], b=RING[k + 1]: a < c.y < b)
eye_l = ellipsoid("eye_L", (0.34, 0.3, 0.34), at=(0.55, -3.45, 0.35), segments=5, rings=3, sharp=0, mat=eye)
eye_r = mirror(eye_l)
legs = []
for i, (y0, y1) in enumerate([(-2.1, -2.7), (-1.55, -1.7), (-1.0, -0.6)]):
    lg = limb(f"tuck_L{i}", [(0.5, y0, -0.45), (0.9, (y0 + y1) / 2, -0.95), (0.45, y1, -1.2)],
              (0.16, 0.12, 0.0), sides=3, mat=claw)
    legs += [lg, mirror(lg, f"tuck_R{i}")]
body = join("body", [abdomen, thorax, head, waist, eye_l, eye_r, *legs], pivot=(0, 0, 0))

# ---- stinger -------------------------------------------------------------------------------------
sting = limb("sway_stinger", [(0, 3.05, -1.0), (0, 3.45, -1.5), (0, 3.4, -2.0)], (0.28, 0.2, 0.0), sides=4, mat=claw)

# ---- wings: two pairs, swept back, flat blades; origin at each root --------------------------------
def wing(name, root, mid, tip, w):
    return limb(name, [root, mid, tip], (w * 0.35, w, 0.0), sides=4, mat=wingm, flat=0.07)


w1 = wing("wing_L1", (0.6, -1.95, 0.95), (2.4, -1.9, 1.2), (4.5, -0.5, 1.0), 0.95)
w2 = wing("wing_L2", (0.6, -1.25, 0.95), (2.1, -0.4, 1.1), (3.8, 2.3, 0.9), 0.8)
mirror(w1)
mirror(w2)

finish()

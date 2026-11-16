"""Acid Spitter: a siege bug. Silhouette: a ball on its back and a snout. A small teal body carries
a big bloated glowing acid sac, the head ends in a raised spout aimed forward and up like a short
mortar, and six legs are braced wide in a planted stance. 8 x 7 x 5 m, <= 1000 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

DARK, TEAL, LIGHT = shades("#2ef2c9")
skin = mat("skin", TEAL, rough=0.45)
under = mat("under", DARK, rough=0.6)
claw = chitin()
eye = eye_glow()
acid = mat("acid", "#c8ff3a", rough=0.25, emit=True, strength=1.5)

# ---- body: a low, wide carapace, heavy at the back; head slung forward ---------------------------
trunk = ellipsoid("trunk", (1.9, 2.7, 1.25), at=(0, 1.0, 2.1), segments=9, rings=6, sharp=0, mat=skin,
                  deform=lambda p: (p.x * (1 - 0.35 * max(0, p.y / 2.7) ** 2), p.y, p.z * (0.55 if p.z < 0 else 1)))
head = ellipsoid("head", (1.15, 1.2, 0.95), at=(0, -2.1, 2.2), segments=8, rings=5, sharp=0, mat=skin,
                 deform=lambda p: (p.x * (1 - 0.2 * max(0, -p.y)), p.y, p.z * (0.7 if p.z < 0 else 1)))
# spout: a thick tube rising forward and up, flared at the lip like a mortar muzzle
spout = limb("spout", [(0, -2.6, 2.4), (0, -3.5, 3.1), (0, -4.3, 4.0)], (0.75, 0.65, 0.62), sides=6, mat=claw, twist=0)
lip = cylinder("lip", 0.9, 0.35, at=(0, -4.45, 4.15), rot=(50, 0, 0), r2=0.7, sides=6, mat=under)
bore = cylinder("bore", 0.5, 0.1, at=(0, -4.6, 4.3), rot=(50, 0, 0), sides=6, mat=acid)
eye_l = ellipsoid("eye_L", (0.3, 0.3, 0.3), at=(0.8, -2.8, 2.6), segments=5, rings=3, sharp=0, mat=eye)
eye_r = mirror(eye_l)
collar = cylinder("collar", 1.7, 0.7, at=(0, 1.2, 3.1), r2=1.25, sides=8, mat=claw, sharp=0)
spines = [cone(f"spine{i}", 0.26, 0.9, at=(0, y, 3.45 - 0.1 * i), rot=(-20, 0, 0), sides=4, cap=False, mat=claw)
          for i, y in enumerate([-0.9, -0.2])]
body = join("body", [trunk, head, spout, lip, bore, eye_l, eye_r, collar, *spines], pivot=(0, 0, 2.1))
paint(body, under, lambda c: c.z < 1.6 and c.y > -1.9)  # darker belly

# ---- the acid sac: a big bloated bulb on the back, swells and shrinks ----------------------------
sac = ellipsoid("pulse_sac", (1.45, 1.55, 1.75), at=(0, 1.3, 3.2), segments=10, rings=7, sharp=70, mat=acid,
                deform=lambda p: (p.x * (1 + 0.1 * (p.z > 0)), p.y, p.z * (1 + 0.08 * (p.z > 0))))
# a few darker teal bands to hold it to the body are the collar above; the sac itself is pure acid

# ---- legs: wide, braced, knees high, planted feet -------------------------------------------------
LEGS = [
    ((1.4, -1.3, 2.0), (2.8, -2.2, 3.1), (3.1, -2.8, 1.5), (3.0, -3.1, 0.0)),
    ((1.7, 0.8, 1.9), (3.0, 0.9, 3.0), (3.3, 0.9, 1.5), (3.1, 0.9, 0.0)),
    ((1.4, 2.6, 1.9), (2.7, 3.2, 2.9), (3.0, 3.4, 1.4), (3.0, 3.5, 0.0)),
]
for i, pts in enumerate(LEGS, start=1):
    leg = limb(f"leg_L{i}", pts, (0.55, 0.42, 0.3, 0.0), sides=5, mat=under, floor=0)
    paint(leg, claw, lambda c: c.z < 0.5)
    mirror(leg)

finish()

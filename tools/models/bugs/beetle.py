"""Carapace Beetle: the armoured tank. Wide, low and heavy: a faceted domed shell with a centre seam
and ridges, a low head under a neck shield with one short horn, six stumpy legs, short mandibles.
12 x 9 x 6 m, <= 1200 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

DARK, GOLD, LIGHT = shades("#ffc93a")
skin = mat("skin", GOLD, rough=0.4, metal=0.15)
under = mat("under", DARK, rough=0.6)
claw = chitin()
eye = eye_glow()

# ---- shell: a wide dome, flat underneath, squared off at the back ------------------------------
def shell_shape(p):
    z = max(p.z, -0.35)
    k = 1.0 if p.y < 0 else 1.0 - 0.12 * (p.y / 4.6) ** 2
    return (p.x * k * (1 + 0.12 * (z > 0) * 0), p.y, z * (1.0 if z > 0 else 0.5))


shell = ellipsoid("shell", (4.0, 4.5, 3.4), at=(0, 1.2, 2.3), segments=10, rings=6, sharp=0, mat=skin,
                  deform=shell_shape, poles="Z")
# centre seam and two ridges per wing case (cut edges, then paint the thin bands dark)
SEAMS = [-0.2, 0.2]
cut(shell, (1, 0, 0), SEAMS + [-1.7, -1.5, 1.5, 1.7])
paint(shell, under, lambda c: abs(c.x) < 0.2 and c.z > 2.3)
paint(shell, under, lambda c: 1.45 < abs(c.x) < 1.75 and c.z > 2.3)
# rim plates: a darker skirt along the lower edge
paint(shell, under, lambda c: c.z < 2.0)

# ---- neck shield (pronotum): a wide wedge plate over the head ------------------------------------
shield = ellipsoid("shield", (3.3, 2.0, 1.7), at=(0, -3.4, 2.4), segments=8, rings=5, sharp=0, mat=skin,
                   deform=lambda p: (p.x * (1 - 0.25 * max(0, -p.y / 1.9)), p.y, max(p.z, -0.5)))
head = ellipsoid("head", (1.6, 1.5, 0.95), at=(0, -5.0, 1.15), segments=8, rings=5, sharp=0, mat=under,
                 deform=lambda p: (p.x * (1 - 0.25 * max(0, -p.y)), p.y, p.z))
horn = limb("horn", [(0, -4.6, 2.0), (0, -6.1, 2.7), (0, -6.6, 4.3), (0, -5.9, 5.9)],
            (0.85, 0.7, 0.5, 0.0), sides=5, mat=claw)
eye_l = ellipsoid("eye_L", (0.34, 0.34, 0.28), at=(1.05, -5.7, 1.45), segments=5, rings=3, sharp=0, mat=eye)
eye_r = mirror(eye_l)
# armoured shoulder spikes on the shield
sp = cone("spike_L", 0.6, 1.9, at=(3.1, -3.2, 3.2), rot=(0, 60, 0), sides=4, cap=False, mat=claw)
sp_r = mirror(sp)
skirt = ellipsoid("skirt", (4.2, 4.9, 0.6), at=(0, 1.2, 1.5), segments=12, rings=3, sharp=0, mat=under)
visor = ellipsoid("visor", (2.7, 1.6, 0.45), at=(0, -4.9, 2.65), segments=8, rings=3, sharp=0, mat=skin,
                  deform=lambda p: (p.x * (1 - 0.3 * max(0, -p.y / 1.6)), p.y, p.z))
paint(visor, under, lambda c: c.z < 2.5)
body = join("body", [shell, skirt, visor, shield, head, horn, eye_l, eye_r, sp, sp_r], pivot=(0, 0, 2))

# ---- legs: stumpy, thick, splayed ---------------------------------------------------------------
LEGS = [
    ((2.7, -2.6, 1.7), (3.6, -3.0, 2.5), (3.95, -3.3, 1.0), (4.05, -3.5, 0.0)),
    ((3.0, 0.2, 1.6), (3.8, 0.2, 2.5), (4.05, 0.3, 1.0), (4.1, 0.3, 0.0)),
    ((2.8, 3.2, 1.6), (3.6, 3.7, 2.4), (3.9, 4.1, 1.0), (4.0, 4.4, 0.0)),
]
for i, pts in enumerate(LEGS, start=1):
    leg = limb(f"leg_L{i}", pts, (0.8, 0.7, 0.5, 0.0), sides=5, mat=under, floor=0)
    paint(leg, claw, lambda c: c.z < 0.55)
    mirror(leg)

# ---- mandibles ---------------------------------------------------------------------------------
jaw = limb("jaw_L", [(0.75, -5.9, 0.95), (1.2, -6.5, 0.8), (0.25, -6.9, 0.7)], (0.4, 0.3, 0.0),
           sides=4, mat=claw, flat=0.7)
mirror(jaw)

finish()

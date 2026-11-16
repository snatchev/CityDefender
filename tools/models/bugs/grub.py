"""Tunneler Grub: a burrowing worm. Seven fat faceted segments tapering to the tail, dark bands
where they meet, and a round drilling mouth: a dark bezel, a ring of chitin teeth around a glowing
maw. No legs. 11 x 4 x 4 m, <= 800 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

DARK, SALMON, LIGHT = shades("#ff8c69", dark=0.55)
skin = mat("skin", SALMON, rough=0.5)
under = mat("under", DARK, rough=0.6)
claw = chitin()
eye = eye_glow()
maw_m = mat("maw", "#ffd23a", rough=0.3, emit=True, strength=2.5)

# radius of each segment (x/z), and its y length; centres run front to back
RADII = [1.7, 1.8, 1.8, 1.7, 1.5, 1.25, 0.9]
Y0, STEP = -3.3, 1.3
for i, r in enumerate(RADII):
    y = Y0 + STEP * i
    z = r * 0.97 + 0.15 * math.sin(math.pi * i / 6)  # a slight hump so it reads as crawling
    ry = 0.95 if i < 6 else 0.75
    seg = ellipsoid(f"seg_{i + 1}", (r, ry, r * 0.97), at=(0, y, z), segments=8, rings=6, sharp=0, mat=skin,
                    poles="Y")
    # dark band where it meets its neighbours: the outer faces of each end
    paint(seg, under, lambda c, y=y, ry=ry: abs(c.y - y) > 0.6 * ry)
    if 0 < i < 6:  # a dorsal spine on the middle segments
        sp = cone(f"s{i}", 0.34, 0.9, at=(0, y, z + r * 0.97 - 0.1), sides=4, cap=False, mat=claw)
        seg = join(f"seg_{i + 1}", [seg, sp], pivot=(0, y, z))

# ---- the drilling mouth: rigid "head" in front of seg_1 -------------------------------------------
HZ = 1.75
bezel = cylinder("bezel", 1.7, 0.9, at=(0, -4.35, HZ), rot=(90, 0, 0), r2=1.5, sides=10, mat=under, sharp=0)
maw = cylinder("maw", 1.1, 0.3, at=(0, -4.85, HZ), rot=(90, 0, 0), sides=10, mat=maw_m, sharp=0)
parts = [bezel, maw]
for k in range(10):
    a = 2 * math.pi * k / 10
    parts.append(cone(f"tooth{k}", 0.36, 1.35, at=(1.3 * math.cos(a), -5.2, HZ + 1.3 * math.sin(a)),
                      rot=(90, 0, 0), sides=4, cap=False, mat=claw))
head = join("head", parts, pivot=(0, -4.35, HZ))

finish()

"""Jersey barrier: the classic concrete highway barrier profile run along X. Wide foot, sloped sides,
narrow top, a faded yellow reflector stripe on the upper slope, lifting slots at the foot. A joint
groove at x = 0 and (half each) at the module ends, so sections are 4 m long and a row reads as a
line of barriers. 8 x 4.2 x 3.75 m, <= 300 tris."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

concrete = mat("concrete", "#c9c4b8", rough=0.92)
joint = mat("joint", "#8a867c", rough=0.95)
yellow = mat("yellow", "#d8b64a", rough=0.8)
slot = mat("slot", "#4d4a44", rough=0.95)

# (z0, z1, width at z0, width at z1): foot, lower slope, upper slope, reflector band, top
PROFILE = [(0, 0.5, 4.2, 4.2), (0.5, 1.5, 4.2, 2.3), (1.5, 2.6, 2.3, 1.8), (2.6, 3.2, 1.8, 1.55), (3.2, 3.75, 1.55, 1.25)]
parts = [
    box(f"slab{i}", (8.0, w0, z1 - z0), at=(0, 0, (z0 + z1) / 2), top=(1, w1 / w0), mat=concrete)
    for i, (z0, z1, w0, w1) in enumerate(PROFILE)
]
for x in (-2.0, 2.0):  # lifting slots at the foot, in the middle of each 4 m section
    for y in (-1, 1):
        parts.append(box(f"slot{x}{y}", (1.0, 0.06, 0.22), at=(x, y * 2.1, 0.27), mat=slot))

body = join("jersey", parts, pivot=(0, 0, 0))
G = 0.09  # half width of the joint groove
cut(body, (1, 0, 0), [-4 + G, -G, G, 4 - G])
paint(body, yellow, lambda c: 2.7 < c.z < 3.1 and abs(c.x) < 3.9)
paint(body, joint, lambda c: (abs(c.x) < G or abs(c.x) > 4 - G) and c.z > 0.05)

finish()

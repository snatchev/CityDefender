"""Spike strip: a low dark-red mat lying across the street, steel rails along both long edges and six
rows of three-sided steel spikes leaning up and outward toward both sides (front rows lean -Y, back
rows +Y). Spikes every 0.5 m along X, offset 0.25 from the ends, so a row continues across the join.
8 x 2.4 x 0.4 m, <= 400 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

red = mat("red", "#8a2b2b", rough=0.85)
steel = mat("steel", "#aeb6bf", rough=0.35, metal=0.8)
rail = mat("rail", "#3a3d43", rough=0.5, metal=0.6)

parts = [box("mat", (8.0, 2.4, 0.12), at=(0, 0, 0.06), mat=red)]
for s in (-1, 1):
    parts.append(box(f"rail{s}", (8.0, 0.16, 0.18), at=(0, s * 1.12, 0.14), mat=rail))

LEAN = 28  # degrees, outward
L = 0.3  # spike length
R = 0.13
a = math.radians(LEAN)
for row, y in enumerate((-0.85, -0.5, -0.15, 0.15, 0.5, 0.85)):
    s = 1 if y > 0 else -1
    d = (0, s * math.sin(a), math.cos(a))  # spike axis
    for k in range(16):
        x = -3.75 + 0.5 * k
        base = (x, y, 0.1)
        at = tuple(base[i] + d[i] * L / 2 for i in range(3))
        parts.append(cone(f"sp{row}_{k}", R, L, at=at, rot=(-s * LEAN, 0, 0), sides=3, mat=steel, cap=False))

join("spikeStrip", parts, pivot=(0, 0, 0))
finish()

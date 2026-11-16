"""Bus wall: a city bus parked across the street. The module is an 8 m segment of articulated bus:
transit-blue body, white band, strip of dark windows with pillars, four wheels in dark arches (every
4 m), roof units, and dark accordion joints at both ends so a row reads as one long bendy bus.
8 x 5.4 x 6 m, <= 800 tris."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

blue = mat("blue", "#3d7fd6", rough=0.45)
white = mat("white", "#eef1f4", rough=0.5)
glass = mat("glass", "#16202c", rough=0.15, metal=0.3)
dark = mat("dark", "#1a1d22", rough=0.8)
bellows = mat("dark", "#1a1d22", rough=0.8)
tyre = bellows
hub = mat("hub", "#9aa3ad", rough=0.4, metal=0.6)
unit = mat("unit", "#d5dbe1", rough=0.6)

HW = 2.5  # body half width (wheels stick out to 2.7)
parts = []
body = box("body", (7.7, 2 * HW, 4.9), at=(0, 0, 0.5 + 2.45), mat=blue)
cut(body, (0, 0, 1), [2.0, 2.8])
paint(body, white, lambda c: 2.0 < c.z < 2.8 and abs(c.x) < 3.8 and abs(c.y) > 1)
parts.append(body)

# accordion joints at both ends (half each; neighbours double them to 0.3 m of bellows)
for s in (-1, 1):
    parts.append(box(f"bellows{s}", (0.15, 2 * HW - 0.4, 4.7), at=(s * 3.925, 0, 0.6 + 2.35), mat=bellows))
parts.append(box("underside", (8.0, 3.6, 0.5), at=(0, 0, 0.3), mat=dark))

# window strip: windows between pillars every 2 m (pillars straddle the module ends)
for y in (-1, 1):
    for x in (-3.0, -1.0, 1.0, 3.0):
        parts.append(box(f"win{x}{y}", (1.6, 0.06, 1.4), at=(x, y * (HW + 0.02), 3.9), mat=glass))
    # dark wheel arches and the wheels, every 4 m
    for x in (-2.0, 2.0):
        parts.append(box(f"arch{x}{y}", (2.5, 0.06, 1.5), at=(x, y * (HW + 0.01), 1.1), mat=dark))
        parts.append(cylinder(f"wheel{x}{y}", 1.0, 0.45, at=(x, y * 2.45, 1.0), rot=(90, 0, 0), sides=10, mat=tyre))
        parts.append(cylinder(f"hub{x}{y}", 0.45, 0.5, at=(x, y * 2.45, 1.0), rot=(90, 0, 0), sides=6, mat=hub))

# roof units: two air-conditioning boxes and a hatch
parts.append(box("ac1", (2.6, 2.4, 0.6), at=(-2.0, 0, 5.7), top=(0.85, 0.85), mat=unit))
parts.append(box("ac2", (2.6, 2.4, 0.6), at=(2.0, 0, 5.7), top=(0.85, 0.85), mat=unit))
parts.append(box("hatch", (1.2, 1.0, 0.1), at=(0, 0, 5.45), mat=white))

join("busWall", parts, pivot=(0, 0, 0))
finish()

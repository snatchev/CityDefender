"""Sawhorse: a police sawhorse module. Two striped boards (yellow and black, 45 degree stripes) on
black A-frame legs. Tiles along X: boards run the full -4..+4, stripes repeat every 1.6 m and legs
stand every 4 m, so a row of modules reads as one barrier. 8 x 3 x 2.5 m, <= 300 tris."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

yellow = mat("yellow", "#f2c14e", rough=0.55)
black = mat("black", "#1e1f22", rough=0.7)
STRIPE = 0.8  # band width along X; 8 m / (2 * 0.8) = 5 whole periods, so ends meet cleanly


def striped_board(name, z, h):
    b = box(name, (8.0, 0.28, h), at=(0, -0.42, z), mat=yellow)
    lo, hi = int((-4 + z - h / 2) // STRIPE), int((4 + z + h / 2) // STRIPE) + 1
    cut(b, (1, 0, 1), [k * STRIPE for k in range(lo, hi + 1)])  # 45 degree planes x + z = k * 0.8
    paint(b, black, lambda c: int((c.x + c.z) // STRIPE) % 2 == 1)
    return b


parts = [striped_board("board_top", 2.15, 0.62), striped_board("board_low", 1.15, 0.5)]

# A-frames at x = -2 and +2 (with the neighbours' that makes a leg every 4 m)
for x in (-2.0, 2.0):
    parts.append(box(f"cap{x}", (0.5, 0.75, 0.25), at=(x, -0.05, 2.38), mat=black))
    for y in (-1, 1):
        parts.append(limb(f"leg{x}{y}", [(x, 0.18 * y, 2.3), (x, 1.32 * y, 0.0)], (0.15, 0.13), sides=4, mat=black, floor=0))
    parts.append(box(f"brace{x}", (0.16, 2.0, 0.16), at=(x, 0, 0.75), mat=black))

join("sawhorse", parts, pivot=(0, 0, 0))

finish()

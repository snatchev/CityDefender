"""Sedan: a rounded, friendly four-door city car, parked along the kerb. The body is lofted through
ten cross-sections, so the bonnet, roof, doors and boot have vertices about every 0.8 m for the
game to dent. `tint` is the paint (coloured per car). 6.0 x 2.4 x 1.9 m, <= 400 tris."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

paint_ = tint("tint", rough=0.35, metal=0.1)
glass = mat("glass", "#1d2833", rough=0.3)
rubber = mat("rubber", "#1c1c1e", rough=0.85)
trim = mat("trim", "#8a9099", rough=0.4, metal=0.5)
head = lamp("light_head", "#fff1d6", strength=2.0)
tail = lamp("light_tail", "#ff2a1f", strength=2.0)

W = 1.12  # half width of the body


def section(y, w, zb, belt, wr, zr, crown):
    """Right half of a cross-section: bottom centre, sill, side, belt line, roof edge, roof."""
    return (y, [(0, zb), (w * 0.9, zb), (w, zb + 0.3), (w, belt), (wr, zr), (wr * 0.5, zr + crown * 0.75), (0, zr + crown)])


body = hull("body", [
    section(-3.0, 1.0, 0.45, 0.85, 0.78, 0.95, 0.02),  # nose
    section(-2.6, W, 0.35, 0.98, 0.9, 1.06, 0.1),  # bonnet
    section(-1.9, W, 0.35, 1.04, 0.96, 1.15, 0.1),
    section(-1.35, W, 0.35, 1.1, 1.0, 1.2, 0.08),  # windscreen base
    section(-0.6, W, 0.35, 1.1, 0.84, 1.76, 0.13),  # roof
    section(0.3, W, 0.35, 1.1, 0.9, 1.79, 0.13),
    section(1.15, W, 0.35, 1.1, 0.84, 1.74, 0.13),
    section(1.95, W, 0.35, 1.1, 1.0, 1.22, 0.05),  # rear window base, boot
    section(2.6, W, 0.35, 1.05, 0.95, 1.15, 0.04),
    section(3.0, 1.0, 0.45, 0.92, 0.8, 1.02, 0.02),  # tail
], mat=paint_, sharp=60)
paint(body, glass, lambda c: -1.35 < c.y < 1.95 and 1.18 < c.z < 1.74)  # windscreen, side and rear windows
paint(body, rubber, lambda c: c.z < 0.5)  # dark sills and underside
paint(body, trim, lambda c: c.z < 0.72 and abs(c.y) > 2.75)  # bumpers: the low band of nose and tail

parts = [body]
for x in (0.68, -0.68):
    parts.append(box(f"head{x}", (0.46, 0.14, 0.22), at=(x, -2.98, 0.68), mat=head))
    parts.append(box(f"tail{x}", (0.42, 0.14, 0.24), at=(x * 1.02, 2.98, 0.78), mat=tail))
for y in (-1.95, 1.9):
    for x in (1.0, -1.0):
        # a tyre whose outer face narrows to a hubcap: the cap is the trim-coloured face
        # rot (0, 90, 0) puts the cylinder's top (r2) at +X: the outer side for a left wheel
        r_in, r_out = 0.5, 0.34
        wheel = cylinder(f"wheel{x}{y}", r_in if x > 0 else r_out, 0.44, at=(x, y, 0.45), rot=(0, 90, 0),
                         r2=r_out if x > 0 else r_in, sides=7, mat=rubber)
        paint(wheel, trim, lambda c, x=x: abs(c.x) > abs(x) + 0.21)
        parts.append(wheel)
join("body", parts, pivot=(0, 0, 0))

finish()

"""Van: a boxy delivery van. A short sloped nose, a tall upright windscreen, then a windowless cargo
box with a flat back: a tall slab where the sedan is a low bubble. Lofted like the sedan, with a
side line halfway up the cargo box so the big panels have vertices to dent. `tint` is the paint.
6.8 x 2.6 x 2.9 m, <= 400 tris."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

paint_ = tint("tint", rough=0.45)
glass = mat("glass", "#1d2833", rough=0.3)
rubber = mat("rubber", "#1c1c1e", rough=0.85)
trim = mat("trim", "#8a9099", rough=0.4, metal=0.5)
head = lamp("light_head", "#fff1d6", strength=2.0)
tail = lamp("light_tail", "#ff2a1f", strength=2.0)

W = 1.25  # half width of the body


def section(y, w, zb, belt, wr, zr, crown):
    """Right half of a cross-section: bottom centre, sill, side, belt line, upper side, roof edge, roof."""
    mid = belt + (zr - belt) * 0.5
    return (y, [(0, zb), (w * 0.92, zb), (w, zb + 0.3), (w, belt), (w - (w - wr) * 0.5, mid), (wr, zr),
                (wr * 0.5, zr + crown * 0.75), (0, zr + crown)])


body = hull("body", [
    section(-3.4, 1.15, 0.42, 1.0, 1.0, 1.2, 0.04),  # nose and short bonnet
    section(-2.35, W, 0.38, 1.35, 1.18, 1.5, 0.06),  # windscreen base
    section(-1.6, W, 0.38, 1.4, 1.17, 2.78, 0.08),  # cab roof
    section(-0.6, W, 0.38, 1.4, 1.2, 2.8, 0.08),
    section(0.4, W, 0.38, 1.4, 1.2, 2.8, 0.08),  # cargo box
    section(1.4, W, 0.38, 1.4, 1.2, 2.8, 0.08),
    section(2.4, W, 0.38, 1.4, 1.2, 2.8, 0.08),
    section(3.4, 1.22, 0.42, 1.4, 1.17, 2.76, 0.06),  # flat back
], mat=paint_, sharp=35, inset=(False, True))  # the flat back needs the inset ring to dent
paint(body, glass, lambda c: -2.35 < c.y < -0.6 and 1.45 < c.z < 2.68)  # windscreen and cab windows
paint(body, rubber, lambda c: c.z < 0.5)  # dark sills and underside
paint(body, trim, lambda c: c.z < 0.75 and abs(c.y) > 3.15)  # bumpers

parts = [body]
for x in (0.78, -0.78):
    parts.append(box(f"head{x}", (0.5, 0.14, 0.26), at=(x, -3.38, 0.78), mat=head))
    parts.append(box(f"tail{x}", (0.26, 0.14, 0.62), at=(x * 1.38, 3.39, 1.05), mat=tail))
for y in (-2.45, 2.25):
    for x in (1.1, -1.1):
        # rot (0, 90, 0) puts the cylinder's top (r2) at +X: the outer side for a left wheel
        r_in, r_out = 0.53, 0.36
        wheel = cylinder(f"wheel{x}{y}", r_in if x > 0 else r_out, 0.44, at=(x, y, 0.48), rot=(0, 90, 0),
                         r2=r_out if x > 0 else r_in, sides=7, mat=rubber)
        paint(wheel, trim, lambda c, x=x: abs(c.x) > abs(x) + 0.21)
        parts.append(wheel)
join("body", parts, pivot=(0, 0, 0))

finish()

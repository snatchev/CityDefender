"""Brood Mother: the wave-20 final boss. A bloated queen: a small armoured head and thorax up front
with a tall crown-like crest and big mandibles, eight legs clustered at the front hauling the
weight, and behind them an enormous swollen, ribbed abdomen dragging along the street, studded with
glowing egg sacs. Grotesque and regal, not gory. 37 x 24 x 17 m, <= 4500 tris."""

import math
import sys
from pathlib import Path

from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

DARK, PINK, LIGHT = shades("#ff5fa2")
skin = mat("skin", PINK, rough=0.45)
under = mat("under", DARK, rough=0.6)
claw = chitin()
eye = eye_glow()
egg = mat("egg", "#ff9acb", rough=0.35, emit=True, strength=2.0)  # pale pink, glowing


# ---- helpers ------------------------------------------------------------------------------------

def lerp_table(table, y):
    """Piecewise-linear lookup in [(y, value), ...] (sorted by y)."""
    if y <= table[0][0]:
        return table[0][1]
    for (y0, a), (y1, b) in zip(table, table[1:]):
        if y <= y1:
            return a + (b - a) * (y - y0) / (y1 - y0)
    return table[-1][1]


def lathe(name, rings, segments=12, extra=None, **kw):
    """A closed body of elliptical cross-sections along Y, built on the library's ellipsoid.

    rings: front to back, [(y, half_width, height_above_centre, depth_below_centre, centre_z), ...];
    the first and last are the pointed ends (only their y and centre_z are used).
    extra(i, a, x, z) -> (x, z): optional per-vertex tweak (a: angle around the section, 90 = top).
    """
    n = len(rings) - 1

    def deform(p):
        phi = math.acos(max(-1.0, min(1.0, p.y)))
        k = round(phi / (math.pi / n))  # 0 at p.y = +1 (the back)
        i = n - k
        y, rx, rt, rb, zc = rings[i]
        if k in (0, n):
            return (0.0, y, zc)
        s = math.sin(phi)
        dx, dz = p.x / s, p.z / s
        x, z = dx * rx, dz * (rt if dz > 0 else rb)
        if extra:
            x, z = extra(i, math.degrees(math.atan2(dz, dx)), x, z)
        return (x, y, zc + z)

    return ellipsoid(name, (1, 1, 1), segments=segments, rings=n, poles="Y", deform=deform, **kw)


def spike(name, base, direction, length, r, sides=4, bend=None, m=None):
    """A pointed spike from `base` along `direction` (a limb with 3 rings, optionally bent)."""
    b, d = Vector(base), Vector(direction).normalized()
    mid = b + d * (length * 0.5)
    if bend is not None:
        mid += Vector(bend) * length * 0.15
    return limb(name, [b, mid, b + d * length], (r, r * 0.55, 0.0), sides=sides, mat=m or claw, sharp=0)


# ---- the abdomen: enormous, swollen, ribbed, dragging ---------------------------------------------
W = [(-8.0, 3.6), (-6.0, 6.8), (-3.0, 9.0), (0.0, 10.3), (4.0, 11.0), (8.0, 10.7), (11.5, 9.3), (14.5, 6.8), (17.6, 2.4)]
TOP = [(-8.0, 6.6), (-6.0, 9.4), (-3.0, 12.4), (0.0, 14.3), (3.0, 15.3), (6.0, 15.5), (9.0, 14.8), (12.0, 12.8),
       (15.0, 9.4), (17.6, 4.6)]
BOT = [(-8.0, 3.8), (-4.0, 2.4), (2.0, 1.1), (7.0, 0.45), (13.0, 0.35), (17.6, 1.6)]


def section(y, s=1.0):
    w, top, bot = lerp_table(W, y), lerp_table(TOP, y), lerp_table(BOT, y)
    zc = bot + (top - bot) * 0.42
    return (y, w * s, (top - zc) * s, (zc - bot) * s, zc)


GROOVES = [-5.0 + 3.2 * k for k in range(7)]  # -5.0 .. 14.2: seven fat ribs
prof = [(-8.3, 0.0), (-7.7, 0.7), (-6.6, 0.95)]
for g in GROOVES:
    prof += [(g - 0.22, 0.9), (g + 0.22, 0.9), (g + 1.05, 1.03), (g + 2.15, 1.03)]
prof = [(y, s) for y, s in prof if y < 16.6] + [(17.0, 0.82), (17.6, 0.5), (18.0, 0.0)]


def abd_extra(i, a, x, z):
    # a flattened, sagging belly that drags; rib crests carry a low dorsal keel
    if z < 0:
        z *= 0.85
    return x, z


abdomen = lathe("pulse_abdomen", [section(y, s) for y, s in prof], segments=14, extra=abd_extra, sharp=0, mat=skin)
# A slow, shallow swell: the egg sacs sit on this surface and pulse on their own, so a full-size
# pulse would sink them into the hide or lift them off it.
props(abdomen, amp=0.25)
paint(abdomen, under, lambda c: any(abs(c.y - g) < 0.25 for g in GROOVES))  # dark seams between the ribs
paint(abdomen, under, lambda c: c.z < 1.6)  # the dragging belly
ABD_C = Vector((0, 4.5, 7.0))
set_origin(abdomen, ABD_C)


def abd_at(y, a):
    """Point on the abdomen at body position y, section angle a (deg; 90 = top) and its normal."""
    def pt(y, a):
        _, rx, rt, rb, zc = section(y, 1.0)
        ar = math.radians(a)
        return Vector((math.cos(ar) * rx, y, zc + math.sin(ar) * (rt if a <= 180 else rb)))
    p = pt(y, a)
    B = (pt(y + 0.2, a) - pt(y - 0.2, a)).normalized()
    T = (pt(y, a + 2) - pt(y, a - 2)).normalized()
    N = T.cross(B).normalized()
    if N.dot(p - Vector((0, y, section(y)[4]))) < 0:
        N = -N
    return p, N


# ---- egg sacs: glowing blisters bulging between the ribs ------------------------------------------
SACS = [  # (y, angle, radius): clusters of a big sac and smaller ones, half sunk into the hide
    (-0.2, 40, 2.1), (-1.9, 52, 1.2), (-0.2, 140, 2.1), (1.4, 125, 1.1),
    (3.3, 74, 2.4), (5.0, 92, 1.3), (3.3, 106, 2.4),
    (9.6, 34, 2.2), (11.2, 46, 1.2), (9.6, 146, 2.2), (8.0, 134, 1.2),
    (11.1, 84, 1.8),
    (6.4, 16, 1.4), (6.4, 164, 1.4),
]
for k, (y, a, r) in enumerate(SACS, start=1):
    p, N = abd_at(y, a)
    c = p + N * (r * 0.05)
    ellipsoid(f"pulse_egg_{k}", (r, r * 1.1, r * 0.95), at=c, segments=8, rings=5, sharp=0, mat=egg)

# ---- the ovipositor at the tail -------------------------------------------------------------------
tail = limb("sway_ovipositor", [(0, 16.9, 3.0), (0, 18.0, 2.4), (0, 18.7, 1.2)], (1.0, 0.6, 0.0), sides=6,
            mat=under, sharp=0)
props(tail, amp=0.6)

# ---- thorax and head: small, armoured, regal -------------------------------------------------------
thorax = ellipsoid("thorax", (3.4, 3.4, 2.8), at=(0, -9.6, 5.4), segments=10, rings=6, sharp=0, mat=skin,
                   deform=lambda p: (p.x * (1 + 0.1 * p.y / 3.4), p.y, p.z * (0.75 if p.z < 0 else 1.0)))
# a raised pronotum plate with a ridge of spines
pronotum = ellipsoid("pronotum", (3.6, 2.6, 1.0), at=(0, -10.4, 7.6), rot=(-14, 0, 0), segments=10, rings=4, sharp=0,
                     mat=skin, deform=lambda p: (p.x, p.y, p.z + 0.5 * (1 - abs(p.x) / 3.6) - 0.08 * p.x * p.x))
pspikes = [spike(f"psp{k}", (sx * 2.4, -10.6 + dy, 8.2), (sx * 0.7, 0.4, 1), 1.4, 0.35)
           for k, (sx, dy) in enumerate([(1, -1.0), (-1, -1.0), (1, 1.0), (-1, 1.0)])]
neck = ellipsoid("neck", (2.2, 1.6, 1.8), at=(0, -12.4, 4.8), segments=8, rings=5, sharp=0, mat=under)

HEAD_C, HEAD_R = Vector((0, -14.2, 4.6)), (2.6, 2.4, 2.1)
head = ellipsoid("head", HEAD_R, at=HEAD_C, segments=10, rings=6, sharp=0, mat=skin,
                 deform=lambda p: (p.x * (1 + 0.12 * p.y / 2.4), p.y - 0.3 * max(0.0, -p.z), p.z))
paint(head, under, lambda c: c.z < 3.4)

# the crest: a tall blade swept back over the head, flanked by two lower blades (a crown)
crest_parts = []
for k, (sx, h, lean, w) in enumerate([(0.0, 7.6, 0.0, 1.0), (1.0, 5.6, 30.0, 0.8), (-1.0, 5.6, -30.0, 0.8),
                                       (1.9, 3.8, 50.0, 0.6), (-1.9, 3.8, -50.0, 0.6)]):
    base = Vector((sx * 1.0, -14.0 + abs(sx) * 0.5, 6.2 - abs(sx) * 0.3))
    top = base + Vector((sx * h * math.sin(math.radians(abs(lean))), 2.4 * w, h))
    blade = limb(f"crest{k}", [base, base.lerp(top, 0.45) + Vector((0, -0.5, 0)), top],
                 (1.4 * w, 1.0 * w, 0.0), sides=4, flat=0.4, twist=0, mat=under, sharp=0)
    crest_parts.append(blade)
    paint(blade, claw, lambda c, t=top: c.z > t.z - 1.8)
    # spines along the blade's back edge
    for j, t in enumerate((0.35, 0.65)):
        p = base.lerp(top, t) + Vector((0, 0.5 * w, 0))
        crest_parts.append(spike(f"crsp{k}{j}", p, (sx * 0.4, 1, 0.5), 1.2 * w, 0.3))

# eyes: a band of glowing eyes across the face
eyes = []
for side in (1, -1):
    for k, (dx, dy, dz, r) in enumerate([(0.55, -0.75, 0.35, 0.5), (0.85, -0.4, 0.45, 0.42), (0.3, -0.85, 0.6, 0.34)]):
        u = Vector((dx * side, dy, dz)).normalized()
        c = HEAD_C + Vector((u.x * HEAD_R[0], u.y * HEAD_R[1], u.z * HEAD_R[2])) * 0.9
        eyes.append(ellipsoid(f"eye{side}{k}", (r, r, r * 0.85), at=c, segments=6, rings=4, sharp=0, mat=eye))

body = join("body", [thorax, pronotum, *pspikes, neck, head, *crest_parts, *eyes], pivot=(0, -10, 5))

# ---- mandibles: big sickles, hinged at the mouth ---------------------------------------------------
jl = limb("jaw_L", [(1.3, -15.8, 3.6), (3.4, -17.0, 3.4), (3.2, -18.4, 3.1), (0.9, -18.9, 2.8)],
          (0.75, 0.6, 0.42, 0.0), sides=5, flat=0.55, mat=claw, sharp=0)
jt = spike("jaw_L_tooth", (3.0, -17.4, 3.4), (-1, -0.3, 0), 1.0, 0.3)
mirror(join("jaw_L", [jl, jt], pivot=(1.3, -15.8, 3.6)))

# ---- legs: eight, clustered around the thorax, hauling ---------------------------------------------
LEGS = [
    # hip, knee, ankle, foot
    [(2.4, -12.0, 4.4), (6.6, -14.8, 8.0), (8.4, -17.2, 2.6), (8.6, -17.8, 0.0)],
    [(2.9, -10.6, 4.2), (8.2, -11.8, 8.4), (11.2, -12.8, 2.6), (11.5, -13.0, 0.0)],
    [(3.0, -9.0, 4.2), (8.6, -8.2, 8.4), (11.7, -7.4, 2.6), (11.9, -7.2, 0.0)],
    [(2.7, -7.6, 4.2), (8.4, -4.6, 9.0), (10.8, -1.8, 2.6), (11.0, -1.4, 0.0)],
]
for i, pts in enumerate(LEGS, start=1):
    hip, knee, ankle, foot = (Vector(p) for p in pts)
    r0 = 1.3 if i in (1, 4) else 1.15
    parts = [limb(f"leg_L{i}", pts, (r0, r0 * 0.85, r0 * 0.55, 0.3), sides=6, flat=0.85, mat=skin, sharp=0, floor=0),
             spike(f"lspur{i}", knee + Vector((0, 0, 0.5)), (0.3, 0.4, 1), 1.0, 0.3),
             spike(f"lspine{i}", knee.lerp(ankle, 0.5) + Vector((0.35, 0, 0)), (1, 0.2, 0.4), 0.8, 0.26)]
    leg = join(f"leg_L{i}", parts, pivot=pts[0])
    paint(leg, under, lambda c, z=ankle.z: c.z < z + 1.2 or (c - hip).length < 1.4)
    paint(leg, claw, lambda c: c.z < 1.0)
    mirror(leg)

# ---- antennae: long, sweeping up and back ---------------------------------------------------------
ant = limb("sway_antenna_L", [(0.9, -15.6, 5.8), (2.6, -17.6, 8.6), (4.4, -16.6, 11.4), (5.6, -13.8, 12.6)],
           (0.28, 0.2, 0.14, 0.0), sides=4, mat=under, sharp=0)
props(ant, amp=1.2)
mirror(ant)

finish()

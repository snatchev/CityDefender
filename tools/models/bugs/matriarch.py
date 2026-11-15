"""Beetle Matriarch: the wave-10 boss, a walking fortress. Mother of the Carapace Beetles, but taller
and meaner: a humped shell of overlapping armour plates with glowing amber seams and rows of spikes
along its ridges, a heavy neck shield crowned with horns, a great forked horn sweeping forward and
up from the head, clusters of glowing eyes, big mandibles and massive clawed front legs.
Seen close, from low in front, in her intro cutscene. 27 x 19 x 13 m, <= 3500 tris."""

import math
import sys
from pathlib import Path

from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

DARK, AMBER, LIGHT = shades("#ffb12e")
skin = mat("skin", AMBER, rough=0.4)
under = mat("under", DARK, rough=0.6)
claw = chitin()
eye = eye_glow()
seam = mat("seam", "#ff8c14", rough=0.4, emit=True, strength=2.0)  # glowing amber between the plates


# ---- helpers ------------------------------------------------------------------------------------

def lerp_table(table, y):
    """Piecewise-linear lookup in [(y, value), ...] (sorted by y)."""
    if y <= table[0][0]:
        return table[0][1]
    for (y0, a), (y1, b) in zip(table, table[1:]):
        if y <= y1:
            t = (y - y0) / (y1 - y0)
            return a + (b - a) * t
    return table[-1][1]


def lathe(name, rings, segments=12, extra=None, **kw):
    """A closed body of elliptical cross-sections along Y, built on the library's ellipsoid.

    rings: front to back, [(y, half_width, height_above_centre, depth_below_centre, centre_z), ...];
    the first and last are the pointed ends (only their y and centre_z are used).
    extra(i, a, x, z) -> (x, z): optional per-vertex tweak; i the ring index, a the angle around
    the section (0 = left side +X, 90 = top), x/z the vertex's offset from the section's centre.
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
        a = math.degrees(math.atan2(dz, dx))
        x, z = dx * rx, dz * (rt if dz > 0 else rb)
        if extra:
            x, z = extra(i, a, x, z)
        return (x, y, zc + z)

    return ellipsoid(name, (1, 1, 1), segments=segments, rings=n, poles="Y", deform=deform, **kw)


def spike(name, base, direction, length, r, sides=4, bend=None, m=None):
    """A pointed spike from `base` along `direction` (a limb with 3 rings, optionally bent)."""
    b, d = Vector(base), Vector(direction).normalized()
    mid = b + d * (length * 0.5)
    if bend is not None:
        mid += Vector(bend) * length * 0.15
    return limb(name, [b, mid, b + d * length], (r, r * 0.55, 0.0), sides=sides, mat=m or claw, sharp=0)


# ---- the shell: a domed hump of armour plates over a glowing core --------------------------------
# envelope of the hump along y (front -> back)
W = [(-4.0, 5.6), (-1.5, 6.8), (2.0, 7.3), (6.0, 7.0), (9.5, 5.6), (12.6, 2.6)]  # half width
TOP = [(-4.0, 7.0), (-1.5, 9.4), (1.5, 10.4), (5.0, 10.3), (8.5, 8.9), (11.0, 6.6), (12.6, 4.6)]  # top z
BOT = [(-4.0, 2.8), (2.0, 2.6), (8.0, 2.8), (12.6, 3.8)]  # belly z
CORE_Y = [-4.2, -3.6, -2.4, -0.6, 1.2, 3.0, 4.8, 6.6, 8.4, 10.0, 11.4, 12.3, 12.8]


def section(y, s=1.0):
    w, top, bot = lerp_table(W, y), lerp_table(TOP, y), lerp_table(BOT, y)
    zc = bot + (top - bot) * 0.3
    return (y, w * s, (top - zc) * s, (zc - bot) * s, zc)


def end_scale(y):
    # round the two ends of the core off
    return min(1.0, 0.35 + 0.65 * min(1.0, (y + 4.2) / 1.6), 0.35 + 0.65 * min(1.0, (12.8 - y) / 1.8))


core = lathe("core", [section(y, end_scale(y)) for y in CORE_Y], segments=12, sharp=0, mat=seam)


def shell_at(y, a, out=0.0):
    """Point on the core at body position y and section angle a (deg; 0 = left side, 90 = top),
    plus the frame there: T (around the section), B (along the body), N (outward)."""
    def pt(y, a):
        _, rx, rt, rb, zc = section(y, end_scale(y))
        ar = math.radians(a)
        return Vector((math.cos(ar) * rx, y, zc + math.sin(ar) * rt))
    p = pt(y, a)
    B = (pt(y + 0.2, a) - pt(y - 0.2, a)).normalized()
    T = (pt(y, a + 2) - pt(y, a - 2)).normalized()
    N = T.cross(B).normalized()
    _, _, _, _, zc = section(y)
    if N.dot(p - Vector((0, y, zc))) < 0:
        N = -N
    return p + N * out, T, B, N


def plate_at(name, c, T, B, N, hw, hl, thick=0.55, lift=9.0, taper=0.0, bend=(14.0, 30.0), m=None, rings=4):
    """A faceted armour plate centred at c, lying in the plane (T, B) with outward normal N.
    lift: degrees its +B edge rises off the surface (shingled). taper: narrows the -B end.
    bend: (rx, ry) radii-ish of the surface it hugs (positive: convex dome, negative: dish).
    Returns the plate and its top point."""
    t = math.radians(lift)
    B, N = B * math.cos(t) + N * math.sin(t), N * math.cos(t) - B * math.sin(t)
    T = B.cross(N)  # right-handed local frame: x = T, y = B, z = N
    rot = Matrix((T, B, N)).transposed().to_euler("XYZ")

    def shape(p):
        # square the plate off so neighbours leave narrow, even seams
        ux, uy = p.x / hw, p.y / hl
        mx, r = max(abs(ux), abs(uy)), math.hypot(ux, uy)
        if mx > 1e-6:
            k = 1 + 0.8 * (r / mx - 1)
            p = Vector((p.x * k, p.y * k, p.z))
        x = p.x * (1 - taper * (1 - (p.y + hl) / (2 * hl)))
        z = p.z
        if z > 0:
            z += 0.28 * thick * (1 - abs(p.x) / hw)  # a low ridge down the middle
        else:
            z *= 0.35  # flat underside, hidden
        z -= p.x * p.x / bend[0] + p.y * p.y / bend[1]  # hug the surface
        return (x, p.y, z)

    ob = ellipsoid(name, (hw, hl, thick), at=c + N * 0.2, rot=[math.degrees(r) for r in rot], segments=8, rings=rings,
                   deform=shape, sharp=0, mat=m or skin)
    return ob, c + N * (0.2 + thick * 1.1), B, N


def plate(name, y, a, hw, hl, thick=0.55, lift=9.0):
    """A shingled armour plate on the shell at body position y, section angle a."""
    c, T, B, N = shell_at(y, a)
    ob, top, B, N = plate_at(name, c, T, B, N, hw, hl, thick, lift)
    return ob, top, T, B, N


plates, spikes = [], []
#      angle  centres along y                     half-width half-length  spike length
ROWS = [(90, [-2.3, 1.2, 4.7, 8.1, 10.9], 2.3, 1.95, 1.8),
        (53, [-0.6, 2.9, 6.4, 9.6], 2.4, 1.95, 1.3),
        (17, [-2.1, 1.3, 4.8, 8.2], 2.3, 1.95, 0.0)]
for ai, (a, ys, hw, hl, sl) in enumerate(ROWS):
    for k, y in enumerate(ys):
        sides = (a, 180 - a) if a != 90 else (90,)
        for sa in sides:
            sc = 1.0 if y < 9.5 else 0.8
            ob, top, T, B, N = plate(f"pl{ai}{k}{sa}", y, sa, hw * sc, hl * sc)
            plates.append(ob)
            if sl:
                rake = 0.8 if a == 90 else 0.5
                spikes.append(spike(f"sp{ai}{k}{sa}", top - N * 0.2, N + B * rake, sl * (1.08 - 0.1 * k), 0.42 if a == 90 else 0.34,
                                    bend=B))
paint(core, under, lambda c: c.z < 4.4 or c.y > 11.7)

# ---- the neck shield (pronotum) and its crown of horns -------------------------------------------
SHIELD_AT = Vector((0, -5.6, 6.6))
SHIELD_TILT = -14
SHIELD_ROT = Euler((math.radians(SHIELD_TILT), 0, 0), "XYZ")
SR = (7.8, 1.2, 5.0)


def shield_local(p):
    # dish the shield: its rim curls forward, like a hood over the head; the lower corners flare
    r2 = (p.x / SR[0]) ** 2 + (p.z / SR[2]) ** 2
    return (p.x, p.y - 1.9 * r2 + (0.6 if p.y > 0 else 0), p.z)


# the shield's core glows through the seams between a fan of plates (a ruff behind the head)
shield = ellipsoid("shield", SR, at=SHIELD_AT, rot=(SHIELD_TILT, 0, 0), segments=12, rings=6, sharp=0, mat=seam,
                   deform=shield_local)


def on_shield(x, z, dy=0.0):
    p = Vector(shield_local(Vector((x, dy, z))))
    p.rotate(SHIELD_ROT)
    return p + SHIELD_AT


def shield_front(x, z):
    r2 = (x / SR[0]) ** 2 + (z / SR[2]) ** 2
    return on_shield(x, z, -SR[1] * math.sqrt(max(0.0, 1 - r2)))


def shield_r2(c):
    q = c - SHIELD_AT
    q.rotate(SHIELD_ROT.to_matrix().inverted())
    return (q.x / SR[0]) ** 2 + (q.z / SR[2]) ** 2


paint(shield, under, lambda c: c.y > SHIELD_AT.y + 0.2 or c.z < 3.4 or shield_r2(c) > 0.8)  # dark rim frames the fan

FAN_O = Vector((0, -3.6))  # the fan's hub, low behind the head (shield-local x, z)
crown, fan = [], []
for k, a in enumerate((24, 46, 68, 90, 112, 134, 156)):
    ar = math.radians(a)
    d = Vector((math.cos(ar), math.sin(ar)))
    # distance from the hub to the shield's rim along d
    lo, hi = 0.0, 20.0
    for _ in range(30):
        mid = (lo + hi) / 2
        q = FAN_O + d * mid
        lo, hi = (mid, hi) if (q.x / SR[0]) ** 2 + (q.y / SR[2]) ** 2 < 1 else (lo, mid)
    rim = lo
    cq = FAN_O + d * (rim * 0.62)
    c = shield_front(cq.x, cq.y)
    B = (shield_front(*(cq + d * 0.3)) - shield_front(*(cq - d * 0.3))).normalized()
    perp = Vector((-d.y, d.x))
    T = (shield_front(*(cq + perp * 0.3)) - shield_front(*(cq - perp * 0.3))).normalized()
    N = T.cross(B).normalized()
    if N.y > 0:
        N = -N
    hl = rim * 0.36
    hw = rim * 0.62 * math.radians(22) * 0.62
    ob, top, Bp, Np = plate_at(f"fan{k}", c, T, B, N, hw, hl, thick=0.5, lift=7.0, taper=0.5, bend=(-30.0, -25.0),
                               rings=3)
    fan.append(ob)
    # a crown horn at the outer end of each plate
    base = shield_front(*(FAN_O + d * (rim * 0.93))) + N * 0.35
    length = 2.75 if a == 90 else (2.5 if a in (68, 112) else 2.0)
    hd = Vector((d.x, 0, d.y)) * 1.0 + N * 0.35 + Vector((0, 0, 0.2))
    horn_k = spike(f"crown{k}", base, hd, length, 0.55 if a == 90 else 0.46, sides=5, bend=N * 0.6, m=skin)
    paint(horn_k, claw, lambda c, b=base, ln=length: (c - b).length > ln * 0.6)
    crown.append(horn_k)

# a heavy collar where the shield meets the head
collar = ellipsoid("collar", (3.8, 1.8, 2.5), at=(0, -6.6, 3.7), segments=10, rings=5, sharp=0, mat=under)

# ---- head: low, broad, armoured, with the great forked horn ---------------------------------------
HEAD_C, HEAD_R = Vector((0, -9.0, 3.7)), (3.4, 2.7, 2.4)


def head_shape(p):
    # wider at the back, a flat brow, a chin that juts forward
    k = 1 + 0.12 * (p.y / HEAD_R[1])
    z = p.z * (0.8 if p.z < 0 else 1.0)
    return (p.x * k, p.y - 0.25 * max(0.0, -p.z), z)


head = ellipsoid("head", HEAD_R, at=HEAD_C, segments=10, rings=6, sharp=0, mat=skin, deform=head_shape)
paint(head, under, lambda c: c.z < 2.5)


def on_head(dx, dy, dz, sink=0.25):
    u = Vector((dx, dy, dz)).normalized()
    p = Vector((u.x * HEAD_R[0], u.y * HEAD_R[1], u.z * HEAD_R[2]))
    p = Vector(head_shape(p))
    return HEAD_C + p * (1 - sink / max(HEAD_R))


# eye clusters: a big eye and three small ones on each side of the face
eyes = []
for side in (1, -1):
    s = "L" if side > 0 else "R"
    for k, (d, r) in enumerate([((0.6, -0.75, 0.3), 0.7), ((0.85, -0.35, 0.5), 0.46),
                                ((0.36, -0.85, 0.66), 0.4), ((0.92, -0.3, 0.0), 0.4)]):
        c = on_head(d[0] * side, d[1], d[2], sink=0.3)
        eyes.append(ellipsoid(f"eye{s}{k}", (r, r, r * 0.85), at=c, segments=6, rings=4, sharp=0, mat=eye))

# the great horn: from the brow, forward and up, then forked
horn = limb("horn", [(0, -10.0, 4.4), (0, -12.4, 5.4), (0, -14.0, 7.6), (0, -14.5, 10.0)],
            (1.45, 1.15, 0.85, 0.62), sides=6, flat=0.8, mat=skin, sharp=0)
tines = [limb(f"tine{k}", [(0, -14.4, 9.6), (0.85 * sx, -14.8, 11.1), (1.75 * sx, -14.6, 12.5)], (0.6, 0.4, 0.0),
              sides=5, mat=skin, sharp=0) for k, sx in enumerate((1, -1))]
horn_teeth = [spike(f"htooth{k}", (0, y, z), (0, 0.4, 1), 1.0, 0.32) for k, (y, z) in enumerate([(-12.2, 6.2), (-13.6, 7.9)])]
for t in tines:
    paint(t, claw, lambda c: c.z > 11.4)
# a short knob horn either side of the brow
brow = [spike(f"brow{k}", on_head(0.55 * sx, -0.4, 0.75, 0.3), (0.7 * sx, -0.4, 0.9), 1.3, 0.38, sides=4)
        for k, sx in enumerate((1, -1))]

body = join("body", [core, *plates, shield, collar, head, horn, *tines, *horn_teeth, *brow, *eyes, *spikes, *crown, *fan],
            pivot=(0, 0, 5))

# ---- mandibles: hinged at the corners of the mouth, curving in, with an inner tooth ---------------
jl = limb("jaw_L", [(1.7, -10.9, 2.6), (3.8, -12.3, 2.9), (3.6, -14.3, 2.8), (1.0, -15.0, 2.4)],
          (0.85, 0.7, 0.48, 0.0), sides=5, flat=0.55, mat=claw, sharp=0)
jt = spike("jaw_L_tooth", (3.3, -13.1, 2.8), (-1, -0.2, 0.1), 1.4, 0.38)
jaw = join("jaw_L", [jl, jt], pivot=(1.7, -10.9, 2.6))
mirror(jaw)

# ---- legs: massive toothed forelegs, two pairs of walking legs -----------------------------------
# foreleg: a heavy armoured thigh, a broad digging blade of a shin with teeth on its outer edge,
# and a two-hooked claw
fhip, fknee, fankle, ffoot = Vector((2.8, -7.2, 3.0)), Vector((7.2, -8.6, 7.4)), Vector((8.0, -11.4, 1.9)), Vector((7.8, -12.3, 0.0))
fore = [
    limb("leg_L1", [fhip, fhip.lerp(fknee, 0.5) + Vector((0, 0, 0.5)), fknee], (1.3, 1.35, 1.0), sides=6, mat=skin, sharp=0),
    limb("shin", [fknee, fankle, ffoot], (1.15, 0.95, 0.35), sides=6, flat=0.5, mat=skin, sharp=0, floor=0),
    limb("claw_a", [fankle + Vector((-0.2, 0, -0.3)), Vector((7.4, -13.4, 1.1)), Vector((6.7, -13.9, 0.0))], (0.5, 0.32, 0.0),
         sides=5, mat=claw, sharp=0, floor=0),
    limb("claw_b", [fankle + Vector((0.3, 0, -0.3)), Vector((9.0, -12.9, 0.9)), Vector((9.0, -13.3, 0.0))], (0.42, 0.26, 0.0),
         sides=5, mat=claw, sharp=0, floor=0),
    spike("spur1", fknee + Vector((0.2, 0.3, 0.6)), (0.4, 0.5, 1), 1.3, 0.4),
]
for k, t in enumerate((0.25, 0.5, 0.75)):
    p = fknee.lerp(fankle, t) + Vector((0.9, 0, 0))
    fore.append(spike(f"tooth{k}", p, (1, -0.2, -0.3), 1.2 - 0.2 * k, 0.36))
leg = join("leg_L1", fore, pivot=fhip)
paint(leg, under, lambda c: c.z < 3.0 and c.y > -12.4)
mirror(leg)

LEGS = [
    # hip, knee, ankle, foot; radii
    ([(4.0, -2.6, 3.0), (8.6, -3.4, 7.0), (9.3, -4.8, 2.2), (9.35, -5.2, 0.0)], (1.0, 0.85, 0.58, 0.2)),
    ([(4.0, 2.6, 3.0), (8.4, 4.8, 6.8), (9.0, 7.8, 2.2), (9.05, 8.6, 0.0)], (1.0, 0.85, 0.58, 0.2)),
]
for i, (pts, radii) in enumerate(LEGS, start=2):
    hip, knee, ankle, foot = (Vector(p) for p in pts)
    parts = [limb(f"leg_L{i}", pts, radii, sides=6, flat=0.85, mat=skin, sharp=0, floor=0),
             spike(f"legspine{i}", knee.lerp(ankle, 0.45) + Vector((0.3, 0.2, 0)), (1, 0.6, 0.5), 0.9, 0.28),
             spike(f"legspur{i}", knee + Vector((0, 0, 0.4)), (0.4, 0.4, 1), 0.8, 0.3)]
    leg = join(f"leg_L{i}", parts, pivot=pts[0])
    paint(leg, under, lambda c, z=ankle.z: c.z < z + 0.8)
    paint(leg, claw, lambda c: c.z < 0.9)
    mirror(leg)

# ---- short clubbed feelers under the horn --------------------------------------------------------
ant = limb("sway_feeler_L", [(1.4, -10.9, 3.6), (2.5, -12.2, 4.2), (3.0, -13.0, 3.7)], (0.22, 0.16, 0.32),
           sides=4, mat=under, sharp=0)
props(ant, amp=0.8)
mirror(ant)

finish()

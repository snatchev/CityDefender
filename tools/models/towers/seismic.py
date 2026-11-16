"""Seismic pulse: a pile driver. A squat octagonal base with four outrigger feet planted on the
ground, a gantry frame, and a massive hammer on a piston held above an anvil plate. The hammer
(kick_hammer) drops straight down onto the anvil when the tower fires. 13 m across, 9 m tall,
<= 2500 tris."""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

ACCENT = "#d99a5b"
paint_ = mat("paint", ACCENT, rough=0.5, metal=0.3)
dark = gunmetal()
metal = steel()
glow = accent_glow(ACCENT)

DECK = 1.35  # top of the base deck
ANVIL_TOP = 2.6
HAM_BOT = ANVIL_TOP + 1.0  # one metre of travel
HAM_H = 2.3
HAM_Z = HAM_BOT + HAM_H / 2
UPX = 3.5  # gantry uprights at x = +-UPX

# ---- base (fixed): octagon deck, outriggers with ground pads, gantry, housing, cabinet ----------
p = [cylinder("plate", 4.9, 1.0, at=(0, 0, 0.5), sides=8, bevel=0.15, mat=dark)]
p.append(cylinder("deck", 4.4, 0.35, at=(0, 0, 1.17), r2=4.1, sides=8, bevel=0.08, mat=paint_))
for k in range(4):
    th = 45 + k * 90
    a = math.radians(th)
    s, c = math.sin(a), -math.cos(a)
    # outrigger arm: a deep box beam angled down to the foot; foot pad flat on the ground
    p.append(limb(f"arm{k}", [(3.4 * s, 3.4 * c, 1.5), (6.1 * s, 6.1 * c, 0.8)], (0.95, 0.8), sides=4, flat=0.85, mat=paint_))
    p.append(box(f"foot{k}", (2.3, 2.3, 0.5), at=(6.1 * s, 6.1 * c, 0.25), rot=(0, 0, th), bevel=0.12, mat=dark))
    p.append(cylinder(f"ram{k}", 0.42, 0.7, at=(6.1 * s, 6.1 * c, 0.85), sides=6, mat=metal))
    p.append(box(f"foot_glow{k}", (1.1, 0.12, 0.18), at=(5.2 * s + 0.2 * c, 5.2 * c - 0.2 * s, 1.35), rot=(0, 0, th), mat=glow))
# gantry: two uprights with a deep cross beam and diagonal braces
for sx in (1, -1):
    p.append(box(f"up{sx}", (0.9, 1.8, 7.2), at=(sx * UPX, 0, 1.3 + 3.6), top=(0.85, 0.85), bevel=0.1, mat=paint_))
    p.append(box(f"upfoot{sx}", (1.7, 2.6, 0.5), at=(sx * UPX, 0, 1.55), bevel=0.08, mat=dark))
    p.append(box(f"rail{sx}", (0.35, 0.6, 5.0), at=(sx * (UPX - 0.62), -0.9, 4.4), mat=metal))
    p.append(box(f"rail_b{sx}", (0.35, 0.6, 5.0), at=(sx * (UPX - 0.62), 0.9, 4.4), mat=metal))
    for sy in (1, -1):
        p.append(limb(f"brace{sx}{sy}", [(sx * (UPX + 0.2), sy * 2.5, 1.6), (sx * UPX, sy * 0.7, 7.4)], (0.22, 0.22), sides=4, mat=dark))
p.append(box("beam", (8.4, 2.2, 0.9), at=(0, 0, 8.55), bevel=0.12, mat=dark))
p.append(box("beam_top", (7.4, 1.6, 0.2), at=(0, 0, 9.05), bevel=0.05, mat=paint_))
p.append(cylinder("housing", 1.15, 1.6, at=(0, 0, 7.6), r2=1.0, sides=10, bevel=0.06, mat=metal))
p.append(cylinder("housing_cap", 1.35, 0.35, at=(0, 0, 8.3), sides=10, mat=paint_))
p.append(box("beam_glow", (3.0, 0.12, 0.2), at=(0, -1.12, 8.55), mat=glow))
# anvil plate on the deck
p.append(box("anvil_flange", (4.8, 4.8, 0.3), at=(0, 0, DECK + 0.15), bevel=0.08, mat=dark))
p.append(box("anvil", (4.0, 4.0, ANVIL_TOP - DECK - 0.3), at=(0, 0, (ANVIL_TOP + DECK + 0.3) / 2), top=(0.95, 0.95), bevel=0.1, mat=metal))
p.append(box("anvil_top", (3.7, 3.7, 0.15), at=(0, 0, ANVIL_TOP - 0.07), mat=dark))
p.append(box("anvil_glow", (3.0, 0.12, 0.2), at=(0, -2.02, 2.0), mat=glow))
# control cabinet at the back, hose to the housing, steps at the front, rail posts
p.append(box("cabinet", (2.6, 1.4, 1.9), at=(0, 3.3, DECK + 0.95), bevel=0.1, mat=paint_))
for k in range(3):
    p.append(box(f"vent{k}", (0.5, 0.1, 0.9), at=(-0.8 + k * 0.8, 4.03, DECK + 1.0), mat=dark))
p.append(box("cab_glow", (1.8, 0.12, 0.2), at=(0, 2.58, DECK + 1.5), mat=glow))
p.append(limb("hose", [(0, 3.3, 3.2), (0, 2.7, 5.2), (0, 0.9, 7.6)], (0.18, 0.18, 0.18), sides=4, mat=dark))
for k in range(2):
    p.append(box(f"step{k}", (2.4, 1.0, 0.45), at=(0, -4.6 - k * 0.2 + 0.2, 0.3 + k * 0.45 + 0.2), bevel=0.06, mat=metal if k else dark))
for sx in (1, -1):
    p.append(cylinder(f"post{sx}", 0.1, 1.0, at=(sx * 1.4, -3.6, DECK + 0.5), sides=4, mat=metal))
p.append(box("handrail", (2.9, 0.12, 0.12), at=(0, -3.6, DECK + 1.0), mat=metal))
join("base", p, pivot=(0, 0, 0))

# ---- hammer (kick: drops straight down onto the anvil) ------------------------------------------
h = [
    box("ham", (4.0, 4.0, HAM_H), at=(0, 0, HAM_Z), top=(0.92, 0.92), bevel=0.15, mat=dark),
    box("ham_top", (3.6, 3.6, 0.35), at=(0, 0, HAM_BOT + HAM_H + 0.1), bevel=0.1, mat=paint_),
    box("ham_face", (3.7, 3.7, 0.35), at=(0, 0, HAM_BOT + 0.18), bevel=0.08, mat=metal),
    cylinder("rod", 0.55, 2.4, at=(0, 0, HAM_BOT + HAM_H + 1.2), sides=8, mat=metal),
    cylinder("rod_collar", 0.9, 0.45, at=(0, 0, HAM_BOT + HAM_H + 0.55), sides=8, mat=paint_),
]
for sx in (1, -1):
    h.append(box(f"shoe{sx}", (UPX - 0.45 - 1.9, 1.5, 1.0), at=(sx * (1.9 + (UPX - 0.45 - 1.9) / 2), 0, HAM_Z + 0.4), bevel=0.06, mat=dark))
    h.append(box(f"band_glow{sx}", (0.12, 2.6, 0.3), at=(sx * 2.0, 0, HAM_Z - 0.1), mat=glow))
    h.append(box(f"band_glow_f{sx}", (2.4, 0.12, 0.3), at=(0, sx * -2.0, HAM_Z - 0.1), mat=glow))
join("kick_hammer", h, pivot=(0, 0, HAM_Z))

empty("muzzle", (0, -0.01, 7.6))

finish()

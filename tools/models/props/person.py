"""Person: a chunky cartoon townsperson. Big head with painted hair, a barrel torso (`tint`: the
shirt, coloured per person), short legs in trousers, block shoes, mitten hands (`tint2`: skin).
Arms hang straight down from a pivot at the shoulder, so the game can swing them to walk or turn
them straight up to panic. 3.0 m tall, 1.3 m across the shoulders, <= 220 tris."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)

shirt = tint("tint", rough=0.7)
skin = tint("tint2", rough=0.6)
trousers = mat("trousers", "#34405a", rough=0.8)
shoes = mat("shoes", "#2b211b", rough=0.6)
hair = mat("hair", "#4a2e1b", rough=0.8)

HIP_Z, SHOULDER_Z = 1.02, 1.86
SHOULDER_X = 0.56  # arm axis: far enough out that raised hands clear the head

# ---- body: torso (shirt above the belt, trousers below) and the big head --------------------------
torso = cylinder("torso", 0.42, SHOULDER_Z + 0.12 - 0.88, at=(0, 0, (SHOULDER_Z + 0.12 + 0.88) / 2), r2=0.34,
                 sides=7, mat=shirt)
paint(torso, trousers, lambda c: c.z < 1.12)


def head_shape(p):
    # a slightly squarer jaw and a quiff of hair at the front of the crown
    return (p.x * (1.08 if p.z < 0 else 1.0), p.y, p.z + (0.07 if p.z > 0.25 and p.y < 0 else 0.0))


head = ellipsoid("head", (0.4, 0.42, 0.48), at=(0, 0, 2.46), segments=8, rings=5, sharp=50, mat=skin, deform=head_shape)
paint(head, hair, lambda c: c.z > 2.68 or (c.y > 0.1 and c.z > 2.32))  # crown and back of the head
join("body", [torso, head], pivot=(0, 0, 0))

# ---- legs: trouser block and a shoe, pivot at the hip ------------------------------------------------
leg = box("leg_L", (0.3, 0.34, HIP_Z - 0.2), at=(0.19, 0, (HIP_Z + 0.2) / 2), mat=trousers, pivot=(0.19, 0, HIP_Z))
shoe = box("shoe_L", (0.34, 0.54, 0.24), at=(0.2, -0.08, 0.12), mat=shoes, sharp=30)
mirror(join("leg_L", [leg, shoe], pivot=(0.19, 0, HIP_Z)))

# ---- arms: a sleeve with a rounded cap centred on the shoulder, and a mitten -------------------------
# The cap above the pivot makes a clean ball joint, so the arm looks right hanging and raised.
sleeve = limb("arm_L", [(SHOULDER_X, 0, SHOULDER_Z + 0.07), (SHOULDER_X, 0, SHOULDER_Z), (SHOULDER_X, 0, 1.22)],
              (0.0, 0.135, 0.12), sides=5, mat=shirt, twist=0)
mitten = ellipsoid("mitten_L", (0.13, 0.13, 0.18), at=(SHOULDER_X, -0.02, 1.08), segments=5, rings=3, mat=skin)
mirror(join("arm_L", [sleeve, mitten], pivot=(SHOULDER_X, 0, SHOULDER_Z)))

finish()

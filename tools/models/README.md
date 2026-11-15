# Models: Blender scripts → GLB → game

Every bug, tower and barricade is a **Python script run by Blender with no window**. The script is
the source of truth; the `.glb` it writes is what the game loads. Nothing here is modelled by hand,
so a model can be rebuilt, reviewed in a diff, and restyled by changing the script (D060).

```
tools/models/
  lib/            shared helpers (materials, shapes, export, preview render)
  bugs/<id>.py    one script per model; <id> is the key in src/data/mobs.json
  towers/<id>.py  <id> is the key in src/data/towers.json
  barricades/<id>.py  <id> is the key in src/data/barricades.json
  props/<id>.py   street life: people and parked or moving cars (src/render/ambient/)
  previews/<id>.png   three views of each model (committed, for review)
  blend/<id>.blend    the built scene, to open in Blender (gitignored)
public/models/{bugs,towers,barricades,props}/<id>.glb   what the game loads
```

Build one: `npm run models:build -- bugs/skitterling`. Build all: `npm run models:build`.
Check one against this contract: `node tools/models/check.mjs public/models/bugs/skitterling.glb`.

Blender: `/Applications/Blender.app/Contents/MacOS/Blender` (4.5 LTS), always with `--background`.
Stefan's open Blender window is not used for building.

`build.sh` runs each script in its own Blender process, then `check.mjs --quiet` on the GLB, then
`sheet.py`, which puts every preview of a kind on one contact sheet (`previews/_bugs.png`,
`_towers.png`, `_barricades.png`, `_props.png`). A failed build leaves its log in `previews/.<id>.log`.

## Writing a model

```python
"""Skitterling: one line on what it is and how it should read."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import *  # noqa: E402,F403

begin(__file__)                                    # empty scene; kind and id from the path
DARK, GREEN, _ = shades("#7dff3a")
skin, under = mat("skin", GREEN), mat("under", DARK, rough=0.6)
body = ellipsoid("body", (1.6, 2.6, 1.0), at=(0, 1, 1.6), sharp=0, mat=skin)
leg = limb("leg_L1", [(0.9, -1.7, 1.3), (2.3, -2.9, 2.7), (3.75, -3.95, 0)], (0.4, 0.25, 0), mat=under)
mirror(leg)                                        # leg_R1, at -X, normals right
finish()                                           # bake, check, write .glb + .blend + preview
```

The calls you need most:

- `box`, `cylinder`, `cone`, `ellipsoid`, `limb` make one part each. `at=` is its centre in world
  metres, `rot=` degrees, `pivot=` the origin (the joint it moves about; `limb` defaults to its
  first point, the hip). `sharp=0` faceted, `40` default, `180` smooth. `box(..., bevel=0.1)`
  chamfers machine edges.
- `mirror(obj)` copies a part to the other side as its own object (`leg_L1` becomes `leg_R1`).
- `join(name, [parts], pivot=...)` merges rigid pieces into one part (`body`, `turret`, `base`).
- `paint(obj, mat, lambda c: c.z < 1)` recolours the faces whose centre passes the test (bellies,
  claw tips); `cut(obj, normal, offsets)` first adds edges where you want a colour boundary
  (stripes).
- `empty("muzzle", at)` for the tower's muzzle; `props(obj, phase=, amp=)` for motion overrides.
- Props: `tint()` / `tint("tint2")` for the per-instance colours, `lamp("light_head", hex)` for
  lamps, `hull(name, sections)` for a car body lofted through cross-sections.

Every helper is in `lib/` with a docstring; `bugs/skitterling.py`, `towers/mgNest.py`,
`barricades/sawhorse.py`, `props/person.py` and `props/sedan.py` are the reference models. Look at
your preview PNG (1200 x 400, about 150 kB; three views: 3/4 front-left, left side, top with the
front up; darker ground lines every 5 m, plus faint 1 m lines in the top view; barricades show
their neighbours at x ±8, the left one grey) and iterate until it reads.

Pitfalls: build every shape through the helpers (they bake rotation into the mesh and keep the
origin where you say). Do not read `obj.matrix_world` in a script: Blender only updates it when the
scene is evaluated, so it is stale for objects you just made; the helpers use `obj.location`.
Spend triangles on the silhouette: a cut through a UV sphere adds a whole ring of faces, while
`ellipsoid(..., poles="Y")` gives a long body natural segment rings to paint for free.

## The contract (what the game relies on)

The game does not play skeletal animation. Crowds are drawn as instanced meshes, so each model is
merged into one geometry at load and **animated in the vertex shader**, part by part. A part is one
Blender object; its **name** says how it moves and its **origin** is the joint it moves about.

### All models

- **Units:** metres, at the sizes in the tables below. The game draws things much bigger than life
  so they read from far away; keep these sizes.
- **Axes (Blender):** Z up. The model **faces −Y** (Blender's front view shows its face). Its left
  side is +X. Exported with +Y up, so in the game it faces +Z.
- **Origin of the model:** world origin, on the surface it stands on (z = 0 is the street or roof).
  Fliers are the exception: the body's centre is at the world origin.
- **Objects:** top level only (no parenting, no armatures, no shape keys, no animation data).
  Object scale must be 1 and rotation 0 at export (apply both); location carries the pivot.
  Modifiers are fine; they are applied on export. Names: letters, digits and `_` only, no `.001`.
- **Materials:** Principled BSDF with a flat **base colour**, roughness, metallic, and optionally
  **emission** (colour + strength) for parts that glow. No textures, no transparency, no vertex
  colours. At most 6 materials per model. The game bakes base colour and emission into vertex
  attributes.
- **Shading:** smooth shading with sharp edges where the angle is above ~40° (faceted where it
  suits the shape). Normals are exported.
- **No n-gons with holes, no loose vertices, no inside faces** where parts overlap heavily (they cost
  triangles nobody sees).

### Bugs (`public/models/bugs/<id>.glb`)

| Name starts with | Motion (done by the game) | Origin goes |
|---|---|---|
| `leg_` (`leg_L1`, `leg_R3`…) | walks: swings forward and back about the vertical axis, lifts on the forward stroke | at the hip, where the leg meets the body |
| `wing_` (`wing_L1`…) | flaps about the fore–aft axis, fast | at the wing root |
| `jaw_` (`jaw_L`, `jaw_R`) | opens and closes about the vertical axis, slowly | at the hinge |
| `sway_` (antennae, tails, stingers) | sways gently | at its base |
| `seg_` (`seg_1`…, front to back) | body segments ripple front to back (worms) | at the segment's centre |
| `pulse_` (sacs, egg sacs) | swells and shrinks a little | at its centre |
| anything else (`body`, `head`, `shell`…) | rigid; the game bobs the whole bug | anywhere |

- `L` parts sit at +X, `R` parts at −X. Left and right parts are separate objects (no Mirror
  modifier across the two sides of an animated part).
- Legs are numbered front to back. The game alternates them (L1, R2, L3 together; R1, L2, R3
  together). Model legs in a neutral mid-stride pose, feet on z = 0.
- Optional custom properties on a part override the defaults: `phase` (0–1), `amp` (0–2, a
  multiplier on the motion).

### Towers (`public/models/towers/<id>.glb`)

| Name starts with | Motion | Notes |
|---|---|---|
| `turret` | turns to face the target | turns about the vertical axis **through the model origin**, so centre the turret there |
| `kick` | turns with the turret, and jumps directly away from `muzzle` when the tower fires, then eases back | barrels, hammers, pistons |
| `spin` | turns all the time about the vertical axis through its own origin | radar dishes, coil rings |
| `muzzle` | **required.** An Empty where shots start | at the barrel tip (for a tower with no barrel, where its effect comes from) |
| anything else (`base`…) | fixed | |

The model points at −Y at rest (barrels over −Y).

### Barricades (`public/models/barricades/<id>.glb`)

One **module, exactly one tile wide**: it spans x = −4 … +4 m and is repeated along X to cross a
street, so its two ends must meet themselves cleanly. Depth along Y is centred on 0. No moving parts.
The game tints the whole module toward red as it takes damage.

### Props (`public/models/props/<id>.glb`)

Street life: hundreds of people and cars, drawn as instanced meshes like the bugs. One model must
make a varied crowd, so the game colours two materials per instance:

- **`tint`** and **`tint2`**: author them **white** (`tint()` / `tint("tint2")` in lib). The game
  multiplies them by a colour per instance. Person: `tint` is the shirt or coat, `tint2` the skin.
  Car: `tint` is the paint, and there is no `tint2`. They never glow. Every other material keeps
  its own colour. Previews draw `tint` in a sample red and `tint2` in a sample skin tone; the GLB
  stays white.
- **`light_…`** materials (`light_head`, `light_tail`; `lamp()` in lib) are lamps. Give them an
  emission colour and strength (2); the game switches the glow on at night.
- **Person:** `arm_L`, `arm_R` with the origin at the shoulder, modelled hanging straight down at
  the sides; `leg_L`, `leg_R` with the origin at the hip; everything else rigid (`body`). The game
  swings arms and legs to walk, and to panic it turns the arms straight up about the shoulder
  (about the fore–aft axis) and waves them. So an arm must look right both hanging and raised: a
  rounded cap centred on the shoulder pivot, nothing that only works in one pose, and raised hands
  that clear the head. All four parts are required.
- **Cars:** no moving parts. The game crumples them in the vertex shader as they take damage, so
  the big `tint` panels (bonnet, roof, doors, boot) need vertices to move: no `tint` triangle may
  have an edge longer than 1.3 m. `hull()` lofts a body through cross-sections ~1 m apart for
  this; a roof made of two triangles cannot dent.

### How it is checked

`finish()` checks the Blender scene and refuses to export on a violation; `check.mjs` checks the
same rules on the GLB. Both read `lib/contract.json`, the machine-readable copy of the tables below
(keep the two in step). Sizes pass between 80% and 110% of the table. A barricade must span
x = −4 … +4 to within 1 cm. Walkers, towers and barricades must touch z = 0 (within 5 cm) and every
`leg_` must reach it (props too); bugs marked `"flier": true` in contract.json (the wasp) are exempt. Only
`phase` and `amp` may appear as custom properties. The railgun's "rails reach 15 forward" means its
bounds may reach y = −15 (in front of the origin) but only half its 9 m width behind. Inside faces
cannot be checked automatically: look at the preview. Props: the `parts` and `tints` listed in
contract.json must exist, `tint`/`tint2` must be white, `light_` materials must glow, a car's
longest `tint` triangle edge is at most `maxEdge` (1.3 m), and cars have no moving parts.

What the exporter writes (Blender 4.5 glTF exporter): +Y up; modifiers applied; normals (split at
sharp edges); no UVs, tangents or vertex colours; Empties as plain nodes; object custom properties
as `node.extras`. An emission strength above 1 is written as the `KHR_materials_emissive_strength`
extension (three.js's GLTFLoader reads it into `emissiveIntensity`); `emissiveFactor` holds the
colour.

## Sizes and triangle budgets

Triangles are after modifiers. Skitterlings and wasps come in hundreds; stay inside the budget.

| Bug | Length × width × height (m) | Triangles | Main colour |
|---|---|---|---|
| skitterling | 9 × 8 (with legs) × 3 | ≤ 500 | `#7dff3a` acid green |
| beetle | 12 × 9 × 6 | ≤ 1200 | `#ffc93a` gold |
| wasp | 7 long, 9 wingspan, 3 tall | ≤ 500 | `#ff4fd8` magenta |
| grub | 11 × 4 × 4 | ≤ 800 | `#ff8c69` salmon |
| spitter | 8 × 7 × 5 | ≤ 1000 | `#2ef2c9` teal |
| matriarch (boss) | 27 × 19 × 13 | ≤ 3500 | `#ffb12e` amber |
| broodMother (boss) | 37 × 24 × 17 | ≤ 4500 | `#ff5fa2` hot pink |

| Tower | Footprint × height (m) | Triangles | Accent colour |
|---|---|---|---|
| mgNest | 13 across, 10 tall | ≤ 2500 | `#2fb4ff` |
| mortar | 15 across, 12 tall | ≤ 2500 | `#ff7a45` |
| cryo | 10 across, 11 tall | ≤ 2500 | `#aef0ff` |
| railgun | 9 across, 8 tall, rails reach 15 forward | ≤ 2500 | `#a970ff` |
| flak | 14 across, 12 tall | ≤ 2500 | `#9fd66b` |
| tesla | 7 across, 15 tall | ≤ 2500 | `#f5f06a` |
| seismic | 13 across, 9 tall | ≤ 2500 | `#d99a5b` |

| Barricade | Module width × depth × height (m) | Triangles | Colour |
|---|---|---|---|
| sawhorse | 8 × 3 × 2.5 | ≤ 300 | `#f2c14e` police yellow |
| jersey | 8 × 4.2 × 3.75 | ≤ 300 | `#c9c4b8` concrete |
| busWall | 8 × 5.4 × 6 | ≤ 800 | `#3d7fd6` transit blue (no real operator's branding) |
| blastWall | 8 × 6 × 8 | ≤ 600 | `#5a5f66` steel grey |
| spikeStrip | 8 × 2.4 × 0.4 | ≤ 400 | `#8a2b2b` dark red |

| Prop | Length × width × height (m) | Triangles | Tinted materials |
|---|---|---|---|
| person | 3.0 tall, 1.3 across the shoulders (depth free) | ≤ 220 | `tint` shirt, `tint2` skin |
| sedan | 6.0 × 2.4 × 1.9 | ≤ 400 | `tint` paint |
| van | 6.8 × 2.6 × 2.9 | ≤ 400 | `tint` paint |

## Style

Chunky, stylised low-poly, like well-made toys: a few bold shapes, slightly exaggerated proportions,
bevelled hard edges on machines, faceted shells on bugs. No fine detail that vanishes at distance.

- **Read from 100 m.** A skitterling is about 40 px on screen in play. The silhouette and the colour
  must tell the type on their own. Compare with the other models: no two should share an outline.
- **Bugs:** the main colour covers at least 60% of what you see from above (the colour is how a
  player tells bugs apart in a crowd). Use a darker shade of it for legs, joints and undersides, a
  near-black chitin (`#1c1f24`) for claws and mandibles, and **glowing eyes** (`#fff6a0`, emission
  strength 3). One more accent at most. Menacing, not cute; not gory.
- **Towers:** gunmetal (`#2a323d`) and steel (`#5a6878`) machinery with the accent colour painted
  on at least 40% of what you see from above, plus one or two **glowing accent strips** (the accent
  colour, emission strength 2). They should look bolted to a roof: a clear base plate, then the
  mechanism.
- **Barricades:** street furniture in the given colour with one secondary (white/black stripes,
  dark tyres, bare concrete). They must look like one continuous wall when repeated.
- **Props:** friendly and cartoony, the opposite of the bugs: chunky townspeople with big heads,
  mitten hands and block shoes; rounded toy cars with dark glass, dark tyres with a light hubcap,
  grey bumpers. They must read at 30 px tall, and the arms-up panic pose must read as a silhouette.
  Keep fixed colours muted (trousers, hair, glass, tyres) so the tinted colours carry the variety.

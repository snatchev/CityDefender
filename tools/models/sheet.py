"""Contact sheets: every preview of a kind on one image (previews/_bugs.png, _towers.png,
_barricades.png, _props.png). Two columns of 780 x 260 tiles, so a sheet is 1580 px wide. Each tile is a
model's preview, which already carries its id, size and triangle count in the corner.

    /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/models/sheet.py
(build.sh runs it after building.)
"""

import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.preview import write_png  # noqa: E402

MODELS = Path(__file__).resolve().parent
PREVIEWS = MODELS / "previews"
TILE_W, TILE_H, GAP, COLS = 780, 260, 20, 2
BACKGROUND = (0.12, 0.12, 0.13, 1.0)


def tile(path):
    img = bpy.data.images.load(str(path))
    img.scale(TILE_W, TILE_H)
    px = np.empty(TILE_W * TILE_H * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(TILE_H, TILE_W, 4)


for kind in ("bugs", "towers", "barricades", "props"):
    ids = sorted(p.stem for p in (MODELS / kind).glob("*.py"))
    pngs = [PREVIEWS / f"{i}.png" for i in ids if (PREVIEWS / f"{i}.png").exists()]
    out = PREVIEWS / f"_{kind}.png"
    if not pngs:
        continue
    rows = (len(pngs) + COLS - 1) // COLS
    w = COLS * TILE_W + (COLS - 1) * GAP
    h = rows * TILE_H + (rows - 1) * GAP
    sheet = np.empty((h, w, 4), dtype=np.float32)
    sheet[:] = BACKGROUND
    for k, p in enumerate(pngs):
        r, c = divmod(k, COLS)
        y = h - (r + 1) * TILE_H - r * GAP  # Blender rows run bottom to top
        x = c * (TILE_W + GAP)
        sheet[y : y + TILE_H, x : x + TILE_W] = tile(p)
    write_png(out, sheet)
    print(f"{out.relative_to(MODELS.parents[1])}: {len(pngs)} models, {w} x {h}")

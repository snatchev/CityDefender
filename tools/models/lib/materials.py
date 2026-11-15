"""Flat Principled materials from sRGB hex colours.

Every material is one Principled BSDF with a flat base colour, roughness, metallic and optional
emission. Materials are cached by name, so calling `mat("chitin", CHITIN)` twice gives the same one.
"""

import colorsys

import bpy

# Shared colours (sRGB hex), from the style guide in tools/models/README.md.
CHITIN = "#1c1f24"  # claws, mandibles
EYE = "#fff6a0"  # glowing eyes
EYE_STRENGTH = 3.0
GUNMETAL = "#2a323d"  # tower machinery
STEEL = "#5a6878"  # tower machinery, lighter
ACCENT_STRENGTH = 2.0  # glowing accent strips on towers


def hex_rgb(hex_str):
    """'#7dff3a' -> (r, g, b) floats 0..1, still sRGB."""
    h = hex_str.lstrip("#")
    if len(h) != 6:
        raise ValueError(f"colour must be #rrggbb, got {hex_str!r}")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def srgb_to_linear(c):
    """One sRGB channel (0..1) to linear, the exact piecewise sRGB curve."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear(hex_str):
    """'#rrggbb' (sRGB) -> linear RGBA tuple, what Blender's colour sockets take."""
    return tuple(srgb_to_linear(c) for c in hex_rgb(hex_str)) + (1.0,)


def _hex(rgb):
    return "#" + "".join(f"{round(max(0, min(1, c)) * 255):02x}" for c in rgb)


def shades(hex_str, dark=0.5, light=1.25):
    """(darker, base, lighter) sRGB hex of a colour, same hue.

    The darker one is for legs, joints and undersides; the lighter one for highlights.
    `dark`/`light` scale the HLS lightness (0.5 = half as light).
    """
    h, l, s = colorsys.rgb_to_hls(*hex_rgb(hex_str))
    return (
        _hex(colorsys.hls_to_rgb(h, l * dark, s)),
        hex_str,
        _hex(colorsys.hls_to_rgb(h, min(0.95, l * light), s)),
    )


def mat(name, hex_str, rough=0.5, metal=0.0, emit=None, strength=0.0):
    """A flat Principled material (cached by name).

    hex_str: base colour, sRGB '#rrggbb'. rough/metal: 0..1.
    emit: emission colour (sRGB hex) or True for the base colour; strength: emission strength.
    """
    m = bpy.data.materials.get(name)
    if m is not None:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = linear(hex_str)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = linear(hex_str if emit is True else emit)
        bsdf.inputs["Emission Strength"].default_value = strength or 1.0
    m.diffuse_color = linear(hex_str)  # viewport colour, so the .blend reads in Solid mode
    return m


# Shared materials. Functions, not constants: materials must be created after begin() resets the scene.
def chitin():
    """Near-black glossy chitin for claws and mandibles."""
    return mat("chitin", CHITIN, rough=0.35)


def eye_glow():
    """Glowing bug eyes: #fff6a0, emission strength 3."""
    return mat("eye", EYE, rough=0.3, emit=True, strength=EYE_STRENGTH)


def gunmetal():
    """Dark tower machinery."""
    return mat("gunmetal", GUNMETAL, rough=0.45, metal=0.6)


def steel():
    """Lighter tower machinery."""
    return mat("steel", STEEL, rough=0.4, metal=0.7)


def accent_glow(hex_str):
    """A tower's glowing accent strip: its accent colour, emission strength 2."""
    return mat("accent_glow", hex_str, rough=0.3, emit=True, strength=ACCENT_STRENGTH)


def tint(name="tint", rough=0.5, metal=0.0):
    """Props: a white material the game multiplies by a colour per instance. 'tint' is a person's
    shirt or a car's paint, 'tint2' a person's skin. Previews draw them in sample colours."""
    if name not in ("tint", "tint2"):
        raise ValueError("tinted materials are named 'tint' or 'tint2'")
    return mat(name, "#ffffff", rough=rough, metal=metal)


def lamp(name, hex_str, strength=2.0):
    """Props: a lamp the game switches on at night. Its name must start with 'light_'."""
    if not name.startswith("light_"):
        raise ValueError("lamp materials are named light_<something>, e.g. light_head")
    return mat(name, hex_str, rough=0.3, emit=True, strength=strength)

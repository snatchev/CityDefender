"""City Defender model library. A model script does `from lib import *`; see tools/models/README.md."""

from .materials import (  # noqa: F401
    ACCENT_STRENGTH, CHITIN, EYE, EYE_STRENGTH, GUNMETAL, STEEL,
    accent_glow, chitin, eye_glow, gunmetal, lamp, linear, mat, shades, steel, tint,
)
from .scene import ContractError, begin, finish  # noqa: F401
from .shapes import (  # noqa: F401
    apply_modifiers, box, cone, cut, cylinder, ellipsoid, empty, hull, join, limb, mirror, paint, props,
    set_origin,
)

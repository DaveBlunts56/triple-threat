"""Generates the pictures the players' materials repeat or mask with, into assets/maps/: our own, so they are CC0.

    blender-4.5 --background --python tools/blender/maps.py

Blender is only used for its Python, which has NumPy, and to write PNGs. Every tile wraps: its left edge meets its
right and its top its bottom, so it can be repeated without a seam. A normal map is made from a height field, with its
slopes taken across the wrap.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import project  # noqa: E402

SIZE = 512
# The knit: holes on a grid of this many to the tile (a 4 cm tile: a hole every 2 mm), this deep and this wide (a share
# of the grid's spacing), between ribs that run down the cloth. The twill: diagonal ribs, this many to the tile.
KNIT = {'holes': 20, 'depth': 1.0, 'radius': 0.26, 'ribs': 0.25, 'strength': 4.0, 'rough': 0.76, 'roughHole': 0.9}
TWILL = {'lines': 48, 'strength': 2.5, 'rough': 0.84}


def grid(size=SIZE):
    """x and y of every pixel, from 0 to 1 across the tile."""
    v = (np.arange(size) + 0.5) / size
    return np.meshgrid(v, v)


def tile_normal(height, strength):
    """A tangent-space normal map (RGB, 0 to 1) from a height field, its slopes taken across the wrap."""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5 * strength
    n = np.stack([-dx, dy, np.ones_like(height)], axis=-1)   # image rows run down; a normal map's green points up
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def knit(size=SIZE):
    """The jersey's mesh knit: (height, roughness)."""
    x, y = grid(size)
    cx, cy = (x * KNIT['holes']) % 1 - 0.5, (y * KNIT['holes']) % 1 - 0.5
    r = np.hypot(cx, cy) / KNIT['radius']
    hole = np.clip(1 - r, 0, 1) ** 0.7                      # 1 in the middle of a hole, 0 outside it
    ribs = 0.5 + 0.5 * np.cos(2 * np.pi * x * KNIT['holes'] * 2)   # two ribs between each pair of holes, running down
    height = (1 - KNIT['depth'] * hole) * (1 - KNIT['ribs'] * (1 - ribs))
    rough = KNIT['rough'] + (KNIT['roughHole'] - KNIT['rough']) * hole
    return height, rough


def twill(size=SIZE):
    """The shorts' twill: (height, roughness)."""
    x, y = grid(size)
    ribs = 0.5 + 0.5 * np.sin(2 * np.pi * (x + y) * TWILL['lines'])
    height = ribs ** 1.5
    rough = TWILL['rough'] + 0.04 * (ribs - 0.5)
    return height, rough


def save(name, rgb):
    """Writes a picture (rows from the top, RGB or a single channel, 0 to 1) as assets/maps/<name>.png."""
    import bpy
    if rgb.ndim == 2:
        rgb = np.repeat(rgb[..., None], 3, axis=-1)
    h, w = rgb.shape[:2]
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], axis=-1)[::-1]   # Blender's rows run from the bottom
    image = bpy.data.images.new(name, w, h, alpha=False)
    image.colorspace_settings.name = 'Non-Color'                       # the numbers are written as they are
    image.pixels = rgba.astype(np.float32).ravel()
    path = project('assets', 'maps', f'{name}.png')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.filepath_raw, image.file_format = path, 'PNG'
    image.save()
    bpy.data.images.remove(image)
    print('MAPS wrote', path)


def main():
    height, rough = knit()
    save('knit-normal', tile_normal(height, KNIT['strength']))
    save('knit-rough', rough)
    height, rough = twill()
    save('twill-normal', tile_normal(height, TWILL['strength']))
    save('twill-rough', rough)


if __name__ == '__main__':
    main()

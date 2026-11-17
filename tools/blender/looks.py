"""A player's own skin picture (used by build_players.py): the generator's skin, which players of one base skin share,
copied for him alone, tinted to his skin tone, and with his beard painted on.

The beard is painted into the skin's picture rather than modelled, so it moves with his face's expressions and never
stands off his skin. Where it grows is worked out on his own head (see BEARD): every face of the skin is painted
through its corners' places in the picture, as dense as the beard is at those corners.
"""
import math

import bpy
import numpy as np

# Where a beard grows, in metres from his own landmarks (`eyes`, `mouth`: their heights; the chin is found from them):
# up the cheek to `cheek` of the way from the mouth to the eyes; under the chin `under` (more for a full beard);
# round the jaw to `round` radians from straight ahead (the ears are at about a quarter turn), up to the top of the
# ears near them as sideburns. The lips (`lips`: half width, half height) and the nose stay clear. `soft`: how far
# the edges fade.
BEARD = {'cheek': 0.3, 'chin': 0.85, 'under': {'short': 0.022, 'full': 0.035, 'stubble': 0.018}, 'round': 1.62, 'burns': 1.25,
         'lips': (0.027, 0.0075), 'soft': 0.012,
         'mustache': (0.032, 0.005, 0.02), 'goatee': (0.03, 0.012)}
# How dense each kind is painted (0 to 1), and how much the hairs vary from pixel to pixel.
DENSITY = {'stubble': 0.3, 'mustache': 0.72, 'goatee': 0.72, 'short': 0.62, 'full': 0.8}
GRAIN = 0.5


def read(image):
    """A picture's pixels as one flat array (foreach_get: reading them one by one takes many seconds)."""
    pixels = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels


def hex_rgb(colour):
    return np.array([int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)


def skin_image(body):
    """The skin's colour picture (the first picture of its first material)."""
    return next(n.image for n in body.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)


def own_skin(body, name, tone):
    """Gives `body` a copy of its skin picture of its own, `name`, tinted so that its skin's average colour is `tone`
    ('#rrggbb'). The picture's details (pores, shading) stay; each channel is scaled."""
    image = skin_image(body)
    width, height = image.size
    pixels = read(image).reshape(-1, 4)
    seen = pixels[:, 3] > 0.5
    average = pixels[seen, :3].mean(axis=0)
    pixels[:, :3] = np.clip(pixels[:, :3] * (hex_rgb(tone) / np.maximum(average, 1e-3)), 0, 1)
    copy = bpy.data.images.new(name, width, height, alpha=True)
    copy.alpha_mode = image.alpha_mode
    copy.pixels.foreach_set(pixels.ravel())
    copy.pack()
    for material in body.data.materials:
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image is image:
                node.image = copy
    return copy


def soft(edge, x):
    """1 well inside an edge (x < edge), 0 well outside, fading over BEARD['soft']."""
    return min(1.0, max(0.0, (edge - x) / BEARD['soft'] + 0.5))


def beard_density(kind, p, frame, eyes, mouth):
    """How dense a beard of `kind` is at the point `p` of his skin (0 to 1)."""
    middle = frame['middle']
    x, turn = abs(p.x - middle.x), abs(math.atan2(p.x - middle.x, -(p.y - middle.y)))
    chin = mouth - BEARD['chin'] * (eyes - mouth)
    lw, lh = BEARD['lips']
    lips = x < lw and abs(p.z - mouth) < lh and turn < 0.7
    if kind in ('mustache', 'goatee'):
        mw, low, high = BEARD['mustache']
        d = soft(mw, x) * soft(p.z, mouth + lh - 0.001 + low - 0.005) * soft(mouth + high, p.z) * (turn < 0.8)
        if kind == 'goatee':
            gw, gap = BEARD['goatee']
            d = max(d, soft(gw, x) * soft(mouth - gap, p.z) * soft(p.z, chin - 0.012) * (turn < 0.8))
            d = max(d, soft(mw, x) * (x > lw - 0.004) * soft(p.z, mouth - gap) * soft(mouth + high, p.z) * (turn < 0.8))
        return 0.0 if lips else d
    # A beard: the cheeks below the cheekbones, the upper lip, the chin and under the jaw, round to the ears.
    if turn > BEARD['round'] or lips:
        return 0.0
    near_ear = min(1.0, max(0.0, (turn - BEARD['burns']) / (BEARD['round'] - BEARD['burns'])))
    top = mouth + BEARD['cheek'] * (eyes - mouth)
    top = top + (frame['side'] - top) * near_ear   # sideburns, up to the top of the ears
    nose = turn < 0.32 and p.z > mouth + 0.02
    bottom = chin - BEARD['under'][kind] + near_ear * (BEARD['under'][kind] + 0.02)
    return 0.0 if nose else soft(top, p.z) * soft(p.z, bottom)


def paint_beard(body, image, kind, colour, frame, eyes, mouth, seed):
    """Paints a beard of `kind` (see DENSITY) in `colour` ('#rrggbb') into the skin picture `image`, from where his
    skin is now. `eyes`, `mouth`: the heights of his eyes and of his mouth."""
    mw = body.matrix_world
    density = np.array([beard_density(kind, mw @ v.co, frame, eyes, mouth) for v in body.data.vertices], dtype=np.float32)
    if not density.any():
        return
    width, height = image.size
    painted = np.zeros((height, width), dtype=np.float32)
    uv = body.data.uv_layers.active.data
    slots = {slot for slot, material in enumerate(body.data.materials) if image in [n.image for n in material.node_tree.nodes if n.type == 'TEX_IMAGE']}
    for polygon in body.data.polygons:
        if polygon.material_index not in slots or not density[list(polygon.vertices)].any():
            continue
        corners = [(np.array([uv[i].uv.x * width, uv[i].uv.y * height]), density[v]) for i, v in zip(polygon.loop_indices, polygon.vertices)]
        for k in range(1, len(corners) - 1):   # a fan of triangles
            (a, da), (b, db), (c, dc) = corners[0], corners[k], corners[k + 1]
            x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
            x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
            x0, y0, x1, y1 = max(0, x0), max(0, y0), min(width - 1, x1), min(height - 1, y1)
            if x1 < x0 or y1 < y0:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(det) < 1e-9:
                continue
            wa = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
            wb = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
            wc = 1 - wa - wb
            inside = (wa >= -0.02) & (wb >= -0.02) & (wc >= -0.02)
            value = np.where(inside, wa * da + wb * db + wc * dc, 0)
            block = painted[y0:y1 + 1, x0:x1 + 1]
            np.maximum(block, value, out=block)
    rng = np.random.default_rng(seed)
    hairs = painted * DENSITY[kind] * (1 - GRAIN + GRAIN * rng.random((height, width), dtype=np.float32))
    pixels = read(image).reshape(height, width, 4)
    pixels[:, :, :3] = pixels[:, :, :3] * (1 - hairs[:, :, None]) + hex_rgb(colour)[None, None, :] * hairs[:, :, None]
    image.pixels.foreach_set(pixels.ravel())
    image.pack()

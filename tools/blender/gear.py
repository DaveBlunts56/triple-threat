"""Gear by script (spec section 7.2), used by build_players.py: headbands, arm and leg sleeves and wristbands cut from
the skin they sit on, as the kit is, and the pack's trainers made into high-tops in the player's team colour.

A person's `gear` in people.json is a list of [item, colour]: the item one of ITEMS, the colour 'white', 'black' or
'team'. Each item is a mesh of its own with the material gear-<item>-<colour>; the game colours it (src/render/kit.js
GEAR). The skin under a sleeve or band is taken away, as under the kit (see under_gear).
"""
import re

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from common import project
from kit import SHORTS, cut_out, tidy_border

BONE = 'mixamorig:'
ITEMS = ('headband', 'armSleeveLeft', 'armSleeveRight', 'legSleeveLeft', 'legSleeveRight', 'wristbandLeft', 'wristbandRight')
COLOURS = ('white', 'black', 'team')
# off: how far a band stands off the skin, thick: how thick it is (metres). headband: its bottom under the forehead's
# hairline and how tall it is, and how far it stands off (over close-cut hair). shoulder: an arm sleeve starts this far
# from the shoulder joint. hem: a leg sleeve starts this far under the shorts' hem. wrist: how far up the forearm a
# wristband reaches, from the wrist joint.
BAND = {'off': 0.0025, 'thick': 0.002, 'headband': (0.025, 0.04, 0.008), 'shoulder': 0.06, 'hem': 0.03, 'wrist': 0.06}
# The high-tops: the collar raised this far up the leg, over the sock, starting this far under the ankle joint, and
# let out round the leg by this share. (The sole is left as it is: a thicker one would lift him off his planted feet.)
SHOES = {'raise': 0.06, 'below': 0.03, 'out': 0.08}


def team_colours():
    """The teams' colours as (r, g, b) from 0 to 1, as the game paints the kit (src/render/kit.js KIT.team)."""
    text = open(project('src', 'render', 'kit.js')).read()
    hexes = re.search(r"team: f\(\[\s*'(#[0-9a-f]{6})',\s*'(#[0-9a-f]{6})'\s*\]\)", text).groups()
    return [tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)) for h in hexes]


def band_points(body, item, mark, bones, frame, shoe_top, joint):
    """Which points of the body's skin an `item` covers: keep(i) -> bool. `joint(name)`: where a joint of his
    skeleton is (name without mixamorig:)."""
    mw = body.matrix_world
    coords = [mw @ v.co for v in body.data.vertices]
    skin = body.vertex_groups['body'].index
    is_skin = [any(g.group == skin and g.weight > 0 for g in v.groups) for v in body.data.vertices]
    side = 'Left' if item.endswith('Left') else 'Right'
    if item == 'headband':
        low, tall, _ = BAND['headband']
        bottom = frame['front'] - low
        return lambda i: is_skin[i] and bottom <= coords[i].z <= bottom + tall and bones[i] in ('Head', 'Neck') and i not in frame['ears']
    if item.startswith('armSleeve'):
        start = joint(f'{side}Arm')
        return lambda i: is_skin[i] and bones[i] in (f'{side}Arm', f'{side}ForeArm') and (coords[i] - start).length > BAND['shoulder']
    if item.startswith('legSleeve'):
        top = mark['knee'] - SHORTS['below_knee'] - BAND['hem']   # the shorts' hem less the gap
        return lambda i: is_skin[i] and bones[i] in (f'{side}UpLeg', f'{side}Leg') and shoe_top + 0.01 < coords[i].z < top
    wrist = joint(f'{side}Hand')
    return lambda i: is_skin[i] and bones[i] == f'{side}ForeArm' and (coords[i] - wrist).length < BAND['wrist']


def make_item(body, item, colour, keep, off, levels=()):
    """One item cut from the skin it covers, standing `off` from it, BAND['thick'] thick, with its own material; its
    edges near the heights `levels` laid level on them."""
    piece = cut_out(body, f'gear-{item}', keep)
    tidy_border(piece, flat=levels)
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * off
    bm.to_mesh(piece.data)
    bm.free()
    bpy.context.view_layer.objects.active = piece
    solid = piece.modifiers.new('thick', 'SOLIDIFY')
    solid.thickness, solid.offset, solid.use_rim, solid.use_even_offset = BAND['thick'], 1, True, False
    bpy.ops.object.modifier_move_to_index(modifier=solid.name, index=0)
    bpy.ops.object.modifier_apply(modifier=solid.name)
    piece.data.materials.clear()
    m = bpy.data.materials.new(f'gear-{item}-{colour}')   # his own: it is named for him when he is finished
    m.use_nodes = True
    shader = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = {'white': (0.9, 0.9, 0.9, 1), 'black': (0.03, 0.03, 0.03, 1), 'team': (0.3, 0.3, 0.8, 1)}[colour]
    piece.data.materials.append(m)
    for polygon in piece.data.polygons:
        polygon.use_smooth = True
    return piece


def make_gear(body, row, mark, bones, frame, shoe_top, joint):
    """His gear as {item: object}, and the points of the body's skin it hides."""
    made, hidden = {}, set()
    for item, colour in row.get('gear', []):
        keep = band_points(body, item, mark, bones, frame, shoe_top, joint)
        bottom = frame['front'] - BAND['headband'][0]
        levels = (bottom, bottom + BAND['headband'][1]) if item == 'headband' else ()
        made[item] = make_item(body, item, colour, keep, BAND['headband'][2] if item == 'headband' else BAND['off'], levels)
        if item != 'headband':   # the forehead under a headband is still needed for his face's expressions
            hidden |= {i for i in range(len(body.data.vertices)) if keep(i)}
    return made, hidden


def high_tops(shoes, ankle_height):
    """The pack's trainers made into high-tops: each upper's collar drawn up the leg over the sock and let out round
    it. Each foot has two pieces: the trainer, the larger, and the sock, a tube round his leg."""
    bm = bmesh.new()
    bm.from_mesh(shoes.data)
    pieces, left = [], set(bm.verts)
    while left:
        stack, piece = [left.pop()], set()
        while stack:
            v = stack.pop()
            piece.add(v)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o in left:
                    left.discard(o)
                    stack.append(o)
        pieces.append(piece)
    pieces.sort(key=len, reverse=True)
    middle = lambda piece: sum((v.co for v in piece), Vector()) / len(piece)
    for trainer in pieces[:2]:
        side = middle(trainer).x > 0
        leg = middle(next(p for p in pieces[2:] if (middle(p).x > 0) == side))   # the sock on the same foot
        start = ankle_height - SHOES['below']
        top = max(v.co.z for v in trainer)
        for v in trainer:
            up = max(0.0, min(1.0, (v.co.z - start) / max(top - start, 1e-6)))
            if up > 0:
                v.co += Vector((0, 0, SHOES['raise'] * up * up)) + Vector((v.co.x - leg.x, v.co.y - leg.y, 0)) * (SHOES['out'] * up)
    bm.to_mesh(shoes.data)
    bm.free()


def paint_shoes(shoes, team):
    """The shoes' picture in his team's colour: the dark stripes set in the white upper, and the green accents."""
    image = next(n.image for n in shoes.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
    w, h = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[:, :, :3]
    bright, dark = rgb.min(axis=2) > 0.65, rgb.max(axis=2) < 0.25
    green = (rgb[:, :, 1] > rgb[:, :, 0] + 0.12) & (rgb[:, :, 1] > rgb[:, :, 2] + 0.12)
    # How much of the white upper lies round each pixel: a box sum over a few pixels each way.
    reach = max(2, w // 40)   # about as far as a stripe is wide
    padded = np.pad(bright.astype(np.float32), reach)
    total = np.zeros_like(bright, dtype=np.float32)
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            total += padded[reach + dy:reach + dy + h, reach + dx:reach + dx + w]
    stripes = dark & (total / (2 * reach + 1) ** 2 > 0.2)
    colour = np.array(team_colours()[team], dtype=np.float32)
    paint = stripes | green
    rgb[paint] = colour * 0.9
    name = f'shoes-team-{team}'
    if name in bpy.data.images:   # made once for each team
        copy = bpy.data.images[name]
        for node in shoes.data.materials[0].node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image is image:
                node.image = copy
        return
    copy = bpy.data.images.new(name, w, h, alpha=True)
    copy.pixels = px.ravel()
    copy.pack()
    for node in shoes.data.materials[0].node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image is image:
            node.image = copy

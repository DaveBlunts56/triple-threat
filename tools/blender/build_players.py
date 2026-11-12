"""Builds assets/players.glb from assets/source/people.json.

    blender-4.5 --background --python tools/blender/build_players.py [-- --shots DIR]

Each person is generated with MPFB, given the Mixamo skeleton, dressed in a jersey and shorts made from the body's
own "tights" helper surface, stripped of the skin the kit hides, scaled to his height and exported.
People who share a skin, a hair style and colour, or the shoes, eyes, brows and lashes share that picture.
With --shots, a contact sheet of each finished player is written to DIR so the result can be looked at.
"""
import importlib
import json
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import MPFB, bounds, clear_scene, project, service, snapshot  # noqa: E402

BONE = 'mixamorig:'
# Muscle and weight for each build (MPFB macros, 0 to 1).
BUILDS = {'slim': (0.65, 0.38), 'athletic': (0.82, 0.45), 'strong': (0.95, 0.58)}
# Longest side of each picture in pixels, by what it covers. The skin is seen close up; the rest is small on screen.
# A recoloured hair picture is smaller than one in its own colours, so that ten players fit the size the file may have.
TEXTURE = {'skin': 2048, 'hair': 512, 'recoloured': 384, 'shoes': 512, 'eyes': 256, 'brows': 256, 'lashes': 256}
OPAQUE = ('skin', 'shoes', 'eyes')   # the generator wires transparency into every material; these do not need it
# How loosely the kit hangs: how far each ring of the surface is pushed out from the body, as a share of its radius.
JERSEY = {'chest': 0.05, 'hem': 0.16, 'drop': 0.10}       # drop: metres the hem hangs below the hip joints
SHORTS = {'hip': 0.07, 'hem': 0.42, 'above_knee': 0.03, 'rise': 0.09}   # rise: metres the waistband sits above the hip bone's root
SKIN_MARGIN = 0.05   # metres of skin kept under the edge of the kit, so no gap shows when he moves
# Where the two panels of a kit piece sit in its picture, as shares of the picture's width: the middle of the front panel,
# the middle of the back panel, and how wide each is. The game paints the colour, the trim and the number onto them.
PANEL = {'front': 0.25, 'back': 0.75, 'width': 0.46}
# Share of triangles kept when a mesh is simplified. The face keeps all of its own.
KEEP = {'body': 0.42, 'hair': 0.65, 'shoes': 0.65}
# A face other than the generator's own: this many shapes from these folders of MPFB's targets, each this strong.
# Targets ending in `sideways` move the whole head, nose or mouth to one side, so they are never used.
FACE = {'parts': ('head', 'nose', 'chin', 'cheek', 'mouth', 'eyes', 'forehead'), 'shapes': 6, 'weight': (0.3, 0.8),
        'sideways': ('-trans-in', '-trans-out')}


def people():
    with open(project('assets', 'source', 'people.json')) as f:
        return json.load(f)['people']


def asset(fragment, subdir):
    path = service('assetservice', 'AssetService').find_asset_absolute_path(fragment, subdir)
    if not path:
        raise FileNotFoundError(f'MPFB asset not found: {subdir}/{fragment} (is the system assets pack loaded?)')
    return path


def face_targets(seed):
    """The shapes that make the face numbered `seed`, as [(path of the target, weight)]. 0 is the generator's own face.

    The face stays symmetrical: a shape for the left side (l-...) always comes with its twin for the right (r-...) at
    the same weight, and the two are one choice. A one-sided shape with no twin is never chosen, nor is one that moves
    a whole feature sideways.
    """
    if not seed:
        return []
    folder = os.path.join(os.path.dirname(importlib.import_module(MPFB).__file__), 'data', 'targets')
    groups = {}   # a shape and its opposite are one group: nose-hump-incr and nose-hump-decr are both "nose-hump"
    for part in FACE['parts']:
        names = sorted(name[:-len('.target.gz')] for name in os.listdir(os.path.join(folder, part)) if name.endswith('.target.gz'))
        for name in names:
            side, _, shape = name.partition('-')
            twin = f'r-{shape}'
            if side == 'r' or (side == 'l' and twin not in names) or (side != 'l' and name.endswith(FACE['sideways'])):
                continue                                   # a right side is taken with its left; the rest would be lopsided
            files, shape = ([name, twin], shape) if side == 'l' else ([name], name)
            groups.setdefault(shape.rsplit('-', 1)[0], []).append([os.path.join(folder, part, f'{file}.target.gz') for file in files])
    rng = random.Random(seed)
    chosen = [(rng.choice(groups[group]), rng.uniform(*FACE['weight'])) for group in rng.sample(sorted(groups), FACE['shapes'])]
    return [(path, weight) for paths, weight in chosen for path in paths]


def make_body(row):
    """The generated human with skin, skeleton, eyes, brows, lashes, hair (unless bald) and shoes. Returns (body, rig, parts)."""
    HumanService, TargetService = service('humanservice', 'HumanService'), service('targetservice', 'TargetService')
    macro = TargetService.get_default_macro_info_dict()
    muscle, weight = BUILDS[row['build']]
    macro.update(gender=1.0, age=0.5, muscle=muscle, weight=weight, height=0.75, proportions=0.85)
    race = row['skin'].split('_')[1]   # skins are named <age>_<race>_male; "asian" must not be found inside "caucasian"
    macro['race'] = {name: 1.0 if name == race else 0.0 for name in ('asian', 'caucasian', 'african')}
    body = HumanService.create_human(scale=0.1, macro_detail_dict=macro, detailed_helpers=True)
    for path, strength in face_targets(row['face']):   # before anything is fitted, so that everything follows the face
        TargetService.load_target(body, path, weight=strength)
    HumanService.set_character_skin(asset(f"{row['skin']}/{row['skin']}.mhmat", 'skins'), body, skin_type='GAMEENGINE', material_instances=False)
    rig = HumanService.add_builtin_rig(body, 'mixamo')   # before anything is fitted, or it will not follow the skeleton

    hair = [('hair', 'hair', f"{row['hair']}/{row['hair']}.mhclo", 'Hair')] if row['hair'] else []
    parts = {}
    for name, subdir, fragment, kind in [
        ('eyes', 'eyes', 'low-poly/low-poly.mhclo', 'Eyes'),
        ('brows', 'eyebrows', 'eyebrow001/eyebrow001.mhclo', 'Eyebrows'),
        ('lashes', 'eyelashes', 'eyelashes01/eyelashes01.mhclo', 'Eyelashes'),
        *hair,
        ('shoes', 'clothes', 'shoes05/shoes05.mhclo', 'Clothes'),   # the white trainers, with socks
    ]:
        parts[name] = HumanService.add_mhclo_asset(asset(fragment, subdir), body, asset_type=kind, subdiv_levels=0, material_type='GAMEENGINE')
    return body, rig, parts


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bake_shape(obj):
    """Make the generated shape permanent, so the mesh can be cut up."""
    if obj.data.shape_keys:
        activate(obj)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)


def landmarks(rig):
    """Heights and positions of the joints the kit is cut along, in metres."""
    head = lambda name: rig.matrix_world @ rig.data.bones[BONE + name].head_local
    return {
        'hip': head('LeftUpLeg').z, 'knee': head('LeftLeg').z, 'pelvis': head('Hips').z, 'chest': head('Spine2').z,
        'neck': head('Neck').z, 'shoulder': head('LeftArm'), 'thigh': head('LeftUpLeg'), 'spine_y': head('Spine1').y,
    }


def dominant_bones(obj):
    """For each vertex, the name of the bone that moves it most (without the mixamorig: prefix)."""
    names = {g.index: g.name[len(BONE):] for g in obj.vertex_groups if g.name.startswith(BONE)}
    out = []
    for v in obj.data.vertices:
        best = max((g for g in v.groups if g.group in names), key=lambda g: g.weight, default=None)
        out.append(names[best.group] if best else None)
    return out


def in_group(obj, name):
    index = obj.vertex_groups[name].index
    return [any(g.group == index and g.weight > 0 for g in v.groups) for v in obj.data.vertices]


def cut_out(body, name, keep_vertex):
    """A new object holding the faces of `body` whose corners all satisfy keep_vertex(index). Weights come with it."""
    activate(body)
    bpy.ops.object.duplicate()
    piece = bpy.context.view_layer.objects.active
    piece.name = name
    for m in [m for m in piece.modifiers if m.type != 'ARMATURE']:
        piece.modifiers.remove(m)
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(keep_vertex(v.index) for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(piece.data)
    bm.free()
    return piece


def tidy_border(piece, flat=()):
    """Cut edges follow the faces they were cut along, so they are ragged. Level the hems, and round off the rest.

    `flat` lists heights: border corners within 12 cm of one are moved onto it.
    """
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    border = {v: [e.other_vert(v) for e in v.link_edges if e.is_boundary] for v in bm.verts if v.is_boundary}
    level = {}
    for v in border:
        near = [z for z in flat if abs(v.co.z - z) < 0.12]
        if near:
            v.co.z = level[v] = near[0]
    # Smooth each border loop without shrinking it: a step toward the neighbours, then a slightly larger step back.
    for step in [0.5, -0.53] * 12:
        moved = {v: v.co + step * ((ns[0].co + ns[1].co) / 2 - v.co) for v, ns in border.items() if len(ns) == 2}
        for v, co in moved.items():
            v.co = Vector((co.x, co.y, level[v])) if v in level else co
    bm.to_mesh(piece.data)
    bm.free()


def simplify(obj, keep, protect=None):
    """Reduce the mesh to about `keep` of its triangles. Vertices in the `protect` group are left as they are."""
    activate(obj)
    modifier = obj.modifiers.new('simplify', 'DECIMATE')
    modifier.ratio = keep
    if protect:
        modifier.vertex_group, modifier.invert_vertex_group, modifier.vertex_group_factor = protect, True, 1000
    bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def plain_material(name):
    """White and matte: the game tints it in the team's colour. There is one of each name, shared by every player."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
    shader.inputs['Roughness'].default_value = 0.85
    material.use_backface_culling = False   # the inside shows at the hem and the arm holes
    return material


def dress(piece, material, levels):
    piece.data.materials.clear()
    piece.data.materials.append(material)
    if levels:
        activate(piece)
        modifier = piece.modifiers.new('smooth', 'SUBSURF')
        modifier.levels = levels
        bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)   # before the skeleton, so it can be applied
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    for polygon in piece.data.polygons:
        polygon.use_smooth = True


def panel_uvs(piece):
    """Lay the piece out in its picture as two panels side by side: the front on the left, the back on the right.

    Each face corner is placed by where it is: across its panel by its x, up it by its z, so the top edge of the piece
    is the top of the picture. A face is on the front when it faces forward (humans face -Y). Across the front the
    picture runs toward his left and across the back toward his right, so both read the right way round from outside.
    """
    mesh = piece.data
    xs, zs = [v.co.x for v in mesh.vertices], [v.co.z for v in mesh.vertices]
    width, lowest, height = max(xs) - min(xs), min(zs), max(zs) - min(zs)
    corners = mesh.uv_layers.active.data   # the layer the piece was cut out with, so the joined mesh still has only one
    for polygon in mesh.polygons:
        front = polygon.normal.y < 0
        for corner, vertex in zip(polygon.loop_indices, polygon.vertices):
            across = PANEL['width'] * xs[vertex] / width
            corners[corner].uv = (PANEL['front'] + across if front else PANEL['back'] - across, (zs[vertex] - lowest) / height)


def make_jersey(body, mark, bones, tights):
    """A sleeveless jersey: the torso of the tights surface, hung loose, with a scooped neck and arm holes."""
    hem = mark['hip'] - JERSEY['drop']
    strap = mark['shoulder'].x - 0.035                     # the straps stop short of the shoulder joint
    coords = [body.matrix_world @ v.co for v in body.data.vertices]

    armpit = mark['shoulder'].z - 0.10
    is_arm = lambda bone: 'Arm' in bone or 'Hand' in bone

    def keep(i):
        p, bone = coords[i], bones[i]
        if not tights[i] or p.z < hem or bone in (None, 'Neck', 'Head'):
            return False
        if p.z < armpit:
            return not is_arm(bone)                        # the whole torso, but not the arms hanging beside it
        if abs(p.x) > strap:
            return False                                   # arm hole
        front = p.y < mark['spine_y']
        scoop = mark['neck'] - (0.13 if front else 0.05)
        return not (abs(p.x) < 0.085 and p.z > scoop)      # neck opening, deeper at the front

    jersey = cut_out(body, 'jersey', keep)
    for v in jersey.data.vertices:
        t = min(1.0, max(0.0, (v.co.z - hem) / (mark['chest'] - hem)))   # 0 at the hem, 1 at the chest
        loose = JERSEY['chest'] + (JERSEY['hem'] - JERSEY['chest']) * (1 - t)
        v.co.x *= 1 + loose
        v.co.y = mark['spine_y'] + (v.co.y - mark['spine_y']) * (1 + loose)
    return jersey


def make_shorts(body, mark, bones, tights):
    """Loose knee-length shorts: the hips and thighs of the tights surface, flared toward the hem."""
    hem, waist = mark['knee'] + SHORTS['above_knee'], mark['pelvis'] + SHORTS['rise']
    crotch = mark['hip'] - 0.10
    coords = [body.matrix_world @ v.co for v in body.data.vertices]

    def keep(i):
        return tights[i] and hem <= coords[i].z <= waist and bones[i] in ('Hips', 'Spine', 'LeftUpLeg', 'RightUpLeg')

    shorts = cut_out(body, 'shorts', keep)
    thigh = mark['thigh']
    for v in shorts.data.vertices:
        if v.co.z >= crotch:                                # around the hips: a little room all round
            v.co.x *= 1 + SHORTS['hip']
            v.co.y = mark['spine_y'] + (v.co.y - mark['spine_y']) * (1 + SHORTS['hip'])
            continue
        t = (crotch - v.co.z) / (crotch - hem)              # 0 at the crotch, 1 at the hem
        loose = SHORTS['hip'] + (SHORTS['hem'] - SHORTS['hip']) * t
        side = 1 if v.co.x >= 0 else -1
        axis_x = side * (abs(thigh.x) + 0.02 * t)           # each leg flares around its own thigh
        x = axis_x + (v.co.x - axis_x) * (1 + loose)
        v.co.x = side * max(0.006, side * x)                # the two legs meet at the middle, never cross
        v.co.y = thigh.y + (v.co.y - thigh.y) * (1 + loose)
    return shorts


def strip_body(body, mark, bones, shoes):
    """Remove everything that is not skin (helpers, joints) and the skin the kit and shoes hide."""
    is_body = in_group(body, 'body')
    coords = [body.matrix_world @ v.co for v in body.data.vertices]
    shorts_hem = mark['knee'] + SHORTS['above_knee'] + SKIN_MARGIN
    armpit = mark['shoulder'].z - 0.10
    shoe_top = bounds([shoes])[1].z - 0.03

    def hidden(i):
        p, bone = coords[i], bones[i]
        if bone in ('Hips', 'LeftUpLeg', 'RightUpLeg'):
            return p.z > shorts_hem
        if bone in ('Spine', 'Spine1'):
            return True
        if bone == 'Spine2':
            return p.z < armpit
        if bone in ('LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'):
            return p.z < shoe_top
        return False

    for m in [m for m in body.modifiers if m.type != 'ARMATURE']:
        body.modifiers.remove(m)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    doomed = [f for f in bm.faces if not all(is_body[v.index] for v in f.verts) or all(hidden(v.index) for v in f.verts)]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()


def part_names(row):
    """What each mesh of a built person is, in the order build_person returns them."""
    return ['skin', 'jersey', 'shorts', 'eyes', 'brows', 'lashes', *(['hair'] if row['hair'] else []), 'shoes']


def build_person(row, with_doll=False):
    """Returns (skeleton, the meshes that part_names lists, doll).

    The doll is the whole body before any skin is removed, for Mixamo; None unless asked for.
    """
    body, rig, parts = make_body(row)
    for obj in [body, *parts.values()]:
        bake_shape(obj)
    mark, bones, tights = landmarks(rig), dominant_bones(body), in_group(body, 'helper-tights')
    is_skin = in_group(body, 'body')
    doll = cut_out(body, 'doll', lambda i: is_skin[i]) if with_doll else None
    jersey = make_jersey(body, mark, bones, tights)
    shorts = make_shorts(body, mark, bones, tights)
    tidy_border(jersey, flat=[mark['hip'] - JERSEY['drop']])
    tidy_border(shorts, flat=[mark['knee'] + SHORTS['above_knee'], mark['pelvis'] + SHORTS['rise']])
    dress(jersey, plain_material('jersey'), levels=0)
    dress(shorts, plain_material('shorts'), levels=0)
    panel_uvs(jersey)
    panel_uvs(shorts)
    strip_body(body, mark, bones, parts['shoes'])

    # The face keeps every triangle; hands, limbs, ears and the scalp under the hair give up most of theirs.
    face = body.vertex_groups.new(name='face')
    head, skip = body.vertex_groups[BONE + 'Head'].index, {body.vertex_groups[n].index for n in ('scalp', 'ears')}
    for v in body.data.vertices:
        groups = {g.group: g.weight for g in v.groups}
        if groups.get(head, 0) > 0.5 and not skip & {g for g, w in groups.items() if w > 0}:
            face.add([v.index], 1.0, 'REPLACE')
    simplify(body, KEEP['body'], protect='face')
    if 'hair' in parts:
        simplify(parts['hair'], KEEP['hair'])
    simplify(parts['shoes'], KEEP['shoes'])
    name = f"player-{row['team']}-{row['number']}"
    rig.name = name
    return rig, [body, jersey, shorts, *parts.values()], doll


def pictures(material):
    """The pictures a material shows."""
    return [node.image for node in material.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image]


def fit(image, kind):
    """Shrink a picture to the size its kind is shipped at."""
    limit = TEXTURE[kind]
    if max(image.size) > limit:
        image.scale(*(int(d * limit / max(image.size)) for d in image.size))


def recoloured(image, name, colour):
    """The hair picture in another colour ('#rrggbb'), made once for each name.

    Each pixel becomes the colour, as bright as that pixel is against the average of the hair that shows. Alpha is kept.
    The result is shipped smaller than a hair picture in its own colours (see TEXTURE).
    """
    if name in bpy.data.images:
        return bpy.data.images[name]
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
    brightness = pixels[:, :3].mean(axis=1)
    average = np.average(brightness, weights=pixels[:, 3])   # see-through pixels are not part of what is seen
    rgb = np.array([int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)
    pixels[:, :3] = np.clip(np.outer(brightness / average, rgb), 0, 1)
    copy = bpy.data.images.new(name, *image.size, alpha=True)
    copy.alpha_mode = image.alpha_mode
    copy.pixels = pixels.ravel()
    fit(copy, 'recoloured')
    return copy


def blank_unused_skin(image, bodies):
    """Paint over every part of the skin picture that no remaining face of any player uses, in the average skin colour.

    The generator's skin pictures cover the whole unclothed body. Only what is seen is shipped. Players with the same
    skin share the picture, so it keeps what any one of them shows.
    """
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    used = np.zeros((height, width), dtype=bool)
    for mesh in [body.data for body in bodies]:
        slots = {slot for slot, material in enumerate(mesh.materials) if image in pictures(material)}
        uv = mesh.uv_layers.active.data
        for polygon in mesh.polygons:
            if polygon.material_index not in slots:
                continue
            corners = np.array([[uv[i].uv.x * width, uv[i].uv.y * height] for i in polygon.loop_indices])
            x0, y0 = np.floor(corners.min(axis=0)).astype(int) - 3
            x1, y1 = np.ceil(corners.max(axis=0)).astype(int) + 3
            used[max(0, y0):min(height, y1 + 1), max(0, x0):min(width, x1 + 1)] = True   # the face's box, with a margin
    colour = pixels[used][:, :3].mean(axis=0)
    pixels[~used, :3] = colour
    pixels[~used, 3] = 1
    image.pixels = pixels.ravel()


def finish(row, rig, meshes, extra=()):
    """One mesh on the skeleton, at his real height, feet on the floor, with pictures small enough to ship.

    Objects in `extra` are scaled and placed with him. The skin picture still shows the whole body: once everyone who
    shares it is finished, blank_unused_skin must be run before anything is exported.
    """
    body = meshes[0]
    for obj, name in zip(meshes, part_names(row)):
        material = obj.data.materials[0]
        if name not in ('jersey', 'shorts'):
            material.name = f'{name}-{rig.name}'
            # Bump pictures cost megabytes and cannot be seen at this size on screen.
            tree = material.node_tree
            for node in [n for n in tree.nodes if n.type == 'NORMAL_MAP']:
                tree.nodes.remove(node)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = body.data.name = f'{rig.name}-mesh'
    for polygon in body.data.polygons:
        polygon.use_smooth = True

    for material in body.data.materials:
        kind = material.name.split('-')[0]
        tree = material.node_tree
        if kind in OPAQUE:
            shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
            for link in list(shader.inputs['Alpha'].links):
                tree.links.remove(link)
            shader.inputs['Alpha'].default_value = 1
            material.use_backface_culling = True
        for node in tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                fit(node.image, kind)
                if kind == 'hair' and row['hairColour']:   # without a colour the hair keeps the picture it came with
                    node.image = recoloured(node.image, f"{row['hair']}-{row['hairColour'][1:]}", row['hairColour'])

    bpy.context.view_layer.update()
    top = max((body.matrix_world @ v.co).z for v in body.data.vertices if any(g.group == body.vertex_groups['body'].index for g in v.groups))
    scale = Matrix.Scale(row['height'] / top, 4)
    lowest = min((body.matrix_world @ v.co).z for v in body.data.vertices) * row['height'] / top
    place = Matrix.Translation((0, 0, -lowest)) @ scale
    for obj in [body, rig, *extra]:
        obj.data.transform(place)
    body.data.update()
    return body


def report(name, meshes):
    counts = {}
    for obj in meshes:
        dg = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = dg.to_mesh()
        counts[obj.name] = sum(len(p.vertices) - 2 for p in mesh.polygons)
        dg.to_mesh_clear()
    print(f'BUILD {name}: {sum(counts.values())} triangles', counts)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    shots = args[args.index('--shots') + 1] if '--shots' in args else None
    clear_scene()
    players = {}   # each finished mesh, by the name of its skeleton
    for row in people():
        rig, meshes, _ = build_person(row)
        report(rig.name, meshes)
        body = players[rig.name] = finish(row, rig, meshes)
        lo, hi = bounds([body])
        print(f'BUILD {rig.name}: stands {hi.z:.3f} m, feet at {lo.z:.3f} m, materials {[m.name for m in body.data.materials]}')
    bodies = list(players.values())
    skins = {image.name: image for body in bodies for m in body.data.materials if m.name.startswith('skin-') for image in pictures(m)}
    for image in skins.values():
        blank_unused_skin(image, bodies)
    if shots:
        for name, body in players.items():
            for other in bodies:                  # they all stand on the same spot: show one at a time
                other.hide_render = other is not body
            lo, hi = bounds([body])
            snapshot(os.path.join(shots, f'{name}.png'), [body])
            snapshot(os.path.join(shots, f'{name}.head.png'), [body], views=('front', 'three_quarter', 'side'), tile=(512, 512),
                     box=(Vector((-0.2, lo.y, hi.z - 0.4)), Vector((0.2, hi.y, hi.z))))
            snapshot(os.path.join(shots, f'{name}.legs.png'), [body], views=('back', 'three_quarter', 'front'), tile=(512, 512),
                     box=(Vector((-0.3, lo.y, 0.35)), Vector((0.3, hi.y, 1.15))))
        for body in bodies:
            body.hide_render = False
    bpy.ops.wm.save_as_mainfile(filepath=project('assets', 'source', 'players.blend'))
    bpy.ops.export_scene.gltf(
        filepath=project('assets', 'players.glb'), export_format='GLB', use_selection=False,
        export_animations=False, export_skins=True, export_morph=False, export_yup=True,
        export_image_format='JPEG', export_jpeg_quality=85, export_materials='EXPORT',
        export_cameras=False, export_lights=False, export_extras=False)
    print('BUILD wrote assets/players.glb', os.path.getsize(project('assets', 'players.glb')), 'bytes')


if __name__ == '__main__':
    main()

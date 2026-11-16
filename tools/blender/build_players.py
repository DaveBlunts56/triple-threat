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
from kit import SHORTS, add_springs, cut_out, make_kit  # noqa: E402
from hair import PACK, covered, head_frame, make_hair  # noqa: E402
from gear import high_tops, make_gear, paint_shoes  # noqa: E402

BONE = 'mixamorig:'
# Muscle and weight for each build (MPFB macros, 0 to 1).
BUILDS = {'slim': (0.65, 0.38), 'athletic': (0.82, 0.45), 'strong': (0.95, 0.58)}
# Longest side of each picture in pixels, by what it covers. The skin is seen close up; the rest is small on screen.
# A recoloured hair picture is smaller than one in its own colours, so that ten players fit the size the file may have.
TEXTURE = {'skin': 2048, 'hair': 512, 'recoloured': 384, 'shoes': 512, 'eyes': 256, 'brows': 256, 'lashes': 256, 'mouth': 512}
OPAQUE = ('skin', 'shoes', 'eyes', 'mouth')   # the generator wires transparency into every material; these do not need it
# The face's expressions, each the sum of the generator's expression units (data/targets/expression/units/<race>/)
# at full strength, kept as shape keys on the skin above his neck (see add_expressions; src/render/face.js shows them).
EXPRESSIONS = {
    'blink': ('eye-left-closure', 'eye-right-closure'),
    'effort': ('mouth-compression', 'eyebrows-left-down', 'eyebrows-right-down', 'nose-compression', 'neck-platysma'),
    'shout': ('mouth-open', 'eyebrows-left-up', 'eyebrows-right-up', 'mouth-retraction'),
    'dejected': ('eyebrows-left-inner-up', 'eyebrows-right-inner-up', 'mouth-depression'),
}
# Skin the kit covers is taken away when cloth lies within `reach` metres along its normal and along lines `spread`
# (about 14 degrees) to each side of it.
COVER = {'reach': 0.03, 'spread': 0.25}
# The far level of detail (spec section 9): about this many triangles, without the parts too small to see from afar.
FAR = {'triangles': 13000, 'without': ('eyes', 'cornea', 'brows', 'lashes', 'mouth')}
# The skin's regions, kept in its vertex colours for the game's skin material (src/render/materials.js skinMaterial):
# red how rough it is, green how much sweat gathers there. `rough` and `sweat` give each region's values.
MASKS = {
    'rough': {'forehead': 0.45, 'nose': 0.45, 'lip': 0.45, 'cheeks': 0.55, 'body': 0.6},
    'sweat': {'forehead': 1.0, 'temples': 1.0, 'lip': 1.0, 'neck': 0.9, 'chest': 0.8, 'arms': 0.6, 'hands': 0.2, 'legs': 0.4, 'head': 0.5, 'body': 0.5},
}
# The clear shell over each eye: the faces of the eyes' own outer shell within `front` of looking straight ahead.
CORNEA = {'front': 0.5}
SKIN_MARGIN = 0.05   # metres of skin kept under the edge of the kit, so no gap shows when he moves
# Share of triangles kept when a mesh is simplified. The face, ears, neck and hands keep all of their own, and so does
# the skin around the shoulders and knees (within `joints` metres of the joint), which bends most in sight; `body` is
# the share kept of the rest of the skin.
KEEP = {'body': 0.55, 'hair': 0.65, 'shoes': 0.65, 'mouth': 0.4, 'joints': 0.08}
# The muscle detail the simplified skin loses, baked from the whole body (subdivided once) into a normal map this many
# pixels a side, looked for this far either side of the skin.
DETAIL = {'size': 1024, 'reach': 0.01}
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
        ('eyes', 'eyes', 'high-poly/high-poly.mhclo', 'Eyes'),
        ('brows', 'eyebrows', 'eyebrow001/eyebrow001.mhclo', 'Eyebrows'),
        ('lashes', 'eyelashes', 'eyelashes01/eyelashes01.mhclo', 'Eyelashes'),
        *hair,
        ('shoes', 'clothes', 'shoes05/shoes05.mhclo', 'Clothes'),   # the white trainers, with socks
        ('teeth', 'teeth', 'teeth_base/teeth_base.mhclo', 'Teeth'),
        ('tongue', 'tongue', 'tongue01/tongue01.mhclo', 'Tongue'),
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


def simplify(obj, keep, protect=None):
    """Reduce the mesh to about `keep` of its triangles; with a `protect` group, its points are left as they are and
    `keep` is the share kept of the triangles outside it."""
    activate(obj)
    modifier = obj.modifiers.new('simplify', 'DECIMATE')
    modifier.ratio = keep
    if protect:
        index = obj.vertex_groups[protect].index
        held = {v.index for v in obj.data.vertices if any(g.group == index and g.weight > 0 for g in v.groups)}
        count = lambda faces: sum(len(p.vertices) - 2 for p in faces)
        total, inside = count(obj.data.polygons), count(p for p in obj.data.polygons if all(i in held for i in p.vertices))
        modifier.ratio = (inside + keep * (total - inside)) / total
    if protect:
        modifier.vertex_group, modifier.invert_vertex_group, modifier.vertex_group_factor = protect, True, 1000
    bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def under_cloth(body, is_skin, garments):
    """The points of the skin the garments cover well: cloth found along the skin's normal and a little to each side of
    it, close by (COVER). The skin near a garment's openings keeps it: there some of those lines miss the cloth."""
    from mathutils.bvhtree import BVHTree
    depsgraph = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(g, depsgraph) for g in garments]
    hidden = set()
    for v in body.data.vertices:
        if not is_skin[v.index]:
            continue
        n = v.normal
        side = n.orthogonal().normalized()
        other = n.cross(side)
        lines = [n] + [(n + d * COVER['spread']).normalized() for d in (side, -side, other, -other)]
        start = v.co + n * 0.001
        if all(any(t.ray_cast(start, line, COVER['reach'])[0] is not None for t in trees) for line in lines):
            hidden.add(v.index)
    return hidden


def strip_body(body, mark, bones, shoes, under_hair=()):
    """Remove everything that is not skin (helpers, joints) and the skin the kit, shoes and hair hide (`under_hair`:
    the points of the skin the hair hides)."""
    is_body = in_group(body, 'body')
    coords = [body.matrix_world @ v.co for v in body.data.vertices]
    shorts_hem = mark['knee'] - SHORTS['below_knee'] + SKIN_MARGIN
    armpit = mark['shoulder'].z - 0.10
    shoe_top = bounds([shoes])[1].z - 0.03

    def hidden(i):
        p, bone = coords[i], bones[i]
        if i in under_hair:
            return True
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


def protect(body, rig):
    """The `keep` group: the points simplify() leaves as they are (see KEEP)."""
    keep = body.vertex_groups.new(name='keep')
    joint = lambda name: rig.matrix_world @ rig.data.bones[BONE + name].head_local
    shoulders, knees = [joint(f'{s}Arm') for s in ('Left', 'Right')], [joint(f'{s}Leg') for s in ('Left', 'Right')]
    head, scalp, ears = (body.vertex_groups[n].index for n in (BONE + 'Head', 'scalp', 'ears'))
    for v, bone in zip(body.data.vertices, dominant_bones(body)):
        groups = {g.group: g.weight for g in v.groups if g.weight > 0}
        at = body.matrix_world @ v.co
        if ((groups.get(head, 0) > 0.5 and scalp not in groups) or ears in groups or bone == 'Neck' or (bone and 'Hand' in bone)
                or (bone in ('LeftArm', 'RightArm') and min((at - j).length for j in shoulders) < KEEP['joints'])
                or min((at - j).length for j in knees) < KEEP['joints']):
            keep.add([v.index], 1.0, 'REPLACE')


def whole_copy(body):
    """The skin before it is simplified, subdivided once, to bake its detail from."""
    whole = body.copy()
    whole.data = body.data.copy()
    bpy.context.scene.collection.objects.link(whole)
    smooth = whole.modifiers.new('detail', 'SUBSURF')
    smooth.levels = smooth.render_levels = 1
    return whole


def bake_detail(whole, skin, name):
    """Bakes what `whole` has and the simplified `skin` lacks into a tangent-space normal map on the skin's material,
    wired to its shader as the node 'baked-normal-map' (which finish() keeps)."""
    scene = bpy.context.scene
    engine = scene.render.engine
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    image = bpy.data.images.new(name, DETAIL['size'], DETAIL['size'], alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    tree = skin.data.materials[0].node_tree
    texture = tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    tree.nodes.active = texture
    activate(skin)
    whole.select_set(True)
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True, cage_extrusion=DETAIL['reach'],
                        max_ray_distance=DETAIL['reach'] * 2, margin=4)
    image.pack()   # a made picture is kept in the .blend only when packed
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)[:, :3]
    print(f'BUILD {name}: baked, mean {pixels.mean(axis=0).round(3)}, spread {pixels.std(axis=0).round(3)}')
    normal = tree.nodes.new('ShaderNodeNormalMap')
    normal.name = 'baked-normal-map'
    tree.links.new(texture.outputs['Color'], normal.inputs['Color'])
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    tree.links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    scene.render.engine = engine


def expression_moves(body, row):
    """{expression: how far each point of the body as generated moves for it, an array of (x, y, z)}: each unit
    loaded as a shape key, measured against the key it is relative to, and taken off again."""
    TargetService = service('targetservice', 'TargetService')
    race = row['skin'].split('_')[1]
    folder = os.path.join(os.path.dirname(importlib.import_module(MPFB).__file__), 'data', 'targets', 'expression', 'units', race)
    moves = {}
    for name, units in EXPRESSIONS.items():
        total = np.zeros((len(body.data.vertices), 3))
        for unit in units:
            TargetService.load_target(body, os.path.join(folder, f'{unit}.target.gz'), weight=1.0)
            key = body.data.shape_keys.key_blocks[-1]
            moved, rest = np.empty(len(key.data) * 3), np.empty(len(key.data) * 3)
            key.data.foreach_get('co', moved)
            key.relative_key.data.foreach_get('co', rest)
            total += (moved - rest).reshape(-1, 3)
            body.shape_key_remove(key)
        moves[name] = total
    return moves


def add_expressions(body, moves, rest, neck):
    """The expressions as shape keys on the simplified skin: each point that is still one of the body's own points
    as generated (the `source` attribute, and the same place) and stands above the height `neck` moves as `moves`
    says; the rest stay put. `rest`: the body's points as generated."""
    count = len(body.data.vertices)
    source, at = np.empty(count, dtype=np.int32), np.empty(count * 3)
    body.data.attributes['source'].data.foreach_get('value', source)
    body.data.vertices.foreach_get('co', at)
    at = at.reshape(-1, 3)
    own = (source >= 0) & (source < len(rest))
    own[own] &= np.linalg.norm(at[own] - rest[source[own]], axis=1) < 1e-6
    face = own & (at[:, 2] > neck)
    body.shape_key_add(name='Basis', from_mix=False)
    for name, move in moves.items():
        moved = at.copy()
        moved[face] += move[source[face]]
        body.shape_key_add(name=name, from_mix=False).data.foreach_set('co', moved.ravel())
    body.data.attributes.remove(body.data.attributes['source'])
    print(f'BUILD expressions on {int(face.sum())} points of the face')


def make_mouth(teeth, tongue):
    """The teeth and tongue as one mesh wearing one picture: the teeth's on its left half and the tongue's on its right."""
    pictures_of = lambda obj: [image for material in obj.data.materials for image in pictures(material)]
    half = TEXTURE['mouth'] // 2
    sides = []
    for obj in (teeth, tongue):
        image = pictures_of(obj)[0].copy()
        image.scale(half, half)
        sides.append(np.array(image.pixels[:], dtype=np.float32).reshape(half, half, 4))
        bpy.data.images.remove(image)
    picture = bpy.data.images.new('mouth', 2 * half, half, alpha=False)
    picture.pixels = np.concatenate(sides, axis=1).ravel()
    picture.pack()
    for obj, start in ((teeth, 0.0), (tongue, 0.5)):
        for corner in obj.data.uv_layers.active.data:
            corner.uv = (start + corner.uv.x * 0.5, corner.uv.y)
    for node in teeth.data.materials[0].node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image:
            node.image = picture
    tongue.data.materials.clear()
    tongue.data.materials.append(teeth.data.materials[0])
    activate(teeth)
    tongue.select_set(True)
    bpy.ops.object.join()
    teeth.name = 'mouth'
    return teeth


def make_cornea(eyes):
    """The clear shell over the front of each eye, taken from the eyes: the detailed eyes are an eyeball inside a
    shell, which the generator draws see-through. The shell's front (its faces within CORNEA['front'] of looking
    straight ahead) becomes the cornea; the rest of it, inside the head, is dropped. Weights come with it."""
    cornea = eyes.copy()
    cornea.data = eyes.data.copy()
    cornea.name = 'cornea'
    bpy.context.scene.collection.objects.link(cornea)
    for obj, keep_shell in ((eyes, False), (cornea, True)):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.normal_update()
        pieces, left = [], set(bm.faces)
        while left:                                     # the mesh's separate pieces, each as a set of faces
            stack, piece = [left.pop()], set()
            while stack:
                face = stack.pop()
                piece.add(face)
                for edge in face.edges:
                    for other in edge.link_faces:
                        if other in left:
                            left.discard(other)
                            stack.append(other)
            pieces.append(piece)
        front = lambda piece: min(v.co.y for f in piece for v in f.verts)   # he looks along -y
        side = lambda piece: sum(v.co.x for f in piece for v in f.verts) > 0
        shells = {id(min((p for p in pieces if side(p) == s), key=front)) for s in (True, False)}   # the front-most piece of each eye
        doomed = [f for p in pieces for f in p if (id(p) in shells) != keep_shell or (keep_shell and -f.normal.y < CORNEA['front'])]
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(obj.data)
        bm.free()
    cornea.data.materials.clear()
    if 'cornea' not in bpy.data.materials:   # clear and glossy; the game gives it its own material of the same kind
        material = bpy.data.materials.new('cornea')
        material.use_nodes = True
        shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
        shader.inputs['Alpha'].default_value, shader.inputs['Roughness'].default_value = 0.05, 0.05
        material.surface_render_method = 'BLENDED'
    cornea.data.materials.append(bpy.data.materials['cornea'])
    return cornea


def skin_masks(body, frame, eyes, mouth):
    """The skin's regions (see MASKS) as its vertex colours, from where each point is on his face and which bone moves
    it. `eyes`, `mouth`: the heights of his eyes and of his mouth."""
    bones = dominant_bones(body)
    colours = body.data.color_attributes.new('masks', 'FLOAT_COLOR', 'POINT')   # the numbers as they are, no colour space
    middle = frame['middle']
    for v, bone in zip(body.data.vertices, bones):
        p = body.matrix_world @ v.co
        x, front = abs(p.x - middle.x), p.y < middle.y - 0.03
        region = 'body'
        if bone == 'Head':
            region = 'head'
            if front and p.z > eyes + 0.025:
                region = 'forehead'
            elif not front and x > 0.05 and eyes - 0.01 < p.z < eyes + 0.05:
                region = 'temples'
            elif front and x < 0.03 and mouth < p.z < mouth + 0.02:
                region = 'lip'
            elif front and x < 0.018 and mouth + 0.02 <= p.z < eyes - 0.005:
                region = 'nose'
            elif front and mouth - 0.01 < p.z < eyes - 0.005:
                region = 'cheeks'
        elif bone == 'Neck':
            region = 'neck'
        elif bone in ('Spine2', 'LeftShoulder', 'RightShoulder'):
            region = 'chest'
        elif bone and ('Arm' in bone):
            region = 'arms'
        elif bone and 'Hand' in bone:
            region = 'hands'
        elif bone and ('Leg' in bone or 'Foot' in bone):
            region = 'legs'
        rough = MASKS['rough'].get(region, MASKS['rough']['body'])
        sweat = MASKS['sweat'].get(region, MASKS['sweat']['body'])
        colours.data[v.index].color = (rough, sweat, 0.0, 1.0)
    body.data.color_attributes.active_color = colours
    body.data.color_attributes.render_color_index = list(body.data.color_attributes).index(colours)


def part_names(row):
    """What each mesh of a built person is, in the order build_person returns them."""
    return ['skin', 'jersey', 'shorts', 'eyes', 'brows', 'lashes', 'hair', 'shoes', 'mouth', 'cornea', *(['gear'] * len(row.get('gear', [])))]


def skin_tone(body):
    """The average colour of his skin's picture, (r, g, b) from 0 to 1, for hair that shows skin through it."""
    image = pictures(body.data.materials[0])[0].copy()
    image.scale(64, 64)
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
    bpy.data.images.remove(image)
    return tuple(np.average(pixels[:, :3], axis=0, weights=pixels[:, 3] + 1e-6))


def build_person(row, with_doll=False):
    """Returns (skeleton, the meshes that part_names lists, doll).

    The doll is the whole body before any skin is removed, for Mixamo; None unless asked for.
    """
    body, rig, parts = make_body(row)
    moves = expression_moves(body, row)
    for obj in [body, *parts.values()]:
        bake_shape(obj)
    rest = np.empty(len(body.data.vertices) * 3)
    body.data.vertices.foreach_get('co', rest)
    rest = rest.reshape(-1, 3)
    body.data.attributes.new('source', 'INT', 'POINT').data.foreach_set('value', range(len(body.data.vertices)))
    parts['mouth'] = make_mouth(parts.pop('teeth'), parts.pop('tongue'))
    parts['cornea'] = make_cornea(parts['eyes'])
    if row['hairStyle'] not in PACK:
        colour = tuple(int(row['hairColour'][i:i + 2], 16) / 255 for i in (1, 3, 5))
        parts['hair'], under_hair = make_hair(body, rig, row['hairStyle'], colour, skin_tone(body), seed=row['face'] * 31 + row['number'])
    else:   # the pack's afro hides the scalp too (simplified under it, the scalp once spiked through)
        under_hair = covered(body, head_frame(body, rig), row['hairStyle'])
    parts = {name: parts[name] for name in part_names(row)[3:] if name != 'gear'}   # in the order part_names gives
    joint = lambda name: rig.matrix_world @ rig.data.bones[BONE + name].head_local
    high_tops(parts['shoes'], joint('LeftFoot').z)
    paint_shoes(parts['shoes'], row['team'])
    mark, bones, tights = landmarks(rig), dominant_bones(body), in_group(body, 'helper-tights')
    is_skin = in_group(body, 'body')
    doll = cut_out(body, 'doll', lambda i: is_skin[i]) if with_doll else None
    collider = cut_out(body, 'collider', lambda i: is_skin[i])   # the skin as it stands, for the kit to drape on
    for m in [m for m in collider.modifiers]:
        collider.modifiers.remove(m)
    jersey, shorts = make_kit(body, collider, mark, bones, tights)
    bpy.data.objects.remove(collider)
    add_springs(rig, shorts, mark)
    rig['headTop'] = max((body.matrix_world @ v.co).z for v, skin in zip(body.data.vertices, is_skin) if skin)
    frame = head_frame(body, rig)
    gear, under_gear = make_gear(body, row, mark, bones, frame, bounds([parts['shoes']])[1].z - 0.03, joint)
    strip_body(body, mark, bones, parts['shoes'], under_hair | under_gear | under_cloth(body, is_skin, [jersey, shorts]))

    protect(body, rig)
    rig['skinTriangles'] = sum(len(p.vertices) - 2 for p in body.data.polygons)   # before it is simplified: counts.json
    whole = whole_copy(body)
    simplify(body, KEEP['body'], protect='keep')
    bake_detail(whole, body, f"detail-player-{row['team']}-{row['number']}")
    add_expressions(body, moves, rest, (rig.matrix_world @ rig.data.bones[BONE + 'Neck'].head_local).z)
    skin_masks(body, frame, bounds([parts['eyes']])[0].z / 2 + bounds([parts['eyes']])[1].z / 2, bounds([parts['mouth']])[0].z / 2 + bounds([parts['mouth']])[1].z / 2)
    bpy.data.objects.remove(whole)
    if row['hairStyle'] in PACK:   # the modelled styles are made to their budget
        simplify(parts['hair'], KEEP['hair'])
    simplify(parts['shoes'], KEEP['shoes'])
    simplify(parts['mouth'], KEEP['mouth'])
    name = f"player-{row['team']}-{row['number']}"
    rig.name = name
    return rig, [body, jersey, shorts, *parts.values(), *gear.values()], doll


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
        if name not in ('jersey', 'shorts', 'cornea'):
            # A modelled style's name comes with it, for the game: hair-fade-player-0-4.
            modelled = name == 'hair' and row['hairStyle'] not in PACK
            if name == 'gear':   # gear-<item>-<colour>, made for him: the game reads the colour from it
                material.name = f"{material.name.split('.')[0]}-{rig.name}"
            else:
                material.name = f"{name}-{row['hairStyle']}-{rig.name}" if modelled else f'{name}-{rig.name}'
            # The generator's bump pictures cost megabytes and cannot be seen at this size on screen; the skin's own
            # baked detail stays.
            tree = material.node_tree
            for node in [n for n in tree.nodes if n.type == 'NORMAL_MAP' and n.name != 'baked-normal-map']:
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
                if kind == 'hair' and row['hairColour'] and row['hairStyle'] in PACK:   # a modelled style is made in its colour
                    node.image = recoloured(node.image, f"{row['hair']}-{row['hairColour'][1:]}", row['hairColour'])

    bpy.context.view_layer.update()
    top = rig['headTop']   # the top of his head as generated: under some hair styles that skin is gone
    scale = Matrix.Scale(row['height'] / top, 4)
    lowest = min((body.matrix_world @ v.co).z for v in body.data.vertices) * row['height'] / top
    place = Matrix.Translation((0, 0, -lowest)) @ scale
    for obj in [body, rig, *extra]:
        if obj.type == 'MESH':
            obj.data.transform(place, shape_keys=True)
        else:
            obj.data.transform(place)
    body.data.update()
    return body


def make_far(body, rig):
    """The far level of detail: a copy of the finished player (`body`, one mesh on `rig`) without the parts FAR leaves
    out, without expressions, simplified to about FAR['triangles'], on the same skeleton. Named <player>-far."""
    far = body.copy()
    far.data = body.data.copy()
    far.name = far.data.name = f'{rig.name}-far'
    bpy.context.scene.collection.objects.link(far)
    far.shape_key_clear()   # the points stay as they are at rest
    for colours in list(far.data.color_attributes):   # the skin's masks are for the near skin's material only
        far.data.color_attributes.remove(colours)
    drop = {i for i, m in enumerate(far.data.materials) if m.name.split('-')[0] in FAR['without']}
    bm = bmesh.new()
    bm.from_mesh(far.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in drop], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(far.data)
    bm.free()
    triangles = sum(len(p.vertices) - 2 for p in far.data.polygons)
    simplify(far, min(1.0, FAR['triangles'] / triangles))
    for index in sorted(drop, reverse=True):   # the slots of the parts left out, now empty
        far.data.materials.pop(index=index)
    return far


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
    # --only a,b: build just these people into the .blend given by --blend, to look at; nothing is exported.
    only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
    clear_scene()
    players = {}   # each finished mesh, by the name of its skeleton
    counts = {}    # the triangles of each one's skin before it was simplified, for the tests
    for row in people():
        if only and f"player-{row['team']}-{row['number']}" not in only:
            continue
        rig, meshes, _ = build_person(row)
        counts[rig.name] = {'skin': rig['skinTriangles']}
        report(rig.name, meshes)
        body = players[rig.name] = finish(row, rig, meshes)
        make_far(body, rig)
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
    if only:
        bpy.ops.wm.save_as_mainfile(filepath=args[args.index('--blend') + 1])
        return
    with open(project('assets', 'source', 'counts.json'), 'w') as f:
        json.dump(counts, f, indent=2, sort_keys=True)
    bpy.ops.wm.save_as_mainfile(filepath=project('assets', 'source', 'players.blend'))
    bpy.ops.export_scene.gltf(
        filepath=project('assets', 'players.glb'), export_format='GLB', use_selection=False,
        export_animations=False, export_skins=True, export_morph=True, export_morph_normal=False, export_yup=True, export_vertex_color='ACTIVE',
        export_image_format='WEBP', export_image_quality=85, export_materials='EXPORT',
        export_cameras=False, export_lights=False, export_extras=False)
    print('BUILD wrote assets/players.glb', os.path.getsize(project('assets', 'players.glb')), 'bytes')


if __name__ == '__main__':
    main()

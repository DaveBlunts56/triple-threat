"""Hair modelled by script on the head of the player it is for (spec section 7.1). Used by build_players.py.

Every style is grown from the head's own skin above a hairline that runs from the forehead, over the ears, to the
nape, so it fits his head as generated:

    buzz      a shell 2 mm off the scalp, coloured as short hair over skin
    fade      a shell from 1 mm over the ears to 6 mm at the crown, fading from skin to hair, with a curly top
    curls     a shell 4 to 7 cm high, flat on top (a high top), pushed out in curl-sized clumps
    twists    short two-strand twists standing up and out from the scalp, over a close-cut base
    locs      long tubes hanging from the scalp, their lower parts on two spring bones, over a close-cut base
    cornrows  rows of braid lobes from the hairline back, with scalp between them

`afro` and `short` are the pack's own hair (the person's `hair` names it), made as before.

Each style has one picture of its own (PICTURE['size'] pixels): its lower half a band from the hairline (v = 0) to
the crown (v = 0.5) in which a fade turns from skin to hair, its upper half all hair. The game lays a tile of strands
over it (assets/maps/strands-normal.png, see maps.py).
"""
import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

from kit import cut_out, tidy_border

BONE = 'mixamorig:'
STYLES = ('buzz', 'fade', 'curls', 'afro', 'twists', 'locs', 'cornrows', 'short')
PACK = ('afro', 'short')   # made from the pack's hair, not here
# The hairline, in metres: `front` under the top of his head at the forehead, `side` over the top of his ears,
# `back` under the bottom of his ears at the nape. taper: over this far in from the hairline the hair comes down to
# the skin. least: the closest a shell comes to the skin.
LINE = {'front': 0.075, 'side': 0.005, 'back': 0.02, 'taper': 0.015, 'least': 0.001}
# Heights off the skin (metres) and clumps (their size and how far they push in or out), by style.
SHELL = {
    'buzz': {'low': 0.002, 'high': 0.002},
    'fade': {'low': 0.001, 'high': 0.006, 'top': 0.6, 'curly': 0.025, 'clump': 0.012, 'push': 0.004},
    # A high top: short at the sides, rising over the upper part of the head to its full height, flat across the top.
    'curls': {'low': 0.008, 'high': 0.065, 'from': 0.25, 'to': 0.75, 'cap': 0.055, 'clump': 0.015, 'push': 0.01},
}
BASE = 0.003   # the close-cut hair under twists and locs
# Twists and locs: how many, how thick (radius), how long, round how many sides, along how many segments, how far
# apart their roots are at least, how far apart they lie in layers off the head, and how they fall: `fall` is how
# hard each step turns toward hanging, `back` how far behind him it hangs; those rooted within `face` (radians) of
# straight ahead are swept to the side, off his face; `hug`: it lies on his head until it is past his hairline.
# A twist makes `turns` turns.
TWISTS = {'count': (70, 90), 'radius': 0.0032, 'length': (0.03, 0.06), 'sides': 6, 'segments': 5, 'apart': 0.012,
          'layers': 0.004, 'fall': 0.35, 'back': 0.3, 'face': 1.0, 'hug': False, 'turns': 2}
LOCS = {'count': (45, 60), 'radius': 0.0045, 'length': (0.18, 0.30), 'sides': 6, 'segments': 12, 'apart': 0.016,
        'layers': 0.012, 'fall': 0.6, 'back': 0.15, 'face': 1.0, 'hug': True,
        'free': 0.06, 'swing': 0.12}   # free: metres of a loc held by the head alone; swing: over which it passes to its spring
UNDER = 0.02   # the skin more than this far above the hairline is under the hair, and is not kept (see covered)
# Cornrows: rows across the head, how wide, long and tall a braid lobe is, how far apart they lie along a row, how
# far off the scalp, and how far each leans one way or the other to read as a braid.
ROWS = {'rows': (6, 7), 'width': 0.008, 'length': 0.012, 'tall': 0.005, 'step': 0.009, 'lift': 0.003, 'lean': 0.45,
        'spread': math.radians(55)}
PICTURE = {'size': 128, 'grain': 0.08}   # pixels each way; how much the brightness of a strand varies


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def head_frame(body, rig):
    """Where his head is: its middle, the top of it and the heights of his hairline, from the generated body."""
    mw = body.matrix_world
    group = lambda name: body.vertex_groups[name].index
    points = lambda name: [mw @ v.co for v in body.data.vertices if any(g.group == group(name) and g.weight > 0 for g in v.groups)]
    scalp, ears = points('scalp'), points('ears')
    top = max(p.z for p in scalp)
    middle = Vector((0.0, sum(p.y for p in scalp) / len(scalp), (top + min(p.z for p in ears)) / 2))
    return {
        'middle': middle, 'top': top, 'radius': max((p - middle).length for p in scalp),
        'front': top - LINE['front'], 'side': max(p.z for p in ears) + LINE['side'], 'back': min(p.z for p in ears) - LINE['back'],
        'ears': {i for i, v in enumerate(body.data.vertices) if any(g.group == group('ears') and g.weight > 0 for g in v.groups)},
    }


def angle(frame, p):
    """The way round his head a point is: 0 straight ahead (he faces -y), a half turn behind him."""
    return math.atan2(p.x - frame['middle'].x, -(p.y - frame['middle'].y))


def hairline(frame, p):
    """The height of his hairline in the direction of `p`."""
    a = abs(angle(frame, p)) / (math.pi / 2)
    if a <= 1:
        return frame['front'] + (frame['side'] - frame['front']) * smoothstep(0, 1, a)
    return frame['side'] + (frame['back'] - frame['side']) * smoothstep(0, 1, a - 1)


def rise(frame, p):
    """How far up from his hairline toward the top of his head a point is: 0 at the hairline, 1 at the top."""
    line = hairline(frame, p)
    return min(1.0, max(0.0, (p.z - line) / max(frame['top'] - line, 1e-6)))


def scalp_patch(body, frame):
    """The skin his hair grows from, as an object of its own, with the body's weights."""
    mw, skin = body.matrix_world, body.vertex_groups['body'].index
    coords = [mw @ v.co for v in body.data.vertices]
    is_skin = [any(g.group == skin and g.weight > 0 for g in v.groups) for v in body.data.vertices]
    patch = cut_out(body, 'hair', lambda i: is_skin[i] and i not in frame['ears'] and coords[i].z > hairline(frame, coords[i]))
    tidy_border(patch)   # a smooth hairline, not the skin's own steps
    for m in list(patch.modifiers):
        if m.type != 'ARMATURE':
            patch.modifiers.remove(m)
    return patch


def inward_distance(bm):
    """For each point of the patch, how far it is from the patch's edge, along its edges."""
    far = {v: math.inf for v in bm.verts}
    edge = [v for v in bm.verts if v.is_boundary]
    for v in edge:
        far[v] = 0.0
    frontier = list(edge)
    while frontier:   # a few rounds of relaxing distances: the patch is small
        changed = []
        for v in frontier:
            for e in v.link_edges:
                o = e.other_vert(v)
                d = far[v] + e.calc_length()
                if d < far[o] - 1e-9:
                    far[o] = d
                    changed.append(o)
        frontier = changed
    return far


def lay_out_shell(bm, frame):
    """The shell's picture: across it by the way round his head, up it from the hairline (0) to the crown (0.5)."""
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new()
    for face in bm.faces:
        for loop in face.loops:
            p = loop.vert.co
            loop[uv].uv = ((angle(frame, p) + math.pi) / (2 * math.pi), 0.5 * rise(frame, p))


def make_shell(patch, frame, style, seed):
    """The patch pushed out from the skin as `style` says (SHELL), meeting the skin at the hairline."""
    spec = SHELL[style]
    bm = bmesh.new()
    bm.from_mesh(patch.data)
    if 'clump' in spec:   # clumps need more points than the skin has
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    bm.normal_update()
    far = inward_distance(bm)
    shift = Vector((seed * 1.37, seed * 2.11, seed * 0.53))
    moved = {}
    for v in bm.verts:
        p, t = v.co, rise(frame, v.co)
        height = spec['low'] + (spec['high'] - spec['low']) * (smoothstep(spec['from'], spec['to'], t) if 'from' in spec else t)
        if style == 'fade':
            height += spec['curly'] * smoothstep(spec['top'], spec['top'] + 0.15, t)
        if 'clump' in spec and (style != 'fade' or t > spec['top']):
            height += spec['push'] * noise.noise(p / spec['clump'] + shift)
        height = LINE['least'] + max(0.0, height - LINE['least']) * smoothstep(0, LINE['taper'], far[v])
        out = p + v.normal * height
        if style == 'curls' and v.normal.z > 0.5:   # a high top: flat across the top
            out.z = min(out.z, frame['top'] + spec['cap'])
        moved[v] = out
    for v, out in moved.items():
        v.co = out
    lay_out_shell(bm, frame)
    bm.to_mesh(patch.data)
    bm.free()
    return patch


def roots(bm, frame, count, apart, rng, low=0.12):
    """Up to `count` points of the scalp patch, each at least `apart` from the rest, none right at the hairline."""
    choices = [v.co.copy() for v in bm.verts if rise(frame, v.co) > low]
    normals = {tuple(v.co): v.normal.copy() for v in bm.verts}
    rng.shuffle(choices)
    picked = []
    for p in choices:
        if all((p - q).length >= apart for q, _ in picked):
            picked.append((p, normals[tuple(p)]))
        if len(picked) >= count:
            break
    return picked


def tube(bm, path, radius, sides, uv, twist=0.0, lobes=False):
    """A tube along `path` (points), `radius` thick, ending in a point; two lobes turning `twist` times along it
    make a two-strand twist. Its picture is the all-hair half of the style's picture."""
    rings = []
    for k, p in enumerate(path):
        ahead = (path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]).normalized()
        side = ahead.cross(Vector((0, 0, 1)) if abs(ahead.z) < 0.9 else Vector((1, 0, 0))).normalized()
        up = side.cross(ahead)
        s = k / (len(path) - 1)
        ring = []
        for j in range(sides):
            a = 2 * math.pi * j / sides
            r = radius * (1 - 0.7 * s ** 3)
            if lobes:
                r *= 1 + 0.3 * math.cos(2 * (a - 2 * math.pi * twist * s))
            ring.append(bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * r))
        rings.append(ring)
    tip = bm.verts.new(path[-1] + (path[-1] - path[-2]).normalized() * radius * 0.5)
    faces = []
    for k in range(len(rings) - 1):
        for j in range(sides):
            faces.append((bm.faces.new((rings[k][j], rings[k][(j + 1) % sides], rings[k + 1][(j + 1) % sides], rings[k + 1][j])), k, j))
    for j in range(sides):
        faces.append((bm.faces.new((rings[-1][j], rings[-1][(j + 1) % sides], tip)), len(rings) - 1, j))
    bmesh.ops.recalc_face_normals(bm, faces=[face for face, _, _ in faces])
    for face, k, j in faces:
        for loop, (dk, dj) in zip(face.loops, ((0, 0), (0, 1), (1, 1), (1, 0))):
            loop[uv].uv = ((j + dj) / sides, 0.5 + 0.5 * min(1.0, (k + dk) / len(rings)))
    return rings, tip


def skin_tree(body):
    """The skin of the body as generated, to keep locs and twists outside it."""
    group = body.vertex_groups['body'].index
    bm = bmesh.new()
    bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.active
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v[deform].get(group, 0) > 0 for v in f.verts)], context='FACES')
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def drape(tree, frame, root, normal, length, spec, lift, segments):
    """The path a twist or a loc takes from `root`: out from the scalp, then turning a little more each step toward
    hanging (down, swept back off his face and out past his ears), never closer to the skin than its own thickness
    and `lift`, so they lie on his head and over each other."""
    side = 1 if root.x >= frame['middle'].x else -1
    out = abs(root.x - frame['middle'].x) / frame['radius']
    if abs(angle(frame, root)) < spec['face']:   # over his forehead: swept to the side and back, off his face
        flow = Vector((side * 0.9, 0.4, -1.0)).normalized()
    else:
        flow = Vector((side * out * 0.3, spec['back'], -1.0)).normalized()
    step, keep = length / segments, spec['radius'] + lift
    path, p = [root - normal * 0.002], root + normal * keep
    direction = normal.copy() if not spec['hug'] else (flow - normal * flow.dot(normal)).normalized()
    for _ in range(segments):
        path.append(p.copy())
        direction = (direction + flow * spec['fall']).normalized()
        p = p + direction * step
        at, n, _, _ = tree.find_nearest(p)
        # Over his head a loc lies on it (in its layer); past the hairline it hangs free, kept off the skin.
        if at is not None and ((spec['hug'] and at.z > frame['back']) or (p - at).dot(n) < keep):
            p = at + n * keep
        direction = (p - path[-1]).normalized()
    path.append(p)
    return path


def make_tubes(patch, frame, style, rng, tree):
    """Twists or locs on a close-cut base shell. Returns (object, {vertex index: metres along its tube})."""
    spec = TWISTS if style == 'twists' else LOCS
    bm = bmesh.new()
    bm.from_mesh(patch.data)
    bm.normal_update()
    far = inward_distance(bm)
    places = roots(bm, frame, rng.randint(*spec['count']), spec['apart'], rng)
    for v in bm.verts:   # the base: close-cut hair
        v.co += v.normal * (LINE['least'] + (BASE - LINE['least']) * smoothstep(0, LINE['taper'], far[v]))
    lay_out_shell(bm, frame)
    uv = bm.loops.layers.uv.active
    along = {}
    for root, normal in places:
        path = drape(tree, frame, root, normal, rng.uniform(*spec['length']), spec, BASE + rng.uniform(0, spec['layers']), spec['segments'])
        rings, tip = tube(bm, path, spec['radius'], spec['sides'], uv, twist=TWISTS['turns'] if style == 'twists' else 0, lobes=style == 'twists')
        walked = 0.0
        for k, ring in enumerate(rings):
            walked += (path[k] - path[k - 1]).length if k else 0.0
            for v in ring:
                along[v] = walked
        along[tip] = walked + spec['radius']
    bm.verts.index_update()
    lengths = {v.index: d for v, d in along.items()}
    bm.to_mesh(patch.data)
    bm.free()
    return patch, lengths


def covered(body, frame, style):
    """The points of the body's skin his hair hides (more than UNDER above the hairline), to be taken away: none under
    cornrows or the pack's short styles, which show the scalp between them."""
    if style in ('short', 'cornrows'):
        return set()
    mw, skin = body.matrix_world, body.vertex_groups['body'].index
    hidden = set()
    for v in body.data.vertices:
        p = mw @ v.co
        if v.index not in frame['ears'] and p.z > hairline(frame, p) + UNDER and any(g.group == skin and g.weight > 0 for g in v.groups):
            hidden.add(v.index)
    return hidden


def make_rows(patch, frame, rng):
    """Cornrows: rows of braid lobes from the hairline back over his head, the scalp between them."""
    source = bmesh.new()
    source.from_mesh(patch.data)
    source.normal_update()
    tree = BVHTree.FromBMesh(source)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    rows = rng.randint(*ROWS['rows'])
    c, r = frame['middle'], frame['radius']
    for j in range(rows):
        tilt = -ROWS['spread'] + 2 * ROWS['spread'] * j / (rows - 1)
        points, last = [], None
        for k in range(400):   # along the row, from the face over the top to the nape
            phi = math.pi * k / 399
            guess = c + Vector((math.sin(tilt) * math.sin(phi), -math.cos(phi), math.cos(tilt) * math.sin(phi))) * r
            at, normal, _, _ = tree.find_nearest(guess)
            if at is None or rise(frame, at) < 0.04:
                continue
            if last is None or (at - last).length >= ROWS['step']:
                points.append((at, normal))
                last = at
        for k, (at, normal) in enumerate(points):
            ahead = (points[min(k + 1, len(points) - 1)][0] - points[max(k - 1, 0)][0])
            if ahead.length < 1e-6:
                continue
            ahead.normalize()
            side = normal.cross(ahead).normalized()
            lean = ROWS['lean'] * (1 if k % 2 else -1)
            along = (ahead * math.cos(lean) + side * math.sin(lean)).normalized()
            across = normal.cross(along).normalized()
            centre = at + normal * ROWS['lift']
            result = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=1.0)
            for v in result['verts']:
                x, y, z = v.co
                v.co = centre + along * (x * ROWS['length'] / 2) + across * (y * ROWS['width'] / 2) + normal * (z * ROWS['tall'] / 2)
            for face in {f for v in result['verts'] for f in v.link_faces}:
                for loop in face.loops:
                    loop[uv].uv = (0.5, 0.75)
    source.free()
    bm.to_mesh(patch.data)
    bm.free()
    patch.data.update()
    return patch


def picture(name, style, hair, skin, rng):
    """The style's picture (see the module's notes): hair over skin in the band, all hair above it."""
    size = PICTURE['size']
    v = (np.arange(size) + 0.5) / size
    band = np.clip(v / 0.5, 0, 1)   # rows from the bottom: Blender's v runs up
    share = {'buzz': np.full(size, 0.8), 'fade': np.clip((band - 0.05) / 0.45, 0, 1) ** 1.5}.get(style, np.ones(size))
    share = np.where(v >= 0.5, 1.0, share)
    grain = 1 + PICTURE['grain'] * (np.array([[rng.uniform(-1, 1) for _ in range(size)] for _ in range(size)]))
    rgb = (share[:, None, None] * np.array(hair)[None, None, :] + (1 - share[:, None, None]) * np.array(skin)[None, None, :]) * grain[:, :, None]
    image = bpy.data.images.new(name, size, size, alpha=False)
    image.pixels = np.concatenate([np.clip(rgb, 0, 1), np.ones((size, size, 1))], axis=2).ravel()
    image.pack()
    return image


def material(name, image):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    tree = m.node_tree
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Roughness'].default_value = 0.5
    texture = tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    return m


def weigh(obj, lengths=None):
    """Points cut from the skin keep its weights, so the hair moves as the skin under it does. The rest (tubes and
    lobes) are on his head, and a loc's lower part passes to the spring bone on its side (see add_loc_springs)."""
    head = obj.vertex_groups.get(BONE + 'Head') or obj.vertex_groups.new(name=BONE + 'Head')
    springs = {side: obj.vertex_groups.new(name=f'hairLocs{side}') for side in ('Left', 'Right')} if lengths else None
    for v in obj.data.vertices:
        if any(g.weight > 0 for g in v.groups):
            continue
        share = smoothstep(LOCS['free'], LOCS['free'] + LOCS['swing'], lengths.get(v.index, 0.0)) if lengths else 0.0
        head.add([v.index], 1 - share, 'REPLACE')
        if share > 0:
            springs['Left' if v.co.x >= 0 else 'Right'].add([v.index], share, 'REPLACE')


def add_loc_springs(rig, frame):
    """The locs' spring bones, hairLocsLeft and hairLocsRight: children of the head, at the back of it, hanging down."""
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    to_rig = rig.matrix_world.inverted()
    for side, x in (('Left', 0.05), ('Right', -0.05)):
        bone = rig.data.edit_bones.new(f'hairLocs{side}')
        at = Vector((frame['middle'].x + x, frame['middle'].y + frame['radius'] * 0.6, frame['side']))
        bone.head, bone.tail = to_rig @ at, to_rig @ (at + Vector((0, 0, -0.1)))
        bone.parent, bone.use_deform = rig.data.edit_bones[BONE + 'Head'], True
    bpy.ops.object.mode_set(mode='OBJECT')


def make_hair(body, rig, style, hair, skin, seed):
    """His hair in `style` (one of STYLES), coloured `hair` over a skin of colour `skin` (both (r, g, b), 0 to 1), as an
    object on his skeleton with its own material and picture, and the points of the body's skin it hides (see
    covered); (None, nothing) for the pack's styles, made elsewhere."""
    if style in PACK:
        return None, set()
    rng = random.Random(seed)
    frame = head_frame(body, rig)
    patch = scalp_patch(body, frame)
    lengths = None
    if style in SHELL:
        make_shell(patch, frame, style, seed)
    elif style in ('twists', 'locs'):
        patch, lengths = make_tubes(patch, frame, style, rng, skin_tree(body))
    else:
        make_rows(patch, frame, rng)
    weigh(patch, lengths if style == 'locs' else None)
    if style == 'locs':
        add_loc_springs(rig, frame)
    patch.data.materials.clear()
    patch.data.materials.append(material(f'hair-{style}', picture(f'hair-{style}-{seed}', style, hair, skin, rng)))
    for polygon in patch.data.polygons:
        polygon.use_smooth = True
    return patch, covered(body, frame, style)

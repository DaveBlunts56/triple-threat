"""The players' kit as garments: a jersey and shorts cut from the body's "tights" helper surface, hung loose, draped by a
cloth simulation, given bindings, side panels, thickness and a layout the game paints. Used by build_players.py.

The layout of each garment's picture, with (0, 0) at its top left (as src/render/kit.js paints it):
    MAIN    the front panel on the left half and the back panel on the right, the garment's top along the top edge;
            its side panels and stripes are painted at the edges of the two, where the front meets the back
    TRIM    a strip: the bindings round the neck and the arm holes, the waistband and the shorts' hems; v runs from
            the garment's edge (top of the strip) to the binding's inner edge (bottom), where it is stitched on
"""
import math

import bmesh
import bpy
from mathutils import Vector

BONE = 'mixamorig:'
# The kit is cut as basketball kit was in the early 2000s: a long, loose jersey hanging straight from the shoulders,
# and long, baggy shorts reaching below the knee, in thick, heavy, shiny cloth.
# How loosely the kit hangs: how far each ring of the surface is pushed out from the body, as a share of its radius.
# The jersey is tucked into the shorts, as the rules of the game ask: its hem is `tuck` metres below the shorts'
# waistband, narrower there than they are, and roomier just above it, so that it blouses over the waistband.
# armpit: how far under the shoulder joint its arm holes reach; strap: how far in from the shoulder joint they start.
JERSEY = {'chest': 0.17, 'hem': 0.10, 'shoulder': 0.04, 'tuck': 0.08, 'armpit': 0.14, 'strap': 0.04}
# A round neck: the opening dips `front` metres under the neck joint at the front and `back` at the back, and is
# `wide` metres either side of the middle, on a smooth curve, broad at the bottom (the higher `round`, the broader).
NECK = {'front': 0.115, 'back': 0.035, 'wide': 0.11, 'round': 2.6, 'spare': 0.03, 'fine': 0.04}
# spare: the opening is first cut this much smaller; fine: within this far under the curve the cloth is made finer,
# then trimmed to it, so that the collar's edge is a clean round line (see round_neck).
# rise: metres the waistband sits above the hip bone's root; below_knee: metres the hems hang below the knee joint.
SHORTS = {'hip': 0.16, 'hem': 0.55, 'below_knee': 0.06, 'rise': 0.09}
# Regions of each garment's picture, as (top, bottom) shares of its height. Must match KIT.layout in src/render/kit.js.
LAYOUT = {'main': (0.0, 0.8), 'trim': (0.82, 0.9)}
PANEL = {'front': 0.25, 'back': 0.75, 'width': 0.46}      # the main panels: their middles across the picture, and their width
# How wide each binding is (metres) — the collar, the arm holes, the shorts' waistband and their hems — how far it
# stands off the cloth, how far past its edge it wraps, and how many rounds of smoothing its edges get along the loop.
BINDING = {'collar': 0.025, 'arm': 0.018, 'waist': 0.045, 'hem': 0.03, 'proud': 0.003, 'over': 0.002, 'smooth': 10}
THICK = 0.006                                             # metres of cloth: heavy, as the cloth of the time was
# The drape: frames of cloth simulation, how heavy and how stiff to bend the cloth is (heavy cloth falls in a few broad
# folds), and the most any point may move or go into the body before the drape is thrown away for that garment.
DRAPE = {'frames': 30, 'mass': 0.3, 'bend': 0.5, 'most': 0.08, 'near': 0.004}
# Round the neck the jersey moves with his spine and neck only, not with his shoulders and arms, so that the collar keeps
# its round shape when he leans or swings his arms: fully within `hold` metres of the collar's edge, blending back to
# its own weights by `free`; `shoulders` is the share of his shoulders' pull it keeps there.
COLLAR = {'hold': 0.04, 'free': 0.09, 'shoulders': 0.25}


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


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


def tidy_border(piece, flat=(), onto=None):
    """Cut edges follow the faces they were cut along, so they are ragged. Level the hems, and round off the rest.

    `flat` lists heights: border corners within 12 cm of one are moved onto it. `onto(point)`: the height of a curve a
    border corner is laid on (the neck's), or None.
    """
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    border = {v: [e.other_vert(v) for e in v.link_edges if e.is_boundary] for v in bm.verts if v.is_boundary}
    level = {}
    for v in border:
        near = sorted((z for z in flat if abs(v.co.z - z) < 0.12), key=lambda z: abs(v.co.z - z))   # the nearest level
        curve = onto(v.co) if onto else None
        if curve is not None:
            v.co.z = level[v] = curve
        elif near:
            v.co.z = level[v] = near[0]
    # Smooth each border loop without shrinking it: a step toward the neighbours, then a slightly larger step back.
    for step in [0.5, -0.53] * 12:
        moved = {v: v.co + step * ((ns[0].co + ns[1].co) / 2 - v.co) for v, ns in border.items() if len(ns) == 2}
        for v, co in moved.items():
            v.co = Vector((co.x, co.y, level[v])) if v in level else co
    bm.to_mesh(piece.data)
    bm.free()


def neckline(mark, p):
    """The height of the round neck's edge above the point `p` (by its side-to-side place and whether it is in front),
    or None where the neck is not open."""
    if abs(p.x) >= NECK['wide']:
        return None
    depth = NECK['front'] if p.y < mark['spine_y'] else NECK['back']
    return mark['neck'] - depth * (1 - abs(p.x / NECK['wide']) ** NECK['round'])


def make_jersey(body, mark, bones, tights):
    """A sleeveless jersey: the torso of the tights surface, hung loose, with a round neck and deep arm holes."""
    hem = mark['pelvis'] + SHORTS['rise'] - JERSEY['tuck']
    strap = mark['shoulder'].x - JERSEY['strap']           # the straps stop short of the shoulder joint
    coords = [body.matrix_world @ v.co for v in body.data.vertices]
    armpit = mark['shoulder'].z - JERSEY['armpit']
    is_arm = lambda bone: 'Arm' in bone or 'Hand' in bone

    def keep(i):
        p, bone = coords[i], bones[i]
        if not tights[i] or p.z < hem or bone in (None, 'Neck', 'Head'):
            return False
        if p.z < armpit:
            return not is_arm(bone)                        # the whole torso, but not the arms hanging beside it
        if abs(p.x) > strap:
            return False                                   # arm hole
        edge = neckline(mark, p)
        return edge is None or p.z <= edge + NECK['spare']  # the neck opening, cut a little small: see round_neck

    jersey = cut_out(body, 'jersey', keep)
    for v in jersey.data.vertices:
        t = min(1.0, max(0.0, (v.co.z - hem) / (mark['chest'] - hem)))   # 0 at the hem, 1 at the chest
        up = min(1.0, max(0.0, (v.co.z - mark['chest']) / (mark['shoulder'].z - mark['chest'])))   # 1 at the shoulder
        loose = JERSEY['chest'] + (JERSEY['hem'] - JERSEY['chest']) * (1 - t) + (JERSEY['shoulder'] - JERSEY['chest']) * up   # the straps lie on the shoulders
        v.co.x *= 1 + loose
        v.co.y = mark['spine_y'] + (v.co.y - mark['spine_y']) * (1 + loose)
    round_neck(jersey, mark)
    # The neck's edge laid on its curve, so that it is a clean round line, not the skin's own steps.
    above = mark['shoulder'].z - JERSEY['armpit']
    tidy_border(jersey, flat=[hem], onto=lambda p: neckline(mark, p) if p.z > above and abs(p.x) < NECK['wide'] + 0.01 else None)
    return jersey


def round_neck(jersey, mark):
    """The cloth round the neck made finer (each edge there cut in three) and trimmed to the neck's curve: the skin's
    surface is too coarse at the breastbone to follow a round line. Weights and the picture's points are carried over."""
    bm = bmesh.new()
    bm.from_mesh(jersey.data)
    above = mark['shoulder'].z - JERSEY['armpit']

    def close(co):   # along the curve: from `fine` under it to the spare cloth over it, and where it meets the straps;
        # every edge touching this band is cut, so the faces that straddle the curve are made fine too
        if co.z <= above:
            return False
        edge = neckline(mark, co)
        if edge is not None:
            return -NECK['fine'] < co.z - edge < NECK['spare'] + 0.01
        return abs(co.x) < NECK['wide'] + NECK['fine'] and co.z > mark['neck'] - NECK['fine']

    # Smooth: the new points follow the curve of the cloth, not the flat faces they cut (inside his body by a few mm).
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if any(close(v.co) for v in e.verts)], cuts=2, use_grid_fill=True, smooth=1.0)
    inside = lambda f: (lambda c, edge: edge is not None and c.z > edge)(f.calc_center_median(), neckline(mark, f.calc_center_median()))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if close(f.calc_center_median()) and inside(f)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(jersey.data)
    bm.free()


def make_shorts(body, mark, bones, tights):
    """Long, baggy shorts: the hips and legs of the tights surface down to below the knee, flared toward the hem."""
    hem, waist = mark['knee'] - SHORTS['below_knee'], mark['pelvis'] + SHORTS['rise']
    crotch = mark['hip'] - 0.10
    coords = [body.matrix_world @ v.co for v in body.data.vertices]

    def keep(i):
        return tights[i] and hem <= coords[i].z <= waist and bones[i] in ('Hips', 'Spine', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg')

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
    tidy_border(shorts, flat=[hem, waist])
    return shorts


def drape(piece, collider, pins):
    """Lets the garment settle on the body as cloth does, its points near `pins(point)` held. Returns whether it was kept.

    The collider is the body as it stands. A drape that moves any point more than DRAPE['most'] or brings one within
    DRAPE['near'] of the body's surface is thrown away: the garment stays as it was cut.
    """
    before = [v.co.copy() for v in piece.data.vertices]
    group = piece.vertex_groups.new(name='drape-pin')
    group.add([v.index for v in piece.data.vertices if pins(piece.matrix_world @ v.co)], 1.0, 'REPLACE')
    hits = collider.modifiers.new('drape-collision', 'COLLISION')
    cloth = piece.modifiers.new('drape', 'CLOTH')
    s = cloth.settings
    s.quality, s.mass, s.air_damping = 6, DRAPE['mass'], 1.0
    s.tension_stiffness = s.compression_stiffness = 15
    s.bending_stiffness = DRAPE['bend']
    s.vertex_group_mass = 'drape-pin'
    cloth.collision_settings.distance_min = 0.004
    cloth.collision_settings.use_self_collision = False
    scene = bpy.context.scene
    cloth.point_cache.frame_start, cloth.point_cache.frame_end = 1, DRAPE['frames']
    for frame in range(1, DRAPE['frames'] + 1):
        scene.frame_set(frame)
    activate(piece)
    bpy.ops.object.modifier_move_to_index(modifier=cloth.name, index=0)
    bpy.ops.object.modifier_apply(modifier=cloth.name)
    collider.modifiers.remove(hits)
    piece.vertex_groups.remove(piece.vertex_groups['drape-pin'])   # by name: applying the cloth renews the list
    scene.frame_set(1)

    moved = max((v.co - b).length for v, b in zip(piece.data.vertices, before))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    surface = collider.evaluated_get(depsgraph)
    inverse = surface.matrix_world.inverted()
    # How far the deepest point has gone into the body: a point behind the nearest surface, against its normal.
    def inside(v):
        p = inverse @ (piece.matrix_world @ v.co)
        _, at, normal, _ = surface.closest_point_on_mesh(p)
        return -(p - at).dot(normal)
    near = max(inside(v) for v in piece.data.vertices)
    if moved > DRAPE['most'] or near > DRAPE['near']:
        for v, b in zip(piece.data.vertices, before):
            v.co = b
        print(f'KIT drape skipped for {piece.name}: moved {moved:.3f} m, {near:.4f} m into the body')
        return False
    print(f'KIT draped {piece.name}: moved {moved:.3f} m at most')
    return True


def lay_out(piece, middle, legs=None):
    """The garment's own faces, in the MAIN region: the front panel on the left, the back on the right, each the right
    way round from outside, its top at the top of the region. The picture wraps round the garment, across it by the
    angle round an upright axis, so that its sides get as much of the picture as its front: the axis is the body's
    middle (at y = `middle`), or below the crotch each leg's own (`legs`: {'crotch': height, 'x': the left leg's
    axis, 'y'}), its inside at the middle of a panel and its outside at the panel's side edge."""
    mesh = piece.data
    zs = [v.co.z for v in mesh.vertices]
    lowest, height = min(zs), max(zs) - min(zs)
    top, bottom = LAYOUT['main']
    half = PANEL['width'] / 2
    uv = mesh.uv_layers.active.data
    for polygon in mesh.polygons:
        c = polygon.center
        leg = legs is not None and c.z < legs['crotch']
        side = (1 if c.x >= 0 else -1) if leg else 1                # which way is outward: his left is +x
        ax, ay = (side * legs['x'], legs['y']) if leg else (0.0, middle)
        angle = lambda co: math.atan2(side * (co.x - ax), -(co.y - ay))   # 0 at the front (humans face -y), + outward
        front = abs(angle(c)) <= math.pi / 2
        for corner, vertex in zip(polygon.loop_indices, polygon.vertices):
            co = mesh.vertices[vertex].co
            a = angle(co)
            if not front:                                          # the back, measured as if seen from the front
                a = (math.pi - a) if a > 0 else (-math.pi - a)
            share = side * (a + math.pi / 2) / math.pi if leg else 2 * a / math.pi   # leg: 0 inside to 1 outside
            u = PANEL['front'] + half * share if front else PANEL['back'] - half * share
            u = min(1.0, max(0.0, u))   # a corner reaching round past a side seam: the side panel's paint covers it
            v = top + (bottom - top) * (1 - (co.z - lowest) / height)
            uv[corner].uv = (u, 1 - v)                      # Blender's v runs up; the picture's rows run down


def bind(piece, bound, width):
    """Sews a binding along each edge of the garment that `bound(point)` says is bound: a strip `width(loop)` metres
    wide (`loop`: the edge's points), standing BINDING['proud'] off the cloth and wrapping just past its edge, in the
    TRIM region of the picture. Its points take the weights of the edge they are sewn to, so it moves with the garment."""
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    bm.verts.ensure_lookup_table()
    deform = bm.verts.layers.deform.active
    uv_layer = bm.loops.layers.uv.active
    edges = [e for e in bm.edges if e.is_boundary]
    # The edge's loops, each in order.
    left, loops = set(edges), []
    while left:
        first = left.pop()
        loop, at, came = [first.verts[0], first.verts[1]], first.verts[1], first
        while True:
            nxt = next((e for e in at.link_edges if e in left), None)
            if nxt is None:
                break
            left.discard(nxt)
            at = nxt.other_vert(at)
            if at is loop[0]:
                break
            loop.append(at)
        loops.append(loop)
    sewn = 0
    top, bottom = LAYOUT['trim']
    for loop in loops:
        if not all(bound(v.co) for v in loop):
            continue
        # Onto the cloth: square to the edge and to the cloth's normal, turned the same way all round the loop, the way
        # most of its points' inner neighbours lie (a point at the tip of a lone triangle has none of its own).
        across = [v.normal.cross(loop[(k + 1) % len(loop)].co - loop[k - 1].co).normalized() for k, v in enumerate(loop)]
        lean = sum((e.other_vert(v).co - v.co).dot(across[k]) for k, v in enumerate(loop) for e in v.link_edges if not e.is_boundary)
        points, wide = [], width(loop)
        for k, v in enumerate(loop):
            n = v.normal.copy()
            into = across[k] if lean >= 0 else -across[k]
            outer = bm.verts.new(v.co - into * BINDING['over'] + n * BINDING['proud'] * 0.5)
            inside = bm.verts.new(v.co + into * wide + n * BINDING['proud'])
            for made in (outer, inside):
                if deform is not None:
                    for group, weight in v[deform].items():
                        made[deform][group] = weight
            points.append((outer, inside))
        # Each edge of the strip smoothed along the loop: point by point the cloth's normals and directions wobble,
        # and a strip laid on them ruffles.
        for _ in range(BINDING['smooth']):
            for ring in (0, 1):
                moved = [(points[k - 1][ring].co + 2 * points[k][ring].co + points[(k + 1) % len(points)][ring].co) / 4 for k in range(len(points))]
                for k, co in enumerate(moved):
                    points[k][ring].co = co
        length, along = 0.0, [0.0]
        for a, b in zip(loop, loop[1:] + loop[:1]):
            length += (a.co - b.co).length
            along.append(length)
        for i in range(len(loop)):
            j = (i + 1) % len(loop)
            (o1, i1), (o2, i2) = points[i], points[j]
            face = bm.faces.new((o1, o2, i2, i1))
            u1, u2 = along[i] / length, along[i + 1] / length
            for corner, (u, v) in zip(face.loops, ((u1, top), (u2, top), (u2, bottom), (u1, bottom))):
                corner[uv_layer].uv = (u, 1 - v)
        sewn += 1
    bm.normal_update()
    bm.to_mesh(piece.data)
    bm.free()
    return sewn


def tuck(jersey, shorts, waist):
    """Keeps the jersey inside the shorts below their waistband: any point of it that is not at least the cloth's
    thickness and a little more inside them is drawn in. A strong player's seat pushes the shorts' cut only so far."""
    from mathutils.bvhtree import BVHTree
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(shorts, depsgraph)
    room = THICK + 0.003
    pulled = 0
    for v in jersey.data.vertices:
        if v.co.z > waist - 0.005:
            continue
        at, normal, _, _ = tree.find_nearest(v.co)
        if at is None:
            continue
        if (v.co - at).dot(normal) > -room:
            v.co = at - normal * room
            pulled += 1
    print(f'KIT tucked {pulled} points of the jersey into the shorts')


def fit_weights(piece, collider, low, high):
    """Where the cloth lies on him (above the height `high`) it takes the weights of the skin under it, so that it moves
    as that skin does; below `low` it keeps the weights it was cut with, and between the two it blends."""
    mask = piece.vertex_groups.new(name='fit-weights')
    for v in piece.data.vertices:
        share = min(1.0, max(0.0, ((piece.matrix_world @ v.co).z - low) / (high - low)))
        if share > 0:
            mask.add([v.index], share, 'REPLACE')
    modifier = piece.modifiers.new('fit-weights', 'DATA_TRANSFER')
    modifier.object, modifier.use_vert_data = collider, True
    modifier.data_types_verts = {'VGROUP_WEIGHTS'}
    modifier.vert_mapping = 'POLYINTERP_NEAREST'
    modifier.layers_vgroup_select_src, modifier.layers_vgroup_select_dst = 'ALL', 'NAME'   # both were cut from the same body
    modifier.mix_mode, modifier.mix_factor, modifier.vertex_group = 'REPLACE', 1.0, mask.name
    activate(piece)
    bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    piece.vertex_groups.remove(piece.vertex_groups['fit-weights'])


def steady_collar(jersey, mark):
    """Round the neck, the jersey's weights are its spine's and neck's (and a little of its shoulders'), so the collar
    keeps its round shape however his shoulders and arms move (see COLLAR)."""
    names = {g.index: g.name for g in jersey.vertex_groups}
    spine = {i for i, n in names.items() if n in (BONE + 'Spine1', BONE + 'Spine2', BONE + 'Neck')}
    shoulder = {i for i, n in names.items() if n.startswith(BONE) and 'Shoulder' in n}
    bm = bmesh.new()
    bm.from_mesh(jersey.data)
    above = mark['shoulder'].z - JERSEY['armpit']
    edge = [v.co.copy() for v in bm.verts if v.is_boundary and v.co.z > above and abs(v.co.x) < NECK['wide'] + 0.01]
    bm.free()
    if not edge:
        return
    for v in jersey.data.vertices:
        far = min((v.co - e).length for e in edge)
        share = 1 - min(1.0, max(0.0, (far - COLLAR['hold']) / (COLLAR['free'] - COLLAR['hold'])))
        if share <= 0:
            continue
        old = {g.group: g.weight for g in v.groups if g.group in spine or (names[g.group].startswith(BONE))}
        kept = {i: w * (1.0 if i in spine else COLLAR['shoulders'] if i in shoulder else 0.0) for i, w in old.items()}
        total = sum(kept.values())
        if total <= 0:
            continue
        for g in v.groups:
            if g.group in old:
                g.weight = (1 - share) * old[g.group] + share * kept[g.group] / total


def thicken(piece):
    """Cloth THICK metres thick, the inside facing in, the edges closed."""
    activate(piece)
    modifier = piece.modifiers.new('thick', 'SOLIDIFY')
    modifier.thickness, modifier.offset, modifier.use_rim = THICK, 1, True   # outward: the draped surface is the inside
    modifier.use_even_offset = False   # an even offset throws spikes off the sharp corners where the shorts' legs meet
    modifier.use_quality_normals = True
    bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def material(name):
    """White and matte: the game paints and shades it. There is one of each name, shared by every player."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    shader = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
    shader.inputs['Roughness'].default_value = 0.8
    return m


def make_kit(body, collider, mark, bones, tights):
    """(jersey, shorts), ready to be joined to the body: draped, laid out, thick, smooth."""
    jersey = make_jersey(body, mark, bones, tights)
    shorts = make_shorts(body, mark, bones, tights)
    neck, waist = mark['neck'], mark['pelvis'] + SHORTS['rise']
    hem = waist - JERSEY['tuck']
    # Held at the shoulders, round the collar (so it keeps the round line it was cut to) and in the shorts.
    collar = lambda p: p.z > mark['chest'] and abs(p.x) < NECK['wide'] + NECK['fine']
    drape(jersey, collider, lambda p: p.z > mark['shoulder'].z - 0.04 or collar(p) or p.z < hem + 0.06)
    drape(shorts, collider, lambda p: p.z > waist - 0.03)                 # held at the waistband
    tuck(jersey, shorts, waist)
    fit_weights(jersey, collider, mark['chest'] - 0.04, mark['chest'] + 0.04)
    steady_collar(jersey, mark)
    legs = {'crotch': mark['hip'] - 0.10, 'x': abs(mark['thigh'].x) + 0.01, 'y': mark['thigh'].y}
    for piece, kind in ((jersey, 'jersey'), (shorts, 'shorts')):
        lowest = min(v.co.z for v in piece.data.vertices)
        lay_out(piece, mark['spine_y'], legs if kind == 'shorts' else None)
        # The jersey's hem is tucked into the shorts: it has no binding. Its collar is the edge that crosses its middle;
        # the shorts' waistband is their highest edge.
        top = max(v.co.z for v in piece.data.vertices)
        if kind == 'jersey':
            width = lambda loop: BINDING['collar'] if min(abs(v.co.x) for v in loop) < 0.02 else BINDING['arm']
        else:
            width = lambda loop: BINDING['waist'] if max(v.co.z for v in loop) > top - 0.01 else BINDING['hem']
        bind(piece, (lambda co: co.z > lowest + 0.03) if kind == 'jersey' else (lambda co: True), width)
        piece.data.materials.clear()
        piece.data.materials.append(material(kind))
        thicken(piece)
        for polygon in piece.data.polygons:
            polygon.use_smooth = True
    return jersey, shorts


def add_springs(rig, shorts, mark):
    """A spring bone in each leg of the shorts (kitShortsLeft, kitShortsRight), hanging from the hip joint, and the
    legs' cloth weighted toward it the nearer the hem it is: at run time the hem lags behind the leg and swings
    (src/render/springs.js). The jersey has none: it is tucked into the shorts."""
    activate(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    down = rig.matrix_world.to_3x3().inverted() @ Vector((0, 0, -0.1))
    for side in ('Left', 'Right'):
        thigh = rig.data.edit_bones[f'{BONE}{side}UpLeg']
        bone = rig.data.edit_bones.new(f'kitShorts{side}')
        bone.head, bone.tail = thigh.head.copy(), thigh.head + down
        bone.parent, bone.use_deform = thigh, True
    bpy.ops.object.mode_set(mode='OBJECT')

    crotch, hem = mark['hip'] - 0.10, mark['knee'] - SHORTS['below_knee']
    groups = {side: shorts.vertex_groups.new(name=f'kitShorts{side}') for side in ('Left', 'Right')}
    for v in shorts.data.vertices:
        co = shorts.matrix_world @ v.co
        t = min(1.0, max(0.0, (crotch - co.z) / (crotch - hem)))
        share = 0.85 * t ** 1.5
        if share <= 0:
            continue
        for g in v.groups:                               # the rest of its weight gives way
            g.weight *= 1 - share
        groups['Left' if co.x >= 0 else 'Right'].add([v.index], share, 'REPLACE')   # his left is +X

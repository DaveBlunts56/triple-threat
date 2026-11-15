"""The players' kit as garments: a jersey and shorts cut from the body's "tights" helper surface, hung loose, draped by a
cloth simulation, given bindings, side panels, thickness and a layout the game paints. Used by build_players.py.

The layout of each garment's picture, with (0, 0) at its top left (as src/render/kit.js paints it):
    MAIN    the front panel on the left half and the back panel on the right, the garment's top along the top edge
    TRIM    a strip: the bindings round the neck and the arm holes, the waistband and the hems; v runs from the
            garment's edge (top of the strip) to the binding's inner edge (bottom), where it is stitched on
    PANEL   a strip: the side panels and stripes; v runs across the panel, from where it meets the front to the back
"""
import math

import bmesh
import bpy
from mathutils import Vector

BONE = 'mixamorig:'
# How loosely the kit hangs: how far each ring of the surface is pushed out from the body, as a share of its radius.
# The jersey is tucked into the shorts, as the rules of the game ask: its hem is `tuck` metres below the shorts'
# waistband, and it is a little narrower there than they are.
JERSEY = {'chest': 0.09, 'hem': 0.07, 'tuck': 0.08}
SHORTS = {'hip': 0.10, 'hem': 0.52, 'above_knee': 0.03, 'rise': 0.09}   # rise: metres the waistband sits above the hip bone's root
# Regions of each garment's picture, as (top, bottom) shares of its height. Must match KIT.layout in src/render/kit.js.
LAYOUT = {'main': (0.0, 0.8), 'trim': (0.82, 0.9), 'panel': (0.92, 1.0)}
PANEL = {'front': 0.25, 'back': 0.75, 'width': 0.46}      # the main panels: their middles across the picture, and their width
BINDING = {'width': 0.016, 'proud': 0.003}               # metres: how wide a binding is, and how far it stands off the cloth
SIDE = {'jersey': 0.035, 'shorts': 0.016}                 # metres either side of the side line that are panel or stripe
THICK = 0.004                                             # metres of cloth
# The drape: frames of cloth simulation, and the most any point may move or go into the body before the drape is
# thrown away for that garment.
DRAPE = {'frames': 30, 'most': 0.06, 'near': 0.004}


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


def make_jersey(body, mark, bones, tights):
    """A sleeveless jersey: the torso of the tights surface, hung loose, with a scooped neck and arm holes."""
    hem = mark['pelvis'] + SHORTS['rise'] - JERSEY['tuck']
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
    tidy_border(jersey, flat=[hem])
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
    s.quality, s.mass, s.air_damping = 6, 0.15, 1.0
    s.tension_stiffness = s.compression_stiffness = 15
    s.bending_stiffness = 0.05
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


def boundary_distance(piece):
    """For each vertex, metres to the nearest point of the garment's edge."""
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    edge = [v.co.copy() for v in bm.verts if v.is_boundary]
    bm.free()
    from mathutils.kdtree import KDTree
    tree = KDTree(len(edge))
    for i, co in enumerate(edge):
        tree.insert(co, i)
    tree.balance()
    return [tree.find(v.co)[2] for v in piece.data.vertices]


def side_offset(co, centre_y, axis_x, piece_name):
    """Metres along the surface (roughly) from the side line of the garment, signed: below 0 toward the front."""
    dx, dy = co.x - axis_x, co.y - centre_y
    radius = max(math.hypot(dx, dy), 1e-6)
    angle = math.atan2(dy, abs(dx))                         # 0 at the side, toward -pi/2 at the front (humans face -Y)
    return angle * radius


def lay_out(piece, kind, mark):
    """Material regions and UVs. Each face is MAIN, TRIM (within a binding's width of an edge) or PANEL (within the
    side panel's width of the side line); its corners are placed in that region of the picture."""
    mesh = piece.data
    to_edge = boundary_distance(piece)
    xs, zs = [v.co.x for v in mesh.vertices], [v.co.z for v in mesh.vertices]
    width, lowest, height = max(xs) - min(xs), min(zs), max(zs) - min(zs)
    thigh = mark['thigh']

    def offset(co):
        if kind == 'shorts' and co.z < mark['hip'] - 0.10:   # below the crotch each leg has its own outer side
            side = 1 if co.x >= 0 else -1
            return side_offset(co, thigh.y, side * abs(thigh.x), kind) if co.x * side > 0 else 1.0
        return side_offset(co, mark['spine_y'], 0.0, kind)

    region = {}
    for polygon in mesh.polygons:
        corners = [mesh.vertices[i].co for i in polygon.vertices]
        centre = sum(corners, Vector()) / len(corners)
        if min(to_edge[i] for i in polygon.vertices) < BINDING['width'] * 0.75:
            region[polygon.index] = 'trim'
        elif abs(offset(centre)) < SIDE[kind] and (kind == 'jersey' or abs(centre.x) > 0.02):
            region[polygon.index] = 'panel'
        else:
            region[polygon.index] = 'main'

    uv = mesh.uv_layers.active.data
    for polygon in mesh.polygons:
        r = region[polygon.index]
        top, bottom = LAYOUT[r]
        front = polygon.normal.y < 0
        for corner, vertex in zip(polygon.loop_indices, polygon.vertices):
            co = mesh.vertices[vertex].co
            if r == 'main':
                across = PANEL['width'] * co.x / width
                u = PANEL['front'] + across if front else PANEL['back'] - across
                v = top + (bottom - top) * (1 - (co.z - lowest) / height)
            elif r == 'trim':
                u = 0.5 + 0.45 * math.sin(co.x * 9 + co.z * 5)
                v = top + (bottom - top) * min(1.0, to_edge[vertex] / BINDING['width'])
            else:
                u = 0.05 + 0.9 * (1 - (co.z - lowest) / height)
                v = top + (bottom - top) * min(1.0, max(0.0, 0.5 + offset(co) / (2 * SIDE[kind])))
            uv[corner].uv = (u, 1 - v)                      # Blender's v runs up; the picture's rows run down
    # The bindings stand off the cloth.
    raised = {i for p in mesh.polygons if region[p.index] == 'trim' for i in p.vertices}
    for i in raised:
        v = mesh.vertices[i]
        v.co += v.normal * BINDING['proud']
    return region


def thicken(piece):
    """Cloth THICK metres thick, the inside facing in, the edges closed."""
    activate(piece)
    modifier = piece.modifiers.new('thick', 'SOLIDIFY')
    modifier.thickness, modifier.offset, modifier.use_rim = THICK, 1, True   # outward: the draped surface is the inside
    modifier.use_even_offset = True
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
    drape(jersey, collider, lambda p: p.z > mark['shoulder'].z - 0.04 or p.z < hem + 0.06)   # held at the shoulders, and in the shorts
    drape(shorts, collider, lambda p: p.z > waist - 0.03)                 # held at the waistband
    for piece, kind in ((jersey, 'jersey'), (shorts, 'shorts')):
        lay_out(piece, kind, mark)
        piece.data.materials.clear()
        piece.data.materials.append(material(kind))
        thicken(piece)
        for polygon in piece.data.polygons:
            polygon.use_smooth = True
    return jersey, shorts

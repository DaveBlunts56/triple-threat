"""Writes assets/source/mixamo-upload.fbx: the first player's body on his own skeleton, for uploading to mixamo.com.

    blender-4.5 --background --python tools/blender/export_mixamo_doll.py [-- --shots DIR]

Mixamo makes each motion for the character it was given, so the skeleton uploaded is exactly the one the game uses.
The figure is the whole body wearing the jersey and shorts, in plain grey with no pictures: Mixamo only needs its shape.
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_players import build_person, finish, people  # noqa: E402
from common import clear_scene, project, snapshot  # noqa: E402


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    shots = args[args.index('--shots') + 1] if '--shots' in args else None
    clear_scene()
    row = people()[0]
    rig, meshes, doll = build_person(row, with_doll=True)
    kit = []
    for piece in meshes[1:3]:                       # copies of the jersey and shorts, before they are joined to the body
        copy = piece.copy()
        copy.data = piece.data.copy()
        bpy.context.scene.collection.objects.link(copy)
        kit.append(copy)
    finish(row, rig, meshes, extra=[doll, *kit])

    bpy.ops.object.select_all(action='DESELECT')
    for obj in [doll, *kit]:
        obj.data.materials.clear()
        obj.select_set(True)
    bpy.context.view_layer.objects.active = doll
    bpy.ops.object.join()
    doll.name = doll.data.name = 'figure'
    if shots:
        snapshot(os.path.join(shots, 'mixamo-upload.png'), [doll], textured=False)

    bpy.ops.object.select_all(action='DESELECT')
    doll.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    out = project('assets', 'source', 'mixamo-upload.fbx')
    bpy.ops.export_scene.fbx(filepath=out, use_selection=True, object_types={'ARMATURE', 'MESH'}, bake_anim=False, path_mode='STRIP')
    print('DOLL wrote', out, os.path.getsize(out), 'bytes;', len(doll.data.polygons), 'faces;', len(rig.data.bones), 'bones')


main()

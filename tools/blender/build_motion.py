"""Writes assets/motion.glb and assets/motion.json: the Mixamo clips in assets/source/mixamo/, on the player's skeleton.

    blender-4.5 --background --python tools/blender/build_motion.py [-- --shots DIR]

Mixamo made each clip for the skeleton it was given (export_mixamo_doll.py), so a clip's skeleton stands exactly like
the player's; only the bones' own axes differ after the round trip. Each bone of the player is therefore given the
same move away from its rest pose that the clip's bone makes, which needs no bone-by-bone mapping.
"""
import json
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_players import build_person, finish, people  # noqa: E402
from common import bounds, clear_scene, project, snapshot  # noqa: E402

FPS = 30
CLIPS = {'idle': True, 'walk': True, 'run': True, 'sprint': True, 'jump': False}   # name (and file name): does it loop
GAITS = ('walk', 'run', 'sprint')
HIPS = 'mixamorig:Hips'
TOES = ('mixamorig:LeftToeBase', 'mixamorig:RightToeBase')
OFF_FLOOR = 0.03     # metres a foot must rise above its lowest point in the clip to count as off the floor
REST_GAP = 0.005     # metres a clip's rest pose may differ from the player's before the build refuses it


def read_clip(name, rig):
    """The clip as a list of frames, each {bone name: where that bone of the rig should be, in the rig's own space}."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=project('assets', 'source', 'mixamo', f'{name}.fbx'))
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    action = src.animation_data.action
    to_rig = rig.matrix_world.inverted() @ src.matrix_world

    offset = {}
    for bone in rig.data.bones:
        theirs = src.data.bones.get(bone.name)
        assert theirs, f'{name}: the clip has no bone {bone.name}'
        gap = (to_rig @ theirs.head_local - bone.head_local).length
        assert gap < REST_GAP, f'{name}: {bone.name} rests {gap:.3f} m from the player\'s; was the clip made for mixamo-upload.fbx?'
        offset[bone.name] = (to_rig @ theirs.matrix_local).inverted() @ bone.matrix_local

    scene = bpy.context.scene
    start, end = (int(v) for v in action.frame_range)
    frames = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        frames.append({bone: to_rig @ src.pose.bones[bone].matrix @ offset[bone] for bone in offset})
    for obj in new:
        bpy.data.objects.remove(obj)
    bpy.data.actions.remove(action)
    return frames


def shift(pose, by):
    for matrix in pose.values():
        matrix.translation = matrix.translation - by


def on_the_spot(frames):
    """Takes the travel out of a clip, evenly over its length, and returns the speed it travelled at in metres a second."""
    travel = frames[-1][HIPS].translation - frames[0][HIPS].translation
    travel.z = 0
    for i, pose in enumerate(frames):
        shift(pose, travel * (i / (len(frames) - 1)))
    return travel.length * FPS / (len(frames) - 1)


def airborne(frames, rig):
    """Only the frames with both feet off the floor, with the climb taken out: the game lifts the whole player."""
    def lowest(pose):
        return min(min(pose[toe].translation.z, (pose[toe] @ Vector((0, rig.data.bones[toe].length, 0))).z) for toe in TOES)
    lows = [lowest(pose) for pose in frames]
    floor = min(lows)
    up = [i for i, low in enumerate(lows) if low > floor + OFF_FLOOR]
    assert up and up == list(range(up[0], up[-1] + 1)) and up[0] > 0 and up[-1] < len(frames) - 1, f'no single jump found: {up}'
    span = slice(up[0] - 1, up[-1] + 2)          # from the last frame on the floor to the first frame back on it
    for pose, low in zip(frames[span], lows[span]):
        shift(pose, Vector((0, 0, low - floor)))
    return frames[span]


def write_action(rig, name, frames):
    """Keys the frames onto the rig as a new action: every bone's turn, and the position of the hips."""
    action = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = action
    last = {}
    for at, pose in enumerate(frames, start=1):
        for bone in rig.pose.bones:
            rest = bone.bone.matrix_local
            if bone.parent:
                basis = (bone.parent.bone.matrix_local.inverted() @ rest).inverted() @ (pose[bone.parent.name].inverted() @ pose[bone.name])
            else:
                basis = rest.inverted() @ pose[bone.name]
            turn = basis.to_quaternion()
            if bone.name in last:
                turn.make_compatible(last[bone.name])      # the shorter way round from the frame before, so nothing spins
            last[bone.name] = bone.rotation_quaternion = turn
            bone.keyframe_insert('rotation_quaternion', frame=at)
            if bone.name == HIPS:
                bone.location = basis.translation
                bone.keyframe_insert('location', frame=at)

    scene = bpy.context.scene                    # self-check: the rig, played back, stands where the frames say
    for at in sorted({1, (len(frames) + 1) // 2, len(frames)}):
        scene.frame_set(at)
        bpy.context.view_layer.update()
        worst = max((bone.matrix.translation - frames[at - 1][bone.name].translation).length for bone in rig.pose.bones)
        assert worst < 0.003, f'{name}: frame {at} lands {worst:.4f} m from the clip'
    return action


def filmstrip(path, body, frames, box):
    """One picture of the body at evenly spaced frames: seen from the side on the top row, from the front quarter below."""
    scene, rows = bpy.context.scene, []
    for view in ('side', 'three_quarter'):
        tiles = []
        for frame in frames:
            scene.frame_set(frame)
            tile = snapshot(f'{path}.{view}.{frame}.png', [body], views=(view,), tile=(256, 384), box=box)
            image = bpy.data.images.load(tile)
            tiles.append(np.array(image.pixels[:], dtype=np.float32).reshape(384, 256, 4))
            bpy.data.images.remove(image)
            os.remove(tile)
        rows.append(np.concatenate(tiles, axis=1))
    sheet = np.concatenate(rows[::-1], axis=0)   # image rows run bottom to top
    out = bpy.data.images.new('filmstrip', width=sheet.shape[1], height=sheet.shape[0])
    out.pixels = sheet.ravel()
    out.filepath_raw, out.file_format = path, 'PNG'
    out.save()
    bpy.data.images.remove(out)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    shots = args[args.index('--shots') + 1] if '--shots' in args else None
    clear_scene()
    row = people()[0]
    rig, meshes, _ = build_person(row)
    body = finish(row, rig, meshes)
    scene = bpy.context.scene
    scene.render.fps = FPS
    lo, hi = bounds([body])
    box = (lo - Vector((0.6, 0.6, 0.05)), hi + Vector((0.6, 0.6, 0.25)))
    for bone in rig.pose.bones:
        bone.rotation_mode = 'QUATERNION'

    facts, actions = {'gaits': {}, 'clips': {}}, {}
    for name, loop in CLIPS.items():
        frames = read_clip(name, rig)
        scene.render.fps = FPS                    # the importer may set the scene to the file's rate
        if loop:
            speed = on_the_spot(frames)
            if name in GAITS:
                facts['gaits'][name] = round(speed, 3)
        else:
            frames = airborne(frames, rig)
        actions[name] = write_action(rig, name, frames)
        facts['clips'][name] = {'duration': round((len(frames) - 1) / FPS, 4), 'loop': loop}
        if shots:
            filmstrip(os.path.join(shots, f'motion-{name}.png'), body, [round(1 + (len(frames) - 1) * i / 5) for i in range(6)], box)

    rig.animation_data.action = None
    for name, action in actions.items():
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, action).name = name
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    out = project('assets', 'motion.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True,
                              export_animation_mode='NLA_TRACKS', export_skins=True, export_yup=True, export_force_sampling=True,
                              export_materials='NONE', export_cameras=False, export_lights=False, export_extras=False)
    with open(project('assets', 'motion.json'), 'w') as file:
        json.dump(facts, file, indent=2)
        file.write('\n')
    print('MOTION wrote', out, os.path.getsize(out), 'bytes;', json.dumps(facts))


if __name__ == '__main__':
    main()

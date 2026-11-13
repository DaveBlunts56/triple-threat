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
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_players import build_person, finish, people  # noqa: E402
from common import bounds, clear_scene, project, snapshot  # noqa: E402

FPS = 30
# Name (and file name) of each Mixamo clip: its kind. A 'loop' repeats; in a 'held' one the game sets how far through it is.
CLIPS = {'idle': 'loop', 'walk': 'loop', 'run': 'loop', 'sprint': 'loop', 'jump': 'held',
         'strafeLeft': 'loop', 'backpedal': 'loop', 'dribble': 'loop'}
MIRRORS = {'strafeRight': 'strafeLeft', 'dribbleLeft': 'dribble'}          # motions the build makes: another one in a mirror
STRIDES = ('walk', 'run', 'sprint')                                        # the gaits whose footfalls are timed
STEPS = {'strafeLeft': (1, 0, 0), 'strafeRight': (-1, 0, 0), 'backpedal': (0, 1, 0)}   # the way each step must travel
GAITS = STRIDES + tuple(STEPS)
HIPS = 'mixamorig:Hips'
TOES = ('mixamorig:LeftToeBase', 'mixamorig:RightToeBase')
FEET = {'left': 'mixamorig:LeftFoot', 'right': 'mixamorig:RightFoot'}
BALL_HAND = 'mixamorig:RightHand'
OFF_FLOOR = 0.03     # metres a foot must rise above its lowest point in the clip to count as off the floor
REST_GAP = 0.005     # metres a clip's rest pose may differ from the player's before the build refuses it
LOPSIDED = 0.02      # metres a bone may rest from its twin's mirror image before the build refuses to mirror (the shoulders: 0.014)
LAND_FRAMES = 10     # how many frames after the landing the hips may take to reach their lowest
BOUNCE_RISE = 0.05   # metres the ball hand must come back up after a low point for it to count as a bounce


def clip_path(name):
    return project('assets', 'source', 'mixamo', f'{name}.fbx')


def read_clip(name, rig):
    """The clip as a list of frames, each {bone name: where that bone of the rig should be, in the rig's own space}."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=clip_path(name))
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


def travel(frames):
    """How far the hips go over the clip, along the floor."""
    return (frames[-1][HIPS].translation - frames[0][HIPS].translation).to_2d().to_3d()


def on_the_spot(frames):
    """Takes the travel out of a clip, evenly over its length, and returns the speed it travelled at in metres a second."""
    gone = travel(frames)
    for i, pose in enumerate(frames):
        shift(pose, gone * (i / (len(frames) - 1)))
    return gone.length * FPS / (len(frames) - 1)


def share(frames, at):
    """How far through a looping clip frame `at` is, from 0 to 1. The last frame is the first again."""
    return round(at / (len(frames) - 1), 3)


def check_heading(name, frames, way):
    """Stops the build unless the clip travels the way its name says, with less than a third as much travel across."""
    gone, way = travel(frames), Vector(way)
    along = gone @ way
    across = (gone - along * way).length
    assert along > 0 and across < along / 3, f'{name}: travels {along:.2f} m the way its name says and {across:.2f} m across it'


def strike(frames):
    """The share of the cycle at which each foot is furthest ahead of the hips the way the clip travels: when it lands."""
    ahead = travel(frames).normalized()

    def furthest(foot):
        reach = [(pose[foot].translation - pose[HIPS].translation) @ ahead for pose in frames[:-1]]
        return share(frames, reach.index(max(reach)))
    return {side: furthest(foot) for side, foot in FEET.items()}


def hips_height(frames):
    """How high the hips sit, on average over a looping clip."""
    return sum(pose[HIPS].translation.z for pose in frames[:-1]) / (len(frames) - 1)


def bounce(frames):
    """When in the cycle the ball hand is lowest, and how many times it goes down and comes back up in one cycle."""
    heights = [pose[BALL_HAND].translation.z for pose in frames[:-1]]
    top = heights.index(max(heights))
    bounces, falling, turn = 0, True, heights[top]
    for height in heights[top:] + heights[:top + 1]:          # once round the cycle, from the hand's highest point
        if falling and height > turn + BOUNCE_RISE:
            bounces, falling, turn = bounces + 1, False, height
        elif not falling and height < turn - BOUNCE_RISE:
            falling, turn = True, height
        turn = min(turn, height) if falling else max(turn, height)
    assert bounces >= 1, f'the ball hand never drops and comes back up {BOUNCE_RISE} m'
    return {'push': share(frames, heights.index(min(heights))), 'bounces': bounces}


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


def landing(frames, jump):
    """The frames that follow the jump: from the frame it ends on to the lowest the hips sink soon after. None is shifted."""
    first = next(i for i, pose in enumerate(frames) if pose is jump[-1])
    soon = range(first, min(first + LAND_FRAMES, len(frames) - 1) + 1)
    lowest = min(soon, key=lambda i: frames[i][HIPS].translation.z)
    assert lowest >= first + 2, f'the hips do not sink after the landing: lowest at frame {lowest}, landing at {first}'
    return frames[first:lowest + 1]


def twin(bone):
    """The name of the bone on the other side; a bone in the middle is its own twin."""
    return bone.replace('Left', 'Right') if 'Left' in bone else bone.replace('Right', 'Left')


def mirrored(frames, rig):
    """The same motion with left and right exchanged: each bone turns from its rest pose as its twin did, in a mirror.

    Only the turn is taken from the twin. The hips go where the mirror puts them and every other bone where its parent
    carries it, so a skeleton whose two sides rest a little differently still holds together.
    """
    flip, bones, carry, joint = Matrix.Diagonal((-1, 1, 1, 1)), rig.data.bones, {}, {}
    for bone in bones:
        other = bones[twin(bone.name)]
        gap = (flip @ other.head_local - bone.head_local).length
        assert gap < LOPSIDED, f'{bone.name} rests {gap:.4f} m from the mirror image of {other.name}: the skeleton cannot be mirrored'
        carry[bone.name] = other.matrix_local.inverted() @ flip @ bone.matrix_local
        if bone.parent:
            joint[bone.name] = bone.parent.matrix_local.inverted() @ bone.head_local

    def mirror(pose):
        new = {}
        for bone in bones:                        # a parent comes before its children
            new[bone.name] = flip @ pose[twin(bone.name)] @ carry[bone.name]
            new[bone.name].translation = new[bone.parent.name] @ joint[bone.name] if bone.parent else flip @ pose[bone.name].translation
        return new
    return [mirror(pose) for pose in frames]


def write_action(rig, name, frames):
    """Keys the frames onto the rig as a new action: every bone's turn, and the position of the hips.

    The first frame is frame 0, so that the clip starts at time zero in the file and is exactly as long as its frames.
    """
    action = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = action
    last = {}
    for at, pose in enumerate(frames):
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
    for at in sorted({0, len(frames) // 2, len(frames) - 1}):
        scene.frame_set(at)
        bpy.context.view_layer.update()
        worst = max((bone.matrix.translation - frames[at][bone.name].translation).length for bone in rig.pose.bones)
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
    missing = [f'{name}.fbx' for name in CLIPS if not os.path.exists(clip_path(name))]
    assert not missing, f'no {", ".join(missing)} in assets/source/mixamo/: nothing is written'
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

    def add(name, kind, frames, **more):
        """Puts one motion in the file, with its facts and, if asked for, its film strip."""
        actions[name] = write_action(rig, name, frames)
        facts['clips'][name] = {'duration': round((len(frames) - 1) / FPS, 4), 'loop': kind == 'loop', 'kind': kind, **more}
        if shots:
            filmstrip(os.path.join(shots, f'motion-{name}.png'), body, [round((len(frames) - 1) * i / 5) for i in range(6)], box)

    for name, kind in CLIPS.items():
        frames = read_clip(name, rig)
        scene.render.fps = FPS                    # the importer may set the scene to the file's rate
        if kind == 'held':                        # the jump, and what follows it
            jump = airborne(frames, rig)
            add(name, kind, jump)
            add('land', 'held', landing(frames, jump))
            continue
        made = {name: frames, **{other: mirrored(frames, rig) for other, source in MIRRORS.items() if source == name}}
        for name, frames in made.items():
            more = {}
            if name in STEPS:
                check_heading(name, frames, STEPS[name])
            if name in STRIDES:
                more['strike'] = strike(frames)
            speed = on_the_spot(frames)
            if name in GAITS:
                facts['gaits'][name] = round(speed, 3)
            if name == 'idle':
                standing = hips_height(frames)
            if name in STEPS:
                more['crouch'] = round(standing - hips_height(frames), 3)
            if name == 'dribble':
                more.update(bounce(frames))
            add(name, kind, frames, **more)

    rig.animation_data.action = None
    for name, action in actions.items():
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, action).name = name
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

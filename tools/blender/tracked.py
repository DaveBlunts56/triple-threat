"""Puts a measured moment of a reference clip (assets/source/tracked/, written by tools/video/poses.py) on the rig.

A moment says which way every limb points, in the body's own frame: x toward his left, y up, z out of his chest. The
rig stands facing -Y with +X toward his left and +Z up, so a direction (x, y, z) of the body is (x, -z, y) of the rig.
Each bone is turned from rest by the shortest turn that lays it along its measured direction; a limb's turn about
itself is not measured (one camera cannot see it) and is left as it rests.
"""
import json
import os

from mathutils import Euler, Quaternion, Vector

from common import project

PREFIX = 'mixamorig:'
# bone: (the bone whose head is its far end, the limb of the moment it lies along)
LIMBS = {
    'LeftUpLeg': ('LeftLeg', 'leftThigh'), 'LeftLeg': ('LeftFoot', 'leftShin'), 'LeftFoot': ('LeftToeBase', 'leftFoot'),
    'RightUpLeg': ('RightLeg', 'rightThigh'), 'RightLeg': ('RightFoot', 'rightShin'), 'RightFoot': ('RightToeBase', 'rightFoot'),
    'LeftArm': ('LeftForeArm', 'leftUpperArm'), 'LeftForeArm': ('LeftHand', 'leftForearm'),
    'RightArm': ('RightForeArm', 'rightUpperArm'), 'RightForeArm': ('RightHand', 'rightForearm'),
}
SPINE = ('Spine', 'Spine1', 'Spine2')
FOOT_SEEN = 0.5     # a foot the tracker is less sure of than this is left square to its shin
_clips = {}


def to_rig(v):
    return Vector((v[0], -v[2], v[1]))


def clip(name):
    """The measured clip `name`: { moment name: moment }, made right-handed (a left-handed clip is seen in a mirror)."""
    if name not in _clips:
        with open(project('assets', 'source', 'tracked', f'{name}.json')) as file:
            data = json.load(file)
        moments = {m['name']: m for m in data['moments']}
        if data['hand'] == 'left':
            swap = lambda limb: limb.replace('left', '\0').replace('right', 'left').replace('\0', 'right')
            flip = lambda v: [-v[0], v[1], v[2]]
            for m in moments.values():
                m['limbs'] = {swap(limb): flip(v) for limb, v in m['limbs'].items()}
                m['seen'] = {swap(limb): v for limb, v in m['seen'].items()}
                m['trunk'] = flip(m['trunk'])
                m['shoulders'] = [m['shoulders'][0], -m['shoulders'][1], -m['shoulders'][2]]   # right-to-left, seen in a mirror
        _clips[name] = moments
    return _clips[name]


def aimed(rig, moment, overrides=None):
    """The turn of every bone from rest, { bone name without the prefix: Quaternion }, for the measured `moment`.

    `overrides` is { bone: (x, y, z) degrees, as in poses.py }: those bones are turned as it says instead, on top of
    their parents, and the bones below them are still laid along their measured directions.
    """
    overrides = overrides or {}
    bones = rig.data.bones
    head = lambda name: bones[PREFIX + name].head_local
    # The whole trunk: its lean, then the shoulders' turn about it, shared between the three spine bones.
    rest_up = (head('Neck') - head('Hips')).normalized()
    lean = rest_up.rotation_difference(to_rig(moment['trunk']).normalized())
    up = to_rig(moment['trunk']).normalized()
    flat = lambda v: (v - up * v.dot(up))
    was, now = flat(lean @ Vector((1, 0, 0))), flat(to_rig(moment['shoulders']))
    twist = Quaternion(up, was.angle(now, 0) * (1 if was.cross(now).dot(up) >= 0 else -1)) if was.length > 1e-6 and now.length > 1e-6 else Quaternion()
    trunk = twist @ lean

    turns, carried = {}, {}
    for bone in bones:                                   # a parent comes before its children
        name = bone.name[len(PREFIX):]
        above = carried[bone.parent.name] if bone.parent else Quaternion()
        if name in overrides:
            turn = Euler([v * 3.141592653589793 / 180 for v in overrides[name]], 'XYZ').to_quaternion()
        elif name in SPINE:
            share = (SPINE.index(name) + 1) / len(SPINE)
            turn = above.inverted() @ Quaternion().slerp(trunk, share)
        elif name in LIMBS and not (name.endswith('Foot') and moment['seen'][LIMBS[name][1]] < FOOT_SEEN):
            far, limb = LIMBS[name]
            rest = (head(far) - bone.head_local).normalized()
            turn = above.inverted() @ rest.rotation_difference(to_rig(moment['limbs'][limb]).normalized())
        else:
            turn = Quaternion()
        carried[bone.name] = above @ turn
        if turn != Quaternion():
            turns[name] = turn
    return turns

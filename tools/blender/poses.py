"""The motions made by hand: each a few key poses, which build_motion.py turns into frames and keys onto the player.

A pose says how far each bone is turned from the way it rests, as (x, y, z) in degrees about the rig's own axes as it
stands at rest: X toward his left, Y toward his back, Z up. The three turns are applied in that order. A bone's turn
is on top of its parent's, so a raised upper arm carries the forearm with it. A bone a key leaves out is at rest.

Which way a turn goes (he faces -Y, and at rest his arms hang out to the sides with the forearms forward):
    x: plus bends the trunk forward and swings a hanging limb back; minus lifts a thigh or an arm to the front
    y: plus tips him to his left, lowers his left arm and raises his right
    z: plus turns him, or a limb held out in front, to his left
"""
from math import radians

from mathutils import Euler, Matrix, Quaternion, Vector

PREFIX = 'mixamorig:'
TOES = (PREFIX + 'LeftToeBase', PREFIX + 'RightToeBase')
LEG_BONES = tuple(side + part for side in ('Left', 'Right') for part in ('UpLeg', 'Leg', 'Foot', 'ToeBase'))


def both(turns):
    """The turns, which name bones of his right side, with the same turns in a mirror for his left side."""
    return {**turns, **{bone.replace('Right', 'Left'): (x, -y, -z) for bone, (x, y, z) in turns.items()}}


# ---- The key poses. Each names only the bones it turns. ----

# Arms hanging at the sides, forearms a little forward, as they hang in the standing clip.
SIDES = both({'RightArm': (17, -22, 21), 'RightForeArm': (-5, -12, -9), 'RightHand': (-5, -10, -12)})

# A defender's legs: feet 0.85 m apart and turned out, knees bent over the toes, the hips 0.25 m lower than he stands, tipped forward.
CROUCH = {'Hips': (10, 0, 0), 'Spine': (10, 0, 0),
          **both({'RightUpLeg': (-58.6, 10.1, -24.7), 'RightLeg': (68.2, 2.1, -7.3), 'RightFoot': (-18.6, -8.1, 7.1)})}
# The same a centimetre and a half lower, the other end of the stance's sway. Both are written to a tenth of a degree
# so that the feet stay where they are between the two.
CROUCH_LOW = {'Hips': (10, 0, 0), 'Spine': (11, 0, 0),
              **both({'RightUpLeg': (-60.1, 10.6, -24.7), 'RightLeg': (70.7, 2.5, -7.4), 'RightFoot': (-19.6, -8.3, 7.5)})}
# A defender's upper body: chest forward, head up, arms out wide and low with the open hands turned to the front.
GUARD = {'Spine1': (10, 0, 0), 'Spine2': (8, 0, 0), 'Neck': (-12, 0, 0), 'Head': (-14, 0, 0),
         **both({'RightArm': (-20, 13, 24), 'RightForeArm': (9, -19, -47), 'RightHand': (-12, -29, -21)})}

# The knees bent for a shot: thigh forward, shin back, foot flat. The hips come down 0.08 m.
KNEES_BENT = both({'RightUpLeg': (-20, 0, 0), 'RightLeg': (40, 0, 0), 'RightFoot': (-20, 0, 0)})

# The ball on the right hip: the right hand on its outer side with the elbow back, the left hand across on its front,
# the upper trunk bent forward and turned a little to the right, the head kept up and to the front. The ball sits
# beside the waist rather than in front of the thigh, so that it is clear of the leg when the legs are in the stance.
ON_HIP = {'Spine1': (8, 0, -8), 'Spine2': (6, 0, -7), 'Neck': (-7, 0, 7), 'Head': (-7, 0, 8),
          'RightArm': (36, 0, 11), 'RightForeArm': (-55, -17, 38), 'RightHand': (-39, -15, -14),
          'LeftArm': (-8, -3, -88), 'LeftForeArm': (-26, 4, -17), 'LeftHand': (-6, -16, 51)}
# The dip: the ball in front of the waist, a hand on each side of it, the upper trunk bent a little, eyes still up.
DIP = {'Spine1': (7, 0, 0), 'Spine2': (5, 0, 0), 'Neck': (-6, 0, 0), 'Head': (-6, 0, 0),
       'RightArm': (23, -18, 45), 'RightForeArm': (-53, -28, 31), 'RightHand': (-53, -10, -42),
       'LeftArm': (9, 24, -56), 'LeftForeArm': (-42, 17, -24), 'LeftHand': (-52, -4, 59)}
# The lift: the ball in front of the chest, a hand on each side of it, elbows down.
LIFT = {'Spine1': (2, 0, 0), 'Spine2': (2, 0, 0),
        'RightArm': (4, -13, 26), 'RightForeArm': (-53, 15, 43), 'RightHand': (-54, 19, -37),
        'LeftArm': (-10, 22, -55), 'LeftForeArm': (-40, -22, -35), 'LeftHand': (-59, -32, 51)}
# The set point: the ball above the forehead on the right hand, wrist cocked back, the right elbow under it,
# the left hand on the ball's side.
SET = {'Spine1': (-2, 0, 0), 'Spine2': (-2, 0, 0),
       'RightShoulder': (0, 8, 0), 'RightArm': (-91, 20, 34), 'RightForeArm': (-1, 44, 37), 'RightHand': (-14, 61, -20),
       'LeftShoulder': (0, -8, 0), 'LeftArm': (-95, -53, -27), 'LeftForeArm': (-9, -2, -8), 'LeftHand': (-38, -28, 49)}
# The follow-through: the right arm straight up and a little forward, the wrist snapped down; the left hand falling away.
FOLLOW = {'RightShoulder': (0, 12, 0), 'RightArm': (-146, 50, -52), 'RightForeArm': (23, 4, -15), 'RightHand': (43, -41, 5),
          'LeftArm': (-12, -7, -9), 'LeftForeArm': (-55, -22, -45), 'LeftHand': (-24, -13, 21)}

# After a chest pass: both arms straight out from the chest, palms turned down and out.
PASSED = {'Spine1': (5, 0, 0), 'Spine2': (4, 0, 0), 'Neck': (-4, 0, 0), 'Head': (-5, 0, 0),
          **both({'RightArm': (-40, 34, 68), 'RightForeArm': (47, 12, -1), 'RightHand': (22, 27, 3)})}
# Reaching for a pass: both hands out in front of the chest, a ball's width apart, fingers up.
HANDS_OUT = {'Spine1': (3, 0, 0), 'Spine2': (3, 0, 0),
             **both({'RightArm': (-23, 6, 46), 'RightForeArm': (-16, 8, 17), 'RightHand': (-47, 32, -43)})}
# The ball pulled in: a hand on each side of it in front of the belly, elbows by the ribs.
PULLED_IN = both({'RightArm': (26, -38, 18), 'RightForeArm': (-35, 15, 30), 'RightHand': (-47, 28, -21)})

# A steal: the guard, with the chest turned a little to the left and the right arm straight out, forward and down.
REACH = {**GUARD, 'Spine1': (10, 0, 8), 'Spine2': (8, 0, 8), 'RightArm': (-14, 35, 63), 'RightForeArm': (18, -1, -21), 'RightHand': (-1, -1, -7)}
# A hand in the shooter's face: the right arm straight up, palm to the front; the left arm low and out to the side.
HAND_UP = {'Spine1': (3, 0, 0),
           'RightShoulder': (0, 15, 0), 'RightArm': (-146, 42, -54), 'RightForeArm': (24, 5, -13), 'RightHand': (10, 9, -8),
           'LeftArm': (16, 8, -22), 'LeftForeArm': (-9, 28, 22), 'LeftHand': (-11, 28, 20)}
# Both arms straight up, palms to the front.
ARMS_UP = both({'RightShoulder': (0, 15, 0), 'RightArm': (-141, 40, -51), 'RightForeArm': (24, 5, -13), 'RightHand': (7, 8, -5)})
# Reaching for a tip: the right arm as high as it goes, the trunk tipped to his left to lift that shoulder, head back;
# the left arm low.
TIP = {'Spine1': (0, 3, 0), 'Spine2': (0, 3, 0), 'Neck': (-10, 0, 0), 'Head': (-12, 0, 0),
       'RightShoulder': (0, 22, 0), 'RightArm': (-138, 32, -51), 'RightForeArm': (26, 3, -21), 'RightHand': (5, 5, -9),
       'LeftArm': (31, 7, -7), 'LeftForeArm': (-16, 13, -1), 'LeftHand': (-6, 11, 13)}

# ---- The motions. name: kind (as in motion.json), length in seconds, and keys: (share of the length, key pose). ----
# `pass` and `reach` show what follows the action, which the rules have already taken: neither has a wind-up, and the
# reach is fully out at 0.16 of its 0.4 s, inside 0.07 s. A loop's middle key is its first with the trunk a degree or
# three further over: the sway. `shoot` passes through the lift on its way up so that the ball stays close to the body.
POSES = {
    'stance': {'kind': 'loop', 'seconds': 2, 'keys': [
        (0, {**CROUCH, **GUARD}), (0.5, {**CROUCH_LOW, **GUARD, 'Spine1': (11, 0, 0)}), (1, {**CROUCH, **GUARD})]},
    'gather': {'kind': 'held', 'seconds': 0.3, 'keys': [(0, {}), (0.55, KNEES_BENT), (1, {})]},
    'hold': {'kind': 'loop', 'seconds': 2, 'keys': [(0, ON_HIP), (0.5, {**ON_HIP, 'Spine1': (11, 0, -6)}), (1, ON_HIP)]},
    'shoot': {'kind': 'held', 'seconds': 0.3, 'keys': [(0, ON_HIP), (0.55, DIP), (0.78, LIFT), (1, SET)]},
    'follow': {'kind': 'held', 'seconds': 0.5, 'keys': [(0, SET), (0.2, FOLLOW), (0.6, FOLLOW), (1, SIDES)]},
    'freeThrow': {'kind': 'once', 'seconds': 0.9, 'keys': [
        (0, ON_HIP), (0.22, LIFT), (0.45, SET), (0.6, FOLLOW), (0.85, FOLLOW), (1, SIDES)]},
    'pass': {'kind': 'once', 'seconds': 0.35, 'keys': [(0, PASSED), (0.45, PASSED), (1, SIDES)]},
    'catch': {'kind': 'held', 'seconds': 0.35, 'keys': [(0, SIDES), (0.6, HANDS_OUT), (1, PULLED_IN)]},
    'reach': {'kind': 'once', 'seconds': 0.4, 'keys': [(0, GUARD), (0.16, REACH), (0.5, REACH), (1, GUARD)]},
    'handUp': {'kind': 'loop', 'seconds': 1, 'keys': [(0, HAND_UP), (0.5, {**HAND_UP, 'Spine1': (5, 0, 0)}), (1, HAND_UP)]},
    'contest': {'kind': 'held', 'seconds': 0.47, 'keys': [(0, GUARD), (0.3, ARMS_UP), (1, ARMS_UP)]},
    'tip': {'kind': 'held', 'seconds': 0.47, 'keys': [(0, SIDES), (0.4, TIP), (1, TIP)]},
}


def ease(t):
    """Slow away from a key and slow into the next."""
    return t * t * (3 - 2 * t)


def stand(rig, turns):
    """Where every bone of the rig is, in the rig's own space, when each has turned from rest as `turns` says."""
    pose, carried = {}, {}
    for bone in rig.data.bones:                   # a parent comes before its children
        turn = turns.get(bone.name, Quaternion())
        if bone.parent:
            carried[bone.name] = carried[bone.parent.name] @ turn
            head = pose[bone.parent.name] @ bone.parent.matrix_local.inverted() @ bone.head_local
        else:
            carried[bone.name], head = turn, bone.head_local
        pose[bone.name] = Matrix.Translation(head) @ carried[bone.name].to_matrix().to_4x4() @ bone.matrix_local.to_3x3().to_4x4()
    return pose


def pose_frames(rig, pose, fps):
    """The pose's keys as frames `fps` to the second, in the form read_clip returns. Its length is rounded to whole frames.

    Between two keys each bone's turn goes the short way round, easing in and out. If a leg bone turns, the hips are
    then moved down or up on every frame so that the lower of the two toes is at the height it rests at.
    """
    unknown = {bone for _, turns in pose['keys'] for bone in turns if PREFIX + bone not in rig.data.bones}
    assert not unknown, f'the rig has no bone called {", ".join(sorted(unknown))}'
    keys = [(share, {PREFIX + bone: Euler([radians(v) for v in degrees], 'XYZ').to_quaternion() for bone, degrees in turns.items()})
            for share, turns in pose['keys']]
    shares = [share for share, _ in keys]
    assert shares[0] == 0 and shares[-1] == 1 and shares == sorted(shares), f'keys must run from 0 to 1 in order: {shares}'
    last = round(pose['seconds'] * fps)
    frames = []
    for at in range(last + 1):
        share = at / last
        after = next(i for i, key in enumerate(shares) if key >= share)
        before = max(after - 1, 0)
        span = shares[after] - shares[before]
        t = ease((share - shares[before]) / span) if span else 0
        turns = {}
        for bone in set(keys[before][1]) | set(keys[after][1]):
            a, b = keys[before][1].get(bone, Quaternion()), keys[after][1].get(bone, Quaternion())
            turns[bone] = a.slerp(b if a.dot(b) >= 0 else -b, t)
        frames.append(stand(rig, turns))

    if any(bone in LEG_BONES for _, turns in pose['keys'] for bone in turns):
        rest = min(rig.data.bones[toe].head_local.z for toe in TOES)
        for frame in frames:
            above = min(frame[toe].translation.z for toe in TOES) - rest
            for matrix in frame.values():
                matrix.translation = matrix.translation - Vector((0, 0, above))
    return frames

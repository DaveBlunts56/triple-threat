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


def flip(turns):
    """The pose seen in a mirror: what his right side did his left does, and a lean or a turn goes the other way."""
    swap = lambda bone: bone.replace('Right', '\0').replace('Left', 'Right').replace('\0', 'Left')
    return {swap(bone): (x, -y, -z) for bone, (x, y, z) in turns.items()}


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

# The moves. A step-back starts with the ball low on the right: on the hip, with the trunk bent over it.
LOW = {**ON_HIP, 'Spine1': (16, 0, -8), 'Spine2': (12, 0, -7), 'Neck': (-12, 0, 7), 'Head': (-12, 0, 8)}

# The dribble moves take the ball hand from low and wide on his right to low and wide on his left. Each is of the arms
# and the upper trunk only, so that his legs go on with the step he is taking and his feet do not slide.
# The ball itself is drawn by the game: out of one hand, off the floor, up into the other.
# An arm low and wide with the open hand to the front (the guard's), and an arm low in front of the body (the dip's).
WIDE = {'RightArm': (-20, 13, 24), 'RightForeArm': (9, -19, -47), 'RightHand': (-12, -29, -21)}
IN = {'RightArm': (23, -18, 45), 'RightForeArm': (-53, -28, 31), 'RightHand': (-53, -10, -42)}
# An arm swung back round the hip, the hand behind him.
BEHIND = {'RightArm': (62, 0, -6), 'RightForeArm': (-42, -10, 58), 'RightHand': (-30, -15, -14)}


def left(arm):
    """An arm pose of the right arm, for the left."""
    return flip(arm)


def over(bend, lean=0, turn=0):
    """The upper trunk bent `bend` degrees forward, tipped `lean` and turned `turn` to his left; the head kept up and to the front."""
    return {'Spine1': (bend * 0.6, lean * 0.6, turn * 0.6), 'Spine2': (bend * 0.4, lean * 0.4, turn * 0.4),
            'Neck': (-bend * 0.35, -lean * 0.3, -turn * 0.5), 'Head': (-bend * 0.35, -lean * 0.3, -turn * 0.5)}


# A crossover: the trunk swung from over his right knee, down through the middle, to over his left.
CROSS_FROM = {**over(32, -14, -18), **WIDE, **left(IN)}
CROSS_MID = {**over(44), **IN, **left(IN)}
# Between the legs: bent right over the ball, which goes under him from one hand to the other.
LEGS_FROM = {**over(40, -8, -14), **WIDE, **left(IN)}
LEGS_MID = {**over(52), **IN, **left(IN)}
LEGS_TO = {**over(40, 8, 14), **IN, **left(WIDE)}
# Behind the back: the trunk up, turned to the right as the right arm wraps back round the hip, then
# to the left as the left hand takes the ball behind him and brings it out wide.
BACK_FROM = {**over(6, 0, -8), **WIDE, **left(WIDE)}
BACK_WRAP = {**over(4, 0, -26), **BEHIND, **left(WIDE)}
BACK_TAKE = {**over(4, 0, 26), **WIDE, **left(BEHIND)}
BACK_TO = {**over(6, 0, 8), **WIDE, **left(WIDE)}
# A step-back's gather: the ball brought in to the belly with both hands, the trunk over it.
TUCKED = {**DIP, 'Spine1': (14, 0, 0), 'Spine2': (10, 0, 0), 'Neck': (-10, 0, 0), 'Head': (-10, 0, 0)}
# A fade's set point: the set point with the trunk leaning back 12 degrees more at each of the two joints.
SET_BACK = {**SET, 'Spine1': (-14, 0, 0), 'Spine2': (-14, 0, 0), 'Neck': (6, 0, 0), 'Head': (8, 0, 0)}

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
    # The five moves. The game places each by hand (how far through the move he is), whatever its kind says.
    'crossover': {'kind': 'once', 'seconds': 0.3, 'keys': [(0, CROSS_FROM), (0.5, CROSS_MID), (1, flip(CROSS_FROM))]},
    'betweenLegs': {'kind': 'once', 'seconds': 0.4, 'keys': [(0, LEGS_FROM), (0.5, LEGS_MID), (1, LEGS_TO)]},
    'behindBack': {'kind': 'once', 'seconds': 0.5, 'keys': [(0, BACK_FROM), (0.35, BACK_WRAP), (0.7, BACK_TAKE), (1, BACK_TO)]},
    'stepBack': {'kind': 'once', 'seconds': 0.35, 'keys': [(0, LOW), (0.5, TUCKED), (1, LIFT)]},
}
# The fade made by hand, kept for reference and as the source of the trunk's lean below: the clip is filmed from high
# in the stands, where a lean away from the camera cannot be told from standing upright.
FADE_BY_HAND = {'kind': 'held', 'seconds': 0.3, 'keys': [(0, ON_HIP), (0.55, DIP), (0.78, {**LIFT, 'Spine1': (-6, 0, 0), 'Spine2': (-6, 0, 0)}), (1, SET_BACK)]}


# ---- The motions measured from reference clips (assets/source/tracked/; see tracked.py and tools/video/README.md). ----
# Each key is (share of the length, (clip, moment), overrides): the moment's measured pose, with the bones named in
# `overrides` turned by hand instead, as the poses above are written. All are made right-handed: the ball in, or going
# to, his right hand, the take-off from his left foot. `through`: the motion passes through its keys without stopping.

# The layup's flight, as the owner described it (the clip of one hides the legs and its timing): he goes up off his
# left foot with the right knee raised, the right arm reaching up toward the rim, and rolls the ball off his fingers
# underhand, palm up; then he comes down and lands. Each is the measured take-off of the dunk with these limbs set
# instead: directions in the body's frame (x his left, y up, z out of his chest).
REACHING = {'limbs': {'rightUpperArm': (-0.12, 0.6, 0.79), 'rightForearm': (-0.05, 0.82, 0.57),
                      'leftUpperArm': (0.4, -0.75, 0.52), 'leftForearm': (0.25, -0.35, 0.9)},
            'palms': {'right': (0, 0.8, -0.6)}}
# The release: the arm straight, up and out to the rim; the trunk a little back (10 degrees; the layup clip measured
# 15); the raised knee coming down, the left leg hanging.
ROLLED = {'limbs': {'rightUpperArm': (-0.1, 0.8, 0.59), 'rightForearm': (-0.06, 0.82, 0.57),
                    'leftUpperArm': (0.45, -0.82, 0.35), 'leftForearm': (0.3, -0.6, 0.74),
                    'rightThigh': (-0.1, -0.6, 0.79), 'rightShin': (0, -0.98, -0.2), 'leftThigh': (0.08, -0.98, -0.18), 'leftShin': (0.04, -0.93, -0.36)},
          'trunk': (0, 0.985, -0.17), 'palms': {'right': (0, 0.8, -0.6)}}
# Coming down: the arm still up for a moment, both legs under him.
DESCENDING = {'limbs': {'rightUpperArm': (-0.15, 0.75, 0.64), 'rightForearm': (-0.1, 0.6, 0.79),
                        'leftUpperArm': (0.4, -0.88, 0.25), 'leftForearm': (0.3, -0.7, 0.65),
                        'rightThigh': (-0.06, -0.93, 0.36), 'rightShin': (0, -0.97, -0.24), 'leftThigh': (0.06, -0.99, -0.1), 'leftShin': (0.03, -0.95, -0.3)},
              'trunk': (0, 0.99, -0.12)}
# The ball arm coming down after the ball has gone: as it hangs at his side.
ARM_DOWN = {'RightArm': (17, -22, 21), 'RightForeArm': (-5, -12, -9), 'RightHand': (-5, -10, -12)}
D, F = 'dunk-one-foot', 'fade-post'
# What the fade keeps from the poses made by hand: the trunk (see FADE_BY_HAND) and the hands, which no clip gives.
trunk_and_hands = lambda pose: {bone: pose[bone] for bone in ('Spine1', 'Spine2', 'Neck', 'Head', 'RightHand', 'LeftHand') if bone in pose}
TRACKED = {
    # The post fade: the arms' path from the gather to the set point is the clip's (the shares are its own timing);
    # the trunk's lean back and the hands are made by hand. `arms`: of the arms and upper trunk only, as the hand-made
    # shot is: the legs are the game's own gather and jump.
    'fade': {'kind': 'held', 'seconds': 0.3, 'through': True, 'arms': True, 'keys': [
        (0, (F, 'gather'), trunk_and_hands(ON_HIP)), (0.33, (F, 'turn'), trunk_and_hands(DIP)),
        (0.67, (F, 'lift'), trunk_and_hands({**LIFT, 'Spine1': (-6, 0, 0), 'Spine2': (-6, 0, 0)})), (1, (F, 'set'), trunk_and_hands(SET_BACK))]},
    # The two steps: the shares are the measured times over the 0.52 s from the gather to the take-off.
    'finishGather': {'kind': 'held', 'seconds': 0.5, 'through': True, 'whole': True, 'keys': [
        (0, (D, 'gather'), {}), (0.33, (D, 'step1'), {}), (0.69, (D, 'step2'), {}), (0.81, (D, 'deepest'), {}), (1, (D, 'takeoff'), {})]},
    # The dunk's jump: cocked at 0.36 of it and thrown down at 0.69, as measured.
    'dunk': {'kind': 'held', 'seconds': 0.94, 'through': True, 'whole': True, 'keys': [
        (0, (D, 'takeoff'), {}), (0.36, (D, 'cocked'), {}), (0.69, (D, 'dunk'), {}), (0.82, (D, 'dunk'), ARM_DOWN), (1, (D, 'landing'), {})]},
    # The layup's jump: the take-off and the landing are the dunk's (measured); between them it is as described (see
    # REACHING): right knee up, right arm up to the rim, the ball rolled off the fingers at 0.62 of it.
    'layup': {'kind': 'held', 'seconds': 0.75, 'through': True, 'whole': True, 'keys': [
        (0, (D, 'takeoff'), {}), (0.35, (D, 'takeoff', REACHING), {}), (0.62, (D, 'takeoff', ROLLED), {}),
        (0.82, (D, 'takeoff', DESCENDING), {}), (1, (D, 'landing'), {})]},
}


def whole_body(pose):
    """Does the motion turn a leg bone? Then it is of the whole body, and the legs play it as well as the arms."""
    return any(bone in LEG_BONES for _, turns in pose['keys'] for bone in turns)


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
    # A turn is (x, y, z) degrees, or a Quaternion as it is (a measured pose: see tracked.py).
    quaternion = lambda turn: turn if isinstance(turn, Quaternion) else Euler([radians(v) for v in turn], 'XYZ').to_quaternion()
    keys = [(share, {PREFIX + bone: quaternion(turn) for bone, turn in turns.items()}) for share, turns in pose['keys']]
    shares = [share for share, _ in keys]
    assert shares[0] == 0 and shares[-1] == 1 and shares == sorted(shares), f'keys must run from 0 to 1 in order: {shares}'
    last = round(pose['seconds'] * fps)
    frames = []
    for at in range(last + 1):
        share = at / last
        after = next(i for i, key in enumerate(shares) if key >= share)
        before = max(after - 1, 0)
        span = shares[after] - shares[before]
        t = (share - shares[before]) / span if span else 0
        if not pose.get('through'):                  # a motion that goes through its keys without stopping at each
            t = ease(t)
        turns = {}
        for bone in set(keys[before][1]) | set(keys[after][1]):
            a, b = keys[before][1].get(bone, Quaternion()), keys[after][1].get(bone, Quaternion())
            turns[bone] = a.slerp(b if a.dot(b) >= 0 else -b, t)
        frames.append(stand(rig, turns))

    if whole_body(pose):
        rest = min(rig.data.bones[toe].head_local.z for toe in TOES)
        for frame in frames:
            above = min(frame[toe].translation.z for toe in TOES) - rest
            for matrix in frame.values():
                matrix.translation = matrix.translation - Vector((0, 0, above))
    return frames

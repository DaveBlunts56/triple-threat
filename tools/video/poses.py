"""Turns a measured clip (see analyze.py) into the direction of every limb at each named moment: numbers only.

    tools/video/.venv/bin/python -I tools/video/poses.py NAME --hand right|left

Reads tools/video/out/NAME/measures.json and track.json and writes assets/source/tracked/NAME.json, which is committed:
the motions are built from it (tools/blender/tracked.py) without the clip or the tracker. --hand is the hand the move
is finished with, as it is seen in the clip.

For each moment, every vector is a unit vector in the body's own frame at that moment:
    x  toward his left
    y  up: the picture's vertical, made square to x
    z  out of his chest (x cross y)
Which way is his left is the hard part: one camera sees depth poorly, and from the side the line of his hips runs
straight into it. So x is taken mostly from the planes his knees bend in (a bent knee swings in the plane he faces
along, and the more it is bent and the surer the tracker is of the leg, the more it counts), with the lines of the hips
and shoulders for when both legs are straight or hidden.
`limbs` are from the nearer joint to the further (thigh: hip to knee; foot: heel to toe). `trunk` is from the middle of
the hips to the middle of the shoulders, `shoulders` from his right shoulder to his left, `hips` from his right hip to
his left. `at` is real seconds from the first moment (the video's own, if the
clip was not given a real jump time). `seen` is how sure the tracker was of each limb's further joint, 0 to 1, over
the five frames about the moment.
"""
import argparse
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'assets', 'source', 'tracked'))
UP = np.array([0.0, -1.0, 0.0])   # the picture's up: y runs down
# name: (from point, to point), by MediaPipe's numbers
LIMBS = {'leftThigh': (23, 25), 'leftShin': (25, 27), 'leftFoot': (29, 31), 'rightThigh': (24, 26), 'rightShin': (26, 28), 'rightFoot': (30, 32),
         'leftUpperArm': (11, 13), 'leftForearm': (13, 15), 'rightUpperArm': (12, 14), 'rightForearm': (14, 16)}


def unit(v):
    return v / np.linalg.norm(v)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('name')
    parser.add_argument('--hand', choices=('right', 'left'), required=True)
    args = parser.parse_args()
    folder = os.path.join(HERE, 'out', args.name)
    with open(os.path.join(folder, 'measures.json')) as file:
        measured = json.load(file)
    with open(os.path.join(folder, 'track.json')) as file:
        track = json.load(file)
    points, numbers = np.array(measured['points']), measured['frames']
    events = sorted(measured['events'].items(), key=lambda pair: pair[1])
    assert events, 'no moments were named: run analyze.py with --at'
    first, slowed = events[0][1], measured['slowed'] or 1
    moments = []
    for name, frame in events:
        i = numbers.index(frame)
        near = range(max(0, i - 2), min(len(numbers), i + 3))
        p = points[i]
        sure = lambda j: round(float(np.mean([track['frames'][k]['world'][j][3] for k in near if track['frames'][k]['world']] or [0])), 2)
        # His left: the planes the knees bend in, by how far each is bent (the cross product's own length) and how
        # sure the tracker is of that leg; a little of the lines of the hips and the shoulders.
        left = 0.3 * unit(p[23] - p[24]) + 0.3 * unit(p[11] - p[12])
        for hip, knee, ankle in ((23, 25, 27), (24, 26, 28)):
            left = left + 2 * min(sure(knee), sure(ankle)) * np.cross(unit(p[knee] - p[hip]), unit(p[ankle] - p[knee]))
        x = unit(left)
        y = unit(UP - x * np.dot(UP, x))
        z = np.cross(x, y)
        inBody = lambda v: [round(float(np.dot(unit(v), axis)), 4) for axis in (x, y, z)]
        moments.append({
            'name': name, 'at': round((frame - first) / measured['fps'] / slowed, 3),
            'limbs': {limb: inBody(p[b] - p[a]) for limb, (a, b) in LIMBS.items()},
            'trunk': inBody((p[11] + p[12]) / 2 - (p[23] + p[24]) / 2), 'shoulders': inBody(p[11] - p[12]), 'hips': inBody(p[23] - p[24]),
            'seen': {limb: sure(b) for limb, (a, b) in LIMBS.items()},
        })
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{args.name}.json')
    with open(path, 'w') as file:
        json.dump({'clip': args.name, 'slowed': round(slowed, 2) if measured['slowed'] else None, 'hand': args.hand, 'moments': moments}, file, indent=1)
        file.write('\n')
    print(f'POSES {args.name}: {len(moments)} moments ({", ".join(m["name"] for m in moments)}); wrote {path}')


if __name__ == '__main__':
    main()

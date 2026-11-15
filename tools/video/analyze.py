"""Measures a tracked clip (see track.py): the joint angles, the feet and the hands on every frame, and the timing.

    tools/video/.venv/bin/python tools/video/analyze.py NAME [--at event=frame,event=frame,...] [--hang SECONDS]

Reads tools/video/out/NAME/track.json. Frames on which the tracker lost him or took somebody else for him are dropped
and filled in from the frames either side; the points are then smoothed over five frames.

--at names moments of the move by the frame number printed on sheet.png (they are found by eye: a moving camera hides
where the floor is, so contact with it is not measured). The measures are printed for each, and the time between them.
--hang says how long the jump really lasts from `takeoff` to `landing`, which tells how much the clip is slowed down:
real times are then printed beside the video's.

Written beside it: measures.json (every frame) and measures.png (the curves, with the named moments marked).

What is measured, in degrees unless said (a monocular estimate: the camera's tilt and anything hidden behind the body
are in it, so read the shape of a curve and the pose at a moment, not a single degree):
    knee L/R      how far the knee is bent (0 straight)
    hip L/R       how far the thigh is raised in front of the line of the trunk (0 standing straight, 90 thigh level)
    lean          how far the trunk is tipped from upright; leanF: the part of it toward where his chest faces
    twist         how far the shoulders are turned from the hips, about the trunk
    arm L/R       how far the upper arm is raised from hanging by the trunk (180 straight overhead)
    elbow L/R     how far the elbow is bent
    wristUp L/R   metres the wrist is above the middle of the shoulders
    hands         metres between the wrists (under about 0.35: both hands on the ball)
    stride        metres between the ankles along the way he faces; + his left foot in front
    footUp L/R    metres the ankle is above his other ankle... (the lower foot is the one nearer the floor)
"""
import argparse
import json
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_HIP, R_HIP, L_KN, R_KN, L_AN, R_AN = 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28
UP = np.array([0.0, -1.0, 0.0])   # the picture's up: y runs down


def unit(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.where(n == 0, 1, n)


def angle(a, b):
    """Degrees between two sets of directions."""
    return np.degrees(np.arccos(np.clip(np.sum(unit(a) * unit(b), axis=-1), -1, 1)))


def cleaned(track):
    """The world points of every frame as an array [frame, 33, 3], with lost and mistaken frames filled in, smoothed."""
    frames = track['frames']
    world = np.array([[p[:3] for p in f['world']] if f['world'] else [[np.nan] * 3] * 33 for f in frames], dtype=float)
    image = np.array([[p[:2] for p in f['image']] if f['image'] else [[np.nan] * 2] * 33 for f in frames], dtype=float)
    # Somebody else: the middle of his hips in the picture is far from the median of the frames round it.
    mid = (image[:, L_HIP] + image[:, R_HIP]) / 2
    bad = np.isnan(mid[:, 0])
    for i in range(len(frames)):
        near = mid[max(0, i - 4):i + 5]
        near = near[~np.isnan(near[:, 0])]
        if len(near) and np.linalg.norm(mid[i] - np.median(near, axis=0)) > 0.12 * track['width']:
            bad[i] = True
    good = np.flatnonzero(~bad)
    for j in range(33):
        for k in range(3):
            world[:, j, k] = np.interp(np.arange(len(frames)), good, world[good, j, k])
    kernel = np.ones(5) / 5
    padded = np.pad(world, ((2, 2), (0, 0), (0, 0)), mode='edge')
    smooth = np.stack([[np.convolve(padded[:, j, k], kernel, mode='valid') for k in range(3)] for j in range(33)])   # [33, 3, frame]
    return np.transpose(smooth, (2, 0, 1)), int(bad.sum())


def measures(p):
    """Every measure for points p [frame, 33, 3]: { name: array over the frames }."""
    hips, shoulders = (p[:, L_HIP] + p[:, R_HIP]) / 2, (p[:, L_SH] + p[:, R_SH]) / 2
    trunk = unit(shoulders - hips)
    across = unit(p[:, L_SH] - p[:, R_SH])                 # toward his left
    facing = unit(np.cross(across, trunk))                 # out of his chest
    out = {}
    for side, hip, knee, ankle, shoulder, elbow, wrist in (('L', L_HIP, L_KN, L_AN, L_SH, L_EL, L_WR), ('R', R_HIP, R_KN, R_AN, R_SH, R_EL, R_WR)):
        thigh, shin = p[:, knee] - p[:, hip], p[:, ankle] - p[:, knee]
        out[f'knee{side}'] = angle(thigh, shin)
        # Raised in front of the trunk's line counts up; swung behind it counts down.
        out[f'hip{side}'] = angle(-trunk, thigh) * np.sign(np.sum(thigh * facing, axis=-1))
        upper, fore = p[:, elbow] - p[:, shoulder], p[:, wrist] - p[:, elbow]
        out[f'arm{side}'] = angle(-trunk, upper)
        out[f'elbow{side}'] = angle(upper, fore)
        out[f'wristUp{side}'] = np.sum((p[:, wrist] - shoulders) * UP, axis=-1)
    out['lean'] = angle(trunk, UP)
    flat = unit(facing - np.outer(np.sum(facing * UP, axis=-1), UP))
    out['leanF'] = np.degrees(np.arcsin(np.clip(np.sum(trunk * flat, axis=-1), -1, 1)))
    hipLine = unit(p[:, L_HIP] - p[:, R_HIP])
    flatten = lambda v: unit(v - trunk * np.sum(v * trunk, axis=-1, keepdims=True))
    a, b = flatten(hipLine), flatten(across)
    out['twist'] = np.degrees(np.arctan2(np.sum(np.cross(a, b) * trunk, axis=-1), np.sum(a * b, axis=-1)))   # + shoulders turned to his left
    out['hands'] = np.linalg.norm(p[:, L_WR] - p[:, R_WR], axis=-1)
    out['stride'] = np.sum((p[:, L_AN] - p[:, R_AN]) * flat, axis=-1)
    out['footUpL'] = np.sum((p[:, L_AN] - p[:, R_AN]) * UP, axis=-1)
    out['footUpR'] = -out['footUpL']
    return out


COLUMNS = ['kneeL', 'kneeR', 'hipL', 'hipR', 'lean', 'leanF', 'twist', 'armL', 'armR', 'elbowL', 'elbowR', 'wristUpL', 'wristUpR', 'hands', 'stride', 'footUpL']


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('name')
    parser.add_argument('--at', default='')
    parser.add_argument('--hang', type=float, default=None)
    args = parser.parse_args()
    out = os.path.join(HERE, 'out', args.name)
    with open(os.path.join(out, 'track.json')) as file:
        track = json.load(file)
    points, dropped = cleaned(track)
    found = measures(points)
    numbers = [f['n'] for f in track['frames']]
    events = [(name, int(frame)) for name, frame in (pair.split('=') for pair in args.at.split(',') if pair)]
    at = dict(events)
    slow = None
    if args.hang and 'takeoff' in at and 'landing' in at:
        slow = (at['landing'] - at['takeoff']) / track['fps'] / args.hang
    print(f'ANALYZE {args.name}: {len(numbers)} frames, {dropped} dropped and filled in' + (f'; slowed {slow:.2f} times (the jump lasts {args.hang} s)' if slow else ''))
    print('moment'.ljust(12) + 'frame'.rjust(6) + ('real s'.rjust(8) if slow else 'video s'.rjust(8)) + ''.join(c.rjust(9) for c in COLUMNS))
    first = events[0][1] if events else numbers[0]
    for name, frame in events:
        i = numbers.index(frame)
        t = (frame - first) / track['fps'] / (slow or 1)
        print(name.ljust(12) + str(frame).rjust(6) + f'{t:8.2f}' + ''.join(f'{found[c][i]:9.2f}' if abs(found[c][i]) < 10 else f'{found[c][i]:9.0f}' for c in COLUMNS))
    with open(os.path.join(out, 'measures.json'), 'w') as file:
        json.dump({'clip': track['clip'], 'fps': track['fps'], 'slowed': slow, 'events': at, 'frames': numbers,
                   'measures': {name: [round(float(v), 3) for v in values] for name, values in found.items()},
                   'points': [[[round(float(v), 4) for v in point] for point in frame] for frame in points]}, file)

    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    groups = [('Knees (bent)', ['kneeL', 'kneeR']), ('Hips (thigh raised)', ['hipL', 'hipR']), ('Trunk', ['lean', 'leanF', 'twist']),
              ('Upper arms (raised)', ['armL', 'armR']), ('Elbows (bent)', ['elbowL', 'elbowR']), ('Wrists above shoulders, hands apart, stride (m)', ['wristUpL', 'wristUpR', 'hands', 'stride'])]
    figure, axes = plt.subplots(len(groups), 1, figsize=(12, 15), sharex=True)
    for axis, (title, names) in zip(axes, groups):
        for name in names:
            axis.plot(numbers, found[name], label=name)
        for name, frame in events:
            axis.axvline(frame, color='0.6', linewidth=0.8)
        axis.set_title(title, loc='left', fontsize=10)
        axis.legend(loc='upper right', fontsize=8, ncol=4)
        axis.grid(alpha=0.3)
    for name, frame in events:
        axes[0].text(frame, axes[0].get_ylim()[1], name, rotation=60, fontsize=8, va='bottom')
    axes[-1].set_xlabel('frame of the video')
    figure.tight_layout()
    figure.savefig(os.path.join(out, 'measures.png'), dpi=80)
    print('wrote', os.path.join(out, 'measures.json'), 'and measures.png')


if __name__ == '__main__':
    main()

"""Tracks one person's body through a video clip, frame by frame, and writes what it found.

    tools/video/.venv/bin/python tools/video/track.py CLIP --name NAME [--from S] [--to S] [--seed X,Y] [--every N]

CLIP is any video file; it is only read. --from and --to bound the part to track, in seconds of the video. The clip may
show several people: the one tracked is the one nearest --seed (a point of the first frame, each coordinate 0 to 1;
by default the largest person there) and after that the one nearest where he was on the frame before.

Written to tools/video/out/NAME/ (never committed):
    track.json   fps, size, and for every frame its number, its time in the video and, when a person was found,
                 `image`: 33 points [x, y, z, seen] with x and y in pixels, and `world`: the same 33 in metres about
                 the middle of the hips (x to the picture's right, y down, z away from the camera).
    sheet.png    every N-th frame with the tracked skeleton drawn on it, to check the tracking by eye.

The 33 points are MediaPipe's (POINTS below): 11/12 shoulders, 13/14 elbows, 15/16 wrists, 23/24 hips, 25/26 knees,
27/28 ankles, 29/30 heels, 31/32 toes; odd numbers are his left.
"""
import argparse
import json
import os
import sys

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as tasks
from mediapipe.tasks.python import vision

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, 'models', 'pose_landmarker_heavy.task')
POINTS = ['nose', 'leftEyeInner', 'leftEye', 'leftEyeOuter', 'rightEyeInner', 'rightEye', 'rightEyeOuter', 'leftEar', 'rightEar',
          'mouthLeft', 'mouthRight', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
          'leftPinky', 'rightPinky', 'leftIndex', 'rightIndex', 'leftThumb', 'rightThumb', 'leftHip', 'rightHip',
          'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle', 'leftHeel', 'rightHeel', 'leftToe', 'rightToe']
BONES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24), (23, 25), (25, 27), (24, 26), (26, 28),
         (27, 29), (29, 31), (27, 31), (28, 30), (30, 32), (28, 32)]
LEFT, RIGHT = (0, 200, 255), (255, 120, 0)   # his left is drawn orange, his right blue (BGR)


def middle(points):
    """The middle of the hips of one person's image points, as (x, y) from 0 to 1."""
    return np.array([(points[23].x + points[24].x) / 2, (points[23].y + points[24].y) / 2])


def size(points):
    """How big one person is in the picture: the height of the box round his points."""
    ys = [p.y for p in points]
    return max(ys) - min(ys)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('clip')
    parser.add_argument('--name', required=True)
    parser.add_argument('--from', dest='start', type=float, default=0)
    parser.add_argument('--to', dest='end', type=float, default=None)
    parser.add_argument('--seed', default=None)
    parser.add_argument('--every', type=int, default=6)
    args = parser.parse_args()
    assert os.path.exists(MODEL), f'no model at {MODEL}: see tools/video/README.md'
    out = os.path.join(HERE, 'out', args.name)
    os.makedirs(out, exist_ok=True)

    video = cv2.VideoCapture(args.clip)
    assert video.isOpened(), f'cannot read {args.clip}'
    fps = video.get(cv2.CAP_PROP_FPS)
    width, height = int(video.get(cv2.CAP_PROP_FRAME_WIDTH)), int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
    options = vision.PoseLandmarkerOptions(
        base_options=tasks.BaseOptions(model_asset_path=MODEL), running_mode=vision.RunningMode.VIDEO, num_poses=4,
        min_pose_detection_confidence=0.4, min_pose_presence_confidence=0.4, min_tracking_confidence=0.4)
    seed = np.array([float(v) for v in args.seed.split(',')]) if args.seed else None
    frames, tiles, last, n = [], [], None, -1
    with vision.PoseLandmarker.create_from_options(options) as tracker:
        while True:
            ok, picture = video.read()
            if not ok:
                break
            n += 1
            t = n / fps
            if t < args.start:
                continue
            if args.end is not None and t > args.end:
                break
            found = tracker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(picture, cv2.COLOR_BGR2RGB)), int(t * 1000))
            people = list(zip(found.pose_landmarks, found.pose_world_landmarks))
            frame = {'n': n, 't': round(t, 4), 'image': None, 'world': None}
            if people:
                near = last if last is not None else seed
                image, world = min(people, key=lambda p: np.linalg.norm(middle(p[0]) - near)) if near is not None else max(people, key=lambda p: size(p[0]))
                # A person who is suddenly a third of the picture away is somebody else: he was lost on this frame.
                if last is None or np.linalg.norm(middle(image) - last) < 0.33:
                    last = middle(image)
                    frame['image'] = [[round(p.x * width, 1), round(p.y * height, 1), round(p.z * width, 1), round(p.visibility, 3)] for p in image]
                    frame['world'] = [[round(p.x, 4), round(p.y, 4), round(p.z, 4), round(p.visibility, 3)] for p in world]
            frames.append(frame)
            if len(frames) % args.every == 1:
                if frame['image']:
                    for a, b in BONES:
                        pa, pb = frame['image'][a], frame['image'][b]
                        cv2.line(picture, (int(pa[0]), int(pa[1])), (int(pb[0]), int(pb[1])), LEFT if a % 2 else RIGHT, max(2, width // 200))
                cv2.putText(picture, str(n), (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)
                scale = 300 / height
                tiles.append(cv2.resize(picture, (int(width * scale), 300)))
    video.release()
    assert frames, 'no frame in that part of the clip'

    with open(os.path.join(out, 'track.json'), 'w') as file:
        json.dump({'clip': os.path.basename(args.clip), 'fps': fps, 'width': width, 'height': height, 'points': POINTS, 'frames': frames}, file)
    across = 10
    while len(tiles) % across:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[i:i + across]) for i in range(0, len(tiles), across)])
    cv2.imwrite(os.path.join(out, 'sheet.png'), sheet)
    seen = sum(1 for f in frames if f['image'])
    print(f'TRACK {args.name}: frames {frames[0]["n"]} to {frames[-1]["n"]} at {fps:g} a second, a person in {seen} of {len(frames)}; wrote {out}')


if __name__ == '__main__':
    sys.exit(main())

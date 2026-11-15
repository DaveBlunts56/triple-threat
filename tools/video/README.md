# Measuring a move from a video clip

Two scripts turn a reference clip into numbers a motion can be made from. Nothing here is shipped with the game, and
nothing it reads or writes is committed: the clips stay where they are, and `tools/video/out/` (which holds frames of
them), `tools/video/.venv/` and `tools/video/models/` are git-ignored. A clip is used only to measure how a body moves;
no person, name or picture from it goes into the game.

## Setting up (once)

```bash
python3 -m venv tools/video/.venv
```

```bash
tools/video/.venv/bin/pip install mediapipe
```

```bash
curl -o tools/video/models/pose_landmarker_heavy.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task
```

That is about 165 MB of packages (MediaPipe 1.2.3, OpenCV, NumPy, Matplotlib) and a 31 MB model.

## 1. Track the body

```bash
tools/video/.venv/bin/python tools/video/track.py "CLIP.mp4" --name dunk-one-foot --from 11.5 --to 17.6
```

Give it only the part of the clip with the move, between two camera cuts: a cut loses the player. It writes
`out/NAME/track.json` (33 body points on every frame, in pixels and in metres about the hips) and `out/NAME/sheet.png`:
every sixth frame with the skeleton drawn on it and the frame number in the corner.

**Look at the sheet before trusting anything.** The tracker follows one person; in a crowd it can jump to somebody
else, and it loses a player who is blurred or hidden. `--seed X,Y` picks who to start with.

## 2. Name the moments and measure

On the sheet, find the frames where the move changes: the gather, each step, the deepest bend, the take-off, the
finish, the landing. They are found by eye, because a broadcast camera pans and zooms, so where the floor is in the
picture is not known and contact with it cannot be measured.

```bash
tools/video/.venv/bin/python tools/video/analyze.py dunk-one-foot --at gather=351,step1=369,step2=390,deepest=396,takeoff=407,cocked=441,dunk=474,landing=504 --hang 0.9
```

It prints, for each moment, how far each knee and hip is bent, how the trunk leans and twists, how high each arm is,
whether both hands are on the ball, and how far apart the feet are along the way he faces; and it writes
`measures.json` (every frame, with the cleaned points) and `measures.png` (the curves).

`--hang` is how long the jump really lasts from `takeoff` to `landing`. Most reference clips are slowed down, by an
amount nobody states; a jump is the one thing in them whose real length is known (0.75 to 0.95 s for a dunk), so it
gives the factor, and the real time of every other moment.

## 3. Write the limb directions the motions are built from

```bash
tools/video/.venv/bin/python -I tools/video/poses.py dunk-one-foot --hand right
```

It writes `assets/source/tracked/NAME.json`: for each named moment, which way every limb points in the body's own
frame (toward his left, up, out of his chest), the lines of the trunk, shoulders and hips, the real time, and how sure
the tracker was of each limb. That file is numbers only and is committed; `tools/blender/build_motion.py` builds the
motions from it, so they can be rebuilt without the clip or the tracker. Which way is "his left" is taken from the
planes his knees bend in, because a single camera sees depth poorly.

## What the numbers are good for

- **Good:** the order of things, which foot, which hand, the shape of each curve, the pose at a named moment to within
  ten or fifteen degrees, the real timing between moments.
- **Not good:** a single degree; anything hidden behind the body on that frame; how far he travels over the floor
  (the camera moves with him). In the game the travel comes from the match itself, and the feet are planted on it.

## Clips measured so far

| Name | What | Tracked |
|---|---|---|
| `dunk-one-foot` | A running one-foot, one-hand dunk: gather, two steps, take-off, cocked, dunk, landing | 171 of 183 frames |
| `dunk-windmill-approach` | A two-foot gather and rise into a windmill | all 129 frames |
| `dunk-windmill-flight` | The windmill's arm circle in the air | 189 of 219 frames; lost before the ball goes down |

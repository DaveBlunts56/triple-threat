# Dunks and layups: design

Date: 2026-11-14. Branch: `feat/dunks`.

## 1. What this adds

Every shot in the game is a jump shot, even at the rim. This adds the two finishes a drive ends in:

- **A layup:** Space while driving at the rim. Two steps, a one-foot take-off, the ball laid up with one hand.
- **A dunk:** a key of its own (R, rebindable). The same two steps, a higher jump, the ball thrown down through the rim.

Both are built from reference clips that were tracked and measured, not drawn from memory. The computer's players use
both. Standing near the rim, Space is still the short jump shot it is now.

## 2. What the clips show

Measured with `tools/video/` (see its README): the body is tracked on every frame, the moments of the move are named
by eye from the contact sheet, and joint angles are read at each. Angles are good to ten or fifteen degrees. Travel
over the floor cannot be measured (the camera pans with the player); in the game it comes from the match.

### 2.1 The running one-foot dunk (`dunk-one-foot`): fully measured

Tracked on 171 of 183 frames. Slowed 3.6 times, taking the jump to last 0.9 s; the real times follow from that.

| Moment | Real s | Feet and weight | Knees, hips | Trunk and hip turn | Ball and arms |
|---|---|---|---|---|---|
| Gather | 0.00 | Left foot down, weight on it | Knees bent 87° (left) and 55°; both thighs raised about 55° | 14° forward; shoulders square to hips | Both hands on it at the right hip, 0.4 m below the shoulders |
| Step 1 | 0.17 | Right foot lands a long stride ahead: ankles 0.78 m apart | Left thigh 79° through; right leg nearly straight under him | 13° forward; shoulders 11° ahead of the hips | Carried at the hip in both hands; elbows bent 80 to 110° |
| Step 2 | 0.36 | Left foot plants: the take-off foot | Both knees about 50° | Upright (12° of lean, none of it forward) | Starts up; still two hands |
| Deepest | 0.42 | All his weight on the left foot | Plant knee 36°; right thigh already 65° up | Upright | 0.15 m below the shoulders, rising |
| Take-off | 0.52 | Left toe leaves the floor, 0.77 m behind the right knee | Plant leg straight (19°), trailing 17° behind the trunk's line; right thigh level (90°), knee bent 69° | 9° of lean; shoulders turned 26° to his right of the hips | At head height, 0.4 m above the shoulders; both arms up (91° and 113°); hands 0.32 m apart |
| Cocked | 0.84 | In the air, legs trailing | Knees 44° and 53°; left thigh 26° behind | Leaning 15° back; still turned 26° | Right arm 150° up, elbow nearly straight; left arm down and out; hands 0.98 m apart: one hand |
| Dunk | 1.14 | In the air, coming down | Legs hang nearly straight (27° and 12°) | 17° of lean | Thrown down through the rim at full reach: 0.62 s after take-off, 69% of the jump |
| Landing | 1.42 | Both feet | Right knee gives to 44° | 7° | Arms down |
| Settled | 1.59 | | Knees about 33° | 6° | |

What matters for the game: the gather takes **0.52 s** and two planted steps; the take-off is from the foot opposite the
dunking hand with the other knee driven up; the ball goes from two hands to one at take-off; the dunk comes **after**
the top of the jump.

### 2.2 The windmill (`dunk-windmill-approach`, `dunk-windmill-flight`): partly measured

- **Approach, every frame tracked:** a two-foot gather in a deep crouch (knees to 94°, thighs to 94°, trunk 37° over, ball
  in both hands in front of the knees), then both legs straighten together and the ball goes up in front of the face.
- **Flight, 189 of 219 frames:** the ball arm circles down past the hip, back behind him and up to shoulder height with
  the elbow straight, hands 0.9 m apart, shoulders turned 28° from the hips. The tracker then leaves him for the
  bench, and the clip ends before the ball goes down.

Not enough to build from. It is left out of this (section 9).

### 2.3 The layup (`layup-drive`, `layup-finish`): partly measured

The clip is an edited breakdown: freeze frames, changes of speed, the shooter small and among defenders. On the whole
picture the tracker followed a defender. On an enlarged crop of the finish it followed the shooter's upper body on 27
of 36 frames; his legs are hidden behind a defender throughout.

- **Measured (finish):** he lays it up with the hand away from the defender. That arm rises from 91° to 122° and its
  elbow straightens from 85° to 34° as he goes up; the hands part from 0.18 m to 0.43 m at the release (one hand); the
  trunk goes from upright to 15° back; the shoulders stay turned 21 to 47° from the hips, the ball side leading.
- **By eye:** a low drive on a dribble, the ball gathered in both hands high on the side away from the defender, two
  steps, a take-off from the foot opposite the shooting hand, both knees tucked up under him in the air, the ball
  rolled off the fingers at full reach near the top of the jump, palm up.
- **Not measurable:** the legs, and any timing (the clip's speed changes: he rises for 0.7 s of video, which no jump does).

So the layup takes its **gather, steps and take-off from the dunk clip**, which are measured, and its **finish from the
layup clip**: the arm and trunk as measured, the tucked knees by eye. A cleaner layup clip (one player, from the side,
unedited) would replace the by-eye part; the build takes it without a change to the game.

## 3. The rules

A finish is a kind of shot. It uses the shot's state (`shooting`, `shotT`, `shotKey`) and adds `finish`: `'layup'`,
`'dunk'` or `null`.

### 3.1 When

Read at the press, for a player with the ball, on the floor, not in a move, in front of the backboard:

- `far`: metres from him to the rim's centre.
- `closing`: his speed toward the rim, m/s.

| Press | Condition | What begins |
|---|---|---|
| Space | `far` from `FINISH.layupNear` to `FINISH.layupFar`, and `closing` at least `FINISH.drive` | A layup |
| Space | anything else | The jump shot, as now |
| R | the layup's condition, and he can dunk: Inside at least `FINISH.dunkAt` and energy at least `FINISH.dunkEnergy` | A dunk |
| R | the layup's condition, but he cannot dunk | A layup |
| R | anything else | Nothing |

The fade key is unchanged.

### 3.2 The gather: two steps

For `FINISH.gather` seconds (0.5: measured 0.52) he is on the floor with the ball in both hands.

- He is carried straight at the rim at the speed that brings him to the take-off spot as the gather ends: the spot
  is `FINISH.takeoff[finish]` metres from the rim's centre. He is never carried faster than `FINISH.gatherSpeed`: from
  further out than that reaches, he takes off short of the spot and the jump makes up the rest. Nearer than the spot
  already, he takes his two steps where he is.
- It is not a travel: these are the two steps a player has after he picks the ball up.
- A pass can still be thrown out of it (the pass key), which ends the finish.
- A steal can still be tried on him, at `FINISH.stealFactor` of its chance: the ball is in two hands.

### 3.3 The jump

At the end of the gather he jumps at `FINISH.jump[finish]` m/s (layup 3.2, dunk 4.2), carried toward the rim at the
speed that puts him `FINISH.arrive[finish]` metres in front of its centre at the finish's moment. He turns to face the
rim and stays so.

- **Layup:** the ball leaves his hand when the key is let go in the air, as a shot's does, or as he begins to come
  down if it is still held. A key let go during the gather (a tap) lays it up at the best moment, but such a layup
  is never green: the green is for a release timed in the air. Its chance, its green window, the contest, the block
  and the foul are the shot's own, from where he is at the release, on his Inside. The best moment is `SHOT.bestAt`
  of the way up this jump.
- **Dunk:** nothing to time. At `FINISH.dunkMoment` (0.69) of the jump the ball goes down through the rim. It scores with
  chance `FINISH.dunkChance × (1 − FINISH.dunkContest × (1 − contest))`, where `contest` is the shot's own (1 open,
  0.5 smothered): 0.97 open, about 0.75 smothered. The level's make and timing factors do not apply: there is nothing
  to time. A miss comes off the back of the rim as any miss does. If he has been kept from the rim (a
  defender in his way) and is further than `FINISH.reach` from its centre at that moment, there is no dunk: the ball
  is laid up from where he is, as a layup let go then. A defender in the air within reach can block it, by
  the shot's own rule, and contact is a foul by the shot's own rule: a dunk through a foul is an and-one.
- Either way it counts as a field-goal attempt and a two, and an assist as any basket does. The basket is remembered
  with `finish`, so the broadcast can say what it was.
- He lands where the jump puts him; never past the baseline (he is kept inside it as everybody is).

### 3.4 Which hand

The hand on the side of the rim he comes from: his right when the rim's centre is to his left as he faces the
baseline, his left otherwise; from straight on, his right. The renderer reads it from the same positions; the rules do
not use it.

### 3.5 The computer

Where the handler now shoots at the rim (settled, nearer than `AI.layupDist`), and where he drives a clear lane:

- With the layup's condition met and nobody between him and the rim, he dunks if he can, and lays it up if he cannot.
- With a defender between him and the rim he lays it up.
- Crowded at the rim with a team-mate wide open, he still kicks it out first (the read that is already there).
- Standing under the rim he takes the short shot, as now.

The computer lets a layup go at the best moment give or take what its level says, as it does a shot.

## 4. Keys and menus

- A nineteenth action, `dunk`, on **R** by default, rebindable like the others and saved with them. The Keys panel
  gets its row (twenty rows with Reset).
- The Controls lists in both menus and the hint line under the match say `R dunk`.
- The shot meter shows for a layup as for a shot, and not for a dunk.

## 5. The motions

### 5.1 From a measured clip to a motion

A new step, `tools/video/poses.py`, reads a clip's `measures.json` and writes `assets/source/tracked/NAME.json`: for
each named moment, the direction of every limb (thigh, shin, foot, upper arm, forearm, each as a unit vector), the
line of the hips, of the shoulders and of the trunk, all in the body's own frame (across his hips, up his trunk, out
of his chest). It holds numbers only: no frame of the clip. It is committed, so the motions can be rebuilt without the
clip or the tracker.

`tools/blender/build_motion.py` turns each into key poses on the player's rig: every bone is turned from rest so that
it lies along its measured direction, the trunk's lean and the shoulders' turn are shared between the spine bones, and
the hands and head are set as the hand-made poses set them (the tracker does not give fingers, and gives the head
poorly). Between moments it eases as the hand-made motions do. Where a clip gives nothing (the layup's legs), the key
names a pose from `poses.py` for those bones, and says so in a comment.

### 5.2 The motions made

All are of the whole body, and each has a twin for the other hand, made in a mirror.

| Motion | Placed by | Moments | From |
|---|---|---|---|
| `finishGather` | How far through the gather he is | gather, step 1, step 2, deepest, take-off | `dunk-one-foot` |
| `dunk` | How far through the jump he is | take-off, cocked, dunk, hanging (the dunk's pose with the arm coming down), before landing | `dunk-one-foot` |
| `layup` | How far through the jump he is | take-off (the dunk's), tucked, reaching, release, before landing | arm and trunk: `layup-finish`; knees: by eye |

The landing is the one the game has.

### 5.3 The feet, the ball and the blends

- **Feet:** during the gather the planting that is already in the game holds each foot the motion puts on the floor
  where it is on the court, so the two steps do not slide however fast he comes. The gather is as long as the two
  steps of the clip.
- **Ball:** between both hands through the gather; in the finishing hand from the take-off; let go by the rules (the
  layup's release, the dunk's moment), from where that hand is.
- **Blends:** the finishes come in as quickly as the dribble moves do (0.07 s), so the gather starts on the step he is
  in. A finish ended early (a pass, a steal) leaves at the usual pace.
- **Net and rim:** the net moves with the ball as it does for any basket. Nobody hangs on the rim.

## 6. The broadcast and the sound

- **Commentary:** three wordings each for a dunk and for a layup that scores, ranked with the ordinary baskets.
- **Poster:** the moment that is there already fires for a dunk over a defender; its test is unchanged.
- **Replays:** unchanged: a dunk is replayed only when it is one of the moments already replayed.
- **Sound:** a dunk plays the rim and the net together, and the crowd's big cheer; no new recording.

## 7. The numbers (`FINISH` in `src/sim/tuning.js`)

| Name | Value | Meaning |
|---|---|---|
| `layupNear`, `layupFar` | 1.2, 4.5 m | How far from the rim a finish can begin |
| `drive` | 2 m/s | The least speed toward the rim that makes Space a layup |
| `gather` | 0.5 s | The two steps (measured: 0.52) |
| `gatherSpeed` | 5 m/s | The fastest he is carried through them |
| `takeoff` | layup 1.6 m, dunk 2.2 m | Where he leaves the floor, from the rim's centre |
| `jump` | layup 3.2, dunk 4.2 m/s | The jump: 0.65 s and 0.86 s in the air |
| `arrive` | layup 0.9 m, dunk 0.35 m | Where he is, in front of the rim's centre, at the finish's moment |
| `dunkMoment` | 0.69 | The share of the jump at which the ball goes down (measured) |
| `dunkAt` | 78 | The Inside from which a player can dunk (10 of the 16) |
| `dunkEnergy` | 0.25 | The energy below which he cannot |
| `dunkChance`, `dunkContest` | 0.97, 0.45 | An open dunk's chance, and how much of it a defender can take |
| `reach` | 0.9 m | The furthest from the rim's centre he can be at the dunk's moment and still dunk |
| `dunkDrop` | 4 m/s | How fast the ball goes down through the rim |
| `stealFactor` | 0.5 | What a reach's chance is multiplied by during the gather |

## 8. Testing and measuring

- **Rules:** each row of the table in 3.1; the gather lasts 0.5 s and ends in a jump; he takes off and arrives where the
  numbers say, from a walk and from a sprint; no travel is called; a layup is released by the key and judged as a shot;
  a dunk goes down at 0.69 of the jump and scores at its chance; a blocked dunk, a fouled dunk, a missed dunk; a pass
  out of the gather; a match is the same match run twice.
- **The computer:** dunks a clear lane when it can, lays it up when it cannot or is guarded, kicks out of a crowd.
- **Keys:** the new action binds, saves and shows in both menus.
- **Motions:** each motion and its twin is in the file; at each named moment the built pose is within 20° of the
  measured one at the knees, hips, upper arms and trunk; the finishing hand is above the head at the dunk and at the
  release.
- **Feet:** with the game's own animator, a flat foot slides less than 0.1 m through a gather at a walk and at a sprint.
- **Balance, before and after, 30 computer matches each size:** points, seconds a possession, the share of baskets that
  are dunks and layups. Dunks at 0.97 will raise scoring at the rim; if points rise by more than a tenth,
  `dunkChance` and `takeoff` are the first things to turn.
- **By eye:** film strips of each motion beside the clip's contact sheet; stills in the game through a layup and a dunk.

## 9. Not in this

- The windmill and any other dunk style; a two-foot or standing dunk; an alley-oop; a put-back; hanging on the rim.
- Other layups: the reverse, the euro step, the floater.
- A Dunk rating of its own: Inside decides.
- Refining the fade, the hesitation pull-up and the crossover from their clips: they can be measured with the same
  tool, and are a job of their own.

## 10. What could go wrong

- **The tracker's numbers are rough.** One camera cannot see depth well, and gives no twist of a limb about itself. A
  measured pose may need a bone corrected by hand after a look at the film strip; each correction is written down
  beside the pose.
- **The layup is half measured.** Its legs and its timing are not from the clip. It will read less true than the dunk
  until a cleaner clip replaces them.
- **The slow-motion factor is an assumption** (a 0.9 s jump). If the real jump was 0.8 s, every time in 2.1 is a ninth
  shorter; the gather would be 0.46 s.
- **Scoring.** More baskets at the rim go in. It is measured, and turned down if it moves the game.
- **A dunk needs room to land.** From 2.2 m out he comes down about under the rim, a metre and a half inside the
  baseline; a player dunking from the side comes down nearer the sideline's corner, and is kept in bounds.

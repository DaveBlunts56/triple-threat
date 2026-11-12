# Realistic Players, Stage 3 (Basketball Moves) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A jump shot is prepared on the floor (a gather, then a small jump), a release inside the green window always goes in, and a meter beside the shooter shows that window; the ten players dribble, hold, shoot, pass, catch, reach, contest and guard with motion that turns, leans, looks and lands, and the ball is drawn in the hand.

**Architecture:** The rule changes live in `src/sim/`, with their numbers in `tuning.js`, and `players.js` exports the functions that judge a shot (`shotWindow`, `greenAt`), so the meter reads the rule and never repeats it. `src/render/motion.js` stays the pure, Three-free place where the match is turned into "which motion, how strongly, how fast", and now also into the meter, the drawn heading, the lean, where each head looks and where a held ball sits. `src/render/animator.js` plays that on two layers: the legs with the hips and lower spine, and the arms with the upper spine, neck and head. `people.js` keeps what the renderer must remember between frames and owns one animator per person. `tools/blender/` builds every motion: the Mixamo clips, their mirrors, and poses keyed from a table.

**Tech Stack:** as stage 2: Three.js 0.187 (`WebGPURenderer`, WebGL 2 fallback), plain ES modules, `node --test`, Blender 4.5.16 with MPFB 2.0.18 run without a window.

**Spec:** `docs/superpowers/specs/2026-11-12-stage-3-motion-amendment.md` is the binding design for this stage. It amends `docs/superpowers/specs/2026-11-12-realistic-players-design.md`, whose sections "Motion", "The ball in the hand", "Testing" and "Known risks" still apply where the amendment does not change them. The study behind the amendment is `docs/superpowers/research/2026-11-12-animation-reference.md`.

**Branch:** `feat/realistic-players`, continuing from stage 2.

**Replaces:** Tasks 7 to 12 of `docs/superpowers/plans/2026-11-12-realistic-players-stages-2-4.md`. Tasks 1 to 6 of that plan (stage 2) come before this file; its Tasks 13 to 16 (stage 4) come after it, unchanged, and start only when the owner has played this stage's single file and says so.

**Starts from** what stage 2 leaves:

- `src/render/motion.js`: `legMotion(player, gaits, last)`, `fade(weights, chosen, step)`, `checkGaits(facts)`, `AIR_TIME`, `MOTION`, `personName`, `courtPeople(state)`, `keepTrack(name)`, `sized(gaits, scale)`, `missingPeople(names)`.
- `src/render/people.js`: `loadPeople() -> Promise<{ models, update(state, dt), setQuality(level) }>`. `models` is six `THREE.Group`s, one per court slot, placed and turned from the match; each holds the model of whoever plays in that slot. There is one model and one mixer per **person** (ten), never cloned. A person's bones are named `mixamorigHips`, `mixamorigSpine`, `mixamorigSpine1`, `mixamorigSpine2`, `mixamorigNeck`, `mixamorigHead`, and for `Left` and `Right`: `…UpLeg`, `…Leg`, `…Foot`, `…ToeBase`, `…Shoulder`, `…Arm`, `…ForeArm`, `…Hand` and fifteen finger bones. `dt` is the match time that passed this frame, or real time on the start and final screens.
- `src/render/kit.js`, `src/render/quality.js`; the view from `scene.js` is `{ scene, camera, backend, render(), follow(x), setQuality(level) }`; `hud.update(state, backend, ui)` is given `ui = game`, where `main.js` keeps `game = { state, paused, pick, fps, quality }`.

**Words used in every task.** Positions are metres. `facing` is radians, measured from +x toward +z. The broadcast camera looks from +z, so +x is to the right of the screen. Team 0 (the owner's) attacks the hoop at +x. A player facing +x has −z on his left. A model faces its own +z and its left is its +x. One step of the game is `DT` = 1/60 s. "The press" is the step on which a player with the ball first has the shoot key down.

## Global Constraints

- Earlier constraints hold: nothing under `src/sim/` imports Three.js or touches the DOM; the only npm dependency is `three@0.187.0`; `npm test` passes before every commit; commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Never push; merge only when the owner says.
- Under `src/sim/` only these change, all in Tasks 1 to 4: shooting with a gather and a smaller jump; the green window; the computer's release, its contest and its easing into spots; the pass remembering its receiver; and the numbers the balance needs. Walking to spots (stage 4) is not touched. Everything else in this stage is drawn only: the models read the match and never steer it.
- Every simulation number lives in `src/sim/tuning.js`. Render-side numbers live in one frozen object at the top of the module that uses them.
- Choosing a motion is plain logic in `src/render/motion.js`, with no Three.js import, tested in Node. `motion.js` may import from `src/sim/`; nothing under `src/sim/` imports from `src/render/`. The single-file packer refuses import cycles.
- The meter and the rule cannot disagree: the band on screen comes from `shotWindow`, and the frozen meter from the record the rules write at the release. Nothing in the renderer works a window out for itself.
- Targets: 60 frames a second on this computer at High; 30 on the Chromebook at Low, as the owner reports; at most 20,000 triangles per player; single file at most 25 MB.
- Numbers the amendment fixes, for shooting: the gather lasts 0.3 s; a shot leaves the floor at 2.2 m/s (about 0.25 m high, 0.45 s in the air) and every other jump at 4 m/s as before; the best moment to let go is 0.48 s after the press (the gather plus 0.8 of the rise); timing counts 1 there, falling in a straight line to 0.6 at the press and at the landing; the green window is 3, 2, 1 or 0 steps either side of the best moment for Open, Guarded, Contested and Smothered, times a range factor (1 up to 4 m from the hoop, 0.5 at 8 m, 0 from 12 m), times the tiredness factor (down to 0.8); a green release that is not blocked always goes in; a computer player within 1.5 m of where he is going asks for part speed, in proportion.
- Numbers the amendment fixes, for the display: the meter stays 1.2 s after the release and goes at once on a travel; the drawn heading turns at most 900 degrees a second; the body tips at most 12 degrees forward or back and 10 sideways; heads turn at most 70 degrees sideways and 30 up or down; one-off moves fade in over 0.07 s and out over 0.22 s, everything else over 0.15 s (`MOTION.fade`); the ball is at the hand for 55% of each bounce; a change of dribbling hand takes 0.2 s; a receiver's hands rise over the last 0.2 s before a pass arrives; a defender on the floor within 2 m of a shooter raises a hand; the knees give for 0.12 s after a landing; the ball blends between hand and flight in 0.1 s; a defender is drawn facing his man within 4 m.
- Not in this stage: a pump fake; a wind-up before a pass or a steal; crossovers, spins, step-backs, fadeaways, lay-up or dunk packages; feet or hands locked in place by inverse kinematics (a little foot slide is accepted); two players animated as one; different shot timings per player; a camera that moves during live play; faces and fingers beyond what a clip contains. Free throws keep their own meter and rules.
- Assets: Mixamo downloads, `.fbx`, `.blend` and pack zips stay out of the repository. Every Mixamo clip used is listed in `assets/CREDITS.md`. Only dressed renders are shown to the owner.
- Blender: `blender-4.5 --background --python tools/blender/<script>.py -- --shots DIR`. Results are judged from the rendered film strips, and from the tests that measure the shipped file.
- Mixamo: Claude drives mixamo.com in the app's built-in browser; the owner only signs in if it is logged out. The character `MIXAMO-UPLOAD` is already in the account. Settings: FBX Binary, With Skin, 30 frames per second, no keyframe reduction, "In Place" unticked. A download lands as a hidden file `~/Downloads/.org.chromium.Chromium.*` and is copied into `assets/source/mixamo/`.
- After any change the owner will play: `npm run single`, then send `dist/triple-threat.html`.

## Review Focus

Conditions the amendment implies but does not spell out, most likely to bite a person playing first. Each has a test in the task named.

1. **A whistle, a steal or a pass during the gather.** He cannot steer during a gather, so a shot that is cut short must end there: he is not left planted through the stoppage, the ball does not leave his hands later, and the meter goes at once. (Tasks 1 and 5)
2. **Picking up the dribble on the run and shooting at the last moment.** Today Space takes him off the floor at once, so this is always legal. With a gather he slides up to 0.6 m while he brakes. That slide must not be counted toward a travel. (Task 1)
3. **A green release that cannot go in.** "Always" has to be true of everything the meter calls green. Behind the backboard no ball can go in, so nothing is green there; and a release that is blocked is shown as blocked, never with the tick. (Tasks 2 and 5)
4. **A meter that outlives its shot.** On the Chromebook a drawn frame is two steps of the game, so the release can fall between two frames: the frozen meter must show the release the rules judged, not the last frame the renderer saw. Match time stops at the final buzzer, so a meter counted in match time would stay on the final screen for ever. And a shot taken straight after another must not bring the old meter back. (Tasks 2 and 5)
5. **Arms caught between two things.** A pass caught the moment it is thrown, a shooter who lands with the ball, a shooter who is blocked, a steal that wins the ball, a rebounder who jumps seconds after his own shot: the arms always show the newest thing, a shooter in the air keeps his follow-through instead of throwing both arms up, and nobody shows a follow-through he did not earn. (Tasks 8 and 9)

---

### Task 1: A gather before a smaller shot jump

**Files:**
- Create: `tests/shot.test.js`
- Modify: `src/sim/tuning.js`, `src/sim/state.js`, `src/sim/players.js`, `src/sim/rules.js`, `src/sim/ai.js`, `tests/actions.test.js`, `tests/ai.test.js`, `tests/violations.test.js`, `tests/fouls.test.js`

**Interfaces:**
- Consumes: `applyActions`, `movePlayers`, `jump`, `makeChance` and `releaseShot` in `players.js`; `deadBall` in `rules.js`; `planWithBall` and `act` in `ai.js`. From `tests/helpers.js`: `live(seed)` (phase `live`; team 0 at x = 5 and team 1 at x = −5, at z = −3, 0 and 3 by slot; player 0 holds the ball), `idle()`, `only(id, intent)`, `run(s, seconds, intents, done)`, `at(s, id, x, z)`.
- Produces:
  - `tuning.js`: `PLAYER.shotJumpV: 2.2`, `SHOT.gather: 0.3`, `SHOT.bestAt: 0.8`. (`PLAYER.gatherDist` is an older number about travelling and has nothing to do with this gather.)
  - `state.js`: every player gains `shotT: 0` (seconds since his press; it counts only while he is `shooting` and keeps its last value afterwards), `letGo: false` (the key came up during the gather) and `takeoff: 0` (the speed he last left the floor at). `lineUp` resets `shotT` and `letGo`.
  - `players.js`:
    - `SHOT_BEST = SHOT.gather + SHOT.bestAt * PLAYER.shotJumpV / BALL.gravity` (0.4794 s) and `SHOT_LANDS = SHOT.gather + 2 * PLAYER.shotJumpV / BALL.gravity` (0.7485 s), both seconds after the press.
    - `gathering(player) -> boolean`: `player.shooting && player.shotT < SHOT.gather - DT / 2`.
    - `jump(player, speed = PLAYER.jumpV)`: as now, at `speed`, which it also stores in `player.takeoff`.
    - `shotTiming(t) -> number`: 1 at `SHOT_BEST`, falling in a straight line to `SHOT.worstTiming` at 0 and at `SHOT_LANDS`, never below it.
    - `makeChance(state, player)`: as now, except that its timing factor is `shotTiming(player.shotT)`.

What a shot now is, step by step (the tests below hold these numbers):

| Step after the press | `shotT` | What happens |
|---|---|---|
| 0 | 0 | The press. He faces the hoop; `shooting` is true. He does not leave the floor. |
| 1 to 17 | up to 0.283 | The gather. His move keys count as zero, so he brakes to a stop. Letting go of the key is remembered. |
| 18 | 0.3 | His feet leave the floor at 2.2 m/s. If he let go during the gather, the ball is released on this step. |
| 19 to 44 | up to 0.733 | In the air. Letting go releases the ball on that step. Step 29 (0.483 s) is the one nearest the best moment. |
| 45 | 0.75 | He is back on the floor. If he still has the ball it is a travel. |

- [ ] **Step 1: Write the failing tests** (`tests/shot.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/step.js';
import { SHOT_BEST, SHOT_LANDS, gathering, makeChance, shotTiming, trySteal } from '../src/sim/players.js';
import { DT, PLAYER, RIM, SHOT } from '../src/sim/tuning.js';
import { live, idle, only, at } from './helpers.js';

const steps = (s, n, intents) => { for (let i = 0; i < n; i++) step(s, intents, DT); };
const hold = only(0, { shoot: true });
const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;

test('pressing shoot with the ball starts a gather: 18 steps on the floor, facing the hoop, braking, deaf to the move keys', () => {
  const s = live(), p = s.players[0];
  steps(s, 30, only(0, { moveZ: 1, sprint: true }));                      // sprinting across the court
  const keys = only(0, { moveZ: 1, sprint: true, shoot: true }), from = { x: p.x, z: p.z };
  step(s, keys, DT);                                                      // the press
  const toHoop = Math.atan2(-p.z, RIM.x - p.x);
  assert.deepEqual([p.shooting, gathering(p), p.shotT, p.facing], [true, true, 0, toHoop]);
  steps(s, 17, keys);
  assert.deepEqual([gathering(p), p.y, p.vy, p.vx, p.vz, p.facing], [true, 0, 0, 0, 0, toHoop]);   // stopped, still on the floor, still facing it
  assert.ok(Math.hypot(p.x - from.x, p.z - from.z) < 0.8, 'he slid more than his braking distance');
  step(s, keys, DT);                                                      // 0.3 s after the press
  assert.deepEqual([gathering(p), p.vy, p.y, s.ball.holder], [false, PLAYER.shotJumpV, 0, 0]);
});

test('the shot jump is small: about 0.25 m high and 0.45 s long; a jump without the ball is as high as ever', () => {
  const s = live(), p = s.players[0], d = s.players[3];
  let peak = 0, air = 0, other = 0;
  for (let i = 0; i < 70; i++) {
    const keys = idle();
    keys[0].shoot = true; keys[3].shoot = i === 0;                        // the shooter holds Space; a defender jumps once
    step(s, keys, DT);
    if (s.ball.holder === 0) { peak = Math.max(peak, p.y); air += p.y > 0; }
    other = Math.max(other, d.y);
  }
  assert.ok(near(peak, PLAYER.shotJumpV ** 2 / (2 * 9.81), 0.01), `peak ${peak}`);     // 0.247 m
  assert.ok(near(air * DT, 0.45, 0.02), `${air} steps in the air`);
  assert.ok(near(other, 0.8155, 0.01), `a defender's jump peaked at ${other}`);
});

test('the best moment is 0.48 s after the press: the full chance there, 60% of it at the press and at the landing', () => {
  assert.ok(near(SHOT_BEST, 0.4794, 0.0005) && near(SHOT_LANDS, 0.7485, 0.0005), `${SHOT_BEST} ${SHOT_LANDS}`);
  assert.equal(shotTiming(SHOT_BEST), 1);
  assert.ok(near(shotTiming(0), SHOT.worstTiming) && near(shotTiming(SHOT_LANDS), SHOT.worstTiming));
  assert.ok(near(shotTiming(SHOT_BEST / 2), 0.8) && near(shotTiming((SHOT_BEST + SHOT_LANDS) / 2), 0.8));   // a straight line each side
  assert.equal(shotTiming(2), SHOT.worstTiming);                                                           // never below the worst
  const s = live(), p = s.players[0];
  p.shotT = SHOT_BEST;
  const full = makeChance(s, p);
  p.shotT = 0;
  assert.ok(near(makeChance(s, p) / full, SHOT.worstTiming));
});

test('letting go in the air releases the ball on that step', () => {
  const s = live(), p = s.players[0];
  steps(s, 29, hold);
  assert.deepEqual([s.ball.holder, p.shooting, p.y > 0], [0, true, true]);
  step(s, idle(), DT);
  assert.deepEqual([s.ball.mode, s.ball.holder, s.ball.shooter, p.shooting], ['shot', null, 0, false]);
  assert.ok(near(p.shotT, 29 * DT), `released ${p.shotT} s after the press`);     // 0.483 s: the step nearest the best moment
});

test('letting go during the gather: the ball leaves on the step his feet leave the floor, with the timing that moment earns', () => {
  const s = live(), p = s.players[0];
  steps(s, 5, hold); steps(s, 3, idle()); steps(s, 10, hold);             // let go early; pressing again changes nothing
  assert.deepEqual([s.ball.holder, p.shooting, p.y, p.vy], [0, true, 0, 0]);   // 18 steps: nothing has left his hand
  step(s, hold, DT);
  assert.deepEqual([s.ball.mode, s.ball.shooter, p.shooting, p.vy], ['shot', 0, false, PLAYER.shotJumpV]);
  assert.ok(near(p.shotT, SHOT.gather) && near(shotTiming(p.shotT), 0.8503, 0.001), `${p.shotT}`);
});

test('landing with the ball is still a travel, 0.75 s after the press', () => {
  const s = live(); let n = 0;
  while (s.phase === 'live' && n < 80) { step(s, hold, DT); n++; }
  assert.deepEqual([s.call?.kind, s.call?.team, n, s.players[0].shooting], ['travel', 0, 46, false]);
});

test('a pass out of the gather is allowed and ends the shot', () => {
  const s = live(), p = s.players[0];
  steps(s, 6, hold);
  step(s, only(0, { shoot: true, pass: true }), DT);
  assert.deepEqual([s.ball.mode, p.shooting, gathering(p)], ['pass', false, false]);
  steps(s, 20, idle());
  assert.deepEqual([p.y, s.call], [0, null]);                             // he never leaves the floor
});

test('a steal during the gather takes the ball and ends the shot', () => {
  const s = live(), p = s.players[0];
  at(s, 3, 5.8, -3);                                                      // a defender within reach
  steps(s, 6, hold);
  let won = false;
  for (let i = 0; i < 200 && !won; i++) { s.players[3].stealCooldown = 0; won = trySteal(s, s.players[3]).won; }
  assert.deepEqual([s.ball.holder, p.shooting, gathering(p)], [3, false, false]);
  steps(s, 20, hold);
  assert.deepEqual([p.y, p.vy, s.ball.holder], [0, 0, 3]);                // no jump follows, and nothing leaves his hands
});

test('a whistle during the gather ends the shot: he is not left planted through the stoppage', () => {
  const s = live(), p = s.players[0];
  s.shotClock = 0.1;
  steps(s, 10, hold);
  assert.deepEqual([s.phase, s.call.kind, p.shooting, gathering(p)], ['dead', 'shotClock', false, false]);
  steps(s, 12, only(0, { moveX: 1 }));
  assert.ok(p.vx > 3, `he could not walk away: vx ${p.vx}`);
});

test('the slide of a gather does not count toward a travel for a player who has picked up his dribble', () => {
  const s = live(), p = s.players[0];
  steps(s, 30, only(0, { moveZ: 1, sprint: true }));
  Object.assign(p, { held: true, steps: 1.2 });
  steps(s, 30, only(0, { moveZ: 1, sprint: true, shoot: true }));
  step(s, idle(), DT);
  assert.deepEqual([s.phase, s.call, s.ball.mode], ['live', null, 'shot']);
  assert.ok(p.steps < 1.5, `${p.steps} m counted`);
});
```

- [ ] **Step 2: Bring the older tests into line** with the new timing. Their claims stay; only how a shot is set up changes.

In `tests/actions.test.js`: import `SHOT_BEST` and `SHOT_LANDS` from `players.js`; delete the `APEX` constant; replace the helper `airborneAtApex` with this one and use it wherever the old one was used:

```js
// In the air at the best moment to let go.
const atBest = p => Object.assign(p, { y: 0.24, vy: 0.4, shotT: SHOT_BEST, shooting: true });
```

In "makeChance falls with distance", the expected chance at 1 m becomes `SHOT.nearChance + (SHOT.farChance - SHOT.nearChance) / SHOT.farDist`, so the test follows the numbers. In "a lay-up from right at the rim, released late on the way down…", the key is held while `!p.shooting || p.shotT < 0.65`. These three tests are replaced:

```js
test('makeChance is best at the best moment', () => {
  const s = setup(), p = atBest(s.players[0]);
  const best = makeChance(s, p);
  p.shotT = 0;
  assert.ok(Math.abs(makeChance(s, p) / best - SHOT.worstTiming) < 0.02);
  p.shotT = SHOT_LANDS;
  assert.ok(Math.abs(makeChance(s, p) / best - SHOT.worstTiming) < 0.02);
});

test('an open close-range shot let go a tenth of a second early goes in as often as its chance says', () => {
  let made = 0, chance;
  const tries = 200;
  for (let seed = 1; seed <= tries; seed++) {
    const s = setup(seed), p = atBest(s.players[0]);
    p.x = RIM.x - 2; p.shotT = SHOT_BEST - 0.1;            // well short of the best moment
    chance = makeChance(s, p);
    releaseShot(s, p);
    for (let t = 0; t < 3; t += DT) {
      const e = stepBall(s.ball, DT);
      if (e.scored === 1) { made++; break; }
      if (e.hitFloor) break;
    }
  }
  assert.ok(Math.abs(made / tries - chance) < 0.1, `made ${made}/${tries}, chance ${chance}`);
});

test('pressing shoot gathers, then jumps; releasing it in the air shoots', () => {
  const s = setup();
  tick(s, intents(0, { shoot: true }));
  assert.deepEqual([s.players[0].shooting, s.players[0].vy], [true, 0]);
  for (let i = 0; i < 24; i++) tick(s, intents(0, { shoot: true }));
  assert.ok(s.players[0].y > 0);
  assert.equal(s.ball.holder, 0);
  tick(s, intents(0, {}));
  assert.equal(s.ball.mode, 'shot');
});
```

In `tests/ai.test.js`: import `SHOT_BEST` and `SHOT_LANDS` from `players.js` and `SHOT` from `tuning.js`, and replace "an AI shot is released near the top of the jump" with:

```js
test('a computer shooter lets go around the best moment, in the air, and never lands with the ball', () => {
  const times = [];
  for (let seed = 1; seed <= 30; seed++) {
    const s = live(); s.seed = seed;
    put(s, 0, 7, 0); put(s, 3, 10, 0);
    assert.ok(run(s, 2, [0], st => st.ball.mode === 'shot'), `seed ${seed}: never released`);
    assert.ok(s.players[0].y > 0 || s.players[0].vy > 0, 'released from the floor');
    times.push(s.players[0].shotT);
  }
  for (const t of times) assert.ok(Math.abs(t - SHOT_BEST) <= AI.releaseJitter + DT && t > SHOT.gather && t < SHOT_LANDS - DT, `released at ${t}`);
  assert.ok(new Set(times.map(t => Math.round(t / DT))).size >= 4, 'no spread');
});
```

In `tests/violations.test.js`, `jumpAfterPickup` holds the shoot key for 0.5 s instead of 0.3 s, so that he is in the air when he lets go or passes. In `tests/fouls.test.js`, in "a defender in the air on top of the shooter at the release…", the shooter holds the key while `s.time < 0.45` and the run lasts 0.6 s.

- [ ] **Step 3: Run them**

Run: `node --test tests/shot.test.js tests/actions.test.js tests/ai.test.js`
Expected: FAIL. `tests/shot.test.js` cannot be loaded (`SHOT_BEST` is not exported), and so on for the other two.

- [ ] **Step 4: Implement.** What is decided:

- `applyActions`, for the player holding the ball, in this order: a fresh pass press passes, as now, also out of a gather or a jump; an inbounder can do nothing else; a player who is `shooting` is handled as in the next point; otherwise a fresh shoot press on the floor is the press; otherwise a fresh hold press, as now.
- The press sets `facing` at the hoop (as now), `shooting = true`, `shotT = 0`, `letGo = false`. It does not call `jump` and spends no energy.
- On every later step while he is `shooting`: note whether he is `gathering`, then add `dt` to `shotT`. If he was gathering: a key that is up sets `letGo`; and if he is no longer `gathering` after the addition, he takes off (`jump(p, PLAYER.shotJumpV)`, then `spend(state, p, STAMINA.jump)`) and, if `letGo` is set, the ball is released by `releaseShot` on this same step and reported as `report.release`. If he was not gathering: on the floor it is a travel, as now; otherwise a key that is up releases, as now.
- `movePlayers`: a `gathering` player's `moveX` and `moveZ` count as zero, so `PLAYER.accel` brakes him; his steps are not counted toward a travel while he gathers; and while a player is `shooting` his `facing` is not changed by which way he is moving.
- `rules.js`: `deadBall` also sets `shooting = false` for every player. A whistle ends any shot still in the hand.
- `ai.js`: the release moment is `ai.releaseAt = SHOT_BEST + (rand(state) * 2 - 1) * AI.releaseJitter`, held between `SHOT.gather + DT` and `SHOT_LANDS - 3 * DT`; and in `act` the key stays down while `p.shotT + DT < ai.releaseAt`, so the ball leaves on the first step at or after that moment. `AI.releaseJitter` stays 0.12; its comment now says "seconds either side of the best moment". The defender is not changed in this task: he still jumps when his man is `shooting`.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Check it in the browser** (`npm start`, then `http://127.0.0.1:5173/` with the Browser pane showing)

| Check | Expected |
|---|---|
| Space with the ball while sprinting | He turns to the hoop, stops within a stride, then hops; letting go in the air shoots |
| Space tapped | The ball leaves as his feet leave the floor |
| Space held | A small hop, then "Travelling. Opponent's ball" |
| WASD during the gather | He does not move off his spot |
| Space without the ball | The same high jump as before |
| The computer's shots | Released in the air; no travelling calls against the computer over a quarter |

- [ ] **Step 7: Commit**

```bash
git add src/sim/tuning.js src/sim/state.js src/sim/players.js src/sim/rules.js src/sim/ai.js tests/shot.test.js tests/actions.test.js tests/ai.test.js tests/violations.test.js tests/fouls.test.js
git commit -m "feat: a gather on the floor before a smaller shot jump"
```

---

### Task 2: A green release always goes in

**Files:**
- Create: `tests/green.test.js`
- Modify: `src/sim/tuning.js`, `src/sim/state.js`, `src/sim/players.js`

**Interfaces:**
- Consumes: from Task 1, `SHOT_BEST`, `player.shotT` and the press in `applyActions`; `shotFactor(energy)` from `stamina.js` (1 at half energy or more, 0.8 at none); `BOARD`, `RIM` and `BALL` from `tuning.js`; `launchShot(state, player, made, value)`.
- Produces:
  - `tuning.js`: `SHOT.greenFull: 4`, `SHOT.greenNone: 12`, and `SHOT.levels`, a frozen list, highest first: `{ name: 'Open', above: 0.95, steps: 3 }`, `{ name: 'Guarded', above: 0.75, steps: 2 }`, `{ name: 'Contested', above: 0.55, steps: 1 }`, `{ name: 'Smothered', above: 0, steps: 0 }`. These widths are the numbers the owner will ask to change if shooting is too easy or too hard.
  - `state.js`: `createMatch` gains `shot: null`.
  - `players.js`:
    - `contest(state, player) -> number`: the factor `makeChance` already works out for the nearest defender (0.5 to 1 by his distance, times `SHOT.airContest` when he is in the air within `SHOT.airContestDist`), moved into a function of its own. `makeChance` uses it and gives the same numbers as before.
    - `boardInWay(player) -> boolean`: true when he stands behind the backboard of the hoop he attacks (`sign * player.x > BOARD.x`) and the straight line from him to the centre of the rim crosses the board's plane within `BOARD.halfWidth + BALL.radius` of the middle.
    - `shotWindow(state, player) -> { best, half, level, inRange }`. `best` is `SHOT_BEST`. `level` is the name of the first entry of `SHOT.levels` whose `above` is not more than `contest(state, player)`. `half` is `steps * DT * range * shotFactor(energy)` seconds, with `range = 1 - (distance to the hoop - SHOT.greenFull) / (SHOT.greenNone - SHOT.greenFull)` held between 0 and 1. `inRange` is `range > 0 && !boardInWay(player)`.
    - `greenAt(window, t) -> boolean`: `window.inRange && Math.abs(t - window.best) <= window.half + DT / 2`.
    - `releaseShot` writes `state.shot = { shooter, t, at, best, half, level, inRange, green, blocked }`: the shooter's id, his `shotT`, `state.time`, the four fields of his `shotWindow` at that moment, `greenAt` of them, and whether the shot was blocked. The press sets `state.shot = null`.

- [ ] **Step 1: Write the failing tests** (`tests/green.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/step.js';
import { SHOT_BEST, boardInWay, contest, greenAt, releaseShot, shotWindow } from '../src/sim/players.js';
import { DT, RIM } from '../src/sim/tuning.js';
import { live, idle, only, run, at } from './helpers.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
// Player 0 `far` metres straight out from the hoop he attacks, with the nearest defender `gap` metres from him toward it.
function shot(far, gap, { up = false, seed = 1, energy = 1 } = {}) {
  const s = live(seed);
  at(s, 0, RIM.x - far, 0); at(s, 3, RIM.x - far + gap, 0);
  if (up) s.players[3].y = 0.5;
  s.rosters[0][0].energy = energy;
  return s;
}
const windowOf = (...args) => { const s = shot(...args); return shotWindow(s, s.players[0]); };
// The same shooter in the air at `t` seconds after his press, about to let go.
const inAir = (s, t) => Object.assign(s.players[0], { shooting: true, shotT: t, y: 0.2, vy: 0.5 });
const scores = s => run(s, 4, idle(), st => st.score[0] > 0);

test('the green window is three steps either side of the best moment when open, two guarded, one contested, none smothered', () => {
  const steps = (...args) => { const w = windowOf(...args); return [w.level, Math.round(w.half / DT * 1e6) / 1e6]; };
  assert.deepEqual(steps(3, 2.5), ['Open', 3]);
  assert.deepEqual(steps(3, 1.5), ['Guarded', 2]);
  assert.deepEqual(steps(3, 0.8), ['Contested', 1]);
  assert.deepEqual(steps(3, 1.2, { up: true }), ['Contested', 1]);        // in the air within 1.5 m
  assert.deepEqual(steps(3, 0.65, { up: true }), ['Smothered', 0]);
  assert.equal(windowOf(3, 2.5).best, SHOT_BEST);
});

test('the level comes from the same number the make chance uses for the defender', () => {
  const s = shot(3, 1.5);
  assert.ok(near(contest(s, s.players[0]), 0.875));                       // 0.5 + 0.5 * 1.5 / 2
  s.players[3].y = 0.5; at(s, 3, RIM.x - 3 + 1.2, 0);
  assert.ok(near(contest(s, s.players[0]), 0.64));                        // (0.5 + 0.5 * 1.2 / 2) * 0.8
});

test('range and tiredness narrow the window: full to 4 m, half at 8 m, none from 12 m; a fifth narrower when exhausted', () => {
  const half = (far, options) => windowOf(far, 2.5, options).half / DT;
  assert.ok(near(half(2), 3) && near(half(4), 3) && near(half(6), 2.25) && near(half(8), 1.5) && near(half(10), 0.75), `${half(6)}`);
  assert.deepEqual([windowOf(11.9, 2.5).inRange, windowOf(12, 2.5).inRange, windowOf(13, 2.5).inRange], [true, false, false]);
  assert.ok(near(half(3, { energy: 0 }), 2.4) && near(half(3, { energy: 0.25 }), 2.7) && near(half(3, { energy: 0.5 }), 3));
});

test('a release is green within the window and half a step, and not one step further', () => {
  const open = windowOf(3, 2.5), smothered = windowOf(3, 0.65, { up: true });
  const greens = w => Array.from({ length: 46 }, (_, k) => k).filter(k => greenAt(w, k * DT));
  assert.deepEqual(greens(open), [26, 27, 28, 29, 30, 31, 32]);           // step 29 (0.483 s) is the nearest to the best moment
  assert.deepEqual(greens(windowOf(3, 1.5)), [27, 28, 29, 30, 31]);
  assert.deepEqual(greens(windowOf(3, 0.8)), [28, 29, 30]);
  assert.deepEqual(greens(smothered), [29]);                              // only the best step
  assert.deepEqual(greens(windowOf(12, 2.5)), []);                        // too far out: nothing is green
});

test('a green release goes in, for every seed and from every range', () => {
  for (let seed = 1; seed <= 40; seed++) for (const far of [0.3, 1.5, 4, 6.75, 9, 11.5]) {
    const s = shot(far, 2.5, { seed });
    inAir(s, 29 * DT);
    const report = releaseShot(s, s.players[0]);
    assert.deepEqual([report.blocked, s.shot.green], [false, true]);
    assert.ok(scores(s), `seed ${seed}, ${far} m: a green release missed`);
  }
});

test('a release one step outside the window can miss', () => {
  let made = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = shot(6.75, 2.5, { seed });
    inAir(s, 32 * DT);                                                    // open at 6.75 m the window is steps 27 to 31
    releaseShot(s, s.players[0]);
    assert.equal(s.shot.green, false);
    made += scores(s);
  }
  assert.ok(made > 0 && made < 40, `${made} of 40 went in`);
});

test('a block still stops a green release', () => {
  let blocked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = shot(3, 0.8, { seed, up: true });                           // a defender in the air in front of him, in reach
    inAir(s, 29 * DT); s.players[0].facing = 0;
    if (releaseShot(s, s.players[0]).blocked) {
      blocked++;
      assert.deepEqual([s.ball.mode, s.shot.green, s.shot.blocked, scores(s)], ['loose', true, true, false]);
    }
  }
  assert.ok(blocked > 0, 'none of 40 was blocked');
});

test('nothing is green from behind the backboard, where no ball can go in', () => {
  const behind = (x, z) => { const s = shot(3, 2.5); at(s, 0, x, z); return [boardInWay(s.players[0]), shotWindow(s, s.players[0]).inRange]; };
  assert.deepEqual(behind(13.5, 1), [true, false]);
  assert.deepEqual(behind(13.5, 6), [false, true]);                       // the corner: the ball passes beside the board
  assert.deepEqual(behind(12, 0.5), [false, true]);
  const t = shot(3, 2.5); at(t, 3, -13.5, 1);                             // the other team, at the other hoop
  assert.equal(boardInWay(t.players[3]), true);
});

test('the release is recorded as the rules judged it, and the next press clears the record', () => {
  const s = shot(3, 2.5);
  for (let i = 0; i < 29; i++) step(s, only(0, { shoot: true }), DT);
  assert.equal(s.shot, null);
  const { best, half, level, inRange } = shotWindow(s, s.players[0]);
  step(s, idle(), DT);
  const { at: when, ...rest } = s.shot;
  assert.deepEqual(rest, { shooter: 0, t: s.players[0].shotT, best, half, level, inRange, green: true, blocked: false });
  assert.ok(near(when, s.time - DT));                                     // the match time of the step he let go on
  const again = shot(3, 2.5);
  again.shot = rest;
  step(again, only(0, { shoot: true }), DT);
  assert.equal(again.shot, null);
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/green.test.js`
Expected: FAIL (`boardInWay` is not exported).

- [ ] **Step 3: Implement.** What is decided:

- In `releaseShot` the window and `green` are worked out first, from where the shooter stands, and the record is written. The block is then judged exactly as today; a blocked shot sets `blocked: true` in the record and nothing else changes. A shot that is not blocked is launched with `made = green || rand(state) < makeChance(state, player)`, so a green release draws no random number for the make.
- What `releaseShot` returns, and so how a shooting foul is judged, does not change.
- Free throws do not pass through `releaseShot` and write no record.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tuning.js src/sim/state.js src/sim/players.js tests/green.test.js
git commit -m "feat: a release inside the green window always goes in"
```

---

### Task 3: The computer contests at take-off and eases into its spots; the pass remembers its receiver

**Files:**
- Create: `tests/target.test.js`
- Modify: `src/sim/tuning.js`, `src/sim/state.js`, `src/sim/players.js`, `src/sim/rules.js`, `src/sim/ai.js`, `tests/ai.test.js`, `tests/actions.test.js`

**Interfaces:**
- Consumes: `planDefence`, `act` and `aiIntents` in `ai.js`; `passBall`, `giveBall` and `letGo` in `players.js`; `deadBall` and `shotTouched` in `rules.js`; `onFloor` from `state.js`. In `tests/ai.test.js`, that file's own `live(holderId)`, `put(s, id, x, z)` and `run(s, seconds, ids, done)`.
- Produces:
  - `tuning.js`: `AI.slowDist: 1.5`; `AI.contestDelay: 0.15` (the longest a defender takes to react to his man leaving the floor). Four numbers start from the values a prototype of these rules was balanced with, and Task 4 measures and settles them: `AI.onBallGap: 1.35`, `AI.offBallGap: 1.8`, `SHOT.farChance: 0.15`, `BLOCK.chance: 0.38`.
  - `state.js`: the ball gains `target: null`.
  - `players.js`: `passBall` sets `ball.target` to the id of the team-mate it chose. `giveBall` and `letGo` clear it (`passBall` sets it after it has let go).
  - `rules.js`: `shotTouched` clears `ball.target` when a free ball turns `loose`; `deadBall` clears it too.
  - `ai.js`:
    - Easing in: in `act`, a player further than `AI.arrive` from his target asks for `min(1, d / AI.slowDist)` of full speed toward it, where `d` is the distance left. Nothing else is needed for the player the owner controls: `main.js` replaces his intent with the keyboard's.
    - Contest: a defender jumps when his man is in the air for a shot (off the floor, and either still `shooting` or the shooter of the shot now in flight) and within `AI.contestDist`. He no longer jumps at the gather.
    - Reaction: in `aiIntents`, the first time a defender sees his man in the air for a shot, his decision timer becomes the smaller of what it was and `rand(state) * AI.contestDelay`. Remember what he saw last in `p.ai.sawJump`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/target.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyIntent } from '../src/sim/state.js';
import { passBall } from '../src/sim/players.js';
import { DT } from '../src/sim/tuning.js';
import { live, idle, run, at } from './helpers.js';

test('a pass remembers who it is for until it is caught', () => {
  const s = live();                                      // player 0 at (5, -3) with the ball; team-mates at (5, 0) and (5, 3)
  assert.equal(s.ball.target, null);
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  assert.deepEqual([s.ball.mode, s.ball.target], ['pass', 1]);
  assert.ok(run(s, 1, idle(), st => st.ball.holder !== null));
  assert.deepEqual([s.ball.holder, s.ball.target], [1, null]);
});

test('a pass nobody catches forgets its receiver when it goes loose, and so does one cut short by a whistle', () => {
  const s = live();
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  s.players.forEach(p => { if (p.id !== 0) at(s, p.id, -12, p.z); });       // everyone else leaves
  assert.ok(run(s, 3, idle(), st => st.ball.mode === 'loose'));
  assert.equal(s.ball.target, null);
  const t = live(); t.shotClock = 2 * DT;
  passBall(t, t.players[0], { ...emptyIntent(), moveZ: 1 });
  run(t, 0.1);
  assert.deepEqual([t.phase, t.ball.target], ['dead', null]);
});
```

```js
// tests/ai.test.js (everything these use is already imported there)
test('a computer defender stays down through his man\'s gather and goes up once he has left the floor', () => {
  const s = live(3);
  put(s, 3, -6, 0); put(s, 0, -7, 0);
  let early = false, up = null;
  for (let i = 0; i < 44; i++) {
    const all = aiIntents(s, DT).map((intent, id) => (id === 0 ? intent : emptyIntent()));
    all[3] = { ...emptyIntent(), shoot: true };
    step(s, all, DT);
    const d = s.players[0];
    if (i < 18) early ||= d.y > 0 || d.vy !== 0;
    else if (up === null && d.vy !== 0) up = i;
  }
  assert.equal(early, false, 'he jumped at the gather');
  assert.ok(up !== null && up - 18 <= AI.contestDelay / DT + 2, `he left the floor at step ${up}`);
});

test('a computer player eases into his spot: full speed far away, part speed in proportion inside 1.5 m, stopped on arrival', () => {
  const eased = dx => {
    const s = live(4);                                     // team 1 has the ball; player 0 guards player 3, off the ball
    put(s, 3, -5, 2); put(s, 4, -8, -5);
    aiIntents(s, DT);                                      // he picks his guard spot
    const p = s.players[0];
    put(s, 0, p.ai.targetX + dx, p.ai.targetZ);
    const m = aiIntents(s, DT)[0];
    return [Math.hypot(m.moveX, m.moveZ), m.moveX];
  };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(eased(3)[0], 1) && near(eased(1.5)[0], 1) && near(eased(0.75)[0], 0.5) && near(eased(0.45)[0], 0.3), `${eased(0.75)}`);
  assert.ok(eased(0.75)[1] < 0);                           // toward the spot
  assert.equal(eased(0.2)[0], 0);                          // inside AI.arrive: he stands
});
```

In `tests/actions.test.js`, "an airborne defender in front blocks about half of shots" becomes "…blocks his share of shots": import `BLOCK`, and its last line becomes `assert.ok(Math.abs(blocked / tries - BLOCK.chance) < 0.12, …)`.

- [ ] **Step 2: Run them**

Run: `node --test tests/target.test.js tests/ai.test.js`
Expected: FAIL: `s.ball.target` is `undefined`; "he jumped at the gather"; the eased speeds are all 1.

- [ ] **Step 3: Implement** as the Interfaces block says.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS, including the whole matches in `tests/match.test.js`. If "the whistle blows a sensible amount" fails, the four starting numbers were not set.

- [ ] **Step 5: Check it in the browser**

| Check | Expected |
|---|---|
| Defenders off the ball | They drift and shuffle onto their man instead of twitching between a stand and a run |
| You gather next to a defender | He stays on the floor until you leave it, then jumps |
| Your own player | Starts and stops as sharply as before |

- [ ] **Step 6: Commit**

```bash
git add src/sim/tuning.js src/sim/state.js src/sim/players.js src/sim/rules.js src/sim/ai.js tests/target.test.js tests/ai.test.js tests/actions.test.js
git commit -m "feat: the computer contests at take-off and eases into its spots; a pass remembers its receiver"
```

---

### Task 4: The balance holds: fifty matches before and after

**Files:**
- Modify: `src/sim/tuning.js`, and any test that states a number this task changes
- Scratch (not committed): `measure.mjs` and a copy of the old simulation, both in your scratch directory

**Interfaces:**
- Consumes: the rules as Tasks 1 to 3 left them; `createMatch`, `startMatch`, `step`, `aiIntents`. Commit `70a7c37` is the last one that changed `src/sim/` before this stage (`git log --oneline -- src/sim` shows this stage's commits above it).
- Produces: numbers in `tuning.js` with which fifty computer matches score, make shots from each range, block and foul within a tenth of what they did before this stage; and both tables of numbers, recorded.

The ball now leaves later and from lower down, a green release always goes in, and defenders arrive more slowly. Each of those moves scoring. This task measures by how much and puts it back.

- [ ] **Step 1: Write the measurement** as `measure.mjs` in your scratch directory. It plays whole computer-against-computer matches, as `tests/match.test.js` does, and counts.

```js
// Usage: node measure.mjs <dir with src/> [matches]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = resolve(process.argv[2]), N = Number(process.argv[3] ?? 50);
const load = p => import(pathToFileURL(resolve(root, p)).href);
const { createMatch, attackSign } = await load('src/sim/state.js');
const { startMatch } = await load('src/sim/rules.js');
const { step } = await load('src/sim/step.js');
const { aiIntents } = await load('src/sim/ai.js');
const { DT, RIM } = await load('src/sim/tuning.js');

const BANDS = [['close', 0, 3], ['mid', 3, 6], ['long', 6, 99]];
const total = { matches: 0, points: 0, blocks: 0, shootingFouls: 0, fouls: 0, travels: 0, shots: 0, unfinished: 0 };
for (const [name] of BANDS) total[name] = { tries: 0, made: 0 };

for (let seed = 1; seed <= N; seed++) {
  const s = createMatch(seed); startMatch(s);
  let lastCall = null, pending = null, steps = 0;
  while (s.phase !== 'final' && steps++ < 60 * 60 * 30) {
    const holder = s.ball.holder, wasShooting = holder !== null && s.players[holder].shooting, phase = s.phase, score = s.score[0] + s.score[1];
    step(s, aiIntents(s, DT), DT);
    if (s.call && s.call !== lastCall) {
      if (s.call.kind === 'shooting') total.shootingFouls++;
      if (['reach', 'shooting', 'charge', 'block'].includes(s.call.kind)) total.fouls++;
      if (s.call.kind === 'travel') total.travels++;
    }
    lastCall = s.call;
    if (phase === 'live' && wasShooting && s.ball.holder === null) {
      const p = s.players[holder];
      if (s.ball.mode === 'shot') {
        const d = Math.hypot(p.x - attackSign(p.team) * RIM.x, p.z);
        pending = BANDS.find(([, lo, hi]) => d >= lo && d < hi)[0];
        total[pending].tries++; total.shots++;
      } else if (s.ball.mode === 'loose') total.blocks++;
    }
    const gained = s.score[0] + s.score[1] - score;
    if (gained >= 2 && pending) { total[pending].made++; }
    if (gained >= 2 || s.ball.holder !== null) pending = null;
  }
  total.matches++; total.points += s.score[0] + s.score[1];
  if (s.phase !== 'final') total.unfinished++;
}
const per = v => +(v / total.matches).toFixed(2);
console.log(JSON.stringify({ matches: total.matches, unfinished: total.unfinished, points: per(total.points), shots: per(total.shots),
  ...Object.fromEntries(BANDS.map(([n]) => [n, { tries: per(total[n].tries), made: per(total[n].made), share: +(total[n].made / total[n].tries).toFixed(3) }])),
  blocks: per(total.blocks), shootingFouls: per(total.shootingFouls), fouls: per(total.fouls), travels: per(total.travels) }, null, 1));
```

A shot is counted when a `shooting` holder's ball becomes a `shot`, by his distance from the hoop then: close under 3 m, mid from 3 to 6 m, long beyond. A block is a `shooting` holder's ball going `loose`.

- [ ] **Step 2: Measure before**

```bash
mkdir -p <scratch>/before && git archive 70a7c37 src package.json | tar -x -C <scratch>/before
node <scratch>/measure.mjs <scratch>/before
```

Expected, exactly (matches replay from their seeds): `points 87`, `shots 95.36`, close `36.56` tried and `17.42` made, mid `17.62` and `6.72`, long `41.18` and `13.06`, `blocks 3.4`, `shootingFouls 4.84`, `fouls 11.4`, `travels 0`, `unfinished 0`. If your numbers differ, the script differs: fix it before going on.

- [ ] **Step 3: Measure after**

Run: `node <scratch>/measure.mjs .`

The six numbers that must hold, and their limits:

| Per match | Before | Must stay within |
|---|---|---|
| Points, both teams | 87 | 78.3 to 95.7 |
| Close shots made | 17.42 | 15.68 to 19.16 |
| Mid shots made | 6.72 | 6.05 to 7.39 |
| Long shots made | 13.06 | 11.75 to 14.37 |
| Blocks | 3.4 | 3.06 to 3.74 |
| Shooting fouls | 4.84 | 4.36 to 5.32 |

Also required: `travels 0` and `unfinished 0`. A prototype of these rules, with the starting numbers of Task 3, gave 85.1, 18.9, 6.3, 14.1, 3.5 and 4.7. Yours will be near that, not equal to it.

- [ ] **Step 4: Adjust until all six are inside their limits.** Change one number at a time and measure again. What each number moves:

| What is off | Number | Which way |
|---|---|---|
| Too many lay-ups and too few long shots tried (the easing leaves defenders behind their man, so lanes open) | `AI.onBallGap`, `AI.offBallGap` | Up moves shots outward; down brings them in. Steps of 0.05 |
| Long shots made | `SHOT.farChance` | Down for fewer |
| Close shots made | `SHOT.nearChance` | Down for fewer |
| Every range together | `AI.releaseJitter` | Up for fewer: a wider spread lands fewer releases in the green window |
| Blocks | `BLOCK.chance` | Up for more |
| Shooting fouls, and blocks with them | `AI.contestDelay` | Up for fewer: fewer defenders are in the air at the release |

Not to be changed here, because the owner fixed them: `SHOT.gather`, `SHOT.bestAt`, `PLAYER.shotJumpV`, `SHOT.levels`, `SHOT.greenFull`, `SHOT.greenNone`, `AI.slowDist`. If twelve rounds have not brought all six inside, stop and report the closest set with its table. Do not widen the limits.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all PASS. A test that states a number you changed is brought into line in this commit.

- [ ] **Step 6: Commit**, with both tables in the message body, and give both tables in your report: they are the record of this stage's balance.

```bash
git add src/sim/tuning.js    # and any test brought into line
git commit -m "feat: scoring, blocks and fouls stay within a tenth of before the gather"
```

How easy shooting is for a person cannot be measured this way. It is judged in the owner's play-test at the end of the stage.

---

### Task 5: The shot meter

**Files:**
- Create: `tests/meter.test.js`
- Modify: `src/render/motion.js`, `src/render/hud.js`, `src/render/scene.js`, `src/main.js`, `index.html`, `tests/hud.test.js`

**Interfaces:**
- Consumes: `shotWindow(state, player) -> { best, half, level, inRange }`, `player.shooting`, `player.shotT` and the record `state.shot = { shooter, t, at, best, half, level, inRange, green, blocked }` from Tasks 1 and 2; `attackSign(team)` from `state.js`; `DT`. The free-throw bar in `index.html` (`#ftBar`, `#ftZone`, `#ftMarker`) for its colours and borders. `hud.update(state, backend, ui)` and the `put`, `set` and `hide` helpers inside `createHud`.
- Produces, in `motion.js` (no Three.js):
  - `SHOT_METER = Object.freeze({ stay: 1.2, aside: 0.6, low: 0.55, high: 1.45 })`: seconds the frozen meter is kept; metres it stands from the shooter, on the side away from the hoop he attacks; and the heights of its two ends, about knee and shoulder. It does not rise with his jump.
  - `shotMeter(state) -> null | { player, x, z, fill, band, level, frozen }`:
    - `null` on the start and final screens; otherwise, while a team 0 player is `shooting`, his live meter; otherwise, for `SHOT_METER.stay` seconds of match time after a release by a team 0 player (`state.time - state.shot.at`), the frozen one; otherwise `null`. Team 1 never gets one.
    - `player` is the shooter's id; `x` is `his x - attackSign(his team) * SHOT_METER.aside` and `z` is his `z`, read every frame, so it follows him along the floor.
    - `fill` is `1 - |t - best| / best`, held between 0 and 1: empty at the press, full at the best moment, draining after it at the pace it filled. `t` is his `shotT`, or the record's `t` once frozen.
    - `band` is `{ from: 1 - (half + DT / 2) / best, to: 1 }` (`from` not below 0), or `null` when the window's `inRange` is false. The fill is inside the band exactly when a release at that moment would be green.
    - `level` is the window's `level`: `'Open'`, `'Guarded'`, `'Contested'` or `'Smothered'`.
    - `frozen` is `null` while he still has the ball, and after the release `{ verdict, blocked }`: `verdict` is `'green'` when the record says so, otherwise `'early'` when its `t` is before its `best` and `'late'` when after; `blocked` is the record's.
    - Live values come from `shotWindow` every frame, so the band shrinks as a defender closes. Frozen values come only from the record.
- Produces, in `scene.js`: the view gains `toScreen(x, y, z) -> { x, y }`: where that point of the court is on the page, in CSS pixels from the top left.
- Produces, in `main.js`: every frame, after `view.render()` and before `hud.update`, `game.meter` is `null` or the meter with two more fields, `foot: view.toScreen(m.x, SHOT_METER.low, m.z)` and `head: view.toScreen(m.x, SHOT_METER.high, m.z)`.
- Produces, in `hud.js`: `update` draws `ui.meter` (absent or `null`: hidden) into the elements below.

The page gains this, after `#ftBox`:

```html
<div id="shotMeter" hidden aria-hidden="true">
  <div id="shotBar"><div id="shotBand"></div><div id="shotFill"></div></div>
  <p id="shotMark" hidden></p>
  <p id="shotLabel"></p>
</div>
```

```css
/* The shot meter: the free-throw bar's track, zone and marker colours, stood on end beside the shooter. */
#shotMeter { position: fixed; transform: translateX(-50%); pointer-events: none; text-align: center; font-size: 12px; font-weight: 700; text-shadow: 0 1px 2px #000; }
#shotBar { position: relative; width: 12px; margin: 0 auto; box-sizing: border-box; background: #23262e; border: 2px solid #fff; }
#shotBand { position: absolute; left: 0; right: 0; top: 0; box-sizing: border-box; background: #2e8b57; border-bottom: 3px solid #fff; }
#shotFill { position: absolute; left: 2px; right: 2px; bottom: 0; background: #ffd257; outline: 1px solid #000; }
#shotMeter.green #shotBar { border-color: #6fdc8c; }
#shotMeter.green #shotFill { background: #6fdc8c; }
#shotMark, #shotLabel { margin: 2px 0 0; white-space: nowrap; }
```

How `hud.js` fills it, from `m = ui.meter`: `#shotMeter` is placed with `style.left = m.head.x` and `style.top = m.head.y`, in whole pixels; `#shotBar` is `m.foot.y - m.head.y` pixels high and never less than 40; `#shotFill` is `m.fill` of the bar high and `#shotBand` is `m.band.to - m.band.from` of it, both as a percentage to one decimal; `#shotBand` is hidden when there is no band; `#shotLabel` reads `m.level`; `#shotMark` is hidden until the meter is frozen and then reads `Blocked` if the shot was blocked, otherwise `✓`, `Early` or `Late`; `#shotMeter` has the class `green` only for a green release that was not blocked. Colour is never the only signal: the band has its white edge, and the result is a tick or a word.

- [ ] **Step 1: Write the failing tests**

```js
// tests/meter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shotMeter, SHOT_METER } from '../src/render/motion.js';
import { SHOT_BEST, giveBall, greenAt, shotWindow } from '../src/sim/players.js';
import { step } from '../src/sim/step.js';
import { DT, RIM } from '../src/sim/tuning.js';
import { live, idle, only, at } from './helpers.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
const hold = id => only(id, { shoot: true });
// Player 0, 3 m from the hoop, holds Space for `n` steps and lets go on the next. `gap`: how far his nearest defender stands.
function shoot(n, gap = 2.5) {
  const s = live();
  at(s, 0, RIM.x - 3, 0); at(s, 3, RIM.x - 3 + gap, 0);
  for (let i = 0; i < n; i++) step(s, hold(0), DT);
  return s;
}

test('no meter until someone on your team gathers; then it stands beside him, on the side away from the hoop', () => {
  const s = shoot(0);
  assert.equal(shotMeter(s), null);
  step(s, hold(0), DT);
  const m = shotMeter(s);
  assert.deepEqual([m.player, m.x, m.z, m.fill, m.level, m.frozen], [0, RIM.x - 3 - SHOT_METER.aside, 0, 0, 'Open', null]);
});

test('the fill runs from empty at the press to full at the best moment, and drains after it', () => {
  const fills = [];
  const s = shoot(1);
  for (let i = 1; i < 45; i++) { step(s, hold(0), DT); fills[i] = shotMeter(s).fill; }
  assert.ok(near(fills[12], (12 * DT) / SHOT_BEST) && near(fills[29], 1 - (29 * DT - SHOT_BEST) / SHOT_BEST), `${fills[12]} ${fills[29]}`);
  assert.equal(Math.max(...fills.slice(1)), fills[29]);                   // fullest on the step nearest the best moment
  for (let i = 2; i < 45; i++) assert.ok(i <= 29 ? fills[i] > fills[i - 1] : fills[i] < fills[i - 1], `step ${i}`);
});

test('the band is the green window to scale: the fill is inside it exactly when a release would be green', () => {
  for (const gap of [2.5, 1.5, 0.8]) {
    const s = shoot(1, gap);
    for (let i = 1; i < 45; i++) {
      step(s, hold(0), DT);
      const m = shotMeter(s), p = s.players[0];
      assert.equal(m.fill >= m.band.from, greenAt(shotWindow(s, p), p.shotT), `gap ${gap}, step ${i}`);
      assert.equal(m.band.to, 1);
    }
  }
  const open = shotMeter(shoot(1)).band, guarded = shotMeter(shoot(1, 1.5)).band;
  assert.ok(near(1 - open.from, 3.5 * DT / SHOT_BEST) && near(1 - guarded.from, 2.5 * DT / SHOT_BEST));
});

test('the label names the contest level, and the band shrinks as a defender closes during the gather', () => {
  const s = shoot(5);
  const before = shotMeter(s);
  at(s, 3, RIM.x - 3 + 0.8, 0);
  const after = shotMeter(s);
  assert.deepEqual([before.level, after.level], ['Open', 'Contested']);
  assert.ok(after.band.from > before.band.from);
});

test('too far out there is no band at all', () => {
  const s = live(); at(s, 0, 0, 0);
  step(s, hold(0), DT);
  assert.equal(shotMeter(s).band, null);
});

test('at the release it freezes and says green, early or late, and it stays for 1.2 seconds', () => {
  const verdict = n => { const s = shoot(n); step(s, idle(), DT); return [s, shotMeter(s)]; };
  const [s, green] = verdict(29);
  assert.deepEqual([green.frozen, green.fill >= green.band.from, green.level], [{ verdict: 'green', blocked: false }, true, 'Open']);
  assert.equal(verdict(22)[1].frozen.verdict, 'early');
  assert.equal(verdict(36)[1].frozen.verdict, 'late');
  assert.ok(verdict(22)[1].fill < verdict(22)[1].band.from);
  const fill = green.fill;
  for (let i = 0; i < 70; i++) step(s, idle(), DT);                        // 1.18 s after the release
  assert.equal(shotMeter(s).fill, fill);
  step(s, idle(), DT); step(s, idle(), DT);
  assert.equal(shotMeter(s), null);
});

test('it goes at once on a travel, and when the shot is passed up', () => {
  const s = shoot(45);
  assert.notEqual(shotMeter(s), null);
  step(s, hold(0), DT);                                                   // he lands with the ball
  assert.deepEqual([s.call.kind, shotMeter(s)], ['travel', null]);
  const t = shoot(10);
  step(t, only(0, { shoot: true, pass: true }), DT);
  assert.equal(shotMeter(t), null);
});

test('the other team never gets a meter, and nothing is drawn on the start and final screens', () => {
  const s = live();
  giveBall(s, s.players[3]);
  for (let i = 0; i < 30; i++) { step(s, hold(3), DT); assert.equal(shotMeter(s), null); }
  step(s, idle(), DT);
  assert.deepEqual([s.ball.mode, shotMeter(s)], ['shot', null]);
  const t = shoot(29);
  step(t, idle(), DT);
  t.phase = 'final';
  assert.equal(shotMeter(t), null);
});

test('a blocked release is marked as blocked, whatever its timing', () => {
  const s = shoot(29);
  s.shot = { shooter: 0, t: 29 * DT, at: s.time, ...shotWindow(s, s.players[0]), green: true, blocked: true };
  s.players[0].shooting = false;
  assert.deepEqual(shotMeter(s).frozen, { verdict: 'green', blocked: true });
});
```

```js
// tests/hud.test.js
test('the shot meter is drawn beside the shooter: how full, the band, the level, and after the release a tick or a word', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els;
  const show = meter => hud.update(s, 'webgl2', { paused: false, pick: null, meter });
  const live = { fill: 0.5, band: { from: 0.8, to: 1 }, level: 'Guarded', frozen: null, foot: { x: 400, y: 380.4 }, head: { x: 402.2, y: 290 } };
  show(live);
  assert.deepEqual([e.shotMeter.hidden, e.shotMeter.style.left, e.shotMeter.style.top, e.shotBar.style.height], [false, '402px', '290px', '90px']);
  assert.deepEqual([e.shotFill.style.height, e.shotBand.hidden, e.shotBand.style.height, e.shotLabel.textContent, e.shotMark.hidden, e.shotMeter.className],
    ['50%', false, '20%', 'Guarded', true, '']);
  show({ ...live, fill: 0.97, frozen: { verdict: 'green', blocked: false } });
  assert.deepEqual([e.shotFill.style.height, e.shotMark.hidden, e.shotMark.textContent, e.shotMeter.className], ['97%', false, '\u2713', 'green']);
  show({ ...live, frozen: { verdict: 'early', blocked: false } });
  assert.deepEqual([e.shotMark.textContent, e.shotMeter.className], ['Early', '']);
  show({ ...live, frozen: { verdict: 'late', blocked: false } });
  assert.equal(e.shotMark.textContent, 'Late');
  show({ ...live, fill: 0.97, frozen: { verdict: 'green', blocked: true } });
  assert.deepEqual([e.shotMark.textContent, e.shotMeter.className], ['Blocked', '']);            // a block is never shown as a make
  show({ ...live, band: null, level: 'Open' });
  assert.deepEqual([e.shotBand.hidden, e.shotLabel.textContent, e.shotMark.hidden], [true, 'Open', true]);
  show({ ...live, foot: { x: 400, y: 300 } });
  assert.equal(e.shotBar.style.height, '40px');                                                  // far from the camera it is still readable
  show(null);
  assert.equal(e.shotMeter.hidden, true);
  hud.update(s, 'webgl2');
  assert.equal(e.shotMeter.hidden, true);
});

test('the page has the shot meter, and it is not announced', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['shotMeter', 'shotBar', 'shotBand', 'shotFill', 'shotMark', 'shotLabel']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<div id="shotMeter"[^>]*aria-hidden="true"/);
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/meter.test.js tests/hud.test.js`
Expected: FAIL (`shotMeter` is not exported; the page has no `shotMeter`).

- [ ] **Step 3: Implement** `shotMeter`, then the page, `hud.js`, `toScreen` and the two lines in `main.js`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS, including "only the score announcement is a live region".

- [ ] **Step 5: Check it in the browser**

| Check | Expected |
|---|---|
| Space with the ball | A slim upright bar appears at once on the side of the shooter away from the hoop, about knee to shoulder; it does not rise with his jump and never covers the ball |
| Holding Space | The fill climbs to the top in about half a second, then falls |
| Open and close to the hoop; then with a defender on you; then from half court | A long green band at the top with "Open"; a short one with "Guarded" or "Contested"; no band at all |
| Letting go inside the band | The bar turns green with a tick and the shot goes in, every time |
| Letting go below it, early and late | The fill stops where it was, with "Early" or "Late"; the bar stays about a second |
| Holding Space until he lands | The bar is gone on the travel |
| The computer's team shoots | No meter |
| G, and a narrow window | The meter stays beside the shooter |

- [ ] **Step 6: Commit**

```bash
git add src/render/motion.js src/render/hud.js src/render/scene.js src/main.js index.html tests/meter.test.js tests/hud.test.js
git commit -m "feat: a shot meter beside the shooter shows the green window"
```

---

### Task 6: Steps, a dribble and a landing from Mixamo

**Files:**
- Modify: `tools/blender/build_motion.py`, `tests/models.test.js`, `assets/CREDITS.md`, `assets/source/README.md`
- Rebuild: `assets/motion.glb`, `assets/motion.json`

**Interfaces:**
- Consumes: `build_motion.py` as it is: `read_clip(name, rig)` gives a clip as a list of frames, each `{bone name: 4x4 matrix in the rig's own space}`; `on_the_spot(frames)` takes the travel out and returns the speed; `airborne(frames, rig)` keeps the frames of `jump.fbx` with both feet off the floor; `write_action(rig, name, frames)` keys frames onto the rig; `filmstrip` renders six frames of a motion. In Blender the player faces −Y, his left is +X and up is +Z. `jump.fbx` (71 frames, already downloaded) carries on after the landing.
- Produces: six more motions in `assets/motion.glb`, and more facts in `assets/motion.json`.

| Motion | Kind | From |
|---|---|---|
| `strafeLeft`, `strafeRight` | loop | Mixamo: a crouched shuffle to each side if one can be found, otherwise the upright strafe walks |
| `backpedal` | loop | Mixamo: a crouched back-step if one can be found, otherwise the upright backward walk |
| `dribble` | loop | Mixamo: a standing dribble with the right hand |
| `dribbleLeft` | loop | `dribble`, mirrored by the build |
| `land` | held | The frames of `jump.fbx` that follow the landing |

More facts in `assets/motion.json`, and one more function in the build:

- `motion.json`, every clip: `kind` (`'loop'`, or `'held'` when the game sets how far through it is, or `'once'`); `loop` stays and is true exactly when `kind` is `'loop'`.
- `gaits` gains `strafeLeft`, `strafeRight` and `backpedal`: metres a second, measured before the travel is taken out.
- `clips.strafeLeft`, `clips.strafeRight`, `clips.backpedal` gain `crouch`: how many metres lower the hips sit, on average over the clip, than their average in `idle`.
- `clips.walk`, `clips.run`, `clips.sprint` gain `strike: { left, right }`: the share of the cycle (0 to 1) at which that foot is furthest ahead of the hips along the direction of travel, which is when it lands.
- `clips.dribble` gains `push` (the share of the cycle at which the right hand is lowest) and `bounces` (how many times it reaches a low point in one cycle, at least 1). `dribbleLeft` has the same timing and the game reads these two from `clips.dribble`.
- `build_motion.py`: `mirrored(frames, rig) -> frames`, the same motion with left and right exchanged. For each bone `B` with twin `T` (`Left` and `Right` exchanged in the name, itself for the middle bones): `new[B] = S · old[T] · rest[T]⁻¹ · S · rest[B]`, where `S` flips x and `rest` is the bone's `matrix_local`. Written like this it does not depend on any bone's own axes. The build stops if the rest pose is not symmetrical to 5 mm.

- [ ] **Step 1: Write the failing tests** (`tests/models.test.js`)

```js
// How far a bone turns from its first pose over a motion: 0 for not at all.
const swing = keys => Math.max(...keys.map(q => 1 - Math.abs(q.reduce((sum, v, i) => sum + v * keys[0][i], 0))));

test('the defensive steps, the dribble and the landing are in the motion file with their facts', () => {
  const names = motion.json.animations.map(a => a.name);
  for (const name of ['strafeLeft', 'strafeRight', 'backpedal', 'dribble', 'dribbleLeft', 'land']) assert.ok(names.includes(name), `no ${name}`);
  for (const gait of ['strafeLeft', 'strafeRight', 'backpedal']) {
    assert.ok(facts.gaits[gait] > 0.5 && facts.gaits[gait] < 4, `${gait}: ${facts.gaits[gait]} m/s`);
    assert.ok(hipsDrift(gait) < 0.25, `${gait} drifts ${hipsDrift(gait)} m`);
    assert.ok(facts.clips[gait].crouch > -0.05 && facts.clips[gait].crouch < 0.6, `${gait}: crouch ${facts.clips[gait].crouch}`);
  }
  const { push, bounces } = facts.clips.dribble;
  assert.ok(push >= 0 && push < 1 && Number.isInteger(bounces) && bounces >= 1, JSON.stringify(facts.clips.dribble));
  for (const [name, clip] of Object.entries(facts.clips)) assert.equal(clip.loop, clip.kind === 'loop', name);
  for (const name of LOOPS) assert.equal(facts.clips[name].kind, 'loop', name);
  assert.deepEqual([facts.clips.jump.kind, facts.clips.land.kind], ['held', 'held']);
});

test('each striding gait says where in its cycle each foot lands, half a cycle apart', () => {
  for (const gait of ['walk', 'run', 'sprint']) {
    const { left, right } = facts.clips[gait].strike;
    assert.ok(left >= 0 && left < 1 && right >= 0 && right < 1, `${gait}: ${left} ${right}`);
    assert.ok(Math.abs(((((left - right) % 1) + 1) % 1) - 0.5) < 0.15, `${gait}: the feet land ${left} and ${right} of the way through`);
  }
});

test('the left-hand dribble is the right-hand one in a mirror', () => {
  const moves = (name, side) => swing(track(name, 'rotation', `mixamorig:${side}ForeArm`));
  assert.ok(moves('dribble', 'Right') > 2 * moves('dribble', 'Left'), 'the dribble is not a right-hand one');
  assert.ok(moves('dribbleLeft', 'Left') > 2 * moves('dribbleLeft', 'Right'), 'the mirror did not exchange the arms');
  assert.ok(Math.abs(moves('dribbleLeft', 'Left') - moves('dribble', 'Right')) < 0.01);
  const here = track('dribble', 'translation'), there = track('dribbleLeft', 'translation');
  here.forEach(([x, y, z], i) => assert.ok(Math.hypot(there[i][0] + x, there[i][1] - y, there[i][2] - z) < 0.002, `key ${i}: the hips are not mirrored`));
});

test('the landing carries on from the pose the jump ends in, and the knees give', () => {
  const end = track('jump', 'translation').at(-1), land = track('land', 'translation');
  assert.ok(Math.hypot(...land[0].map((v, i) => v - end[i])) < 0.01, 'the landing does not start where the jump ends');
  for (const bone of ['mixamorig:LeftUpLeg', 'mixamorig:RightLeg', 'mixamorig:Spine']) {
    const a = track('jump', 'rotation', bone).at(-1), b = track('land', 'rotation', bone)[0];
    assert.ok(Math.abs(a.reduce((sum, v, i) => sum + v * b[i], 0)) > 0.999, `${bone} jumps between the two motions`);
  }
  const sink = land[0][1] - land.at(-1)[1];
  assert.ok(sink > 0.03 && sink < 0.3, `the hips sink ${sink} m`);
  assert.ok(facts.clips.land.duration >= 0.06 && facts.clips.land.duration <= 0.35, `${facts.clips.land.duration} s`);
});
```

Three older tests name exactly five motions and are loosened. `LOOPS` becomes `['idle', 'walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backpedal', 'dribble', 'dribbleLeft']`, so "a looping motion ends in the pose it starts in" covers the new loops. "The motion file holds the five stage 1 motions and no meshes" checks that the five are included. In "each gait has a natural speed…", the list of facts must equal the list of motions in the file (`Object.keys(facts.clips).sort()` against `motion.json.animations.map(a => a.name).sort()`), the loop checks go (the new test has them), and a clip may be as short as 0.05 s.

- [ ] **Step 2: Run them**

Run: `node --test tests/models.test.js`
Expected: FAIL (`no strafeLeft`).

- [ ] **Step 3: Find and download the clips** in the built-in browser, with the settings in Global Constraints. Before the first download, say which clips you are about to fetch. If Mixamo is logged out, ask the owner only to sign in.

Search Mixamo's animations for a crouched defensive shuffle first, with each of these words: `crouch`, `shuffle`, `sidestep`, `goalkeeper`. A clip is good enough when all of these hold: it loops; the body travels sideways without turning; the knees stay bent, with the hips at least 0.1 m below standing height all the way through; the feet never cross; the arms are out or low, not holding something or guarding the face; and it moves at 1 to 3 m/s. If it exists for one side only, download that side and make the other with `mirrored`. If none is good enough, use the upright ones.

| Saved as | First choice | Fallback (Mixamo's name; its description) |
|---|---|---|
| `strafeLeft.fbx` | A crouched shuffle to his left | Left Strafe Walk; Walking Strafe To The Left |
| `strafeRight.fbx` | The same to his right, or the mirror | Right Strafe Walk; Walking Strafe To The Right |
| `backpedal.fbx` | A crouched back-step (search `backpedal`, `crouch walk back`) | Walking Backwards; Walking Backwards |
| `dribble.fbx` | Dribble; Dribbling Basketball With Right Arm: standing, body upright, right hand | The plainest standing right-hand dribble in the search for `dribble` |

Say in your report which clips were taken and whether the steps are crouched: with upright ones a defender stands up a little at each step, which the design accepts.

- [ ] **Step 4: Extend `build_motion.py`.** What is decided:

- The table of Mixamo clips gives each its kind; the three steps join `GAITS`; every clip's facts get `kind`.
- A step must travel the way its name says before the travel is taken out: `strafeLeft` toward +X, `strafeRight` toward −X, `backpedal` toward +Y, each with less than a third as much travel across. The build stops, naming the clip, if not.
- `crouch`, `strike`, `push` and `bounces` are measured from the frames as the Interfaces block defines them. `strike` is measured before the travel is taken out.
- `land`: the frames of `jump.fbx` from the last frame `jump` keeps (the first frame back on the floor) to the frame within the next ten at which the hips are lowest. Nothing is shifted, so it starts in exactly the pose `jump` ends in.
- `dribbleLeft` is `mirrored(dribble)`.
- `--shots` renders a film strip for every motion, as now.

- [ ] **Step 5: Build, look, test**

Run: `blender-4.5 --background --python tools/blender/build_motion.py -- --shots <scratch>/shots`, then `npm test`
Expected: all PASS. In the film strips: side-steps that travel to the side named, with the feet not crossing; a backward step; a right-hand dribble and its mirror image with the ball hand on the left; a landing in which the knees bend.

- [ ] **Step 6: Commit.** In `assets/CREDITS.md` add a row per clip downloaded, with Mixamo's name and description, and say that `dribbleLeft` and `land` are made from `dribble` and `jump`. In `assets/source/README.md` add the new file names to the Motion section and one line each on `kind`, `crouch`, `strike`, `push` and `bounces`.

```bash
git add tools/blender/build_motion.py assets/motion.glb assets/motion.json assets/CREDITS.md assets/source/README.md tests/models.test.js
git commit -m "feat: side-steps, a back-step, a dribble for each hand and a landing"
```

---

### Task 7: The moves made by hand

**Files:**
- Create: `tools/blender/poses.py`, `tests/poses.test.js`
- Modify: `tools/blender/build_motion.py`, `tests/models.test.js`, `assets/source/README.md`
- Rebuild: `assets/motion.glb`, `assets/motion.json`

**Interfaces:**
- Consumes: from Task 6, `write_action`, `filmstrip`, `mirrored(frames, rig)` and the `kind` fact. The skeleton of the player the motions are built on (1.96 m tall): hips 1.13 m up, shoulder joints 1.62 m, the head bone 1.74 m (the top of the head is 0.22 m above it), upper arm 0.30 m, forearm 0.31 m, thigh 0.51 m, shin 0.50 m. In the game a motion is played on one layer only: the **legs** layer is the hips, the legs and feet and the lowest spine bone (`Spine`); the **arms** layer is `Spine1`, `Spine2`, the neck, head, shoulders, arms and hands.
- Produces: thirteen more motions in `assets/motion.glb`, keyed at 30 frames a second, with `kind` and `duration` in `motion.json`.

| Motion | Layer it is made for | Kind | Length | What it shows |
|---|---|---|---|---|
| `stance` | whole body | loop | 2 s | Feet at least 0.7 m apart, knees bent so the hips sit 0.25 m lower than standing, trunk leaning forward, arms out wide and low with open hands between knee and hip height; a slow sway |
| `gather` | legs | held | 0.3 s | From standing, the knees bend until the hips are 0.08 m lower at 55% of the clip, then straighten; back at standing height at the end; feet flat throughout |
| `hold` | arms | loop | 2 s | The ball in both hands on the right hip, elbows out, the upper trunk bent forward and turned a little to the right; a slight sway |
| `holdLeft` | arms | loop | 2 s | `hold`, mirrored by the build |
| `shoot` | arms | held | 0.3 s | Two beats. To 55%: the ball is taken in both hands at the waist and the upper trunk bends a little (the dip). To 100%: a fast rise to the set point, the ball above the forehead, the right elbow under it, the left hand on its side |
| `follow` | arms | held | 0.5 s | By 20%: the right arm straight up and a little forward, wrist snapped down, the left hand falling away. Unchanged to 60%. To 100%: both arms relax to the sides |
| `freeThrow` | arms | once | 0.9 s | The ball from the hip to the set point by 45%; the right arm extends by 60%; held to 85%; relaxed at the end |
| `pass` | arms | once | 0.35 s | Both arms straight out from the chest, already there at the first key; held to 45%; relaxed at the end |
| `catch` | arms | held | 0.35 s | Arms at the sides at the start; at 60% both hands out in front at chest height, a ball's width apart; at the end pulled in to the body |
| `reach` | arms | once | 0.4 s | The right arm forward and down, fully out by 0.07 s; held to 50%; back at the end |
| `handUp` | arms | loop | 1 s | The right arm straight up, hand open; the left arm low; a small sway |
| `contest` | arms | held | 0.47 s | Both arms straight up by 30% and held |
| `tip` | arms | held | 0.47 s | The right arm straight up, reaching, by 40% and held; the left arm low |

The rules act on the key press, so `pass` and `reach` show what follows the action: there is no wind-up. `shoot` ends a little below the height the rules release from (2.3 m above his feet): that is as high as a bent arm goes, and the game blends the ball across the gap.

How they are made:

- `poses.py`:
  - `POSES = { name: { 'kind', 'seconds', 'keys': [(share of the length, { bone: (x, y, z) }), …] } }`. A bone is named without its `mixamorig:` prefix. `(x, y, z)` are degrees turned about the rig's own axes as it stands at rest (X toward his left, Y toward his back, Z up), applied in that order. Each bone's turn is on top of its parent's, so a raised upper arm carries the forearm with it. A bone a key leaves out is at rest.
  - `pose_frames(rig, pose, fps) -> frames`, in the form `read_clip` returns. Between keys each bone's turn is interpolated the short way round, easing in and out. For a pose that turns a leg bone, the hips are then moved down or up on every frame so that the lower of the two toes is at the height it rests at.
- `build_motion.py` keys every pose after the Mixamo clips, writes `holdLeft = mirrored(hold)`, and records `kind` and `duration` for each.

- [ ] **Step 1: Write the failing tests**

```js
// tests/models.test.js
const MADE = { stance: 'loop', gather: 'held', hold: 'loop', holdLeft: 'loop', shoot: 'held', follow: 'held', freeThrow: 'once', pass: 'once', catch: 'held', reach: 'once', handUp: 'loop', contest: 'held', tip: 'held' };
const LENGTHS = { stance: 2, gather: 0.3, hold: 2, holdLeft: 2, shoot: 0.3, follow: 0.5, freeThrow: 0.9, pass: 0.35, catch: 0.35, reach: 0.4, handUp: 1, contest: 0.47, tip: 0.47 };

test('the hand-made motions are in the file, each with its kind and its length', () => {
  for (const [name, kind] of Object.entries(MADE)) {
    assert.ok(motion.json.animations.some(a => a.name === name), `no ${name}`);
    assert.equal(facts.clips[name].kind, kind, name);
    assert.ok(Math.abs(facts.clips[name].duration - LENGTHS[name]) < 0.035, `${name}: ${facts.clips[name].duration} s`);
  }
});
```

Add `'stance'`, `'hold'`, `'holdLeft'` and `'handUp'` to `LOOPS`.

```js
// tests/poses.test.js
// The hand-made motions, measured in the shipped file: each is held at a moment with the real mixer and the bones are read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const data = readFileSync('assets/motion.glb');
const gltf = await new Promise((ok, bad) => new GLTFLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', ok, bad));
const BONES = ['Hips', 'Spine2', 'Head', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];

// Where those bones are, in metres, with motion `name` held at `share` of its length. `mid` is the point between the wrists.
// The player stands on the floor at the origin and faces +z; his left is +x. LeftArm and RightArm are the shoulder joints,
// LeftLeg and RightLeg the knees, LeftFoot and RightFoot the ankles.
function posed(name, share) {
  const mixer = new THREE.AnimationMixer(gltf.scene), clip = gltf.animations.find(c => c.name === name);
  assert.ok(clip, `no ${name}`);
  const action = mixer.clipAction(clip).play();
  action.timeScale = 0; action.time = share * clip.duration;
  mixer.update(0);
  gltf.scene.updateMatrixWorld(true);
  const at = Object.fromEntries(BONES.map(bone => [bone, gltf.scene.getObjectByName(`mixamorig${bone}`).getWorldPosition(new THREE.Vector3())]));
  at.mid = at.LeftHand.clone().add(at.RightHand).multiplyScalar(0.5);
  at.apart = at.LeftHand.distanceTo(at.RightHand);
  return at;
}
const stood = posed('idle', 0);

test('the stance is deep and wide, with the arms out low', () => {
  for (const share of [0, 0.5]) {
    const p = posed('stance', share), lower = stood.Hips.y - p.Hips.y;
    assert.ok(lower > 0.2 && lower < 0.3, `hips ${lower} m lower`);
    assert.ok(p.LeftFoot.x - p.RightFoot.x > 0.7, `feet ${p.LeftFoot.x - p.RightFoot.x} m apart`);
    assert.ok(Math.abs(p.LeftFoot.y - stood.LeftFoot.y) < 0.05 && Math.abs(p.RightFoot.y - stood.RightFoot.y) < 0.05, 'a foot is off the floor or under it');
    for (const side of ['Left', 'Right']) {
      const hand = p[`${side}Hand`];
      assert.ok(hand.y < p.Hips.y && hand.y > p[`${side}Leg`].y, `${side} hand ${hand.y} m up`);          // between knee and hip
      assert.ok(Math.abs(hand.x) > 0.45, `${side} hand only ${Math.abs(hand.x)} m out`);
    }
  }
});

test('the gather dips the knees and is back at standing height when his feet leave the floor', () => {
  const start = posed('gather', 0), low = posed('gather', 0.55), end = posed('gather', 1), dip = start.Hips.y - low.Hips.y;
  assert.ok(dip > 0.06 && dip < 0.12, `dips ${dip} m`);
  assert.ok(Math.abs(end.Hips.y - start.Hips.y) < 0.015);
  for (const p of [low, end]) assert.ok(Math.abs(p.LeftFoot.y - start.LeftFoot.y) < 0.03 && Math.abs(p.RightFoot.y - start.RightFoot.y) < 0.03, 'a foot left the floor');
});

test('a held ball sits on the hip, right or left, not in front of the chest', () => {
  const right = posed('hold', 0), left = posed('holdLeft', 0);
  assert.ok(right.mid.x < -0.12 && Math.abs(right.mid.y - right.Hips.y) < 0.2, `the ball is ${right.mid.x} m across and ${right.mid.y} m up`);   // his right is -x
  assert.ok(right.apart > 0.2 && right.apart < 0.4, `wrists ${right.apart} m apart`);                                                         // a ball between them
  assert.ok(left.mid.x > 0.12 && Math.abs(left.mid.x + right.mid.x) < 0.02 && Math.abs(left.mid.y - right.mid.y) < 0.02, 'holdLeft is not hold in a mirror');
});

test('the shot dips to the waist, and the ball is at the set point above the forehead when the gather ends', () => {
  const dip = posed('shoot', 0.55), set = posed('shoot', 1);
  assert.ok(dip.mid.y > 0.95 && dip.mid.y < 1.35, `the dip holds the ball ${dip.mid.y} m up`);
  assert.ok(set.mid.y > set.Head.y + 0.2 && set.mid.y < 2.3, `the set point is ${set.mid.y} m up`);
  assert.ok(Math.hypot(set.mid.x - set.Head.x, set.mid.z - set.Head.z) < 0.3 && set.mid.z > set.Head.z - 0.05, 'the ball is not over the forehead');
  assert.ok(set.apart < 0.4);
});

test('the follow-through is up within a tenth of a second, stays up, and comes down at the end', () => {
  for (const share of [0.2, 0.6]) { const p = posed('follow', share); assert.ok(p.RightHand.y > p.Head.y + 0.35, `at ${share} the hand is ${p.RightHand.y} m up`); }
  const end = posed('follow', 1);
  assert.ok(end.RightHand.y < end.RightArm.y, 'the arm never comes down');
});

test('the free throw is a set shot: up to the set point, a follow-through, then down', () => {
  const set = posed('freeThrow', 0.45);
  assert.ok(set.mid.y > set.Head.y + 0.15, `the ball only reaches ${set.mid.y} m`);
  for (const share of [0.6, 0.85]) { const p = posed('freeThrow', share); assert.ok(p.RightHand.y > p.Head.y + 0.35, `at ${share}`); }
  const end = posed('freeThrow', 1);
  assert.ok(end.RightHand.y < end.RightArm.y, 'the arm never comes down');
});

test('a pass shows what follows the throw: the arms are already out at its first frame', () => {
  const out = posed('pass', 0), end = posed('pass', 1);
  for (const side of ['Left', 'Right']) {
    const hand = out[`${side}Hand`];
    assert.ok(hand.z > out.Spine2.z + 0.4 && Math.abs(hand.y - out.Spine2.y) < 0.25, `${side} hand is not out in front of the chest`);
    assert.ok(end[`${side}Hand`].z < hand.z - 0.2, `${side} arm never relaxes`);
  }
});

test('the catch reaches out, then pulls the ball in', () => {
  const out = posed('catch', 0.6), end = posed('catch', 1);
  assert.ok(out.mid.z > out.Spine2.z + 0.3 && Math.abs(out.mid.y - out.Spine2.y) < 0.3, 'the hands are not out at chest height');
  assert.ok(out.apart > 0.2 && out.apart < 0.45, `hands ${out.apart} m apart`);
  assert.ok(end.mid.z < out.mid.z - 0.1, 'the ball is never pulled in');
});

test('a steal reach is out within 0.07 s and comes back', () => {
  const out = posed('reach', 0.07 / 0.4), end = posed('reach', 1);
  assert.ok(out.RightHand.z > out.Spine2.z + 0.4 && out.RightHand.y < out.RightArm.y, `after 0.07 s the hand is ${out.RightHand.z} m forward`);
  assert.ok(end.RightHand.z < out.RightHand.z - 0.2, 'the arm never comes back');
});

test('a hand goes up to a shooter: the right arm high, the left low', () => {
  for (const share of [0, 0.5]) {
    const p = posed('handUp', share);
    assert.ok(p.RightHand.y > p.Head.y + 0.35 && p.LeftHand.y < p.LeftArm.y, `at ${share}`);
  }
});

test('a contest ends with both arms up, a tip with one reaching', () => {
  const contest = posed('contest', 1), tip = posed('tip', 1);
  assert.ok(contest.LeftHand.y > contest.Head.y + 0.35 && contest.RightHand.y > contest.Head.y + 0.35);
  assert.ok(tip.RightHand.y > tip.Head.y + 0.4 && tip.LeftHand.y < tip.LeftArm.y);
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/models.test.js tests/poses.test.js`
Expected: FAIL (`no stance`).

- [ ] **Step 3: Write `poses.py` and the keying in `build_motion.py`**, one motion at a time: build with `--shots`, look at its film strip, run `node --test tests/poses.test.js`, and adjust the turns until the strip matches the table and its test passes. Poses made for the arms layer turn `Spine1` and `Spine2` for the trunk and never `Spine`; `gather` turns only leg bones.

Expected for every strip: nothing passes through the body, shoulders are not shrugged to the ears, wrists are not twisted backwards, and a loop's sway is small enough that the hands do not wander.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit.** In `assets/source/README.md`, say that `poses.py` holds the hand-made motions and how a pose is written.

```bash
git add tools/blender/poses.py tools/blender/build_motion.py assets/motion.glb assets/motion.json assets/source/README.md tests/models.test.js tests/poses.test.js
git commit -m "feat: stance, gather, hold, shot, follow-through, pass, catch, reach, hand up, contest and tip, made by hand"
```

---

### Task 8: Which motion, as plain logic

**Files:**
- Create: `tests/moves.test.js`
- Modify: `src/render/motion.js`, `tests/motion.test.js`

**Interfaces:**
- Consumes: `facts` from `assets/motion.json` (`gaits`, `clips[name].duration`); today's `legMotion(player, gaits, last)`; from the simulation `gathering(player)`, `player.shotT`, `player.takeoff`, `SHOT.gather`, `ball.target`, `onFloor`, `PLAYER`, `BALL`.
- Produces, all in `motion.js`:
  - `LEG_CLIPS = ['idle', 'stance', 'walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backpedal', 'jump', 'land', 'gather']` and `ARM_CLIPS = ['dribble', 'dribbleLeft', 'hold', 'holdLeft', 'shoot', 'follow', 'freeThrow', 'pass', 'catch', 'reach', 'handUp', 'contest', 'tip']`, both frozen.
  - `MOTION` gains `guardDist: 4`, `guardSpeed: 2.2` (walking pace: above it a defender turns and runs), `guardStick: 0.4`, `sideways: 50` (degrees either side of straight ahead that still count as forward, and the same either side of straight back as backward), `land: 0.12`, `followHold: 0.6`, `reachBefore: 0.2`, `catchReach: 0.6`, `pullIn: 0.15`, `handUpDist: 2`, `handSide: 0.3`.
  - `airTime(player) -> seconds`: `2 * (player.takeoff || PLAYER.jumpV) / BALL.gravity`. `jumpShare(player)`: `player.jumpT / airTime(player)`, at most 1. `AIR_TIME` stays for the older tests.
  - `manOf(state, player)`: the opponent in the same `slot`. `defending(state, player) -> boolean`: the phase is `live` or `inbound` and the other team has possession.
  - `dribbleHand(state, player, last = 'right') -> 'left' | 'right'`: the hand away from the nearest opponent. If he is further than `guardDist`, or less than `handSide` metres to either side of the line the player is `facing` along, the answer is `last`.
  - `newMarks() -> marks` and `noteChanges(marks, state, dt)`: what the renderer remembers from frame to frame, per player id. On the first call nothing counts as having just happened: it only records what it sees. From then on:
    - `marks.pass[id]`, `.release[id]`, `.catch[id]`, `.reach[id]`, `.land[id]`, `.switched[id]`: seconds since it last happened, `Infinity` if never; each grows by `dt` and is set to 0 on the frame the thing is noticed. A **pass**: he held the ball, nobody does, and `ball.mode` is `'pass'`. A **release**: he held the ball, nobody does, and either `ball.mode` is `'shot'` with him as `ball.shooter` or he was `shooting` on the last frame (a blocked shot). A **catch**: he holds the ball and did not. A **reach**: his `stealCooldown` is higher than it was. A **landing**: he was in the air and is on the floor. **Switched**: `marks.hand[id]` changed.
    - `marks.guard[id]`: he is `defending`, on the floor, within `guardDist` of his man, and slower than `guardSpeed`, or than `guardSpeed + guardStick` if he was guarding on the last frame.
    - `marks.hand[id]`: `dribbleHand(state, player, marks.hand[id])`, starting `'right'`.
  - `drawnFacing(state, player, marks) -> radians`: toward his man when `marks.guard[id]`, otherwise `player.facing`. The rules never read it.
  - `legLook(state, player, marks) -> { facing, defending, guarding, crouch, landed }`: `drawnFacing`, `defending`, `marks.guard[id]`, whether he holds a ball he has picked up (`held`, and not the inbounder), and `marks.land[id]`.
  - `legMotion(player, gaits, last, look = null) -> { clip, rate } | { clip, at }`: the table below.
  - `passArrival(state, player) -> seconds`: when a pass is in the air for him (`ball.mode` is `'pass'`, nobody holds it, `ball.target` is his id), the ball's distance from him along the floor less `PLAYER.pickupRadius`, not below 0, over its speed along the floor; otherwise `Infinity`.
  - `armMotion(player, state, marks, facts) -> { clip, at } | { clip, rate } | null`: the table below. `at` runs 0 to 1; `null` means the arms follow the legs' motion.
  - `checkGaits` also requires a speed for `strafeLeft`, `strafeRight` and `backpedal`.

Legs: first match wins. Without a `look` only rows 1, 5 and 8 apply, so the game keeps playing as it is until Task 9 passes one.

| # | When | Result |
|---|---|---|
| 1 | In the air | `jump`, `at` = `jumpShare(player)` |
| 2 | `gathering(player)` | `gather`, `at` = `shotT / SHOT.gather` |
| 3 | `look.landed < MOTION.land` | `land`, `at` = `look.landed / MOTION.land` |
| 4 | Standing (as slow as `idle` is chosen today), and `look.defending` or `look.crouch` | `stance`, `rate: 1` |
| 5 | Standing | `idle`, `rate: 1` |
| 6 | `look.guarding`, travelling within `sideways` of straight back from `look.facing` | `backpedal` |
| 7 | `look.guarding`, travelling more than `sideways` from straight ahead | `strafeLeft` or `strafeRight`, toward his own left or right |
| 8 | Moving | `walk`, `run` or `sprint` by speed, as today |

In rows 6 to 8 the rate is his speed over that gait's speed, within the limits used today.

Arms: first match wins. "In the air" is `!onFloor(player)`; "has the ball" is `ball.holder === player.id`; "length" is `facts.clips[name].duration`.

| # | When | Result |
|---|---|---|
| 1 | `marks.pass[id]` is younger than `pass`'s length | `pass`, `at` = age / length |
| 2 | The phase is `freeThrow`, he is its shooter, and `marks.release[id]` is younger than `freeThrow`'s length | `freeThrow`, `at` = age / length |
| 3 | He does not have the ball, has released, and is still in the air from that jump (`marks.land[id] > marks.release[id]`) | `follow`, `at` = `min(followHold, release age / length)` |
| 4 | He does not have the ball, has released and has landed since (on the floor, `marks.land[id] <= marks.release[id]`), while the result is below 1 | `follow`, `at` = `min(followHold, release age / length) + landing age / length` |
| 5 | `player.shooting` | `shoot`, `at` = `shotT / SHOT.gather`, at most 1: the set point is reached as his feet leave the floor and held until he lets go |
| 6 | He has the ball and `marks.catch[id]` is younger than `pullIn` | `catch`, `at` = `catchReach + (1 - catchReach) * age / pullIn` |
| 7 | `passArrival(state, player) < reachBefore` | `catch`, `at` = `catchReach * (1 - arrival / reachBefore)` |
| 8 | He has the ball and is the inbounder, or has picked up his dribble (`held`), or the phase is `freeThrow`, `dead` or `quarterEnd` | `hold`, or `holdLeft` when `marks.hand[id]` is `'left'`; `rate: 1` |
| 9 | He has the ball | `dribble` or `dribbleLeft`, by `marks.hand[id]`; `rate: 1` |
| 10 | `marks.reach[id]` is younger than `reach`'s length | `reach`, `at` = age / length |
| 11 | In the air, the phase is `jumpBall` and he is a jumper (`slot === 1`) | `tip`, `at` = `jumpShare(player)` |
| 12 | In the air | `contest`, `at` = `jumpShare(player)` |
| 13 | On the floor, `defending`, and an opponent within `handUpDist` is `shooting` | `handUp`, `rate: 1` |
| 14 | Otherwise | `null` |

- [ ] **Step 1: Write the failing tests** (`tests/moves.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legMotion, armMotion, newMarks, noteChanges, drawnFacing, legLook, manOf, defending, dribbleHand, passArrival, airTime, MOTION } from '../src/render/motion.js';
import { emptyIntent } from '../src/sim/state.js';
import { giveBall, passBall, trySteal } from '../src/sim/players.js';
import { newFreeThrow, setupFreeThrow } from '../src/sim/freethrow.js';
import { step } from '../src/sim/step.js';
import { DT, PLAYER, SHOT } from '../src/sim/tuning.js';
import { live, idle, only, at, press } from './helpers.js';

const facts = { gaits: { walk: 1.8, run: 5.2, sprint: 7.3, strafeLeft: 1.5, strafeRight: 1.5, backpedal: 1.3 },
  clips: { pass: { duration: 0.35 }, follow: { duration: 0.5 }, freeThrow: { duration: 0.9 }, reach: { duration: 0.4 } } };
const still = { vx: 0, vz: 0, y: 0, vy: 0, jumpT: 0, shooting: false, shotT: 0, takeoff: 0 };
const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
// A match with its marks, seen once so that only what happens next counts as new.
function watched(seed = 1) { const s = live(seed), marks = newMarks(); noteChanges(marks, s, DT); return [s, marks]; }
// One step of the match, then one frame of noticing.
const tick = (s, marks, intents = idle()) => { step(s, intents, DT); noteChanges(marks, s, DT); };
const arms = (s, marks, id) => armMotion(s.players[id], s, marks, facts);

// ---- legs ----

test('a defender within 4 m of his man is drawn facing him; beyond that, or at a run, he faces where he goes', () => {
  const [s, marks] = watched();                         // team 0 has the ball; player 3 guards player 0
  const face = () => { noteChanges(marks, s, DT); return drawnFacing(s, s.players[3], marks); };
  at(s, 0, 5, 0); at(s, 3, 3, 0); s.players[3].facing = 2;
  assert.ok(near(face(), 0));                           // his man is toward +x
  at(s, 3, 0.5, 0);
  assert.equal(face(), 2);                              // 4.5 m away
  at(s, 3, 3, 0); s.players[3].vx = 3;
  assert.equal(face(), 2);                              // running
  assert.equal(drawnFacing(s, s.players[0], marks), s.players[0].facing);   // his team has the ball
});

test('a defender shuffling near walking pace does not flip between facing his man and facing his run', () => {
  const [s, marks] = watched();
  at(s, 0, 5, 0); at(s, 3, 3, 0);
  const guarding = v => { s.players[3].vx = v; noteChanges(marks, s, DT); return marks.guard[3]; };
  assert.deepEqual([guarding(2.1), guarding(2.5), guarding(2.7), guarding(2.3), guarding(2.1)], [true, true, false, false, true]);
});

test('guarding, he stands in a stance, side-steps to his own left and right, and back-steps', () => {
  const look = { facing: 0, defending: true, guarding: true, crouch: false, landed: Infinity };
  const moving = (vx, vz, l = look) => legMotion({ ...still, vx, vz }, facts.gaits, null, l);
  assert.deepEqual(legMotion(still, facts.gaits, null, look), { clip: 'stance', rate: 1 });
  assert.deepEqual(moving(0, -1.5), { clip: 'strafeLeft', rate: 1 });     // facing +x, his left is -z
  assert.equal(moving(0, 1.5).clip, 'strafeRight');
  assert.deepEqual(moving(-1.3, 0), { clip: 'backpedal', rate: 1 });
  assert.equal(moving(1.5, 0).clip, 'walk');
  assert.equal(moving(0, 1.5, { ...look, guarding: false }).clip, 'walk');            // not near his man: no side-steps
  assert.equal(legMotion(still, facts.gaits, null, { ...look, guarding: false }).clip, 'stance');
  assert.equal(legMotion(still, facts.gaits, null, { ...look, defending: false, guarding: false }).clip, 'idle');
});

test('a player holding a picked-up ball stands with his knees bent', () => {
  const [s, marks] = watched();
  assert.equal(legLook(s, s.players[0], marks).crouch, false);
  s.players[0].held = true;
  assert.equal(legLook(s, s.players[0], marks).crouch, true);
  assert.equal(legMotion(still, facts.gaits, null, legLook(s, s.players[0], marks)).clip, 'stance');
  s.players[0].inbounder = true;
  assert.equal(legLook(s, s.players[0], marks).crouch, false);            // an inbounder stands upright
});

test('the gather dips the knees over its 0.3 s, and each jump is drawn over its own time in the air', () => {
  const look = { facing: 0, defending: false, guarding: false, crouch: false, landed: Infinity };
  assert.deepEqual(legMotion({ ...still, shooting: true, shotT: 0.15 }, facts.gaits, null, look), { clip: 'gather', at: 0.5 });
  assert.equal(legMotion({ ...still, shooting: true, shotT: 0.15 }, facts.gaits).clip, 'idle');      // without a look it chooses as it always did
  const shot = { ...still, y: 0.2, vy: 0.5, takeoff: PLAYER.shotJumpV, jumpT: PLAYER.shotJumpV / 9.81 };
  assert.ok(near(airTime(shot), 0.4485, 0.0005));
  assert.deepEqual(legMotion(shot, facts.gaits), { clip: 'jump', at: 0.5 });
  assert.ok(near(legMotion({ ...shot, takeoff: PLAYER.jumpV }, facts.gaits).at, 0.275, 0.001));   // the same moment of a full jump
});

test('the knees give for 0.12 s after a landing, then the legs go back to what his speed calls for', () => {
  const [s, marks] = watched(), p = s.players[3];
  assert.equal(legLook(s, p, marks).landed, Infinity);
  tick(s, marks, only(3, { shoot: true }));              // a defender jumps
  while (p.y > 0 || p.vy !== 0) tick(s, marks);
  assert.equal(marks.land[3], 0);
  assert.deepEqual(legMotion(p, facts.gaits, 'jump', legLook(s, p, marks)), { clip: 'land', at: 0 });
  for (let i = 0; i < 3; i++) tick(s, marks);
  assert.ok(near(legMotion(p, facts.gaits, 'land', legLook(s, p, marks)).at, 0.05 / 0.12));
  for (let i = 0; i < 5; i++) tick(s, marks);
  assert.equal(legMotion(p, facts.gaits, 'land', legLook(s, p, marks)).clip, 'stance');
});

// ---- arms ----

test('the arms show the newest thing: a pass, then the catch that follows at once', () => {
  const [s, marks] = watched();
  passBall(s, s.players[0], emptyIntent()); noteChanges(marks, s, DT);
  assert.deepEqual(arms(s, marks, 0), { clip: 'pass', at: 0 });
  giveBall(s, s.players[1]); noteChanges(marks, s, DT);
  assert.deepEqual(arms(s, marks, 1), { clip: 'catch', at: MOTION.catchReach });
  for (let i = 0; i < 9; i++) noteChanges(marks, s, DT);                  // 0.15 s later the ball is pulled in
  assert.deepEqual(arms(s, marks, 1), { clip: 'dribble', rate: 1 });
  for (let i = 0; i < 12; i++) noteChanges(marks, s, DT);
  assert.equal(arms(s, marks, 0), null);                                  // the pass has played out
});

test('the shot is prepared on the floor: the ball is at the set point as his feet leave it, and held there', () => {
  const [s, marks] = watched(), hold = only(0, { shoot: true });
  tick(s, marks, hold);
  assert.deepEqual(arms(s, marks, 0), { clip: 'shoot', at: 0 });
  for (let i = 0; i < 9; i++) tick(s, marks, hold);
  assert.ok(near(arms(s, marks, 0).at, 0.5));                             // halfway through the gather
  for (let i = 0; i < 9; i++) tick(s, marks, hold);
  assert.deepEqual([s.players[0].vy > 0, arms(s, marks, 0)], [true, { clip: 'shoot', at: 1 }]);
  for (let i = 0; i < 8; i++) tick(s, marks, hold);
  assert.deepEqual(arms(s, marks, 0), { clip: 'shoot', at: 1 });          // held until he lets go
});

test('the follow-through goes up at the release and stays up until he has landed', () => {
  const [s, marks] = watched(), p = s.players[0];
  for (let i = 0; i < 19; i++) tick(s, marks, only(0, { shoot: true }));
  tick(s, marks);                                                         // lets go just after take-off
  assert.deepEqual(arms(s, marks, 0), { clip: 'follow', at: 0 });
  for (let i = 0; i < 6; i++) tick(s, marks);
  assert.ok(near(arms(s, marks, 0).at, 0.2));                             // 0.1 s of a 0.5 s clip
  while (p.y > 0 || p.vy !== 0) { assert.ok(arms(s, marks, 0).at <= MOTION.followHold + 1e-9); tick(s, marks); }
  assert.deepEqual(arms(s, marks, 0), { clip: 'follow', at: MOTION.followHold });   // just landed: still up
  for (let i = 0; i < 6; i++) tick(s, marks);
  assert.ok(near(arms(s, marks, 0).at, 0.8));                             // relaxing, 0.1 s after landing
  for (let i = 0; i < 7; i++) tick(s, marks);
  assert.equal(arms(s, marks, 0), null);
  Object.assign(p, { y: 0.4, vy: 1, jumpT: 0.1 });                        // a moment later he jumps for the rebound
  assert.equal(arms(s, marks, 0).clip, 'contest');                        // not a follow-through he has not earned
});

test('a shooter who lands still holding the ball stops shooting, and one who is blocked still follows through', () => {
  const [s, marks] = watched();
  for (let i = 0; i < 46; i++) tick(s, marks, only(0, { shoot: true }));
  assert.deepEqual([s.call.kind, s.players[0].shooting, arms(s, marks, 0)], ['travel', false, { clip: 'hold', rate: 1 }]);   // the whistle has gone: he holds it
  const [t, seen] = watched();
  for (let i = 0; i < 25; i++) tick(t, seen, only(0, { shoot: true }));
  Object.assign(t.ball, { holder: null, mode: 'loose' }); t.players[0].shooting = false;   // swatted out of his hands
  noteChanges(seen, t, DT);
  assert.equal(arms(t, seen, 0).clip, 'follow');
});

test('at the line he holds the ball, and a free throw is a set shot', () => {
  const s = live(), marks = newMarks();
  s.freeThrow = newFreeThrow(0, 2); setupFreeThrow(s);
  noteChanges(marks, s, DT);
  for (let i = 0; i < 12; i++) noteChanges(marks, s, DT);                 // the catch has played out
  assert.match(arms(s, marks, 0).clip, /^hold/);
  press(s); noteChanges(marks, s, 2 * DT);
  assert.deepEqual([s.ball.mode, arms(s, marks, 0)], ['shot', { clip: 'freeThrow', at: 0 }]);
});

test('an inbounder and a player who has picked up his dribble hold the ball; otherwise he dribbles', () => {
  const [s, marks] = watched();
  for (let i = 0; i < 12; i++) noteChanges(marks, s, DT);
  assert.deepEqual(arms(s, marks, 0), { clip: 'dribble', rate: 1 });
  s.players[0].held = true;
  assert.deepEqual(arms(s, marks, 0), { clip: 'hold', rate: 1 });
  s.players[0].held = false; s.players[0].inbounder = true;
  assert.equal(arms(s, marks, 0).clip, 'hold');
});

test('he dribbles and holds with the hand away from the nearest defender, and does not switch for a defender straight ahead', () => {
  const [s, marks] = watched(), p = s.players[0];
  at(s, 0, 5, 0); p.facing = 0;                          // facing +x: his right is +z
  const hand = (x, z) => { at(s, 3, x, z); noteChanges(marks, s, DT); return marks.hand[0]; };
  assert.equal(hand(6, 1), 'left');                      // defender on his right
  assert.deepEqual([arms(s, marks, 0).clip, marks.switched[0]], ['dribbleLeft', 0]);
  assert.equal(hand(6, 0.2), 'left');                    // nearly straight ahead: he keeps the hand he has
  assert.equal(hand(6, -1), 'right');
  assert.equal(hand(10, 3), 'right');                    // nobody within 4 m: no reason to switch
  hand(6, 1); p.held = true;
  assert.equal(arms(s, marks, 0).clip, 'holdLeft');
  assert.equal(dribbleHand(s, p), 'left');
});

test('a team-mate raises his hands over the last 0.2 s before a pass arrives, and nobody else does', () => {
  const [s, marks] = watched();
  at(s, 0, 0, 0); at(s, 1, 7, 0); at(s, 2, 3.5, 2.5);
  passBall(s, s.players[0], { ...emptyIntent(), moveX: 1 });             // to player 1, 7 m away: half a second in the air
  noteChanges(marks, s, DT);
  assert.deepEqual([s.ball.target, arms(s, marks, 1), arms(s, marks, 2)], [1, null, null]);
  let reached = [];
  while (s.ball.holder === null) { tick(s, marks); if (s.ball.holder === null) reached.push(arms(s, marks, 1)?.at ?? -1); }
  const up = reached.filter(v => v >= 0);
  assert.ok(up.length >= 10 && up.length <= 13, `${up.length} frames of reaching`);    // about 0.2 s
  assert.ok(up.every((v, i) => i === 0 || v > up[i - 1]) && up.at(-1) > 0.5 && up.at(-1) <= MOTION.catchReach);
  assert.equal(arms(s, marks, 1).clip, 'catch');                          // caught: the same motion carries on
  assert.ok(arms(s, marks, 1).at >= MOTION.catchReach);
  assert.equal(passArrival(s, s.players[1]), Infinity);
});

test('a steal attempt is a reach; if it wins the ball he is shown catching it', () => {
  const [s, marks] = watched();
  at(s, 3, 5.8, -3); s.players[0].facing = 0;
  let won = false;
  for (let i = 0; i < 80 && !won; i++) {
    s.players[3].stealCooldown = 0;
    won = trySteal(s, s.players[3]).won;
    noteChanges(marks, s, DT);
    if (!won) assert.deepEqual(arms(s, marks, 3), { clip: 'reach', at: 0 });
  }
  assert.equal(arms(s, marks, 3).clip, 'catch');
});

test('in the air without the ball the arms go up; the jumpers at the tip reach with one hand', () => {
  const [s, marks] = watched(), p = s.players[4];
  Object.assign(p, { y: 0.5, vy: 1, takeoff: PLAYER.jumpV, jumpT: PLAYER.jumpV / 9.81 });
  assert.deepEqual(arms(s, marks, 4), { clip: 'contest', at: 0.5 });
  s.phase = 'jumpBall';
  assert.equal(arms(s, marks, 4).clip, 'tip');                            // slot 1 is the jumper
  Object.assign(s.players[5], { y: 0.5, vy: 1 });
  assert.equal(arms(s, marks, 5).clip, 'contest');
});

test('a defender on the floor within 2 m of a shooter raises a hand, from the gather on', () => {
  const [s, marks] = watched();
  at(s, 0, 5, 0); at(s, 3, 6.5, 0); at(s, 4, 8, 0);
  assert.equal(arms(s, marks, 3), null);
  tick(s, marks, only(0, { shoot: true }));              // he gathers
  assert.deepEqual([arms(s, marks, 3), arms(s, marks, 4), arms(s, marks, 1)], [{ clip: 'handUp', rate: 1 }, null, null]);
  s.players[3].y = 0.3; s.players[3].vy = 1;
  assert.equal(arms(s, marks, 3).clip, 'contest');       // once he jumps, both arms go up
});

test('standing with nothing to do, the arms follow the legs', () => {
  const [s, marks] = watched();
  assert.deepEqual([arms(s, marks, 1), arms(s, marks, 4), defending(s, s.players[4]), manOf(s, s.players[4]).id], [null, null, true, 1]);
});
```

In `tests/motion.test.js` the `gaits` used by the older tests gain `strafeLeft: 1.5, strafeRight: 1.5, backpedal: 1.3`, and the list of broken facts gains `{ gaits: { ...gaits, backpedal: undefined } }`.

- [ ] **Step 2: Run them**

Run: `node --test tests/moves.test.js tests/motion.test.js`
Expected: FAIL (`armMotion` is not exported; facts without a back-step are not refused).

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS. Nothing on screen changes yet: `people.js` passes no `look` until Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/render/motion.js tests/moves.test.js tests/motion.test.js
git commit -m "feat: choose leg and arm motions from the match"
```

---

### Task 9: Playing two layers

**Files:**
- Create: `src/render/animator.js`, `tests/animator.test.js`
- Modify: `src/render/motion.js`, `src/render/people.js`, `tests/models.test.js`

**Interfaces:**
- Consumes: from Task 8, `LEG_CLIPS`, `ARM_CLIPS`, `legMotion`, `armMotion`, `legLook`, `newMarks`, `noteChanges`; `keepTrack`, `sized`, `checkGaits`; the facts of Task 6 (`clips.dribble.push` and `.bounces`, `clips.run.strike` and `clips.sprint.strike`, each `{ left, right }`); `people.js` as stage 2 left it, where each person has his own mixer, actions and weights, and a clip's hips position is multiplied by his `scale`.
- Produces, in `motion.js`:
  - `MOTION` gains `fadeIn: 0.07`, `fadeOut: 0.22` and `quick: ['pass', 'reach', 'follow', 'freeThrow', 'handUp']`, the one-off moves that come in fast and leave slowly.
  - `layerOf(trackName) -> 'legs' | 'arms'`: `legs` for `mixamorigHips`, `mixamorigSpine` (that bone exactly, not `Spine1` or `Spine2`) and both sides' `UpLeg`, `Leg`, `Foot` and `ToeBase`; `arms` for everything else. The lean of a run lives in the hips and the lowest spine bone, so a ball handler keeps it.
  - `checkMotions(names)`: throws, naming it, for the first of `LEG_CLIPS` and `ARM_CLIPS` that is not in `names`.
  - `crossFade(weights, chosen, dt) -> weights`: one frame of a cross-fade in which each motion leaves at its own pace: a `quick` one over `fadeOut`; any other over `fadeIn` when the chosen motion is a `quick` one and over `MOTION.fade` otherwise. The chosen motion takes what is left, so the shares always add up to 1.
  - `outOfStep(index) -> { start, rate }`: for person `index` (0 to 9), where in its cycle his `idle` and `stance` start (0 to 1) and how fast they play (0.92 to 1.08), different for each of the ten.
  - `stridePhase(legPhase, strike, dribble) -> 0..1`: the dribble's place in its cycle when the legs carry it: `dribble.push + (legPhase - strike) / dribble.bounces`, wrapped into 0 to 1. One stride is one bounce, and the ball leaves the hand as that foot lands.
- Produces, in `animator.js`: `createAnimator(model, clips, facts, scale, index = 0) -> { update(legs, arms, dt), weights, phase(name), reset() }`.
  - It takes over from `people.js` the dropping of tracks (`keepTrack`) and the scaling of the hips' position by `scale`.
  - Every clip in `LEG_CLIPS` is split in two: its `legs` tracks play on the legs layer and its `arms` tracks on the arms layer. Every clip in `ARM_CLIPS` plays its `arms` tracks only.
  - `weights` is `{ legs: { clip: share }, arms: { clip: share } }`, the arms layer having an entry for every clip of both lists. Each layer is moved by `crossFade` and always adds up to one whole pose. It starts, and `reset()` puts it back, at `idle: 1` on both layers: a person who has just come on.
  - `update(legs, arms, dt)`: `legs` is what `legMotion` returned, `arms` what `armMotion` returned. `{ at }` holds that clip at that share of its length; `{ rate }` plays it at that rate. `arms === null` shows the arms half of the current leg clip, at the same moment as its legs half.
  - When one of `walk`, `run`, `sprint`, `strafeLeft`, `strafeRight` and `backpedal` gives way to another, the incoming clip starts at the same share of its cycle, so the legs never stall.
  - While the legs play `run` or `sprint` and the arms `dribble` or `dribbleLeft`, the dribble is not played at its own rate: its place in the cycle is `stridePhase(the leg clip's phase, facts.clips[leg clip].strike.right for dribble or .left for dribbleLeft, facts.clips.dribble)`. Standing or walking it plays at rate 1.
  - `idle` and `stance` start at `outOfStep(index).start` of their length and play at `rate` times `outOfStep(index).rate`.
  - `phase(name) -> 0..1`: how far through its cycle the arms-layer clip `name` is.
- `people.js`: one animator per person, made with the person's index (0 to 4 for team 0 by roster row, 5 to 9 for team 1); one `marks` for the match; `loadPeople` calls `checkMotions` on the motions in the file, so a file that lacks one is refused, naming it, and the game falls back to capsules with one warning as it already does for a missing player. `update(state, dt)`: on the start and final screens everyone plays `idle` with `null` arms; otherwise `noteChanges(marks, state, dt)` once, then per slot `look = legLook(state, player, marks)`, the slot is turned to `look.facing`, and his animator is given `legMotion(player, his gaits, his last leg clip, look)` and `armMotion(player, state, marks, facts)`. A person coming on in a substitution is `reset()`. `models` and `setQuality` stay as they are.

- [ ] **Step 1: Write the failing tests**

```js
// tests/animator.test.js
// The real mixer, in Node, on the real motion file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAnimator } from '../src/render/animator.js';
import { LEG_CLIPS, ARM_CLIPS, crossFade, layerOf, checkMotions, outOfStep, stridePhase } from '../src/render/motion.js';

const data = readFileSync('assets/motion.glb');
const gltf = await new Promise((ok, bad) => new GLTFLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', ok, bad));
const facts = JSON.parse(readFileSync('assets/motion.json', 'utf8'));
const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
const fresh = (index = 0) => createAnimator(gltf.scene, clips, facts, 1, index);
const whole = layer => Math.abs(Object.values(layer).reduce((sum, w) => sum + w, 0) - 1) < 1e-9;
const FRAME = 1 / 60, run = { clip: 'run', rate: 1 }, idle = { clip: 'idle', rate: 1 };
const frames = (a, n, legs, arms, head) => { for (let i = 0; i < n; i++) a.update(legs, arms, FRAME, head); };
const bone = name => gltf.scene.getObjectByName(name);
const facing = name => { gltf.scene.updateMatrixWorld(true); return new THREE.Vector3(0, 0, 1).applyQuaternion(bone(name).getWorldQuaternion(new THREE.Quaternion())); };

test('both layers stay one whole pose through a start, a dribble, a pass, a catch, a gather, a shot, a landing and a stop', () => {
  const a = fresh();
  const script = [[{ clip: 'walk', rate: 1 }, null], [run, { clip: 'dribble', rate: 1 }], [run, { clip: 'pass', at: 0.2 }], [run, { clip: 'catch', at: 0.5 }],
    [{ clip: 'gather', at: 0.5 }, { clip: 'shoot', at: 0.5 }], [{ clip: 'jump', at: 0.3 }, { clip: 'shoot', at: 1 }], [{ clip: 'jump', at: 0.6 }, { clip: 'follow', at: 0.4 }],
    [{ clip: 'land', at: 0.5 }, { clip: 'follow', at: 0.8 }], [{ clip: 'stance', rate: 1 }, { clip: 'handUp', rate: 1 }], [idle, null]];
  for (const [legs, arms] of script) for (let i = 0; i < 3; i++) {        // three frames each: every fade is cut short
    a.update(legs, arms, FRAME);
    assert.ok(whole(a.weights.legs) && whole(a.weights.arms), JSON.stringify(a.weights));
  }
});

test('every motion the two tables name has its place on a layer', () => {
  const a = fresh();
  assert.deepEqual(Object.keys(a.weights.legs).sort(), [...LEG_CLIPS].sort());
  assert.deepEqual(Object.keys(a.weights.arms).sort(), [...LEG_CLIPS, ...ARM_CLIPS].sort());
});

test('with nothing for the arms to do they follow the legs', () => {
  const a = fresh();
  frames(a, 30, run, null);
  assert.deepEqual([a.weights.legs.run, a.weights.arms.run], [1, 1]);
});

test('a person who has just come on starts from a whole idle pose, also when he has been on before', () => {
  const a = fresh();
  assert.deepEqual([a.weights.legs.idle, a.weights.arms.idle], [1, 1]);
  frames(a, 4, run, { clip: 'dribble', rate: 1 });                        // substituted off in the middle of a fade
  a.reset();
  assert.deepEqual([a.weights.legs.idle, a.weights.arms.idle, whole(a.weights.legs), whole(a.weights.arms)], [1, 1, true, true]);
});

test('a ball handler keeps the lean of his run: the lower spine follows the legs whatever the arms do', () => {
  const a = fresh(), b = fresh();
  frames(a, 30, run, null);
  const leaning = bone('mixamorigSpine').quaternion.clone();
  frames(b, 30, run, { clip: 'hold', rate: 1 });
  assert.ok(Math.abs(bone('mixamorigSpine').quaternion.dot(leaning)) > 0.9999, 'the lower spine left the run');
});

test('a one-off move is fully shown within 0.07 s and is gone 0.22 s after it ends', () => {
  const a = fresh();
  frames(a, 30, idle, { clip: 'dribble', rate: 1 });
  frames(a, 5, idle, { clip: 'pass', at: 0.1 });                          // 0.083 s
  assert.ok(Math.abs(a.weights.arms.pass - 1) < 1e-9);
  frames(a, 12, idle, null);                                              // 0.2 s later
  assert.ok(a.weights.arms.pass > 0.05 && a.weights.arms.pass < 0.15, `${a.weights.arms.pass}`);
  frames(a, 2, idle, null);
  assert.equal(a.weights.arms.pass, 0);
});

test('from one gait to the next the legs carry on from the same point of the stride', () => {
  const a = fresh();
  frames(a, 20, run, null);
  const before = a.phase('run');
  a.update({ clip: 'sprint', rate: 1 }, null, FRAME);
  const gap = Math.abs(a.phase('sprint') - before);
  assert.ok(Math.min(gap, 1 - gap) < 0.05, `run at ${before}, sprint starts at ${a.phase('sprint')}`);
});

test('at a run the dribble is tied to the stride: the push comes as the same-side foot lands', () => {
  const a = fresh(), { push, bounces } = facts.clips.dribble, strike = facts.clips.run.strike.right;
  for (let i = 0; i < 40; i++) {
    a.update(run, { clip: 'dribble', rate: 1 }, FRAME);
    const want = (((push + (a.phase('run') - strike) / bounces) % 1) + 1) % 1, gap = Math.abs(a.phase('dribble') - want);
    assert.ok(Math.min(gap, 1 - gap) < 0.06, `frame ${i}: dribble at ${a.phase('dribble')}, stride wants ${want}`);
  }
});

test('no two people idle in step', () => {
  const a = fresh(0), first = a.phase('idle');
  const b = fresh(3);
  assert.ok(Math.abs(b.phase('idle') - first) > 0.05);
});

// ---- the plain logic the animator leans on ----

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;

test('the lower spine goes with the legs; the upper spine, neck, head and arms are the arms layer', () => {
  assert.deepEqual(['mixamorigHips.position', 'mixamorigHips.quaternion', 'mixamorigLeftUpLeg.quaternion', 'mixamorigRightToeBase.quaternion', 'mixamorigSpine.quaternion',
    'mixamorigSpine1.quaternion', 'mixamorigSpine2.quaternion', 'mixamorigNeck.quaternion', 'mixamorigHead.quaternion', 'mixamorigLeftShoulder.quaternion', 'mixamorigRightHandIndex1.quaternion'].map(layerOf),
  ['legs', 'legs', 'legs', 'legs', 'legs', 'arms', 'arms', 'arms', 'arms', 'arms', 'arms']);
});

test('a motion file that lacks a motion the tables name is refused', () => {
  assert.doesNotThrow(() => checkMotions([...LEG_CLIPS, ...ARM_CLIPS]));
  assert.throws(() => checkMotions(LEG_CLIPS), /dribble/);
  assert.throws(() => checkMotions([...LEG_CLIPS, ...ARM_CLIPS].filter(name => name !== 'handUp')), /handUp/);
});

test('no two of the ten people idle in step', () => {
  const ten = Array.from({ length: 10 }, (_, i) => outOfStep(i));
  for (const { start, rate } of ten) assert.ok(start >= 0 && start < 1 && rate >= 0.92 && rate <= 1.08, `${start} ${rate}`);
  assert.equal(new Set(ten.map(o => o.start.toFixed(3))).size, 10);
  assert.equal(new Set(ten.map(o => o.rate.toFixed(3))).size, 10);
});

test('when the run carries the dribble, there is one bounce per stride and the push comes as that foot lands', () => {
  const d = { push: 0.25, bounces: 2 };
  assert.ok(near(stridePhase(0.3, 0.3, d), 0.25));                         // the foot lands: the ball leaves the hand
  assert.ok(near(stridePhase(0.8, 0.3, d), 0.5) && near(stridePhase(0.1, 0.3, d), 0.15));
  assert.ok(near(stridePhase(1.3, 0.3, d), 0.75));                         // a whole stride later: one bounce on (half of a two-bounce clip)
});

test('one-off moves fade in over 0.07 s and out over 0.22 s; everything else keeps 0.15 s; the shares always make one whole pose', () => {
  const w = { idle: 0, dribble: 1, pass: 0, run: 0 }, total = () => Object.values(w).reduce((sum, v) => sum + v, 0);
  crossFade(w, 'pass', 0.035);
  assert.ok(near(w.dribble, 0.5) && near(w.pass, 0.5));                   // half way in after half of 0.07 s
  crossFade(w, 'pass', 0.035);
  assert.ok(near(w.pass, 1) && near(w.dribble, 0));
  crossFade(w, 'dribble', 0.11);
  assert.ok(near(w.pass, 0.5) && near(w.dribble, 0.5));                   // half way out after half of 0.22 s
  crossFade(w, 'run', 0.03);
  assert.ok(near(w.pass, 0.5 - 0.03 / 0.22) && near(w.dribble, 0.3) && near(total(), 1));   // each leaves at its own pace
  crossFade(w, 'run', 0.2);
  assert.deepEqual(w, { idle: 0, dribble: 0, pass: 0, run: 1 });
  assert.deepEqual(crossFade({ idle: 0.4, run: 0.6 }, 'run', 0), { idle: 0.4, run: 0.6 });   // paused: nothing moves
});
```

```js
// tests/models.test.js
import { LEG_CLIPS, ARM_CLIPS } from '../src/render/motion.js';

test('the motion file holds every motion the two tables name', () => {
  const names = motion.json.animations.map(a => a.name);
  assert.deepEqual([...LEG_CLIPS, ...ARM_CLIPS].filter(name => !names.includes(name)), []);
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/animator.test.js tests/models.test.js`
Expected: FAIL (`src/render/animator.js` does not exist).

- [ ] **Step 3: Implement** the five functions in `motion.js`, then `animator.js`, then use the animator in `people.js` in place of the per-person actions and weights there.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Check it in the browser.** The ball itself is still drawn where the rules put it; Task 10 puts it in the hand.

| Check | Expected |
|---|---|
| Console | No errors |
| Running with the ball | The legs run and lean; one arm dribbles, in time with the stride; the trunk is not upright like a waiter's |
| Standing with the ball next to a defender, then with him on the other side | He dribbles with the hand away from the defender |
| F, then standing still | Both hands go to the hip and the knees bend |
| E; and receiving a pass | The arms are out at once and relax; the receiver's hands come up just before the ball arrives |
| Space with the ball | The knees dip, the arms go up to the set point as he leaves the floor, the follow-through stays up until he has landed, and the knees give on landing |
| Space without the ball; Q next to the ball handler | Both arms up; a quick reach |
| Defenders | Low and wide when still; side-steps and back-steps facing their man; a hand up when you gather beside one; they turn and run when left behind |
| Shift pressed and released repeatedly | The legs never stall between run and sprint |
| Opening tip | The two jumpers reach up with one arm |
| The start screen | Six players breathing, no two in step |
| A substitution | The player coming on stands whole, with no flick |
| Stage 1's five-motion file put in its place (`git show 0896733:assets/motion.glb > assets/motion.glb`), then reload | Capsules, and one warning naming the missing motion. Put the real file back (`git checkout assets/motion.glb`) |

- [ ] **Step 6: Commit**

```bash
git add src/render/animator.js src/render/motion.js src/render/people.js tests/animator.test.js tests/models.test.js
git commit -m "feat: legs and arms play on two layers"
```

---

### Task 10: The ball in the hand

**Files:**
- Create: `tests/hands.test.js`
- Modify: `src/render/motion.js`, `src/render/people.js`, `src/render/actors.js`

**Interfaces:**
- Consumes: the animator's `phase('dribble')` and `phase('dribbleLeft')`; `marks.hand[id]` and `marks.switched[id]`; the arm motion each player was given this frame; `facts.clips.dribble` (`push`, `bounces`); `BALL.radius`; the hand bones `mixamorigLeftHand` and `mixamorigRightHand`, whose own +y axis runs from the wrist toward the fingers.
- Produces, in `motion.js`:
  - `BALL_IN_HAND = Object.freeze({ blend: 0.1, palm: 0.1 })`: seconds over which the ball is drawn across to a new place, and metres from the wrist bone to where the ball sits. `MOTION` gains `dribbleHold: 0.55` and `handSwitch: 0.2`.
  - `dribbleHeight(phase, dribble, handY, radius) -> metres`. With `u` the share of one bounce since the push (`dribble.bounces * (phase - dribble.push)`, wrapped into 0 to 1) and `trip = 1 - MOTION.dribbleHold`: while `u < trip` the ball is on its way to the floor and back, `radius + (handY - radius) * |cos(π u / trip)|`; for the rest of the bounce it is at `handY`. `handY` is the hand's real height on that frame.
  - `switchSpot(from, to, share, radius) -> { x, y, z }`: the ball crossing from one hand to the other, `share` running 0 to 1: straight across in x and z, with one bounce on the way, `y = radius + (the straight line's y - radius) * |cos(π share)|`.
  - `ballSpot(last, now, since) -> { x, y, z }`: `now` once `since >= BALL_IN_HAND.blend` or when `last` is `null`; before that, the straight blend from `last` to `now`.
  - `ballHands(clip) -> 'right' | 'left' | 'both'`: `'right'` for `dribble`, `'left'` for `dribbleLeft`, `'both'` for every other motion.
- Produces, in `people.js`: `heldBall(state) -> { x, y, z } | null`: where the ball is in the holder's hands this frame, or `null` when nobody holds it or on the start and final screens. A palm is the wrist bone's place moved `BALL_IN_HAND.palm` toward the fingers. With `ballHands` of the holder's arm motion: `'both'` is the point midway between the two palms; one hand is that palm's x and z with `y = dribbleHeight(animator.phase(clip), facts.clips.dribble, the palm's y, BALL.radius)`; and while he dribbles with `marks.switched[id] < MOTION.handSwitch`, it is `switchSpot(the old hand's palm, the new hand's palm, marks.switched[id] / MOTION.handSwitch, BALL.radius)`.
- `actors.js`: the ball is drawn at `ballSpot(last, now, since)`, where `now` is `people.heldBall(state)` or, when that is `null`, where the rules say; `last` is where the ball was drawn on the frame its holder last changed (to another player, to nobody, or from nobody), and `since` the seconds of `dt` since then. With capsules the ball is drawn as today.

- [ ] **Step 1: Write the failing tests** (`tests/hands.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dribbleHeight, switchSpot, ballSpot, ballHands, BALL_IN_HAND } from '../src/render/motion.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;

test('a dribbled ball stays at the hand for 55% of each bounce and touches the floor midway through the rest', () => {
  const d = { push: 0.25, bounces: 1 }, height = phase => dribbleHeight(phase, d, 1, 0.12);
  assert.ok(near(height(0.25), 1) && near(height(0.475), 0.12) && near(height(0.7), 1) && near(height(0.9), 1) && near(height(0.1), 1));
  const atHand = Array.from({ length: 1000 }, (_, i) => height(i / 1000)).filter(y => y > 1 - 1e-9).length;
  assert.ok(Math.abs(atHand - 550) <= 2, `${atHand / 10}% of the cycle at the hand`);
  assert.ok(near(dribbleHeight(0.5, { push: 0, bounces: 2 }, 1, 0.12), 1) && near(dribbleHeight(0.1125, { push: 0, bounces: 2 }, 1, 0.12), 0.12));
  assert.ok(near(dribbleHeight(0.475, d, 0.8, 0.12), 0.12) && near(dribbleHeight(0.9, d, 0.8, 0.12), 0.8));   // it follows the hand's real height
});

test('changing hands, the ball crosses low in front with one bounce on the way', () => {
  const from = { x: 0, y: 0.9, z: -0.3 }, to = { x: 0.1, y: 0.9, z: 0.3 };
  assert.deepEqual(switchSpot(from, to, 0, 0.12), from);
  assert.deepEqual(switchSpot(from, to, 1, 0.12), to);
  const mid = switchSpot(from, to, 0.5, 0.12);
  assert.ok(near(mid.x, 0.05) && near(mid.z, 0) && near(mid.y, 0.12));
  assert.ok(switchSpot(from, to, 0.25, 0.12).y < 0.9 && switchSpot(from, to, 0.25, 0.12).y > 0.12);
});

test('whenever the ball changes hands or leaves them it is drawn there over a tenth of a second, and never jumps', () => {
  const held = { x: 1, y: 2, z: 0 }, ruled = { x: 2, y: 3, z: 0 };
  assert.deepEqual(ballSpot(held, ruled, 0), held);
  assert.deepEqual(ballSpot(held, ruled, 0.05), { x: 1.5, y: 2.5, z: 0 });
  assert.deepEqual(ballSpot(held, ruled, BALL_IN_HAND.blend), ruled);
  assert.deepEqual(ballSpot(held, ruled, 5), ruled);
  assert.deepEqual(ballSpot(null, ruled, 0), ruled);                       // the first frame: nothing to blend from
});

test('the dribble is carried in one hand, everything else in both', () => {
  assert.deepEqual(['dribble', 'dribbleLeft', 'hold', 'holdLeft', 'shoot', 'catch'].map(ballHands), ['right', 'left', 'both', 'both', 'both', 'both']);
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/hands.test.js`
Expected: FAIL (`dribbleHeight` is not exported).

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Check it in the browser**

| Check | Expected |
|---|---|
| Dribbling, standing and at a run | The ball rides the hand for more than half of each bounce and is sharp at the floor; at a run it comes down as the same-side foot lands |
| A defender crossing in front of the dribbler | The ball crosses low to the other hand with one bounce, in about a fifth of a second |
| F; inbounding; at the free-throw line | The ball sits between the hands, on the hip |
| Space | The ball goes up with the hands and leaves from them with no visible jump |
| E, and the catch | The ball leaves from the hands; the receiver takes it out in front and pulls it in |
| A steal, a rebound, a pick-up | The ball is in the new holder's hands within a tenth of a second |

- [ ] **Step 6: Commit**

```bash
git add src/render/motion.js src/render/people.js src/render/actors.js tests/hands.test.js
git commit -m "feat: the ball is drawn in the hand, rides it through the dribble and changes hands"
```

---

### Task 11: Turning, leaning and heads

**Files:**
- Create: `tests/bearing.test.js`
- Modify: `src/render/motion.js`, `src/render/animator.js`, `src/render/people.js`, `tests/animator.test.js`

**Interfaces:**
- Consumes: `drawnFacing`, `legLook`, `manOf`, `defending` and `MOTION.guardDist` from Task 8; the animator of Task 9; `ball.target` and `ball.noPickupId` (the player who last let the ball go); `RIM`, `PLAYER.accel`, `attackSign`.
- Produces, in `motion.js`:
  - `MOTION` gains `turnRate: 900` (degrees a second), `leanForward: 12` and `leanSide: 10` (degrees), `leanEase: 0.15` (seconds), `headYaw: 70` and `headPitch: 30` (degrees), `headEase: 8` (a second), `eye: 1.7` (metres above his feet).
  - `easeFacing(drawn, wanted, dt) -> radians`: `drawn` moved toward `wanted` by at most `turnRate` times `dt`, the short way round; the result is between −π and π.
  - `leanOf(lean, was, now, facing, dt, grounded = true) -> { forward, side }`, in radians. `was` and `now` are `{ vx, vz }` one frame apart. The wanted lean is his acceleration along `facing` as a share of `PLAYER.accel`, times `leanForward`, and his acceleration toward his left as a share of `PLAYER.accel`, times `leanSide`, each share held between −1 and 1; in the air it is zero. The lean moves toward the wanted one by the share `1 - exp(-dt / leanEase)`. With `dt` 0 it is returned unchanged.
  - `lookTarget(state, player) -> { x, y, z } | null`: the table below.
  - `headTurn(player, facing, target) -> { yaw, pitch }`, in radians: how far the head must turn from the drawn heading `facing` to look at `target` from his eyes (`player.y + eye` up). `yaw` is positive toward his right and held within `headYaw`; `pitch` is positive upward and held within `headPitch`. A `null` target gives zeros.
  - `easeHead(head, wanted, dt) -> { yaw, pitch }`: each moved toward the wanted one by the share `1 - exp(-headEase * dt)`.
- Produces, in `animator.js`: `update(legs, arms, dt, head = null)`. After the mixer has run, `head = { yaw, pitch }` is added on top of the pose: `mixamorigSpine2` takes 0.15 of each angle, `mixamorigNeck` 0.25 and `mixamorigHead` 0.6. The turns are about the model's own up and side axes, whatever the axes of each bone.
- `people.js`, per slot, each frame of a match: the heading he is drawn with is `easeFacing(its last value, drawnFacing(state, player, marks), dt)`; it turns the slot, replaces `look.facing` for `legMotion`, and is the `facing` given to `leanOf` and `headTurn`. The lean tips the person's model inside the slot's group, not the group, so the number over his head stays where it is: a positive `forward` puts his head ahead of his feet, a positive `side` puts it toward his left. The head is `easeHead(its last value, headTurn(player, heading, lookTarget(state, player)), dt)` and goes to the animator. On the start and final screens there is no lean and no head turn.

Where each head looks. First match wins. A player's head is at `{ x, y: y + MOTION.eye, z }`.

| Who | Looks at |
|---|---|
| Anyone on the start and final screens | Nothing (`null`): the motion's own head |
| A player who is `shooting` | The rim he attacks |
| The ball handler | The nearest opponent's head if he is within `guardDist`, otherwise the rim he attacks |
| The passer while his pass is in the air (`ball.mode` is `'pass'`, `ball.noPickupId` is his id, `ball.target` is set) | His receiver's head |
| A defender (`defending`) within `guardDist` of his man | His man's head |
| Everyone else, which includes a shooter once the ball has left | The ball |

- [ ] **Step 1: Write the failing tests**

```js
// tests/bearing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeFacing, leanOf, lookTarget, headTurn, easeHead, MOTION } from '../src/render/motion.js';
import { emptyIntent } from '../src/sim/state.js';
import { passBall } from '../src/sim/players.js';
import { PLAYER, RIM } from '../src/sim/tuning.js';
import { live, at } from './helpers.js';

const near = (a, b, by = 1e-9) => Math.abs(a - b) < by;
const deg = r => (r * 180) / Math.PI, rad = d => (d * Math.PI) / 180;

test('the drawn heading turns at 900 degrees a second at most, the short way round', () => {
  assert.ok(near(deg(easeFacing(0, rad(90), 1 / 60)), 15));                // 900 / 60
  assert.ok(near(deg(easeFacing(0, rad(10), 1 / 60)), 10));                // close enough: it arrives
  assert.ok(near(deg(easeFacing(rad(170), rad(-170), 1 / 60)), -175));     // through 180, not back through 0
  let drawn = 0, frames = 0;
  while (Math.abs(drawn - Math.PI) > 1e-9 && frames < 100) { drawn = easeFacing(drawn, Math.PI, 1 / 60); frames++; }
  assert.equal(frames, 12);                                                // a half turn takes 0.2 s
  assert.equal(easeFacing(1, 2, 0), 1);                                    // paused: nothing turns
});

test('the body tips into speeding up, back when stopping and into a turn, and never past its limits', () => {
  const rest = { forward: 0, side: 0 }, from = { vx: 0, vz: 0 };
  const start = leanOf(rest, from, { vx: PLAYER.accel / 60, vz: 0 }, 0, 1 / 60);        // full acceleration, facing +x
  assert.ok(start.forward > 0 && near(start.side, 0) && near(deg(start.forward), 12 * (1 - Math.exp(-1 / 9))), `${deg(start.forward)}`);
  let lean = rest;
  for (let i = 0; i < 120; i++) lean = leanOf(lean, { vx: 0, vz: 0 }, { vx: 5, vz: 0 }, 0, 1 / 60);   // far beyond what a player can do
  assert.ok(near(deg(lean.forward), 12, 1e-3));                            // held at 12 degrees
  for (let i = 0; i < 120; i++) lean = leanOf(lean, { vx: 5, vz: 0 }, { vx: 0, vz: 0 }, 0, 1 / 60);
  assert.ok(near(deg(lean.forward), -12, 1e-3));                           // stopping: tipped back
  for (let i = 0; i < 120; i++) lean = leanOf(lean, { vx: 5, vz: 0 }, { vx: 5, vz: -5 }, 0, 1 / 60);   // pushed toward -z: his left
  assert.ok(near(deg(lean.side), 10, 1e-3) && near(deg(lean.forward), 0, 1e-3));
  for (let i = 0; i < 120; i++) lean = leanOf(lean, { vx: 5, vz: 0 }, { vx: 5, vz: 0 }, 0, 1 / 60);
  assert.ok(Math.abs(deg(lean.side)) < 0.01);                              // steady speed: upright again
  assert.deepEqual(leanOf(start, from, { vx: 3, vz: 0 }, 0, 0), start);    // paused: nothing moves
  assert.ok(leanOf(start, from, { vx: 3, vz: 0 }, 0, 1 / 60, false).forward < start.forward);   // in the air he straightens
});

test('each head has something to look at: the ball, his man, the hoop, the nearest defender or his receiver', () => {
  const s = live();                                      // player 0 has the ball at (5, -3); team 1 stands at x = -5
  const eyes = o => ({ x: o.x, y: MOTION.eye, z: o.z }), hoop = { x: RIM.x, y: RIM.height, z: 0 }, look = id => lookTarget(s, s.players[id]);
  assert.deepEqual(look(0), hoop);                       // nobody within 4 m of the ball handler
  at(s, 3, 7, -3);
  assert.deepEqual(look(0), eyes(s.players[3]));         // his defender is close
  assert.deepEqual(look(3), eyes(s.players[0]));         // a defender within 4 m of his man watches him
  assert.deepEqual(look(4), { x: s.ball.x, y: s.ball.y, z: s.ball.z });   // his man is 10 m away: he watches the ball
  assert.deepEqual(look(1), { x: s.ball.x, y: s.ball.y, z: s.ball.z });   // a team-mate without the ball
  s.players[0].shooting = true;
  assert.deepEqual(look(0), hoop);                       // a shooter looks at the hoop, whoever is near
  s.players[0].shooting = false;
  passBall(s, s.players[0], { ...emptyIntent(), moveZ: 1 });
  assert.deepEqual(look(0), eyes(s.players[1]));         // the passer watches his receiver
  assert.deepEqual(look(1), { x: s.ball.x, y: s.ball.y, z: s.ball.z });   // the receiver watches it in
  s.phase = 'final';
  assert.equal(look(1), null);                           // before and after a match nobody stares at the ball
});

test('the head turns up to 70 degrees sideways and 30 up or down, and eases there', () => {
  const p = { x: 0, y: 0, z: 0 };
  assert.deepEqual(headTurn(p, 0, null), { yaw: 0, pitch: 0 });
  const right = headTurn(p, 0, { x: 3, y: MOTION.eye, z: 3 });
  assert.ok(near(deg(right.yaw), 45) && near(right.pitch, 0));             // +z is to the right of a player facing +x
  assert.ok(near(deg(headTurn(p, 0, { x: -3, y: MOTION.eye, z: -1 }).yaw), -70));       // behind him on the left: as far as the neck goes
  assert.ok(near(deg(headTurn(p, Math.PI / 2, { x: 0, y: MOTION.eye, z: 5 }).yaw), 0));  // measured from where he is drawn facing
  assert.ok(near(deg(headTurn(p, 0, { x: 1, y: 3.05, z: 0 }).pitch), 30));               // under the hoop: 30 at most
  assert.ok(near(deg(headTurn(p, 0, { x: 4, y: 0.12, z: 0 }).pitch), deg(Math.atan2(0.12 - MOTION.eye, 4))));
  assert.ok(near(deg(headTurn({ ...p, y: 0.5 }, 0, { x: 4, y: MOTION.eye + 0.5, z: 0 }).pitch), 0));   // his eyes rise with his jump
  let head = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 15; i++) head = easeHead(head, { yaw: 1, pitch: -0.5 }, 1 / 60);   // a quarter of a second
  assert.ok(near(head.yaw, 1 - Math.exp(-2), 1e-6) && near(head.pitch, -0.5 * (1 - Math.exp(-2)), 1e-6));
  assert.deepEqual(easeHead(head, { yaw: 0, pitch: 0 }, 0), head);
});
```

```js
// tests/animator.test.js, added at the end (`fresh`, `frames`, `idle` and `facing` are defined at its top)
test('the head turns toward what it is given: right for a positive yaw, up for a positive pitch, and the middle of the spine stays out of it', () => {
  const plain = fresh();
  frames(plain, 6, idle, null);
  const ahead = facing('mixamorigHead'), chest = facing('mixamorigSpine1');
  const turned = fresh();
  frames(turned, 5, idle, null); frames(turned, 1, idle, null, { yaw: 1, pitch: 0 });
  assert.ok(facing('mixamorigHead').x < ahead.x - 0.5, 'the head did not turn to its right');      // the model faces +z; its right is -x
  assert.ok(facing('mixamorigSpine1').distanceTo(chest) < 1e-6, 'the turn reached below the upper spine');
  const raised = fresh();
  frames(raised, 5, idle, null); frames(raised, 1, idle, null, { yaw: 0, pitch: 0.5 });
  assert.ok(facing('mixamorigHead').y > ahead.y + 0.3, 'the head did not tip up');
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/bearing.test.js tests/animator.test.js`
Expected: FAIL (`easeFacing` is not exported; the head does not turn).

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Check it in the browser**

| Check | Expected |
|---|---|
| A quick change of direction | He turns through the angle in a few frames; he does not snap round |
| Starting a sprint, and stopping | His head goes ahead of his feet as he starts and behind them as he stops; never more than a slight tip |
| Running a curve | He leans into it |
| The numbers over the heads | They do not swing with the lean |
| Players without the ball | Their heads follow the ball while their bodies go elsewhere |
| A defender running back beside his man | His head and chest stay turned to his man |
| A shooter | He looks at the hoop, then follows the ball |
| A defender near walking pace | He does not flick between facing his man and facing his run |
| Any head | It never turns past the shoulder and never spins |

- [ ] **Step 6: Commit**

```bash
git add src/render/motion.js src/render/animator.js src/render/people.js tests/bearing.test.js tests/animator.test.js
git commit -m "feat: players turn, lean into speed and look at what matters"
```

---

### Task 12: Stage 3 in the single file, and the owner's play-test

**Files:**
- Build: `dist/triple-threat.html` (not committed)

**Interfaces:**
- Consumes: everything above; `npm run single`; `tests/single-file.test.js` and "the single file stays under 25 MB" in `tests/models.test.js`.

- [ ] **Step 1:** Run `npm test`. Expected: all PASS. Run `npm run single`. Expected: the size line reads under 25 MB.

- [ ] **Step 2:** Serve `dist/` with the header `Content-Security-Policy: sandbox allow-scripts` and open the file in the built-in browser: origin `null`, no console error, one network request.

- [ ] **Step 3: Check it there**, through one quarter:

| Check | Expected |
|---|---|
| A jump shot beside its meter | Gather, dip, small jump; the fill reaches the top as the ball reaches the set point; a release in the band turns it green with a tick and goes in |
| A late release, a travel, a blocked shot | "Late"; the meter gone at once; "Blocked" |
| Every motion | Dribble in either hand, hold on the hip, pass, catch, reach, hand up, contest, stance, side-steps, back-step, landing, tip: each seen once, none popping |
| The ball | In the hand while held; no jump at a release or a catch |
| G | Low quality still plays every motion |
| The final buzzer with a shot just released | No meter left on the final screen |

- [ ] **Step 4: The gate.** Send `dist/triple-threat.html` and two pictures (a shooter beside his meter; a defender in his stance). Ask the owner:

- Is shooting too easy or too hard? Say that the widths of the green window (3, 2, 1 and 0 steps for Open, Guarded, Contested and Smothered, in `SHOT.levels`) are the numbers that change it.
- Can the meter be read at a glance, and is it in the right place?
- How do the moves look in play? Name the hand-made ones as the place to be critical: the shot, the pass, the hold, the defensive stance. Say whether the side-steps are the crouched ones or the upright fallback.
- The frame rate on the Chromebook at High and after pressing G.

Stage 4 (Tasks 13 to 16 of the earlier plan) starts only when the owner says so. What the owner reports may change it.

---

## What the owner does

- Signs in to Mixamo in the app's browser if it has been logged out (Task 6).
- After Task 12, plays the single file on this computer and on the Chromebook and answers the four questions there.
- Says whether stage 4 may start.

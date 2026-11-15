# Dunks and Layups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, in one session (the owner's rule: one developer, no subagents of other models). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a layup (Space while driving at the rim) and a dunk (R), each a two-step gather and a one-foot jump, with motions built from the measured reference clips.

**Architecture:** A finish is a kind of shot: the rules add `player.finish` (`'layup' | 'dunk' | null`) to the shot's own state and a small pure module, `src/sim/finish.js`, that says when one may begin and where it goes. The motions come from numbers measured off the clips: `tools/video/poses.py` writes limb directions per named moment to `assets/source/tracked/`, and the Blender build turns them into whole-body clips on the rig. The renderer picks those clips from `player.finish`; the foot planting already in the game holds the gather's steps.

**Tech Stack:** JavaScript modules run by `node --test`; Three.js 0.187; Blender 4.5 (`blender-4.5 --background --python`); Python 3.12 with MediaPipe in `tools/video/.venv` (measuring only).

**Spec:** `docs/superpowers/specs/2026-11-14-dunks-layups-design.md`

## Global Constraints

- The sim (`src/sim/`) never imports from `src/render/`, `src/broadcast/`, `src/audio/`, `src/replay.js`, `src/keys.js` or `src/prefs.js`. The renderer only reads the state.
- A match must be the same match run twice from the same seed: every random draw goes through `rand(state)`.
- `FINISH` values are exactly those of the spec's section 7: `layupNear 1.2`, `layupFar 4.5`, `drive 2`, `gather 0.5`, `gatherSpeed 5`, `takeoff { layup: 1.6, dunk: 2.2 }`, `jump { layup: 3.2, dunk: 4.2 }`, `arrive { layup: 0.9, dunk: 0.35 }`, `dunkMoment 0.69`, `dunkAt 78`, `dunkEnergy 0.25`, `dunkChance 0.97`, `dunkContest 0.45`, `reach 0.9`, `dunkDrop 4`, `stealFactor 0.5`.
- The dunk key is the action `dunk`, default `KeyR`.
- No name, picture or frame of a real person, team or league goes into the repository or the game. `tools/video/out/`, `tools/video/.venv/` and `tools/video/models/` stay git-ignored. `assets/source/tracked/*.json` holds numbers only.
- Motion names: `finishGather`, `dunk`, `layup`, and their twins `finishGatherLeft`, `dunkLeft`, `layupLeft`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Stage with explicit paths, never `git add -A`. Never push.
- After any change the owner will play: `npm run single`, then send `dist/triple-threat.html` (it shows only in the desktop app: over 30 MiB).
- Looking in the browser: the hidden-pane technique in memory (`dist/hidden.html` from `scratchpad/mkhidden.py`, frames driven by hand, files refreshed with `cache: 'reload'`).
- `people.js` is not covered by `node --test`: run `node --check src/render/people.js` after every edit to it.

## Review Focus

1. **A finish cut short.** The ball is stolen or passed in the gather, the whistle goes, the shot clock runs out, or the period ends while he is gathering or in the air. Expected: `finish` is `null` again, he is not left `shooting`, nothing is released later. Test in Task 2 and Task 3.
2. **Kept from the rim.** A defender stands on his path, so at the dunk's moment he is further than `FINISH.reach` from the rim. Expected: no ball appears at the rim; it is laid up from where he is. Test in Task 4.
3. **Behind or beside the backboard.** A press with the board between him and the rim. Expected: no finish (Space is the jump shot's own rule, R does nothing). Test in Task 1.
4. **Keys saved before this version.** Saved keys with no `dunk`, and saved keys that already put another action on R. Expected: every action still has one key and no key has two; `dunk` gets R if it is free and otherwise the first free letter. Test in Task 6.
5. **The key let go early.** Space tapped for a layup and let go during the gather; R tapped or held for a dunk. Expected: the layup goes at its best moment and is never green; the dunk is the same either way. Test in Task 3 and Task 4.

---

### Task 1: When a finish may begin

**Files:**
- Modify: `src/sim/tuning.js` (add `FINISH` after `MOVES`)
- Create: `src/sim/finish.js`
- Test: `tests/finish.test.js`

**Interfaces:**
- Consumes: `rimCentre(sign)` from `./ball.js`; `attackSign`, `onFloor`, `personOf` from `./state.js`; `rated(state, player, key)` from `./ratings.js`; `boardInWay(player)` from `./players.js` is NOT imported (players.js will import finish.js): copy its three-line test into finish.js as `behindBoard(player)` and make `players.js` re-export it as `boardInWay` in Task 2.
- Produces:
  - `export const FINISH` (values in Global Constraints).
  - `closing(player, hoop) -> number`: his speed toward `hoop`, m/s (negative going away).
  - `canDunk(state, player) -> boolean`: Inside at least `FINISH.dunkAt` and energy at least `FINISH.dunkEnergy`.
  - `finishFor(state, player, key) -> 'layup' | 'dunk' | null`: the table of spec 3.1 for `key` `'shoot'` or `'dunk'`. Assumes the caller has checked he has the ball and is on the floor. `null` for `'shoot'` means the jump shot; for `'dunk'` it means nothing happens.
  - `finishHand(player) -> 'left' | 'right'`: spec 3.4.
  - `takeoffSpot(player, finish) -> { x, z }`: the point `FINISH.takeoff[finish]` from the rim's centre on the line from the rim to him; his own place if he is nearer than that.
  - `gatherVelocity(player, finish) -> { vx, vz }`: toward `takeoffSpot`, at `distance / FINISH.gather`, capped at `FINISH.gatherSpeed`; zero if he is already there.
  - `jumpVelocity(player, finish) -> { vx, vz }`: toward the rim, so that after the time to the finish's moment he is `FINISH.arrive[finish]` in front of the rim's centre: the moment is `FINISH.dunkMoment` of the jump for a dunk and `SHOT.bestAt` of the way up for a layup; the jump lasts `2 * FINISH.jump[finish] / BALL.gravity`. Never away from the rim (zero if he is already nearer than `arrive`).

- [ ] **Step 1: Write the failing tests** in `tests/finish.test.js`, using `live()` and `at()` from `tests/helpers.js`; player 0 attacks the hoop at `+RIM.x`.

```js
const driving = (out, speed, z = 0) => { const s = live(); at(s, 0, RIM.x - out, z); s.players[0].vx = speed; return s; };
test('Space is a layup only driving at the rim from layup range', () => {
  assert.equal(finishFor(driving(3, 4), driving(3, 4).players[0], 'shoot'), 'layup');
  for (const [out, speed] of [[3, 1.5], [3, -4], [1.0, 4], [5, 4]]) { const s = driving(out, speed); assert.equal(finishFor(s, s.players[0], 'shoot'), null); }
});
test('R is a dunk for a finisher with legs left, a layup for anyone else in range, and nothing out of it', () => {
  const s = driving(3, 4); rate(s, 0, 'inside', 78); assert.equal(finishFor(s, s.players[0], 'dunk'), 'dunk');
  rate(s, 0, 'inside', 77); assert.equal(finishFor(s, s.players[0], 'dunk'), 'layup');
  rate(s, 0, 'inside', 90); personOf(s, s.players[0]).energy = 0.2; assert.equal(finishFor(s, s.players[0], 'dunk'), 'layup');
  const far = driving(6, 4); rate(far, 0, 'inside', 90); assert.equal(finishFor(far, far.players[0], 'dunk'), null);
});
test('behind the backboard there is no finish', () => { /* at(s, 0, RIM.x + 0.9, 0.3), moving at the rim: both keys null */ });
test('the hand is the one on his side of the rim; straight on, the right', () => { /* z = -2 -> one hand, z = +2 -> the other, z = 0 -> 'right'; and the mirror for a team-1 player */ });
test('the gather carries him to the take-off spot in FINISH.gather, never faster than FINISH.gatherSpeed, and not at all from inside it', () => {
  const s = driving(3.2, 6), v = gatherVelocity(s.players[0], 'dunk');
  assert.ok(near(Math.hypot(v.vx, v.vz), (3.2 - 2.2) / 0.5, 1e-9) && v.vx > 0);
  assert.ok(near(Math.hypot(...Object.values(gatherVelocity(driving(4.5, 6).players[0], 'layup'))), 5, 1e-9));
  assert.deepEqual(gatherVelocity(driving(1.5, 6).players[0], 'dunk'), { vx: 0, vz: 0 });
});
test('the jump carries him to FINISH.arrive in front of the rim at the finish\'s moment', () => {
  // from the dunk's take-off spot: speed = (2.2 - 0.35) / (0.69 * 2 * 4.2 / 9.81); from 0.3 m out: zero
});
```

- [ ] **Step 2: Run** `node --test tests/finish.test.js`. Expected: FAIL, `Cannot find module '../src/sim/finish.js'`.
- [ ] **Step 3: Implement** `FINISH` and `src/sim/finish.js` as the Interfaces say.
- [ ] **Step 4: Run** `node --test tests/finish.test.js`. Expected: PASS. Then `npm test`: all pass.
- [ ] **Step 5: Commit** `src/sim/tuning.js src/sim/finish.js tests/finish.test.js` with `feat: when a layup or a dunk may begin, and where its steps and its jump carry him`.

### Task 2: The press and the gather

**Files:**
- Modify: `src/sim/state.js` (`emptyIntent` gains `dunk: false`; both player-object literals gain `finish: null`), `src/sim/players.js`, `src/sim/violations.js` only if the travel test below fails.
- Test: `tests/finish.test.js`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - `player.finish`: set at the press, `null` again whenever `shooting` becomes false (in `letGo`, in the travel branch of `continueShot`, and wherever else `shooting = false` is written: grep for it).
  - `player.shotKey` is `'shoot'`, `'fade'` or `'dunk'`.
  - `gatherOf(player) -> seconds`: `FINISH.gather` in a finish, `SHOT.gather` otherwise; `gathering(player)` uses it.
  - In `applyActions`, where a shot begins: `pressed('dunk')` joins `pressed('shoot') || pressed('fade')`; `finish = finishFor(state, p, key)`; on `'dunk'` with `finish === null` nothing begins; otherwise the shot begins as now with `p.finish = finish` and, for a finish, `p.shotKey` the key pressed.
  - In `moveOne`: a player gathering for a finish is given `gatherVelocity(p, p.finish)` instead of braking to a stop.
  - In `trySteal`: a holder gathering for a finish multiplies the chance by `FINISH.stealFactor`.
  - `boardInWay` in `players.js` becomes a re-export of `behindBoard` from `finish.js`.

- [ ] **Step 1: Write the failing tests** (in `tests/finish.test.js`; drive with `step(s, only(0, intent), DT)`):
  - Space at 4 m/s from 3 m: `finish === 'layup'`, `shooting`, and after 0.5 s (30 steps) he has left the floor; before that he has not.
  - R from 3.2 m with Inside 90: through the gather his distance to the rim falls steadily, and on the step he leaves the floor it is within 0.1 m of 2.2.
  - R from 3 m with Inside 60: `finish === 'layup'`. R from 6 m: `shooting` stays false.
  - Space standing still at 3 m: `finish === null` and the gather lasts `SHOT.gather` (the jump shot, unchanged).
  - No travel is called through a gather from a sprint (`state.call` is not a travel; run 1 s).
  - The pass key during the gather passes the ball and leaves `finish === null`, `shooting === false`.
  - Review Focus 1: a steal that wins during the gather, and `state.phase = 'dead'` set during the gather, each leave `finish === null` and `shooting === false` on the next step and nothing is released afterwards (run 1.5 s; `state.shot` stays `null`).
  - A reach during the gather wins about half as often as on a dribbler: 400 seeded tries each, ratio within 0.35 to 0.65.
- [ ] **Step 2: Run** the file. Expected: FAIL on each new test (no `finish` field).
- [ ] **Step 3: Implement** as the Interfaces say.
- [ ] **Step 4: Run** `npm test`. Expected: all pass. A test that deep-equals a whole player or a whole intent may need `finish: null` or `dunk: false` added: add it, do not loosen the test.
- [ ] **Step 5: Commit** with `feat: Space at a drive and the dunk key begin a finish: two steps to the take-off spot`.

### Task 3: The jump and the layup's release

**Files:**
- Modify: `src/sim/players.js`, `src/sim/ai.js` (only its use of `SHOT_BEST` / `SHOT_LANDS`), `src/render/meter.js`
- Test: `tests/finish.test.js`, `tests/meter.test.js`

**Interfaces:**
- Consumes: `jumpVelocity`, `FINISH`, `gatherOf`.
- Produces:
  - `jumpOf(player) -> m/s`: `FINISH.jump[player.finish]` in a finish, `PLAYER.shotJumpV` otherwise.
  - `shotBest(player) -> seconds after the press`: `gatherOf(player) + SHOT.bestAt * jumpOf(player) / BALL.gravity`; `shotLands(player)`: `gatherOf(player) + 2 * jumpOf(player) / BALL.gravity`. `SHOT_BEST` and `SHOT_LANDS` stay exported with their present values (the jump shot's).
  - `shotTiming(t, worst, best = SHOT_BEST, lands = SHOT_LANDS)`; `makeChance` and `shotWindow` pass `shotBest(player)` and `shotLands(player)`; `shotWindow(...).best` is `shotBest(player)`.
  - In `continueShot`, at the end of a finish's gather: `jump(p, jumpOf(p))`, then `p.vx, p.vz = jumpVelocity(p, p.finish)` (after `jump`, which scales the speed down), and he faces the rim.
  - A layup: let go in the air, it is released then. Still held when `p.vy < 0` first, it is released then. Let go during the gather (`p.letGo`), it is released on the first step at or after `shotBest(p)` and `state.shot.green` is forced `false`. (`releaseShot` gains a second argument `{ green = true } = {}`: when `false`, the release is judged by `makeChance` alone.)
  - In `releaseShot`, `info.finish = player.finish`, and `scoreStats` in `rules.js` copies it: `state.last.score.finish`.
  - `shotMeter` in `src/render/meter.js`: no meter while team 0's shooter is in a dunk; a layup's meter uses `shotWindow` (unchanged call).
  - In `ai.js`, `shoot()` takes the best moment from `shotBest(p)` and clamps to `shotLands(p)` (computed after the press, when `p.finish` is known: set `ai.releaseAt` in `act()` on the step the shot begins, from the jitter drawn in `shoot()`, stored as `ai.releaseOff`).

- [ ] **Step 1: Write the failing tests:**
  - A layup from the take-off spot: `vy` at take-off is 3.2; at `shotBest` he is within 0.1 m of 0.9 m from the rim.
  - Space held and let go at `shotBest`: the release is green and scores (`s.shot.green === true`; run to the basket: `score[0] === 2`); `s.last.score.finish === 'layup'`.
  - Space held to the landing: the ball is released on the first step with `vy < 0`; no travel.
  - Review Focus 5: Space tapped (down one step, then up): the ball is released within one step of `shotBest`, `s.shot.green === false`, and over 300 seeds it goes in between 60% and 95% of the time for a plain 70 player unguarded.
  - A blocked layup and a fouled layup go through the shot's own paths: with a defender in the air in front within `BLOCK.reach`, some seed of 60 gives `s.shot.blocked`.
  - The jump shot's `shotBest` equals `SHOT_BEST`, and `shotTiming(SHOT_BEST)` is still 1 (existing tests must pass untouched).
  - Meter: `shotMeter(state)` is `null` for a team-0 player with `finish === 'dunk'`, and not `null` for a layup.
- [ ] **Step 2: Run.** Expected: FAIL (he jumps at 2.2 and goes nowhere).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat: a layup: carried to the rim on a higher jump and let go like a shot; a tap lays it up at the best moment`.

### Task 4: The dunk

**Files:**
- Modify: `src/sim/players.js`
- Test: `tests/finish.test.js`

**Interfaces:**
- Consumes: Task 3's `continueShot`; `contest(state, player)`; `releaseShot`'s block and foul code.
- Produces:
  - `dunkChance(state, player) -> 0..1`: `FINISH.dunkChance * (1 - FINISH.dunkContest * (1 - contest(state, player)))`.
  - In `continueShot`, for `finish === 'dunk'` in the air: the keys are ignored; on the first step with `p.jumpT >= FINISH.dunkMoment * 2 * FINISH.jump.dunk / BALL.gravity` it calls `releaseDunk(state, p)` and reports it as `report.release`.
  - `releaseDunk(state, player) -> { shooter, defender, blocked }` (the shape `releaseShot` returns):
    1. Further than `FINISH.reach` from the rim's centre: `return releaseShot(state, player, { green: false })` with `player.finish = 'layup'` first.
    2. Otherwise it notes the attempt and builds `ball.info` exactly as `releaseShot` does (extract that part of `releaseShot` into `shotInfo(state, player)` and use it in both), with `green: false`, `finish: 'dunk'`; sets `state.shot` as `releaseShot` does with `green: false`.
    3. The block and the contact defender: the same code as `releaseShot` (extract into `blockedBy(state, player)` and `contactOf(state, player)` and use them in both).
    4. `made = rand(state) < dunkChance(state, player)`; `streak(state, player, made)`.
    5. Made: the ball is put at `(hoop.x, RIM.height + BALL.radius + 0.05, hoop.z)` with velocity `(0, -FINISH.dunkDrop, 0)`, `ball.shooter`, `ball.shotValue = 2`, `ball.made = true`, then `letGo(state, player, 'shot')` and `ball.info = info`. Missed: the ball is put where a release would put it (`SHOT.minRelease` in front of the rim at `player.y + PLAYER.releaseHeight`) and `launchShot(state, player, false, 2, 'clean')`, then `ball.info = info`.

- [ ] **Step 1: Write the failing tests:**
  - R from 3.2 m at a sprint, Inside 90, nobody near: `vy` at take-off is 4.2; the ball leaves his hands on the first step at or after 0.69 of the jump; `score[0] === 2` within 1 s after; `s.last.score.finish === 'dunk'`; `s.shot.green === false`; his box score has one attempt and one make.
  - R tapped and R held give the same match (`JSON.stringify` of the two states after 2 s is equal).
  - Over 400 seeds open, between 94% and 99% score; with a defender standing 0.5 m from him at the rim, between 62% and 85%.
  - The level's `make` does not touch it: on `legend` with team 0, the open share is still above 94%.
  - A miss: for a seed that misses, the ball is loose or rebounded, `score[0] === 0`, and `state.board` was set.
  - A block: a defender in the air within `BLOCK.reach` in front: some seed of 60 gives `s.shot.blocked` and `s.last.block.on === 0`.
  - A foul: the report's `defender` is the id of a defender in the air within `FOUL.contactDist` (assert on the events `step` returns).
  - Review Focus 2: a defender placed on his path 1.2 m in front of the rim: at the dunk's moment he is further than 0.9 m; the ball is released from his hands as a shot (`ball.y` at release is `player.y + PLAYER.releaseHeight`, not the rim's height) and `s.last.score?.finish !== 'dunk'`.
  - The same seed twice gives the same match through a dunk.
- [ ] **Step 2: Run.** Expected: FAIL (a dunk is released like a layup).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat: a dunk: the ball goes down through the rim at 0.69 of the jump, at its own chance; it can be blocked, fouled or missed`.

### Task 5: The computer finishes

**Files:**
- Modify: `src/sim/ai.js`
- Test: `tests/ai.test.js`

**Interfaces:**
- Consumes: `finishFor`, `canDunk`, `FINISH`, `laneClear`.
- Produces: in `planWithBall`, a helper `finish()` used where he now calls `shoot()` at the rim and where he drives a clear lane:
  - A driving handler (the layup's condition met: `finishFor(state, p, 'shoot') === 'layup'`) with the lane clear presses the dunk key if `canDunk`, else Space: `ai.action = 'dunk'` or `shoot()`.
  - With the lane not clear he presses Space (a layup by the same rule).
  - The crowd-and-kick read stays before it.
  - Standing at the rim (`closing < FINISH.drive`) he shoots as now.
  - While driving a clear lane (`goTo(... driveX ...)`) he finishes as soon as `far <= FINISH.layupFar` and `far >= FINISH.takeoff[kind] + 0.3`, instead of running on to `AI.layupDist`.
  - `act()`: `ai.action === 'dunk'` presses `intent.dunk = !p.prev.dunk` once and clears the action; a layup is held and let go as a shot is.

- [ ] **Step 1: Write the failing tests** (use the file's `handler(out, gap, ...)` scene; give the handler `vx` toward his hoop):
  - A handler with Inside 90 driving a clear lane from 4 m: within 1 s `finish === 'dunk'`.
  - The same with Inside 60: `finish === 'layup'`.
  - Inside 90 with a defender on the line to the rim 1.5 m in front of him: `finish === 'layup'`.
  - Crowded at the rim with a team-mate wide open (the existing `atRim(true)` scene): still passes.
  - Standing under the rim (the existing `handler(2, 8)` post-scorer scene): `shooting` with `finish === null`.
  - A computer layup is released within its level's jitter of `shotBest` (Legend: 0.06 s).
- [ ] **Step 2: Run.** Expected: FAIL (no `finish` set by the computer).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass. Tests of the computer shooting at the rim that asserted a plain shot while driving are updated to expect the finish, each with a line saying why.
- [ ] **Step 5: Commit** with `feat: the computer dunks a clear lane when it can and lays it up when it cannot or is guarded`.

### Task 6: The key, the menus and the hints

**Files:**
- Modify: `src/keys.js`, `src/input.js`, `src/render/hud.js`, `index.html`
- Test: `tests/keys.test.js`, `tests/input.test.js`, `tests/hud.test.js`

**Interfaces:**
- Produces: `ACTIONS` gains `'dunk'` after `'fade'`; `DEFAULT_KEYS.dunk = 'KeyR'`; `ACTION_WORDS.dunk = 'Dunk'`; `HELD` in `input.js` gains `'dunk'` and the intent gains `dunk: on('dunk')`; `KEY_ROWS` is twenty long; `index.html` has a twentieth `#keyRows` item and a twelfth line in each Controls list (`ctlK11/ctlW11`, `pctlK11/pctlW11`); the hint line says `R dunk` after the fade.
- `createKeys(saved)`: every action missing from `saved` takes its default if that key is free, otherwise the first key of `KeyA..KeyZ` then `Digit0..Digit9` that no action has.

- [ ] **Step 1: Write the failing tests:**
  - `createKeys().dunk === 'KeyR'`; the intent has `dunk: true` while R is down.
  - Review Focus 4: `createKeys({ steal: 'KeyR' })` gives `steal: 'KeyR'` and `dunk` some other key that no other action has; every action has a key and the keys are all different. `createKeys({})` from a save with no `dunk` gives the defaults.
  - `savedKeys` of the defaults is `{}`; of `bind(keys, 'dunk', 'KeyH')` is `{ dunk: 'KeyH' }`.
  - `controlsLines` and `hintLine` name the dunk with its current key.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Check the Keys panel still fits at 1366x768 (twenty rows): if not, reduce `#keyRows li` padding, nothing else.
- [ ] **Step 4: Run** `npm test`. Expected: all pass (the tests that count nineteen rows or eleven lines are updated to twenty and twelve).
- [ ] **Step 5: Commit** with `feat: a dunk key (R), in the Keys panel, the Controls lists and the hint line`.

### Task 7: From measures to limb directions

**Files:**
- Create: `tools/video/poses.py`, `assets/source/tracked/dunk-one-foot.json`, `assets/source/tracked/layup-finish.json`
- Modify: `tools/video/README.md` (a third step), `assets/source/README.md` (what `tracked/` is)
- Test: `tests/tracked.test.js`

**Interfaces:**
- Consumes: `tools/video/out/NAME/measures.json` (`points`: the cleaned world points per frame, `events`, `frames`, `slowed`).
- Produces `assets/source/tracked/NAME.json`:

```json
{ "clip": "dunk-one-foot", "slowed": 3.59, "hand": "right",
  "moments": [ { "name": "gather", "at": 0.0,
    "limbs": { "leftThigh": [x, y, z], "leftShin": [..], "leftFoot": [..], "rightThigh": [..], "rightShin": [..], "rightFoot": [..],
               "leftUpperArm": [..], "leftForearm": [..], "rightUpperArm": [..], "rightForearm": [..] },
    "trunk": [x, y, z], "shoulders": [x, y, z], "hips": [x, y, z], "seen": { "leftThigh": 0.97, ... } } ] }
```

  Every vector is a unit vector in the body's frame at that moment: `x` toward his left along the line of the hips, `y` up the picture's vertical made square to `x`, `z` out of his chest (`x` cross `y`). `trunk` is from the middle of the hips to the middle of the shoulders; `shoulders` from his right shoulder to his left; `hips` is `[1, 0, 0]` by construction and is kept for the reader. `at` is real seconds from the first moment (video seconds if the clip has no `slowed`). `seen` is the tracker's own confidence for the limb's far joint, averaged over the five frames about the moment. `hand` is the finishing hand as seen in the clip.
- Usage: `tools/video/.venv/bin/python -I tools/video/poses.py NAME --hand right|left`.

- [ ] **Step 1: Write the failing test** `tests/tracked.test.js`: for each of the two files: it parses; every `limbs` vector, `trunk` and `shoulders` has length 1 within 1e-3; moments are in order of `at`; `dunk-one-foot` has the nine moments `gather, step1, step2, deepest, takeoff, cocked, dunk, landing, settled` and `layup-finish` the six `offFloor, rising, tucked, reaching, extended, release`; and three facts of the clip survive the conversion: in `dunk-one-foot` at `takeoff` the right thigh points forward and level (`z > 0.7`, `|y| < 0.5`) and the left shin points down (`y < -0.8`); at `cocked` the right upper arm points up (`y > 0.6`).
- [ ] **Step 2: Run.** Expected: FAIL (no such file).
- [ ] **Step 3: Implement** `poses.py` and run it for both clips: `dunk-one-foot --hand right`, `layup-finish --hand left`. The frame of the body is worked out from the cleaned points; `track.json` supplies `seen`.
- [ ] **Step 4: Run** `node --test tests/tracked.test.js`. Expected: PASS. If the three facts fail, the frame's axes are wrong (most likely a sign): fix `poses.py`, not the test.
- [ ] **Step 5: Commit** the script, the two JSON files, the READMEs and the test with `feat: the measured clips as limb directions at each named moment, numbers only`.

### Task 8: The motions on the rig

**Files:**
- Create: `tools/blender/tracked.py`
- Modify: `tools/blender/poses.py`, `tools/blender/build_motion.py`, `assets/motion.glb`, `assets/motion.json` (rebuilt), `assets/CREDITS.md` (one line: the three motions are made from measurements of reference footage; no footage is included)
- Test: `tests/tracked.test.js`, `tests/poses.test.js`

**Interfaces:**
- Consumes: the tracked JSON (Task 7); `pose_frames`, `flip`, `stand` and the pose dictionaries in `poses.py`; `mirrored` and `add` in `build_motion.py`.
- Produces:
  - `tracked.py`: `aimed(rig, moment, hand) -> { 'mixamorig:Bone': Quaternion turn from rest }` for `Hips` (none: the hips stay level and square), `Spine`, `Spine1`, `Spine2` (the trunk's lean and the shoulders' turn shared equally between them), `LeftUpLeg`, `LeftLeg`, `LeftFoot`, `RightUpLeg`, `RightLeg`, `RightFoot`, `LeftArm`, `LeftForeArm`, `RightArm`, `RightForeArm`. Each limb bone is turned by the shortest turn that takes its rest direction (its tail minus its head in the rig's space) to the measured direction mapped into the rig's axes (the body's `x` is the rig's `+X`, `y` its `+Z`, `z` its `-Y`: he faces `-Y`). A child's turn is worked out after its parent's, so the directions are met in the rig's space, not the parent's. A clip whose `hand` is `left` is mirrored (`x` negated, left and right exchanged) so every motion is made right-handed.
  - `poses.py`: `TRACKED`, a table of the three motions. Each key is `(share, source)` where `source` is `('dunk-one-foot', 'takeoff')` or a dictionary of `overrides` on top of one: bones set by hand as the existing poses set them. Hands and head always come from overrides (`SET`'s right hand for the ball hand; `Neck`/`Head` to keep his eyes on the rim). The layup's legs at `tucked`, `reaching` and `release` are an override, `TUCK`, written by eye (both thighs raised about 45 degrees, knees bent about 90), with the comment `by eye: the clip hides his legs`.

    | Motion | kind | seconds | keys (share: source) |
    |---|---|---|---|
    | `finishGather` | held | 0.5 | 0: gather; 0.33: step1; 0.69: step2; 0.81: deepest; 1: takeoff (the shares are the measured times over 0.52) |
    | `dunk` | held | 0.86 | 0: takeoff; 0.36: cocked; 0.69: dunk; 0.82: dunk with the right arm at `SIDES`; 1: landing |
    | `layup` | held | 0.65 | 0: dunk-one-foot takeoff; 0.3: layup-finish tucked; 0.5: reaching; 0.62: release; 0.8: release with the arm at `SIDES`; 1: dunk-one-foot landing |

  - `build_motion.py`: builds the three with `pose_frames`-style easing between keys, the hips lowered so the lower toe is on the floor during `finishGather` and left where the take-off put them in the two flights (a flight's height is the match's); adds each with `from: 'tracked'`, `whole: true`, and its twin through `MIRRORS` (`finishGatherLeft`, `dunkLeft`, `layupLeft`); film strips for them with `--strips`.

- [ ] **Step 1: Write the failing tests** (in `tests/tracked.test.js`, with the real mixer on `assets/motion.glb`, as `tests/poses.test.js` does):
  - The six motions exist, are `whole`, say `from: 'tracked'`, and last 0.5, 0.86 and 0.65 s to the nearest frame.
  - At each keyed moment that is purely measured (no override on that limb), the built bone's direction (child joint minus joint, in the model's space) is within 20 degrees of the tracked direction, for thighs, shins, upper arms and forearms.
  - `dunk` at 0.69: the right wrist is above the head and in front of the hips; `layup` at 0.62: the right wrist is above the head.
  - `finishGather` at 0, 0.33, 0.69: a toe of the planted foot is on the floor (within 0.03 m of the stance's), and at 1 the left leg is the straighter of the two.
  - `dunkLeft` at 0.69 is `dunk` in a mirror (left wrist `x` equals minus the right's within 0.03).
- [ ] **Step 2: Run.** Expected: FAIL (no such motion).
- [ ] **Step 3: Implement**, then `blender-4.5 --background --python tools/blender/build_motion.py -- --shots <scratchpad>/strips --strips finishGather,dunk,layup`.
- [ ] **Step 4: Look at the three film strips** beside `tools/video/out/dunk-one-foot/sheet.png`. A limb that reads wrong (an arm through the body, a knee bent the wrong way) is corrected by an override on that key, with a comment saying what the tracker got wrong. Then `npm test`: all pass.
- [ ] **Step 5: Commit** with `feat: the gather, the dunk and the layup as motions on the rig, made from the measured clips`.

### Task 9: The motions in the game

**Files:**
- Modify: `src/render/motion.js`, `src/render/hands.js`, `src/render/people.js`, `src/render/checks.js` if it lists required motions
- Test: `tests/moves.test.js`, `tests/hands.test.js`, `tests/animator.test.js`

**Interfaces:**
- Consumes: `player.finish`, `player.shotT`, `player.jumpT`, `player.takeoff`; `gatherOf` and `finishHand` from the sim; `wholeBody`; the planting in `feet.js`.
- Produces:
  - `ARM_CLIPS` gains the six names; `MOTION.quick` gains them.
  - `armMotion`: before the plain shot's line: in a finish, on the floor: `{ clip: 'finishGather' (+ 'Left' for the left hand), at: player.shotT / FINISH.gather }`; in the air while he still has the ball or within the jump: `{ clip: player.finish (+ 'Left'), at: jumpShare(player) }`. After the release the finish's own clip plays on until he lands (so the arm follows through), instead of the shot's `follow`: `marks` remembers the finish he released (`marks.finished[id] = { clip, hand }` set in `noteChanges` when a player who was in a finish is in the air without the ball; cleared when he lands).
  - `ballHands(clip)`: `'both'` for `finishGather*`; `'carryRight'` / `'carryLeft'` for `dunk*` and `layup*` (the twin's is the other hand). `carrying(holder, hands)` gives `'<id> carry'` for those.
  - `heldBall` in `people.js`: for a carry, the palm of that hand (`palmOf`).
  - `people.update` already passes `!standing && onFloor(player)` as the planting flag: nothing to change; the test below proves the gather is planted.

- [ ] **Step 1: Write the failing tests:**
  - `armMotion` for a player with `finish: 'dunk'`, `shooting`, on the floor at `shotT 0.25`: `{ clip: 'finishGather', at: 0.5 }`; from the other side of the rim: `finishGatherLeft`.
  - In the air with the ball at half the jump: `{ clip: 'dunk', at: 0.5 }`; a layup: `layup`.
  - After the release, still in the air: the same clip, further on; landed: no longer.
  - `ballHands` and `carrying` as above.
  - Animator, with the real file: a gather played from 0 to 1 over 0.5 s while the group is carried 1.5 m forward: a flat foot slides less than 0.1 m (measured as in `tests/feet.test.js`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** `node --check src/render/people.js`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat: the gather, the dunk and the layup are drawn: the ball in both hands, then in the finishing hand; the two steps are planted`.

### Task 10: The broadcast and the sound

**Files:**
- Modify: `src/broadcast/commentary.js`, `src/audio/cues.js`
- Test: `tests/commentary.test.js`, `tests/cues.test.js`

**Interfaces:**
- Consumes: `state.last.score.finish`.
- Produces: `LINES.dunk` and `LINES.layup`, three wordings each with `{name}` (no real name, no trademark); `lineFor` uses them for a `made` happening whose score has that `finish`, at the rank of an ordinary basket; `listen` in `cues.js`: a basket whose `state.last.score.finish === 'dunk'` cues the rim (gain 1) and the net together, and `frameCues` asks for `cheerBig` once for it.

- [ ] **Step 1: Write the failing tests:** a `made` happening with `finish: 'dunk'` gives one of `LINES.dunk` with the scorer's name filled in; with `finish: 'layup'`, one of `LINES.layup`; with none, as now. A dunk's basket cues `rim1` or `rim2` and `net` on that step, and `cheerBig` on that frame, once. No line contains `{`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** with `feat: the commentator calls a dunk and a layup; a dunk rattles the rim and lifts the crowd`.

### Task 11: Measure, look, and say what was built

**Files:**
- Modify: `docs/superpowers/specs/2026-11-14-dunks-layups-design.md` (an "As built" section), `src/sim/tuning.js` only if the measures call for it
- No test file; the measures are recorded in the spec.

- [ ] **Step 1: Balance.** With `scratchpad/balance/flavour.mjs` extended to count baskets by `last.score.finish`: 30 computer matches at each size on this branch and on `main`. Record points, seconds a possession, and the share of baskets that are dunks and layups. If points rise by more than a tenth at either size, lower `FINISH.dunkChance` (first to 0.93) or raise `FINISH.dunkAt` (to 82) and measure again; record what was turned and why.
- [ ] **Step 2: Feet.** `scratchpad/slide.mjs` with two new scenarios (a layup and a dunk from a sprint): a flat foot slides less than 0.1 m through each gather. If not, the gather's keys and the two steps disagree: adjust the shares in `TRACKED`, not the planting.
- [ ] **Step 3: In the game.** With the hidden test page: a dunk and a layup by the ball handler, stills at the gather's two steps, the take-off, the finish and the landing, from the side; the ball in the right hands at each; no error in the console; the Keys panel with twenty rows at 1366x768.
- [ ] **Step 4: The spec's "As built".** Every difference from the spec, each with what it costs; the measures of Steps 1 and 2; what was not checked.
- [ ] **Step 5:** `npm test` (all pass), `npm run single`, commit the spec with `docs: dunks and layups as built, and what was measured`, and send `dist/triple-threat.html`.

### Task 12: Final review

- [ ] **Step 1:** `scripts/review-package` over the branch from its merge base with `main`; self-review against the package, the spec and the Review Focus list (one developer: say in the final message that the review was the author's own). Write `Final review: self-review` in the ledger.
- [ ] **Step 2:** Each Critical or Important finding: a test that fails, the fix, the suite green; one pass.
- [ ] **Step 3:** The final message lists every `Ruling:` with what it costs if wrong, every deferred minor, what was measured and what was not checked. Nothing is merged without the owner's word.

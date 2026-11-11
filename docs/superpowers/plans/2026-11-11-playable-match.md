# Playable Match (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A complete 3v3 full-court basketball match, playable in the browser against computer opponents, with placeholder players on a bare court.

**Architecture:** The match is a plain JavaScript state object advanced by a pure `step(state, intents, dt)` at a fixed 60 Hz. Keyboard and AI both produce the same `Intent` object per player. A Three.js renderer reads the state each frame and draws it; nothing in the simulation knows about Three.js or the DOM.

**Tech Stack:** JavaScript ES modules, `three@0.187.0` (`WebGPURenderer`, loaded by import map, no bundler), Node 26 built-in test runner, `python3 -m http.server` as the static server.

**Spec:** `docs/superpowers/specs/2026-11-11-playable-match-design.md`

## Global Constraints

- Nothing under `src/sim/` may import Three.js or touch `window`, `document` or any DOM API.
- The only npm dependency is `three@0.187.0`. No bundler, no test library, no physics engine.
- Tests run with `npm test`, which is `node --test "tests/*.test.js"`.
- All distances are metres. `x` runs along the court's length, `z` across its width, `y` up, origin at centre court.
- Team 0 is the human's team and attacks the hoop at `+x`. Team 1 attacks `-x`. Teams do not swap ends.
- FIBA values: court 28 × 15, rim height 3.05, rim radius 0.225, rim centre 1.575 from the baseline, three-point arc 6.75 with corners at 6.6 from the centre line, ball radius 0.12.
- The simulation advances only in fixed steps of `DT = 1/60`.
- Every tunable number lives in `src/sim/tuning.js`. No magic numbers elsewhere in `src/sim/`.
- All randomness goes through `rand(state)` so a match with the same seed replays identically.
- HUD text is real HTML text, not drawn on the canvas.
- Three.js WebGPU APIs change between releases. Before writing renderer code, read the current `WebGPURenderer` documentation and the `webgpu_*` examples shipped in `node_modules/three/examples/`; do not rely on memory.

## Review Focus

Conditions the spec implies but does not spell out, most likely first. Each has a test in the task named.

1. A shot already in the air when the game clock or shot clock reaches zero still counts, and is not a violation if it hits the rim. (Task 6)
2. Holding Space all the way through the jump: the ball is released on landing, and the player is never left stuck in a shooting state. (Task 5)
3. The window loses focus while keys are held: no key stays "stuck down" afterwards. (Task 9)
4. Moving diagonally (two keys at once) is no faster than moving straight. (Task 4)
5. A ball that comes to rest balanced on the rim rolls off by itself instead of stalling the match. (Task 3)

---

## Shared types

Used by every task. Defined in Task 2.

```js
// Intent: what one player wants to do this step. Keyboard and AI both make these.
{ moveX, moveZ,          // -1..1 each
  sprint, shoot, pass, steal, switch }   // booleans; shoot is "held"

// Player
{ id,                    // 0..5; ids 0-2 are team 0, 3-5 are team 1
  team, slot,            // slot 0..2 within the team
  x, z, y, vx, vz, vy,   // y is height of the feet above the floor
  facing,                // radians, 0 = +x, measured toward +z
  shooting,              // true from shot jump until release
  jumpT,                 // seconds since the current jump began
  inbounder,             // true while standing out of bounds to pass in
  stealCooldown,         // seconds until the next steal attempt is allowed
  prev,                  // previous step's Intent booleans, for edge detection
  ai }                   // { timer, targetX, targetZ, sprint, action } owned by ai.js

// Ball
{ x, y, z, vx, vy, vz,
  holder,                // player id or null
  mode,                  // 'held' | 'shot' | 'pass' | 'loose'
  shooter, shotValue,    // id and 2|3, set at release, cleared when the shot resolves
  noPickupId, noPickupT} // the passer or shooter cannot re-take the ball for this long

// Match state
{ seed, time,
  phase,                 // 'start' | 'inbound' | 'live' | 'dead' | 'quarterEnd' | 'final'
  phaseT,                // seconds left in a timed phase ('dead', 'quarterEnd')
  quarter, gameClock, shotClock,
  score,                 // [team0, team1]
  possession,            // team entitled to the ball
  lastTouch,             // team that last touched the ball, or null
  controlled,            // id of the human-controlled player (always team 0)
  inboundSpot,           // { x, z }
  players, ball }
```

Hoop sign `s` is `+1` for the hoop at `+x` and `-1` for the hoop at `-x`. Team `t` attacks hoop sign `t === 0 ? 1 : -1`; `attackSign(team)` returns it.

---

### Task 1: Project scaffold and browser probe

**Files:**
- Create: `package.json`, `.gitignore`, `index.html`, `probe.html`, `.claude/launch.json`

**Interfaces:**
- Produces: `npm test`, `npm start` (static server on port 5173), the import map every browser module relies on, and HUD element ids used by Task 9.

- [ ] **Step 1: Initialise the repository and install the dependency**

```bash
git init
npm init -y
npm install three@0.187.0
```

Set in `package.json`: `"type": "module"`, `"private": true`, `"scripts": { "test": "node --test \"tests/*.test.js\"", "start": "python3 -m http.server 5173" }`. `.gitignore` contains `node_modules/`.

- [ ] **Step 2: Write `.claude/launch.json`**

One configuration named `game`: `runtimeExecutable` `python3`, `runtimeArgs` `["-m", "http.server", "5173"]`, `port` 5173.

- [ ] **Step 3: Write `index.html`**

Contains, in order: a full-window `<canvas id="court">`; the HUD elements below; the import map; `<script type="module" src="./src/main.js">`.

Import map (paths verified against the package's export map):

```json
{ "imports": {
  "three": "./node_modules/three/build/three.webgpu.js",
  "three/webgpu": "./node_modules/three/build/three.webgpu.js",
  "three/tsl": "./node_modules/three/build/three.tsl.js",
  "three/addons/": "./node_modules/three/examples/jsm/"
} }
```

HUD ids: `score0`, `score1`, `quarter`, `gameClock`, `shotClock`, `backend`, `controls`, and three screens `screenStart`, `screenPause`, `screenFinal` (each a `<section>` with the `hidden` attribute). Wrap the scoreboard in an element with `aria-live="polite"`. Text colour and background must reach a 4.5:1 contrast ratio.

- [ ] **Step 4: Write `probe.html`**

A standalone page, no imports, that prints as text: whether `navigator.gpu` exists, whether `requestAdapter()` returns an adapter and its `info.vendor` / `info.description`, whether a `webgl2` context can be created, and `navigator.userAgent`.

- [ ] **Step 5: Verify**

Run `npm start`, open `http://localhost:5173/probe.html` in the Browser pane and read the page text. Expected: four lines of results and no console errors. Then ask the owner to open the same address in Firefox and report what it shows. Record both results in the commit message.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore index.html probe.html .claude/launch.json docs
git commit -m "chore: scaffold project and add browser capability probe"
```

---

### Task 2: Tuning constants and match state

**Files:**
- Create: `src/sim/tuning.js`, `src/sim/state.js`
- Test: `tests/state.test.js`

**Interfaces:**
- Produces:
  - `tuning.js` named exports, all plain frozen objects:
    - `DT = 1/60`
    - `COURT = { halfLength: 14, halfWidth: 7.5, margin: 1.5 }`
    - `RIM = { x: 12.425, height: 3.05, radius: 0.225, tube: 0.02 }`
    - `BOARD = { x: 12.8, halfWidth: 0.9, bottom: 2.9, top: 3.95 }`
    - `THREE_PT = { radius: 6.75, cornerZ: 6.6 }`
    - `BALL = { radius: 0.12, gravity: 9.81, floorBounce: 0.75, rimBounce: 0.55, boardBounce: 0.6, restSpeed: 0.5 }`
    - `PLAYER = { radius: 0.3, run: 5, sprint: 7, accel: 30, jumpV: 4, releaseHeight: 2.3, reach: 2.4, pickupRadius: 0.7 }`
    - `SHOT = { nearChance: 0.85, farChance: 0.35, farDist: 8, minChance: 0.05, worstTiming: 0.6, contestDist: 2, maxContest: 0.5, airContest: 0.8, airContestDist: 1.5, missMin: 0.18, missMax: 0.32, minAngle: 50 }`
    - `PASS = { speed: 14, noPickup: 0.3 }`
    - `STEAL = { reach: 1.2, frontChance: 0.35, backChance: 0.1, cooldown: 1 }`
    - `BLOCK = { reach: 1.2, minHeight: 0.3, chance: 0.5 }`
    - `CLOCK = { quarters: 4, quarter: 180, overtime: 60, shot: 24, dead: 1.5, quarterBreak: 2 }`
    - `AI = { interval: 0.3, openDist: 1.8, shootRange: 7.5, laneWidth: 1, panicClock: 4, stealRate: 0.15, inboundDelay: 1, swapEvery: 6, onBallGap: 1, offBallGap: 2 }`
  - `state.js`:
    - `createMatch(seed = 1) → state` in phase `'start'`, quarter 1, `gameClock` 180, `shotClock` 24, score `[0, 0]`, six players standing in two lines either side of centre court, ball on the floor at centre, `controlled` 0.
    - `rand(state) → number` in `[0, 1)`; mulberry32 on `state.seed`, advancing it.
    - `emptyIntent() → Intent` with zeros and falses.
    - `attackSign(team) → 1 | -1`.

- [ ] **Step 1: Write the failing tests**

```js
test('createMatch builds six players, three per team', () => {
  const s = createMatch();
  assert.equal(s.players.length, 6);
  assert.deepEqual(s.players.map(p => p.team), [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(s.players.map(p => p.slot), [0, 1, 2, 0, 1, 2]);
  assert.equal(s.phase, 'start');
  assert.equal(s.gameClock, 180);
  assert.deepEqual(s.score, [0, 0]);
});
test('rand is deterministic per seed and stays in [0,1)', () => {
  const a = createMatch(7), b = createMatch(7);
  const xs = Array.from({ length: 100 }, () => rand(a));
  assert.deepEqual(xs, Array.from({ length: 100 }, () => rand(b)));
  assert.ok(xs.every(x => x >= 0 && x < 1));
});
test('attackSign', () => { assert.equal(attackSign(0), 1); assert.equal(attackSign(1), -1); });
```

- [ ] **Step 2:** Run `npm test`. Expected: FAIL, cannot find module `src/sim/state.js`.
- [ ] **Step 3:** Implement `tuning.js` and `state.js` to the Interfaces block.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `git add src tests && git commit -m "feat: tuning constants and match state"`. Later tasks commit the same way with the message given.

---

### Task 3: Ball physics and shot solver

**Files:**
- Create: `src/sim/ball.js`
- Test: `tests/ball.test.js`

**Interfaces:**
- Consumes: `BALL`, `RIM`, `BOARD`, `SHOT`, `DT` from `tuning.js`.
- Produces:
  - `stepBall(ball, dt) → { hitFloor, hitRim, hitBoard, scored }`. Advances a free ball (`holder === null`) one step. `scored` is `1`, `-1` or `0`: the sign of the hoop the ball went through this step.
  - `solveShot(from, target) → { vx, vy, vz }`. Launch velocity that carries the ball centre from `from {x,y,z}` through `target {x,y,z}` under gravity.
  - `rimCentre(sign) → { x, y, z }`.

Behaviour to implement:

- **Flight:** semi-implicit Euler with `BALL.gravity`.
- **Floor:** when `y < radius`, set `y = radius`, reverse `vy` scaled by `floorBounce`, scale horizontal speed by 0.98. If the rebound `|vy| < restSpeed`, set `vy = 0`.
- **Backboard:** each board is the rectangle `|z| ≤ halfWidth`, `bottom ≤ y ≤ top` in the plane `x = ±BOARD.x`, facing centre court. A ball centre within that rectangle that comes within `radius` of the plane while moving toward it is pushed back and has its `x` velocity reversed and scaled by `boardBounce`.
- **Rim:** each rim is a horizontal circle of radius `RIM.radius` at `RIM.height` around `rimCentre(sign)`. Find the nearest point on that circle to the ball centre; if the distance is under `BALL.radius + RIM.tube`, push the ball out along that direction and reflect the velocity about it, scaled by `rimBounce`. If the contact direction is within 5° of straight up, also add 0.3 m/s of horizontal velocity toward centre court (Review Focus 5).
- **Basket:** `scored` is set when the ball centre crosses `y = RIM.height` moving down and its horizontal distance from the rim centre is under `RIM.radius`.

`solveShot` algorithm (the signature does not determine it):

```js
// d = horizontal distance, h = target.y - from.y, g = BALL.gravity
// angle = clamp(max(SHOT.minAngle°, atan2(h, d) + 20°), up to 80°)
// speed² = g·d² / (2·cos²(angle)·(d·tan(angle) − h))
// split speed into horizontal (toward target) and vertical parts
```

- [ ] **Step 1: Write the failing tests**

A helper `fly(ball, seconds)` steps the ball at `DT` and returns the merged events (`scored` is the first non-zero value).

```js
test('dropped ball bounces to 0.75² of its drop height', () => {
  // drop from y=2.12 (2 m of fall); peak after first bounce ≈ 0.12 + 2·0.75² = 1.245, ±0.05
});
test('ball settles on the floor and stops bouncing', () => {
  // after 10 s: y === 0.12 and vy === 0
});
test('solveShot goes in from a grid of positions', () => {
  // for x in [0, 4, 8, 11], z in [-6, 0, 6], release y in [2.3, 3.1]:
  // launch at rimCentre(1); fly 4 s; assert scored === 1
});
test('solveShot works for the -x hoop', () => { /* from (-6, 2.5, 2) → scored === -1 */ });
test('a ball rising through the rim from below does not score', () => {
  // start under rim centre, vy = +6 → scored stays 0 while vy > 0
});
test('a shot aimed 0.3 m wide of the rim centre does not swish', () => {
  // target = rimCentre(1) with z + 0.3; fly until first hitRim or hitFloor; assert hitRim before any score
});
test('backboard reflects the ball', () => {
  // ball at (12.4, 3.4, 0) with vx = +5 → within 0.2 s hitBoard is true and vx < 0
});
test('ball resting on top of the rim rolls off', () => {
  // ball at (RIM.x - RIM.radius, RIM.height + 0.14, 0), zero velocity; fly 3 s; assert y < 2.5
});
```

- [ ] **Step 2:** Run `npm test`. Expected: FAIL, cannot find module `src/sim/ball.js`.
- [ ] **Step 3:** Implement `ball.js` as described.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: ball physics and shot solver`.

---

### Task 4: Player movement

**Files:**
- Create: `src/sim/players.js`
- Test: `tests/movement.test.js`

**Interfaces:**
- Consumes: `PLAYER`, `COURT`, `BALL` from `tuning.js`; state shapes from Task 2.
- Produces:
  - `movePlayers(state, intents, dt)`. For each player: accelerate toward `(moveX, moveZ)` normalised to length ≤ 1, times `run` or `sprint`; turn `facing` toward the direction of travel; apply jump gravity to `y`/`vy`; push overlapping players apart; clamp to the court plus `COURT.margin`.
  - `carryBall(state, dt)`. If `ball.holder !== null`, place the ball 0.4 m in front of the holder at hand height; while the holder is on the floor and moving, bounce it between floor and hand height.
  - `jump(player)`. If on the floor, set `vy = PLAYER.jumpV` and `jumpT = 0`.

Rules:

- A player with `inbounder === true` does not move and is not clamped.
- Two players at the same position separate along a fixed axis; no `NaN`.
- Movement input is ignored while a player is in the air (they keep their horizontal velocity).

- [ ] **Step 1: Write the failing tests**

```js
test('reaches run speed 5 and sprint speed 7', () => { /* 1 s of moveX=1 → |vx| within 0.05 of 5; with sprint → 7 */ });
test('diagonal input is no faster than straight', () => { /* moveX=1, moveZ=1 for 1 s → speed ≤ 5.05 */ });
test('stops when input is released', () => { /* 1 s moving then 0.5 s of empty intent → speed < 0.1 */ });
test('jump rises about 0.82 m and lands', () => { /* peak y within 0.05 of 4²/(2·9.81); after 1 s y === 0 and vy === 0 */ });
test('overlapping players are pushed apart', () => { /* two players 0.2 apart → after 0.5 s distance ≥ 0.6 */ });
test('identical positions separate without NaN', () => { /* same x,z → all coordinates finite, distance > 0 */ });
test('players cannot leave the court margin', () => { /* run at +x for 10 s → x ≤ 14 + 1.5 */ });
test('inbounder does not move', () => {});
test('held ball follows its holder', () => { /* after carryBall, horizontal distance holder→ball within 0.05 of 0.4 */ });
```

- [ ] **Step 2:** Run `npm test`. Expected: FAIL, cannot find module `src/sim/players.js`.
- [ ] **Step 3:** Implement the three functions.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: player movement, jumping and ball carrying`.

---

### Task 5: Player actions

**Files:**
- Modify: `src/sim/players.js`
- Test: `tests/actions.test.js`

**Interfaces:**
- Consumes: `solveShot`, `rimCentre` from `ball.js`; `rand`, `attackSign` from `state.js`; `SHOT`, `PASS`, `STEAL`, `BLOCK`, `PLAYER`, `THREE_PT`, `RIM`.
- Produces:
  - `isThree(x, z, sign) → boolean`: true when `|z| > THREE_PT.cornerZ` or the distance from `(x, z)` to the rim centre exceeds `THREE_PT.radius`.
  - `makeChance(state, player) → number`: `distance factor × timing factor × contest factor`.
    - Distance: linear from `nearChance` at 0 m to `farChance` at `farDist`, continuing down to a floor of `minChance`.
    - Timing: 1 at the jump's apex, falling linearly to `worstTiming` at take-off and at landing.
    - Contest: with `d` the distance to the nearest opponent, `clamp(maxContest + (1 − maxContest)·d / contestDist, maxContest, 1)`, times `airContest` if that opponent is in the air within `airContestDist`.
  - `releaseShot(state, player)`: rolls `rand(state) < makeChance`. A make targets `rimCentre`; a miss targets a point `missMin..missMax` metres from it in a random horizontal direction. Launches the ball from the player's position at `y + releaseHeight`, sets `mode = 'shot'`, `shooter`, `shotValue` (from `isThree` at the player's feet), `holder = null`, `shooting = false`, and the no-pickup fields. Before launching, applies the block rule.
  - `passBall(state, player, intent)`: chooses the teammate whose direction best matches `(moveX, moveZ)`, or the nearest teammate when there is no movement input. Launches at `PASS.speed` toward where the receiver will be, with enough lift to arrive at the height it left. Sets `mode = 'pass'`. If the passer is team 0, sets `state.controlled` to the receiver.
  - `trySteal(state, player)`: only if `stealCooldown ≤ 0`, the ball is held by an opponent within `STEAL.reach`, and that opponent is not an inbounder. Success chance `frontChance` if the thief is within 120° of the holder's facing, else `backChance`. Success gives the thief the ball; either way sets `stealCooldown`.
  - `tryPickup(state)`: a free ball not in `'shot'` mode is taken by the nearest player within `pickupRadius` horizontally whose `y + reach` is at least the ball's height, excluding `noPickupId` while `noPickupT > 0`. Returns the player or `null`.
  - `giveBall(state, player)`: sets holder, `mode = 'held'`, `lastTouch`, `possession`; if the team changed, resets `shotClock` to 24; if the team is 0, sets `controlled`.
  - `applyActions(state, intents, dt)`: the per-step dispatcher. Uses `player.prev` for rising edges.
    - With the ball: `shoot` pressed on the floor → `jump` and `shooting = true`; `shoot` released in the air, or landing while `shooting` → `releaseShot`; `pass` pressed → `passBall`. An inbounder may only pass.
    - Without the ball: `shoot` pressed → `jump`; `steal` pressed → `trySteal`; `switch` pressed by the controlled player while team 0 lacks the ball → `controlled` becomes the team 0 player nearest the ball.
    - Then `tryPickup`, and `giveBall` to whoever it returns.

Block rule: at release, if an opponent is higher than `BLOCK.minHeight`, within `BLOCK.reach`, and inside the 90° cone in front of the shooter, then with probability `BLOCK.chance` the ball is not shot: it becomes `'loose'` with a 4 m/s velocity away from the hoop and `lastTouch` set to the blocker's team.

- [ ] **Step 1: Write the failing tests**

```js
test('isThree: arc and corners', () => {
  assert.equal(isThree(12.425 - 6.7, 0, 1), false);
  assert.equal(isThree(12.425 - 6.8, 0, 1), true);
  assert.equal(isThree(13, 6.7, 1), true);    // corner, inside the arc radius but past the corner line
  assert.equal(isThree(-12.425 + 6.8, 0, -1), true);
});
test('makeChance falls with distance', () => { /* open shooter at apex: 1 m > 4 m > 7 m; 1 m within 0.02 of 0.85 − 0.5/8 */ });
test('makeChance is best at the apex', () => { /* jumpT at apex > jumpT = 0; ratio within 0.02 of 0.6 */ });
test('makeChance falls when a defender is close, more if airborne', () => { /* open > defender at 0.5 m > same defender in the air */ });
test('releaseShot launches a 3 from behind the arc', () => { /* ball.mode 'shot', shotValue 3, holder null, shooter set */ });
test('holding shoot through landing releases the ball', () => {
  // intent.shoot = true for 2 s via applyActions + movePlayers:
  // afterwards ball.holder === null, player.shooting === false, player.y === 0
});
test('pass goes to the teammate in the input direction', () => {});
test('pass with no input goes to the nearest teammate', () => {});
test('passing as team 0 moves control to the receiver', () => {});
test('a free ball is picked up by the nearest player in reach', () => {});
test('the passer cannot immediately re-take their own pass', () => {});
test('a ball in shot mode cannot be picked up', () => {});
test('steal respects the cooldown', () => { /* second attempt within 1 s changes nothing and draws no random number */ });
test('gaining the ball from the other team resets the shot clock to 24', () => {});
test('switch moves control to the defender nearest the ball', () => {});
test('an inbounder can pass but not shoot', () => {});
test('an inbounder cannot be stolen from', () => {});
```

- [ ] **Step 2:** Run `npm test`. Expected: FAIL, `isThree` is not exported.
- [ ] **Step 3:** Implement to the Interfaces block.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: shooting, passing, stealing, blocking and pickups`.

---

### Task 6: Rules and the step function

**Files:**
- Create: `src/sim/rules.js`, `src/sim/step.js`
- Test: `tests/rules.test.js`

**Interfaces:**
- Consumes: `stepBall` (Task 3); `movePlayers`, `carryBall`, `applyActions`, `giveBall` (Tasks 4–5); `CLOCK`, `COURT`, `RIM`.
- Produces:
  - `startMatch(state)`: from `'start'`, sets up quarter 1 with team 0 inbounding at the half-court sideline.
  - `applyRules(state, ballEvents, dt)`: clocks, scoring, out of bounds, shot clock, phase changes.
  - `step(state, intents, dt)`: in `'start'` and `'final'` does nothing. Otherwise, in order: `movePlayers`, `applyActions`, `carryBall` or `stepBall`, `applyRules`, then stores each player's `prev` intent and advances `state.time`. In `'dead'` and `'quarterEnd'` it skips `applyActions` and ignores the ball's events, so nobody can shoot, steal, pick up the ball or score while play is stopped; players still move and the ball still falls.

Rules to implement:

- **Phases:** `inbound` → `live` when a player who is not the inbounder gains the ball. `live` → `dead` on a basket, out of bounds, or shot-clock expiry, for `CLOCK.dead` seconds. `dead` → `inbound` via the inbound setup below.
- **Clocks:** `gameClock` and `shotClock` run only in `'live'`.
- **Basket:** when `stepBall` reports `scored = s`, the team attacking hoop `s` gets `ball.shotValue`, or 2 if no shot was in progress. Possession goes to the other team. Inbound spot: `(s·14.5, 2)`.
- **Out of bounds:** a free ball touching the floor outside the lines, or a holder (not the inbounder) whose centre is outside the lines. Possession goes to the team that is not `lastTouch`. Inbound spot: the point where it left, moved 0.5 m outside the nearest line.
- **Shot clock:** resets to 24 when the ball hits the rim. At zero, if the ball is not in `'shot'` mode: possession to the other team, inbound at the nearest sideline point. While a shot is in the air the clock holds at zero.
- **Shot resolves:** a `'shot'` ball becomes `'loose'` when it hits the floor, rim or backboard; `shooter` and `shotValue` are cleared when it hits the floor or is picked up, so a shot that bounces in off the rim still scores its value.
- **End of period:** when `gameClock` reaches zero and the ball is not in `'shot'` mode, go to `'quarterEnd'` for `CLOCK.quarterBreak` seconds. Then: if `quarter < 4`, or the score is tied, start the next period (`quarter + 1`; 180 s for quarters 2–4, 60 s for overtime); otherwise go to `'final'`.
- **Start of a period:** players return to their starting lines; inbound at the half-court sideline `(0, 8)`. Team 0 inbounds odd-numbered periods, team 1 even.
- **Inbound setup:** the nearest player of the entitled team is placed on the spot with the ball, `inbounder = true`, facing the court. `shotClock` is 24. The flag clears when the phase becomes `'live'`.

```js
// shortcut: the inbounder is teleported to the spot, visible as a small jump; walk them there when animations arrive in milestone 3
```

- [ ] **Step 1: Write the failing tests**

Each test builds a state with `createMatch`, calls `startMatch`, then sets up the situation directly on the state and calls `step` with empty intents.

```js
test('startMatch: team 0 inbounds at half court, clocks stopped', () => {
  // phase 'inbound', possession 0, one team-0 player with inbounder true at z = 8;
  // after 2 s of steps gameClock is still 180
});
test('clock starts when the inbound pass is caught', () => { /* phase becomes 'live'; inbounder flags all false */ });
test('a made two scores 2 and gives the ball to the other team under that hoop', () => {
  // ball dropped through rimCentre(1) with shooter id 0, shotValue 2 → score [2, 0], phase 'dead',
  // possession 1, inboundSpot.x === 14.5
});
test('a made three scores 3', () => {});
test('a ball through the hoop with no shooter scores 2', () => {});
test('loose ball landing out of bounds goes to the team that did not touch it last', () => {});
test('a holder stepping out of bounds loses the ball', () => {});
test('shot clock expiry is a turnover', () => { /* shotClock 0.01, ball held → phase 'dead', possession flips */ });
test('shot clock resets to 24 when the ball hits the rim', () => {});
test('a shot in the air at shot-clock zero is not a violation if it hits the rim', () => {});
test('an airball at shot-clock zero is a violation when it lands', () => {});
test('a shot in the air when the game clock hits zero still counts', () => {
  // gameClock 0.05, ball mid-flight on a solveShot make → score increases, then phase 'quarterEnd'
});
test('quarter 1 ends into quarter 2 with team 1 inbounding', () => { /* quarter 2, gameClock 180, possession 1 */ });
test('a lead after quarter 4 ends the match', () => { /* phase 'final' */ });
test('a tie after quarter 4 starts a 60-second overtime', () => { /* quarter 5, gameClock 60 */ });
test('step does nothing in start and final phases', () => {});
test('nobody can pick up the ball or score during a dead phase', () => {});
```

- [ ] **Step 2:** Run `npm test`. Expected: FAIL, cannot find module `src/sim/rules.js`.
- [ ] **Step 3:** Implement `rules.js` and `step.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: match rules and step function`.

---

### Task 7: Computer players

**Files:**
- Create: `src/sim/ai.js`
- Test: `tests/ai.test.js`, `tests/match.test.js`

**Interfaces:**
- Consumes: state shapes; `AI`, `RIM`, `PLAYER`, `CLOCK`; `attackSign`, `rand`, `emptyIntent`.
- Produces:
  - `aiIntents(state, dt) → Intent[6]`. Each player's `ai.timer` counts down; at zero the player re-plans (`ai.targetX`, `ai.targetZ`, `ai.sprint`, `ai.action`) and the timer resets to `AI.interval` plus up to 0.1 s of random jitter. Every step, the plan is turned into an intent: move toward the target, stopping within 0.3 m.
  - `isOpen(state, player) → boolean`: no opponent within `AI.openDist`.
  - `laneClear(state, player) → boolean`: no opponent within `AI.laneWidth` of the segment from the player to the hoop they attack.
  - `spots(sign) → [{x,z}, {x,z}, {x,z}]`: `(s·6.9, −4.5)`, `(s·6.9, 4.5)`, `(s·10.9, 2.5)`.

Planning rules:

- **Ball handler**, first match wins:
  1. `shotClock < AI.panicClock` → shoot.
  2. `isOpen` and within `AI.shootRange` of the hoop → shoot.
  3. `laneClear` → target `(s·11.2, 0)`, sprint.
  4. Otherwise pass to the open teammate nearest the hoop; if none is open, target `(s·5.5, 0)`.
- **Shooting** is an action that lasts several steps: hold `shoot` until `vy ≤ 0` (the apex), then release.
- **Passing:** set `pass` for one step with `moveX/moveZ` pointing at the chosen teammate.
- **Off-ball offence:** go to `spots(s)[(slot + rotation) % 3]`, where `rotation` is `floor(state.time / AI.swapEvery)`.
- **Inbounder:** after `AI.inboundDelay` seconds, pass to the most open teammate. The teammate nearest the inbounder targets a point 4 m into the court from the inbound spot.
- **Defence:** guard the opponent with the same `slot`. Target the point `AI.onBallGap` (if they hold the ball) or `AI.offBallGap` metres from them toward the hoop being defended. Jump when that opponent is `shooting` and within 2 m. Within `STEAL.reach` of the holder, try a steal with probability `AI.stealRate` per decision.
- **Ball in `'shot'` mode:** on each team the two players nearest the rim being shot at are rebounders; the third targets their own defensive half at `(−s·4, 0)`.
- **Ball in `'loose'` mode:** on each team the two players nearest the ball are rebounders; the third does the same as above.
- **Rebounders** target the ball's `x, z` and jump when it is within 1 m horizontally, below 3.3 m, and falling.

- [ ] **Step 1: Write the failing tests**

```js
// tests/ai.test.js
test('isOpen is false with a defender 1 m away, true at 3 m', () => {});
test('laneClear is false with a defender standing on the line to the hoop', () => {});
test('an open handler in range decides to shoot', () => { /* within 0.5 s some intent for that player has shoot === true */ });
test('a handler with 3 s on the shot clock shoots even when covered', () => {});
test('a covered handler with an open teammate passes', () => { /* within 0.5 s ball.mode === 'pass' when run through step */ });
test('a defender moves to stand between their opponent and the hoop', () => {
  // after 3 s the defender is within 0.5 m of the expected guard point
});
test('the AI inbounder passes within 2 s', () => {});

// tests/match.test.js
test('two AI teams play a whole match', () => {
  const s = createMatch(42); startMatch(s);
  let steps = 0;
  while (s.phase !== 'final' && steps < 60 * 60 * 30) { step(s, aiIntents(s, DT), DT); steps++;
    // every 60 steps: all player and ball coordinates are finite; |ball.x| < 30, |ball.z| < 30, ball.y < 30
  }
  assert.equal(s.phase, 'final');
  assert.ok(s.score[0] > 0 && s.score[1] > 0);
  assert.notEqual(s.score[0], s.score[1]);
});
test('the same seed gives the same final score', () => {});
```

- [ ] **Step 2:** Run `npm test`. Expected: FAIL, cannot find module `src/sim/ai.js`.
- [ ] **Step 3:** Implement `ai.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. The whole-match test must finish in under 10 seconds; if it does not reach `'final'`, print the phase and clocks at the step limit to find the stall.
- [ ] **Step 5:** Sanity-check the result of seed 42: each team should score between 15 and 80 points in 12 minutes. Outside that range, adjust `SHOT` and `AI` values in `tuning.js` only, and re-run.
- [ ] **Step 6:** Commit: `feat: computer players and whole-match test`.

---

### Task 8: Rendering

**Files:**
- Create: `src/render/scene.js`, `src/render/actors.js`, `src/main.js`

**Interfaces:**
- Consumes: `createMatch`, `startMatch`, `step`, `aiIntents`, `DT`, `COURT`, `RIM`, `BOARD`, `THREE_PT`, `BALL`, `PLAYER`.
- Produces:
  - `createScene(canvas) → Promise<{ scene, camera, backend, render(), follow(x) }>`. `backend` is `'webgpu'` or `'webgl2'`. `follow(x)` eases the camera toward the given court `x`.
  - `createActors(scene) → { sync(state) }`. Positions the six player meshes, the ball and the control ring from the state.
  - `main.js` runs the fixed-step loop.

What to build:

- **Renderer:** `WebGPURenderer` with antialiasing, `await renderer.init()`, pixel ratio capped at 2, resized with the window. Read the backend from the renderer after init. If init throws, replace the page body with the message "This browser supports neither WebGPU nor WebGL 2, so the game cannot run."
- **Court:** a 32 × 19 floor. Lines painted on a canvas texture: boundary, centre line and circle, both three-point lines (arc of 6.75 with straight corners at 6.6), both keys (4.9 wide, 5.8 long).
- **Hoops:** at each end a backboard (1.8 × 1.05, lower edge at 2.9), a rim torus (radius 0.225, tube 0.02) at 3.05, a pole behind the baseline, and a static open cone below the rim as a net.
- **Players:** a capsule 1.95 tall with a sphere head and a small box "nose" on the facing side. Team 0 blue, team 1 red. A flat ring on the floor under `state.controlled`.
- **Ball:** an orange sphere of radius 0.12.
- **Lights:** a hemisphere light and one directional light casting shadows from players and ball onto the floor.
- **Camera:** perspective, 40° field of view, at `(followX, 9, 17)` looking at `(followX, 1, 0)`. `followX` eases toward the ball's `x`, clamped to ±9. With this camera, screen right is `+x` and "up the screen" is `−z`.
- **Loop in `main.js`:** each animation frame, add `min(frameSeconds, 0.1)` to an accumulator; while it holds at least `DT`, call `step` and subtract `DT`; then `sync`, `follow`, `render`. For this task every player is driven by `aiIntents` and the match starts immediately.

- [ ] **Step 1:** Read the `WebGPURenderer` documentation and one `webgpu_*` example in `node_modules/three/examples/` to confirm the import style, `init()` and how to detect the backend.
- [ ] **Step 2:** Implement `scene.js`, `actors.js` and `main.js`.
- [ ] **Step 3: Verify in the browser.** Start the `game` server, open `http://localhost:5173/` in the Browser pane. Expected: no console errors; a screenshot shows the court with lines, two hoops, six capsules in two colours and the ball; a second screenshot 10 seconds later shows the players and camera have moved.
- [ ] **Step 4:** Run `npm test`. Expected: PASS (nothing under `src/sim` changed).
- [ ] **Step 5:** Commit: `feat: render the match with placeholder players`.

---

### Task 9: Keyboard, HUD and screens

**Files:**
- Create: `src/input.js`, `src/render/hud.js`
- Modify: `src/main.js`
- Test: `tests/input.test.js`

**Interfaces:**
- Consumes: `emptyIntent`; HUD element ids from Task 1; `createScene().backend`.
- Produces:
  - `createKeyboard(target) → { intent() }`. `target` is any `EventTarget` (the `window` in the game). Listens for `keydown`, `keyup` and `blur`.
  - `createHud(doc) → { update(state, backend), show(name) }`. `name` is `'start'`, `'pause'`, `'final'` or `null`.

Key mapping, by `event.code`:

| Code | Intent field |
|---|---|
| `KeyD` minus `KeyA` | `moveX` |
| `KeyS` minus `KeyW` | `moveZ` |
| `ShiftLeft` or `ShiftRight` | `sprint` |
| `Space` | `shoot` |
| `KeyE` | `pass` and `switch` |
| `KeyQ` | `steal` |

A `blur` event clears every held key. `keydown` for these codes calls `preventDefault` so Space does not scroll the page.

HUD:

- `update` writes the scores, the period (`Q1`–`Q4`, then `OT1`, `OT2`…), the game clock as `m:ss`, the shot clock as whole seconds rounded up, and the backend name. It touches the DOM only when a value changed.
- `controls` shows the key list from the spec.
- The start screen says "Press Enter to play". The final screen shows the score, who won, and "Press Enter to play again".

Changes to `main.js`:

- The match waits in `'start'` until Enter, which calls `startMatch`. In `'final'`, Enter creates a fresh match with a new seed.
- Each step, `aiIntents` supplies all six intents and the keyboard's intent replaces the entry at `state.controlled`.
- Esc toggles pause. `visibilitychange` to hidden and window `blur` both pause. While paused, no steps run and the accumulator is cleared.

- [ ] **Step 1: Write the failing tests**

```js
const key = (type, code) => Object.assign(new Event(type, { cancelable: true }), { code });
test('WASD maps to movement', () => {
  const t = new EventTarget(), k = createKeyboard(t);
  t.dispatchEvent(key('keydown', 'KeyD')); assert.equal(k.intent().moveX, 1);
  t.dispatchEvent(key('keydown', 'KeyA')); assert.equal(k.intent().moveX, 0);
  t.dispatchEvent(key('keydown', 'KeyW')); assert.equal(k.intent().moveZ, -1);
});
test('E sets both pass and switch', () => {});
test('either Shift key sprints; releasing one while the other is held keeps sprinting', () => {});
test('keyup clears the key', () => {});
test('blur releases every held key', () => {
  // hold KeyD, Space, ShiftLeft; dispatch new Event('blur'); intent() deep-equals emptyIntent()
});
test('Space keydown is default-prevented', () => {});
```

- [ ] **Step 2:** Run `npm test`. Expected: FAIL, cannot find module `src/input.js`.
- [ ] **Step 3:** Implement `input.js`, `hud.js` and the `main.js` changes.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Verify in the browser.** In the Browser pane: the start screen is shown; Enter starts the match; holding D moves the ringed player right; Space then release sends the ball toward the hoop; Esc shows the pause screen and the clock stops; no console errors. Read the HUD text with `get_page_text` and confirm score, period and both clocks are present.
- [ ] **Step 6: Frame rate.** With the match running, measure frames over 5 seconds with `requestAnimationFrame` in the page. Expected: at least 55 per second.
- [ ] **Step 7:** Commit: `feat: keyboard control, HUD and start/pause/final screens`.
- [ ] **Step 8: Owner play-test.** Ask the owner to play a full match in their own browser and report on feel: player speed, how often shots fall, how hard the opponents are, the camera. Apply their feedback by changing values in `src/sim/tuning.js` only, re-run `npm test`, and commit as `tune: play-test adjustments`.

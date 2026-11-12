# Full Rules (Milestone 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The match is played under real basketball rules: violations, fouls, free throws shot with a timing meter, stamina, five-player rosters with substitutions, and an opening jump ball.

**Architecture:** `players.js` reports what happened (failed steals, shot releases, collisions, dribble events) and never judges it. `rules.js` turns those reports into calls through three new pure modules, `violations.js`, `fouls.js` and `freethrow.js`. `stamina.js` and `roster.js` own energy and substitutions. Every stoppage goes through one function, `stopPlay`, which records the call for the HUD.

**Tech Stack:** unchanged from milestone 1. JavaScript ES modules, `three@0.187.0` by import map, Node 26 built-in test runner, `python3 -m http.server`.

**Spec:** `docs/superpowers/specs/2026-11-11-full-rules-design.md`

**Branch:** `feat/full-rules` (already contains the play-test fixes).

## Global Constraints

- Milestone 1's constraints still hold: nothing under `src/sim/` imports Three.js or touches the DOM; the only npm dependency is `three@0.187.0`; metres, `x` along the court, `z` across, `y` up; team 0 attacks `+x`; fixed steps of `DT = 1/60`; all randomness through `rand(state)`; HUD text is real HTML text.
- Every new tunable number lives in `src/sim/tuning.js`, with the values in Task 1. No new magic numbers elsewhere in `src/sim/`.
- FIBA numbers: 8 seconds to cross half court, 3 seconds in the key, 5 seconds to inbound, key 4.9 m wide and 5.8 m deep, free-throw line 5.8 m from the baseline, shot clock 24 and 14.
- Foul limits: fouled out on the 3rd personal foul; a team's 3rd defensive foul in a quarter, and each later one, gives two free throws.
- The computer never sets `intent.hold`.
- `index.html` has exactly one `aria-live` element, `#announce`.
- `npm test` passes before every commit. Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Before writing renderer code that uses a Three.js class not already used in `src/render/`, confirm it is exported by `node_modules/three/build/three.webgpu.js`; do not rely on memory.

## Decisions the spec leaves open

Made here so every task agrees. Each is one constant or a few lines to change.

- **Meter speed:** "about 1.5 times a second" means the marker crosses the bar 1.5 times a second (`FT.sweep = 1.5` bar lengths per second).
- **Backcourt line:** front-court status starts when the ball holder's centre is more than `PLAYER.radius` past half court, and the violation is called when it is more than `PLAYER.radius` back over it. A player straddling the line is never called.
- **Team control:** the backcourt, 8-second and 3-second counts run only while a team holds the ball or its pass is in the air. A shot or a loose ball clears all three.
- **Call priority** when two things happen in one step: foul, then basket, then violation, then out of bounds, then the clocks.
- **Tip:** each jumper may jump once per tip, and only after the toss. He can tap the ball only while he is in the air, so a tip nobody jumps for lands.
- **The computer and the key:** the spec says the computer "steps out of the key before its 3 seconds are up". Once every spacing spot is outside the key it already does, so Task 6 moves the low spot and adds a regression test, and an explicit step-out rule is added only if Task 11 shows 3-second calls on the computer.
- **Frozen players:** during the tip, and during free throws until the last attempt is released, players other than those named cannot move or act.

## Review Focus

Conditions the spec implies but does not spell out, most likely first. Each has a test in the task named.

1. A foul is called with the period clock at 0:00: the free throws are still shot, then the period ends. No inbound is set up and the last attempt is not a live rebound. (Tasks 7, 8)
2. You are still holding Space from the jump shot that drew the foul when the free-throw meter appears: it must not fire by itself. Space has to be released and pressed again. (Task 7)
3. You queue a substitution while the game is paused during a dead ball: it is applied when play resumes, not at the following stoppage, and you keep control of the same court position. (Task 3)
4. A player commits his 3rd foul when every bench player has already fouled out: he stays on court, nothing throws, and the match carries on. (Tasks 3, 8)
5. A foul and a violation happen in the same step (a charge by a player who has also just travelled): there is exactly one call, the foul. (Task 8)

---

## Shared types (additions to milestone 1)

Defined in Task 1. Later tasks give the fields their meaning.

```js
// Intent adds
{ hold }                 // boolean: the pick-up key (F)

// Player adds
{ person,                // index into state.rosters[team]: who this court player currently is
  held,                  // true once he has picked up his dribble
  steps,                 // metres moved since picking up
  keyT,                  // seconds spent in the opponent's key
  setT,                  // seconds he has been standing still
  foulCooldown }         // seconds until a collision with him can be judged again

// Match state adds
{ rosters,               // [team0, team1], each five people: { number, energy, fouls }
  subQueue,              // [{ team, out, in }] person indexes, applied at the next stoppage
  autoSubs,              // [true, true]
  teamFouls,             // [n, n] this quarter
  call,                  // the last whistle, or null: { kind, team, ball, number, shots }
  frontcourt,            // the team in control has had the ball in the front court
  backcourtT, inboundT,  // seconds counted toward the 8-second and 5-second calls
  controlTeam,           // team the counts above belong to, or null
  freeThrow,             // null or { shooter, left, total, stage, meter, dir, t, armed, live }
  pendingFoul,           // null or { by, on, shots }: a shooting foul waiting for the shot to finish
  tipWinner }            // team that first held the ball after the opening tip, or null

// phase adds 'jumpBall' and 'freeThrow'

// call.kind: 'out' | 'shotClock' | 'travel' | 'doubleDribble' | 'backcourt' | 'eightSeconds'
//          | 'threeSeconds' | 'fiveSeconds' | 'reach' | 'shooting' | 'charge' | 'block'
// call.team: the team penalised.  call.ball: the team that gets the ball or shoots (always 1 - team).
// call.number: jersey number of the player who fouled, else null.  call.shots: free throws to follow.

// Events: what happened this step, passed from step() to applyRules()
{ hitFloor, hitRim, hitBoard, scored,   // from stepBall, as before
  travel,                // id of a player who landed still holding the ball, else null
  doubleDribble,         // id of a player who pressed hold again after picking up, else null
  stealMisses,           // [{ by, on, front }] steal attempts that failed
  release,               // null or { shooter, defender, blocked }: defender = nearest opponent in the air within FOUL.contactDist, else null
  contacts }             // [[idA, idB]] pairs of players who overlapped
```

---

### Task 1: Foundations

**Files:**
- Modify: `src/sim/tuning.js`, `src/sim/state.js`, `src/input.js`
- Create: `tests/helpers.js`
- Test: `tests/state.test.js`, `tests/input.test.js`

**Interfaces:**
- Produces: every constant below; `emptyEvents()` and `personOf(state, player) → { number, energy, fouls }` from `state.js`; the fields under "Shared types"; `tests/helpers.js` (see Step 5). New test files in this plan use these helpers; tests added to an existing file use that file's own helpers.

- [ ] **Step 1: Write the failing tests**

```js
// tests/state.test.js
test('each team has five people, three of them on court', () => {
  const s = createMatch();
  assert.deepEqual(s.rosters.map(r => r.map(p => p.number)), [[4, 7, 11, 15, 23], [5, 8, 10, 21, 33]]);
  assert.ok(s.rosters.flat().every(p => p.energy === 1 && p.fouls === 0));
  assert.deepEqual(s.players.map(p => p.person), [0, 1, 2, 0, 1, 2]);
  assert.equal(personOf(s, s.players[4]), s.rosters[1][1]);
});

test('a new match has nothing called, counted or queued', () => {
  const s = createMatch();
  assert.deepEqual([s.teamFouls, s.autoSubs, s.subQueue], [[0, 0], [true, true], []]);
  assert.deepEqual([s.call, s.freeThrow, s.pendingFoul, s.tipWinner, s.controlTeam], [null, null, null, null, null]);
  assert.deepEqual([s.frontcourt, s.backcourtT, s.inboundT], [false, 0, 0]);
  for (const p of s.players) assert.deepEqual([p.held, p.steps, p.keyT, p.setT, p.foulCooldown], [false, 0, 0, 0, 0]);
});

test('an empty intent has hold off, and empty events report nothing', () => {
  assert.equal(emptyIntent().hold, false);
  assert.deepEqual(emptyEvents(), { hitFloor: false, hitRim: false, hitBoard: false, scored: 0,
    travel: null, doubleDribble: null, stealMisses: [], release: null, contacts: [] });
});

// tests/input.test.js
test('F is the hold key', () => {
  const { k, down, up } = keyboard();
  down('KeyF'); assert.equal(k.intent().hold, true);
  up('KeyF'); assert.equal(k.intent().hold, false);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test`
Expected: the four new tests FAIL (`rosters` undefined, `emptyEvents` not exported, `hold` undefined).

- [ ] **Step 3: Add the constants to `src/sim/tuning.js`**

Add the three new keys to the existing groups and append the new groups, exactly:

```js
// PLAYER gains  gatherDist: 1.5        metres a player may move after picking up his dribble
// STEAL gains   heldFactor: 0.4        steal chance multiplier against a picked-up ball
// CLOCK gains   shotAfterFoul: 14
// AI gains      hurryAt: 5, lowSpotZ: 3.2

export const VIOLATION = f({ backcourt: 8, key: 3, inbound: 5, keyHalfWidth: 2.45, keyDepth: 5.8 });

export const FOUL = f({
  reachFront: 0.12, reachBack: 0.3,          // chance a failed steal is a foul
  shooting: 0.25, contactDist: 0.8,          // chance, and how close an airborne defender must be at release
  charge: 0.6, block: 0.15,                  // chance when a sprinting handler hits a set / a moving defender
  chargeSpeed: 5.5, setTime: 0.4, setSpeed: 0.5, cooldown: 1,
  limit: 3, bonus: 3,                        // personal fouls to foul out; team foul that starts the bonus
});

export const FT = f({
  lineDist: 5.8, sweep: 1.5, centreChance: 0.95, edgeChance: 0.2,
  limit: 5, aiDelay: 1, aiChance: 0.75, pause: 1,
  // [metres from the baseline, z] for the five other players, mirrored for each hoop
  defence: f([f([2.3, -2.75]), f([2.3, 2.75]), f([9, 2])]),
  offence: f([f([3.7, -2.75]), f([3.7, 2.75])]),
});

export const STAMINA = f({
  sprint: 0.025, run: 0.006, jump: 0.015, rest: 0.02, bench: 0.03,   // energy per second (jump: per jump)
  restSpeed: 1, fadeBelow: 0.5, minSpeed: 0.75, minShot: 0.8,
  subOut: 0.35, subIn: 0.7,
});

export const TIP = f({ wait: 1, height: 1.5, tossV: 6.6, gap: 0.6, speed: 7, aiJumpAt: 3.6, aiError: 0.25 });

export const ROSTER = f({ numbers: f([f([4, 7, 11, 15, 23]), f([5, 8, 10, 21, 33])]) });
```

- [ ] **Step 4: Add the state fields, `emptyEvents`, `personOf`, the `hold` intent and the F key**

`createPlayer(id)` sets `person: id % 3` and the five new player fields. `lineUp` also clears `held`, `steps`, `keyT`, `setT`. `input.js` adds `'KeyF'` to `GAME_KEYS` and `hold: on('KeyF')` to the intent.

- [ ] **Step 5: Create `tests/helpers.js`**

```js
// Live play: team 0 at x=5, team 1 at x=-5, spread across the court, player 0 holding the ball.
export function live(seed = 1)                       // createMatch(seed), phase 'live', giveBall to player 0
export const idle = () => …                          // six empty intents
export const only = (id, intent) => …                // six intents, `intent` merged into player id's
export function run(s, seconds, intents = idle(), done)   // steps; `intents` may be an array or a function of the state; returns true if `done(s)` fired
export function firstSeed(make, hit, max = 400)      // returns make(seed) for the first seed where hit(state) is true; throws if none
export const at = (s, id, x, z) => …                 // places a player
export function freeBall(s, pos, extra = {})         // the ball loose at `pos`, at rest, held by nobody
export const shotAt = (s, pos, value = 2) => …       // the ball in the air at `pos` as player 0's shot worth `value`
export const ai = s => aiIntents(s, DT)              // an `intents` function for run(): the computer plays everyone
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: all PASS (127 existing + 4 new).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: state, constants and hold key for the full rules"
```

---

### Task 2: Stamina

**Files:**
- Create: `src/sim/stamina.js`
- Modify: `src/sim/players.js` (speed, shot chance, jump cost), `src/sim/step.js` (calls `tire`)
- Test: `tests/stamina.test.js`

**Interfaces:**
- Consumes: `personOf`, `STAMINA`.
- Produces: `speedFactor(energy) → number`, `shotFactor(energy) → number`, `tire(state, intents, dt)`, `spend(state, player, amount)`.

- [ ] **Step 1: Write the failing tests**

```js
test('no penalty at half energy or above; 75% speed and 80% shooting at zero', () => {
  assert.deepEqual([1, 0.5, 0.25, 0].map(speedFactor), [1, 1, 0.875, 0.75]);
  assert.equal(shotFactor(0.5), 1);
  assert.ok(Math.abs(shotFactor(0.25) - 0.9) < 1e-9);
  assert.equal(shotFactor(0), 0.8);
});

// `drain` puts player 0 at the given speed and intent, calls tire() for `seconds`, returns his energy.
test('ten seconds of sprinting costs 0.25, of running 0.06', () => {
  assert.ok(Math.abs(drain({ vx: 7 }, { moveX: 1, sprint: true }, 10) - 0.75) < 0.005);
  assert.ok(Math.abs(drain({ vx: 5 }, { moveX: 1 }, 10) - 0.94) < 0.005);
});

test('standing recovers 0.02 a second, the bench 0.03, and energy never passes 1', () => {
  const s = live(); personOf(s, s.players[0]).energy = 0.5; s.rosters[0][3].energy = 0.5;
  for (let i = 0; i < 600; i++) tire(s, idle(), DT);
  assert.ok(Math.abs(s.rosters[0][0].energy - 0.7) < 0.005);
  assert.ok(Math.abs(s.rosters[0][3].energy - 0.8) < 0.005);
  for (let i = 0; i < 6000; i++) tire(s, idle(), DT);
  assert.equal(s.rosters[0][3].energy, 1);
});

test('a jump costs 0.015', () => {
  const s = live();
  step(s, only(3, { shoot: true }), DT);               // a defender jumps
  assert.ok(Math.abs(s.rosters[1][0].energy - (1 - 0.015)) < 0.001);
});

test('an exhausted player sprints at 75% speed', () => {
  const s = live(); s.rosters[0][1].energy = 0;        // player 1, without the ball
  const hold = () => { s.rosters[0][1].energy = 0; return only(1, { moveX: 1, sprint: true }); };
  run(s, 1, hold);
  assert.ok(Math.abs(s.players[1].vx - 0.75 * PLAYER.sprint) < 0.05, `vx ${s.players[1].vx}`);
});

test('an exhausted shooter makes 80% as often', () => {
  const s = live(); const fresh = makeChance(s, s.players[0]);
  s.rosters[0][0].energy = 0;
  assert.ok(Math.abs(makeChance(s, s.players[0]) - 0.8 * fresh) < 1e-9);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/stamina.test.js`
Expected: FAIL, cannot find module `stamina.js`.

- [ ] **Step 3: Implement `src/sim/stamina.js`**

- `speedFactor` and `shotFactor`: 1 at or above `STAMINA.fadeBelow`, falling in a straight line to `minSpeed` / `minShot` at zero.
- `tire(state, intents, dt)`: for each court player, by his horizontal speed and his intent: below `restSpeed` he gains `rest`; otherwise he loses `sprint` if `intent.sprint` is set, else `run`. Every person not on court gains `bench`. Clamp to 0..1.
- `spend(state, player, amount)`: subtracts, clamped at 0.

- [ ] **Step 4: Wire it in**

- `players.js`: `movePlayers` multiplies each player's wanted speed by `speedFactor` of his energy; `makeChance` multiplies by `shotFactor` of the shooter's energy; `applyActions` calls `spend(state, p, STAMINA.jump)` wherever it calls `jump(p)`.
- `step.js`: call `tire(state, intents, dt)` once per step, after `movePlayers`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: stamina drains with effort and slows tired players"
```

---

### Task 3: Rosters and substitutions

**Files:**
- Create: `src/sim/roster.js`
- Modify: `src/sim/rules.js` (apply substitutions during stoppages)
- Test: `tests/roster.test.js`

**Interfaces:**
- Consumes: `personOf`, `STAMINA.subOut`, `STAMINA.subIn`, `FOUL.limit`.
- Produces:
  - `onCourt(state, team) → number[]` person indexes on court, in slot order
  - `benchOf(state, team) → number[]` person indexes off court who have not fouled out
  - `substitute(state, playerId, person) → boolean` false if `person` is on court or has fouled out
  - `queueSub(state, team, a, b) → boolean` `a` and `b` are person indexes in either order; one must be on court and the other an eligible bench player; the same pair again removes it from the queue
  - `applySubs(state)`

- [ ] **Step 1: Write the failing tests**

```js
test('a substitution changes who the court player is, not where he stands or who you control', () => {
  const s = live(); Object.assign(s.players[1], { x: 3, z: 4 }); s.controlled = 1;
  assert.equal(substitute(s, 1, 3), true);
  assert.deepEqual([s.players[1].person, s.players[1].x, s.players[1].z, s.players[1].slot, s.controlled], [3, 3, 4, 1, 1]);
  assert.deepEqual(onCourt(s, 0), [0, 3, 2]);
  assert.deepEqual(benchOf(s, 0), [1, 4]);
});

test('a player already on court, or one who has fouled out, cannot come on', () => {
  const s = live(); s.rosters[0][4].fouls = 3;
  assert.equal(substitute(s, 1, 2), false);
  assert.equal(substitute(s, 1, 4), false);
  assert.deepEqual(benchOf(s, 0), [3]);
});

test('queueSub takes the pair in either order, rejects bad pairs, and the same pair again cancels', () => {
  const s = live();
  assert.equal(queueSub(s, 0, 3, 1), true);
  assert.deepEqual(s.subQueue, [{ team: 0, out: 1, in: 3 }]);
  assert.equal(queueSub(s, 0, 0, 1), false);           // both on court
  assert.equal(queueSub(s, 0, 3, 4), false);           // both on the bench
  assert.equal(queueSub(s, 0, 1, 3), true);            // same pair: cancelled
  assert.deepEqual(s.subQueue, []);
});

test('applySubs makes the queued swap and empties the queue', …);                 // players[1].person === 3

test('a tired player comes off for a fresh one, at 35% and 70%', () => {
  const tired = (court, bench) => { const s = live(); s.rosters[0][0].energy = court; s.rosters[0][3].energy = bench; s.rosters[0][4].energy = 0; applySubs(s); return s.players[0].person; };
  assert.equal(tired(0.3, 0.8), 3);
  assert.equal(tired(0.4, 0.8), 0);                    // not tired enough
  assert.equal(tired(0.3, 0.6), 0);                    // nobody fresh enough
});

test('a player one foul from fouling out is rested for a fresh player with fewer fouls', …);
// fouls 2 on court, bench person 3 fouls 0 energy 1 → swapped; bench energy 0.6 → not; bench fouls 2 → not

test('with automatic substitutions off, a tired player stays on', …);              // autoSubs[0] = false

test('a fouled-out player is always replaced, by the freshest eligible player', () => {
  const s = live(); s.autoSubs[0] = false;
  s.rosters[0][0].fouls = 3; s.rosters[0][3].energy = 0.2; s.rosters[0][4].energy = 0.4;
  applySubs(s);
  assert.equal(s.players[0].person, 4);
});

test('with nobody eligible on the bench a fouled-out player stays on and nothing throws', () => {
  const s = live(); s.rosters[0][0].fouls = 3; s.rosters[0][3].fouls = 3; s.rosters[0][4].fouls = 3;
  applySubs(s);
  assert.equal(s.players[0].person, 0);
});

test('the free-throw shooter is not replaced until he has shot', …);
// s.freeThrow = { shooter: 0 }, person 0 at energy 0.1 → still person 0 after applySubs

test('a swap queued during a dead ball is made as soon as play steps again', () => {
  const s = live(); s.phase = 'dead'; s.phaseT = 1; s.controlled = 1;
  queueSub(s, 0, 1, 3);
  step(s, idle(), DT);
  assert.deepEqual([s.players[1].person, s.controlled, s.subQueue.length], [3, 1, 0]);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/roster.test.js`
Expected: FAIL, cannot find module `roster.js`.

- [ ] **Step 3: Implement `src/sim/roster.js`**

`applySubs` works team by team, in this order, and never touches `state.freeThrow?.shooter`:
1. Forced: each court player whose person has `fouls >= FOUL.limit` is replaced by the bench player with the most energy, if `benchOf` is not empty.
2. Queued: each queue entry for the team that is still valid is made; all of the team's entries are removed.
3. Automatic, when `state.autoSubs[team]`: in slot order, a court player with energy below `subOut`, or with `fouls === FOUL.limit - 1`, is replaced by the bench player with the most energy, provided that energy is above `subIn` and, for the foul case, the bench player has fewer fouls. A bench player is used at most once per call.

- [ ] **Step 4: Call it from `rules.js`**

In `applyRules`, the `'dead'` and `'quarterEnd'` cases call `applySubs(state)` every step, before counting down `phaseT`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: five-player rosters with queued and automatic substitutions"
```

---

### Task 4: The whistle

**Files:**
- Modify: `src/sim/rules.js`
- Test: `tests/whistle.test.js` (new), `tests/rules.test.js` (existing shot-clock assertions)

**Interfaces:**
- Consumes: `VIOLATION.inbound`.
- Produces (internal to `rules.js`, used by Tasks 5 to 9):
  - `makeCall(kind, team, extra = {}) → { kind, team, ball: 1 - team, number: null, shots: 0, ...extra }`
  - `stopPlay(state, possession, spot, call = null)`: records `state.call`; resets the shot clock to 24 only when `possession` differs from the team that had the ball; ends the period instead of restarting only when the clock is at zero **and** `state.freeThrow` is null.
  - `state.call` for out of bounds (`'out'`, team = the team that lost it) and shot-clock expiry (`'shotClock'`). A basket leaves `state.call` null and always sets the shot clock to 24.

- [ ] **Step 1: Write the failing tests**

```js
// tests/whistle.test.js
// `toInbound(s, team)`: possession = team, inboundSpot = { x: 0, z: COURT.halfWidth + 0.5 }, phase 'dead' with phaseT 0, one step → phase 'inbound'.
test('out of bounds is recorded as a call against the team that touched it last', () => {
  const s = live(); s.lastTouch = 0;
  freeBall(s, { x: 0, y: 0.12, z: 8 });                // on the floor outside the sideline
  run(s, 0.1);
  assert.deepEqual(s.call, { kind: 'out', team: 0, ball: 1, number: null, shots: 0 });
});

test('a shot-clock violation is recorded as a call', …);            // call.kind 'shotClock', call.team 0
test('a basket is not a call', …);                                  // after a score: call === null, shotClock 24

test('the shot clock keeps its time when the same team inbounds', () => {
  const s = live(); s.shotClock = 10; s.lastTouch = 1;  // knocked out by the defence
  freeBall(s, { x: 0, y: 0.12, z: 8 });
  run(s, 3, idle(), st => st.phase === 'inbound');
  assert.equal(s.possession, 0);
  assert.ok(Math.abs(s.shotClock - 10) < 0.1, `shot clock ${s.shotClock}`);
});

test('the shot clock is 24 when the other team inbounds', …);       // same, lastTouch = 0 → shotClock 24

test('an inbounder who holds the ball for 5 seconds loses it', () => {
  const s = live(); toInbound(s, 0);
  const spot = { ...s.inboundSpot };
  run(s, 4.9);
  assert.equal(s.phase, 'inbound');
  run(s, 0.2);
  assert.equal(s.phase, 'dead');
  assert.deepEqual(s.call, { kind: 'fiveSeconds', team: 0, ball: 1, number: null, shots: 0 });
  assert.deepEqual([s.possession, s.inboundSpot], [1, spot]);
});
```

Existing tests in `tests/rules.test.js` that assert the shot clock is 24 after every inbound are changed to match the new rule; name each one changed in the commit message.

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/whistle.test.js`
Expected: FAIL (`call` is null; shot clock is 24; phase stays `inbound`).

- [ ] **Step 3: Implement in `rules.js`**

- `stopPlay` and `makeCall` as specified. `setupInbound` no longer touches the shot clock and sets `state.inboundT = 0`; `beginPeriod` sets the shot clock to 24.
- The `'inbound'` case adds `dt` to `state.inboundT` while the inbounder holds the ball and calls `stopPlay(state, 1 - state.possession, state.inboundSpot, makeCall('fiveSeconds', state.possession))` once it passes `VIOLATION.inbound`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: calls are recorded, the shot clock survives an inbound, 5-second inbound"
```

---

### Task 5: Pick-up dribble, travelling and double dribble

**Files:**
- Create: `src/sim/violations.js`
- Modify: `src/sim/players.js`, `src/sim/step.js`, `src/sim/rules.js`
- Test: `tests/actions.test.js`, `tests/violations.test.js`, `tests/ai.test.js`

**Interfaces:**
- Consumes: `stopPlay`, `makeCall`, `emptyEvents`, `PLAYER.gatherDist`, `STEAL.heldFactor`.
- Produces:
  - `applyActions(state, intents, dt) → { travel, doubleDribble, stealMisses, release }` (`stealMisses` stays `[]` and `release` null until Task 8)
  - `findViolation(state, events) → { kind, team } | null`
  - `step` builds one events object from `emptyEvents()`, the ball's events and the return of `applyActions`, and passes it to `applyRules(state, events, dt, intents)`.
  - `giveBall` clears `held` and `steps`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/actions.test.js
test('F picks up the dribble: the ball stops bouncing and his steps are counted', () => {
  const s = setup();
  tick(s, intents(0, { hold: true }));
  assert.equal(s.players[0].held, true);
  for (let i = 0; i < 30; i++) tick(s, intents(0, { moveX: 1 }));
  assert.ok(s.players[0].steps > 1, `steps ${s.players[0].steps}`);
  assert.equal(s.ball.y, PLAYER.handHeight);
});

test('getting the ball gives a live dribble', () => {
  const s = setup(); Object.assign(s.players[1], { held: true, steps: 1.2 });
  giveBall(s, s.players[1]);
  assert.deepEqual([s.players[1].held, s.players[1].steps], [false, 0]);
});

test('F does nothing in the air or for an inbounder', …);
// airborne holder (y 0.5, vy 1) → held false; inbounder → held false

test('a picked-up ball is stolen 40% as often', …);
// as the existing steal-rate test with players[0].held = true: rate within 0.05 of STEAL.frontChance * 0.4

test('landing with the ball is reported as a travel, and no shot leaves the hand', () => {
  const s = setup(); let travelled = null;
  for (let t = 0; t < 1.2 && travelled === null; t += DT) {
    movePlayers(s, intents(0, { shoot: true }), DT);
    travelled = applyActions(s, intents(0, { shoot: true }), DT).travel;
    carryBall(s, DT);
  }
  assert.equal(travelled, 0);
  assert.deepEqual([s.ball.holder, s.players[0].shooting], [0, false]);
});

test('pressing F again after picking up is reported as a double dribble', …);
// hold, release, hold → applyActions(...).doubleDribble === 0

// tests/violations.test.js  (helpers from tests/helpers.js)
test('two steps are allowed after picking up; a third is a travel', () => {
  const s = live(); const p = s.players[0]; Object.assign(p, { held: true, steps: 1.4 });
  step(s, idle(), DT);
  assert.equal(s.phase, 'live');
  p.steps = 1.51;
  step(s, idle(), DT);
  assert.equal(s.phase, 'dead');
  assert.deepEqual(s.call, { kind: 'travel', team: 0, ball: 1, number: null, shots: 0 });
  assert.equal(s.possession, 1);
});

test('holding Space until you land is a travel', …);
// run(s, 1.2, only(0, { shoot: true }), st => st.phase === 'dead') → call.kind 'travel'

test('dribbling again after picking up is a double dribble', …);    // call.kind 'doubleDribble'

test('a pass or a shot in the air after picking up is legal', …);
// held, then jump and release Space in the air → ball.mode 'shot', phase 'live', call null

// tests/ai.test.js
test('the computer never picks up its dribble', () => {
  const s = live(); let held = false;
  for (let t = 0; t < 60; t += DT) { const its = aiIntents(s, DT); held ||= its.some(i => i.hold); step(s, its, DT); }
  assert.equal(held, false);
});
```

Two existing tests in `tests/actions.test.js` describe the behaviour this task reverses and are rewritten: "holding shoot through landing releases the ball" becomes the travel test above, and the lay-up test releases Space at `jumpT = 0.7` instead of on landing (still asserting a fair share go in).

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: the new tests FAIL (`held` stays false, `applyActions` returns undefined, no call).

- [ ] **Step 3: Implement in `players.js`**

- Movement: while a holder has `held` set, add the distance he moves each step to `steps`.
- `carryBall`: a held ball does not bounce.
- `applyActions`, for the ball holder: a fresh press of `hold` on the floor, not as inbounder, sets `held` if it is clear, and otherwise reports `doubleDribble`. A shooter who is back on the floor still holding the ball stops shooting and is reported as `travel`; the shot is released only when Space is let go in the air.
- `trySteal` multiplies its chance by `STEAL.heldFactor` when the holder has `held` set.

- [ ] **Step 4: Implement `violations.js`, `step.js` and the call**

- `findViolation(state, events)`: `events.travel` or a holder with `held` and `steps > PLAYER.gatherDist` → `'travel'`; `events.doubleDribble` → `'doubleDribble'`. `team` is that player's team.
- `rules.js` `livePlay`: after scoring is handled and before out of bounds, `const v = findViolation(state, events); if (v) return stopPlay(state, 1 - v.team, sidelineSpot(ball), makeCall(v.kind, v.team));`
- `step.js`: build and pass the events object.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: pick-up dribble with travelling and double dribble"
```

---

### Task 6: Backcourt, 8 seconds and 3 seconds

**Files:**
- Modify: `src/sim/violations.js`, `src/sim/rules.js`, `src/sim/ai.js`
- Test: `tests/violations.test.js`, `tests/ai.test.js`

**Interfaces:**
- Consumes: `findViolation`, `VIOLATION`, `AI.hurryAt`, `AI.lowSpotZ`.
- Produces:
  - `keyContains(x, z, sign) → boolean`: inside the key at the hoop on side `sign`
  - `trackCounters(state, dt)`: maintains `controlTeam`, `frontcourt`, `backcourtT` and every player's `keyT`
  - `findViolation` also returns `'backcourt'`, `'eightSeconds'`, `'threeSeconds'`.

- [ ] **Step 1: Write the failing tests**

```js
test('keyContains: 4.9 m wide, 5.8 m deep, at the right end', () => {
  assert.equal(keyContains(10, 0, 1), true);
  assert.equal(keyContains(10, 2.5, 1), false);
  assert.equal(keyContains(8.1, 0, 1), false);         // the free-throw line is at x = 8.2
  assert.equal(keyContains(-10, 0, 1), false);
  assert.equal(keyContains(-10, 0, -1), true);
});

// `at(s, id, x, z)` places a player. Team 0 attacks +x, so x < 0 is its back court.
test('once the ball has been in the front court it cannot go back', () => {
  const s = live(); at(s, 0, 1, 0);
  step(s, idle(), DT);
  assert.equal(s.frontcourt, true);
  at(s, 0, -1, 0);
  step(s, idle(), DT);
  assert.deepEqual([s.phase, s.call.kind, s.call.team], ['dead', 'backcourt', 0]);
});

test('a player straddling half court is not called', …);            // x = 1 then x = -0.2 → phase 'live'
test('dribbling in the back court before crossing is not a violation', …);   // x = -5 for 1 s → 'live'

test('a teammate catching a pass in the back court is called', …);
// frontcourt established by player 0 at (2, 0); pass to player 1 at (-3, 0) → 'backcourt' when he catches

test('the ball may be recovered in the back court after a defender knocks it loose', () => {
  const s = live(); at(s, 0, 1, 0);
  step(s, idle(), DT);
  Object.assign(s.ball, { holder: null, mode: 'loose', x: -2, y: 0.5, z: 0, vx: 0, vy: 0, vz: 0 });
  at(s, 0, -2, 0);
  run(s, 0.5);
  assert.deepEqual([s.ball.holder, s.phase, s.frontcourt], [0, 'live', false]);
});

test('8 seconds to cross half court', () => {
  const s = live(); at(s, 0, -5, 0);
  run(s, 7.9);
  assert.equal(s.phase, 'live');
  run(s, 0.2);
  assert.deepEqual([s.phase, s.call.kind, s.call.team], ['dead', 'eightSeconds', 0]);
});

test('the 8-second count restarts when the other team takes the ball', …);
// 5 s in team 0's back court, giveBall to player 3 (their front court is x < 0) → backcourtT back to 0 on the next step

test('3 seconds in the key', () => {
  const s = live(); at(s, 0, 6, 5); at(s, 1, 11, 0);    // the ball is in the front court; a teammate stands in the key
  run(s, 2.9);
  assert.equal(s.phase, 'live');
  run(s, 0.2);
  assert.deepEqual([s.phase, s.call.kind, s.call.team], ['dead', 'threeSeconds', 0]);
});

test('stepping out of the key restarts the count', …);              // 2 s in, moved to (11, 4) for a step, 2 s in → 'live'
test('the count pauses while he is in the air', …);                 // y 0.5, vy 0 held artificially for 3.5 s → 'live'
test('defenders may stand in their own key', …);                    // player 3 at (11, 0) for 4 s → 'live'
test('nobody is counted while the ball is still in the back court', …);   // holder at (-5, 0), player 1 at (11, 0), 4 s → no 'threeSeconds'

// tests/ai.test.js
// A regression test: it passes before this task's AI change, because no spacing spot is inside the key.
test('a computer player left in the key steps out before 3 seconds', () => {
  const s = live(); put(s, 0, 6, 5); put(s, 1, 11, 0);
  run(s, 4, [1]);
  assert.notEqual(s.call?.kind, 'threeSeconds');
  assert.equal(keyContains(s.players[1].x, s.players[1].z, 1), false);
});

test('the low spacing spot is clear of the key', () => {
  for (const sign of [1, -1]) for (const spot of spots(sign)) assert.equal(keyContains(spot.x, spot.z, sign), false);
  assert.ok(Math.abs(spots(1)[2].z) >= VIOLATION.keyHalfWidth + 0.6);
});

test('with 5 seconds gone in the back court the handler stops looking for a pass and brings it up', () => {
  const s = live(); put(s, 0, -8, 0); put(s, 3, -7, 0); put(s, 1, -4, 4);   // covered, with an open teammate ahead
  s.backcourtT = 5.5; s.controlTeam = 0;
  assert.ok(!run(s, 1.5, [0], st => st.ball.mode === 'pass'));
  assert.ok(s.players[0].x > -8);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: the new tests FAIL (`keyContains` not exported; no calls), except the regression test marked above.

- [ ] **Step 3: Implement `trackCounters`, `keyContains` and the three checks**

`trackCounters(state, dt)`:
- The team in control is the holder's team, or `state.lastTouch` while `ball.mode === 'pass'`, else null.
- If it is null or differs from `state.controlTeam`: clear `frontcourt`, `backcourtT` and every `keyT`, store the new value, and return if null.
- With a holder: `frontcourt` becomes true when `attackSign(team) * holder.x > PLAYER.radius`.
- While `frontcourt` is false, add `dt` to `backcourtT`.
- For each player of that team: outside the opponent's key, or `frontcourt` false, `keyT = 0`; inside it and on the floor, add `dt`.

`findViolation` adds, in this order after travel and double dribble: a holder with `frontcourt` set and `attackSign(team) * holder.x < -PLAYER.radius` → `'backcourt'`; `backcourtT > VIOLATION.backcourt` → `'eightSeconds'`; any player with `keyT > VIOLATION.key` → `'threeSeconds'`.

`rules.js` `livePlay` calls `trackCounters(state, dt)` immediately before `findViolation`. `setupInbound` clears `controlTeam`.

- [ ] **Step 4: Implement the AI additions**

- `spots(sign)`: the low spot uses `AI.lowSpotZ`.
- The handler: when `state.backcourtT > AI.hurryAt` and `state.frontcourt` is false, he sprints for the top of the key instead of passing.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: backcourt, 8-second and 3-second violations"
```

---

### Task 7: Free throws

**Files:**
- Create: `src/sim/freethrow.js`
- Modify: `src/sim/players.js` (extract `launchShot`), `src/sim/step.js` (who may move and act in each phase), `src/sim/rules.js`, `tests/helpers.js`
- Test: `tests/freethrow.test.js`

**Interfaces:**
- Consumes: `solveShot`, `rimCentre`, `shotFactor`, `giveBall`, `stopPlay`, `FT`.
- Produces:
  - `launchShot(state, player, made, value)` in `players.js`: throws the ball from the player's hands at the hoop he attacks, on target or nudged off, worth `value`. `releaseShot` uses it.
  - `newFreeThrow(shooter, shots) → { shooter, left: shots, total: shots, stage: 'aim', meter: 0, dir: 1, t: 0, armed: false, live: false }`
  - `ftChance(meter) → number`
  - `setupFreeThrow(state)`
  - `stepFreeThrow(state, intents, events, dt) → null | 'scored' | 'live' | 'over'`
  - `step.js`: players may move and act in `live`, `inbound` and a `freeThrow` whose `live` flag is set; move only in `dead` and `quarterEnd`; neither in `jumpBall` and in a `freeThrow` that is not `live`. Ball events reach `applyRules` in every phase except `dead` and `quarterEnd`.

- [ ] **Step 1: Write the failing tests**

```js
// `shooting(seed, shots, team = 0)`: live(seed), state.freeThrow = newFreeThrow(team * 3, shots), setupFreeThrow(state).
// Added to tests/helpers.js for this task and Task 8:
//   press(s): one step with Space up, then one with the free-throw shooter's Space down.
//   pressWhenAiming: an `intents` function for run() that taps Space on alternate steps whenever a team 0 player is aiming.
test('the odds run in a straight line from 95% at the centre to 20% at the edges', () => {
  assert.deepEqual([0.5, 0, 1].map(ftChance), [0.95, 0.2, 0.2]);
  assert.ok(Math.abs(ftChance(0.25) - 0.575) < 1e-9);
});

test('setup puts the shooter on the line with the ball and the other five in their spots', () => {
  const s = shooting(1, 2);
  const p = s.players[0];
  assert.deepEqual([s.phase, s.ball.holder, s.shotClock, p.x, p.z], ['freeThrow', 0, 24, 8.2, 0]);
  assert.deepEqual([1, 2].map(i => [s.players[i].x, s.players[i].z]), [[10.3, -2.75], [10.3, 2.75]]);
  assert.deepEqual([3, 4, 5].map(i => [s.players[i].x, s.players[i].z]), [[11.7, -2.75], [11.7, 2.75], [5, 2]]);
  assert.ok(s.players.every(q => !q.inbounder && q.vx === 0 && q.vz === 0));
});

test('for team 1 everything is mirrored', …);                       // shooter (player 3) at x = -8.2

test('the marker crosses the bar 1.5 times a second and turns at the ends', () => {
  const s = shooting(1, 2);
  run(s, 1 / 3);
  assert.ok(Math.abs(s.freeThrow.meter - 0.5) < 0.03);
  run(s, 2 / 3);                                        // one second in all: to the end and half-way back
  assert.ok(Math.abs(s.freeThrow.meter - 0.5) < 0.03);
});

test('nobody else can move before the last attempt is released', () => {
  const s = shooting(1, 2); const before = s.players.map(p => [p.x, p.z]);
  run(s, 1, s.players.map((_, i) => ({ ...emptyIntent(), moveX: i ? 1 : 0, sprint: true })));
  assert.deepEqual(s.players.map(p => [p.x, p.z]), before);
});

test('Space held from before the meter appeared does not shoot; a fresh press does', () => {
  const s = shooting(1, 2);
  run(s, 0.5, only(0, { shoot: true }));
  assert.equal(s.freeThrow.stage, 'aim');
  step(s, idle(), DT);
  step(s, only(0, { shoot: true }), DT);
  assert.equal(s.freeThrow.stage, 'flight');
});

// `rate(meter, energy = 1)`: over seeds 1..200, park the meter at `meter` (dir 0, armed), press Space, play it out; share that scored.
test('dead centre makes about 95%, the edge about 20%', () => {
  assert.ok(Math.abs(rate(0.5) - 0.95) < 0.06);
  assert.ok(Math.abs(rate(0) - 0.2) < 0.1);
});

test('an exhausted shooter makes 80% as often', …);                 // |rate(0.5, 0) - 0.76| < 0.1
test('a made free throw is worth 1 point', …);                      // score [1, 0]

test('after the first of two the ball comes back to the shooter', () => {
  const s = shooting(1, 2); press(s);
  run(s, 6, idle(), st => st.freeThrow?.stage === 'aim' && st.freeThrow.left === 1);
  assert.deepEqual([s.freeThrow.left, s.ball.holder, s.phase], [1, 0, 'freeThrow']);
});

test('no press within 5 seconds counts as a miss', () => {
  const s = shooting(1, 1);
  run(s, 4.9);
  assert.equal(s.freeThrow.stage, 'aim');
  run(s, 8, idle(), st => st.phase !== 'freeThrow');
  assert.deepEqual(s.score, [0, 0]);
});

test('the computer shoots after about a second and makes about 75%', …);
// team 1 shooter, 200 seeds, idle intents: stage 'flight' by 1.2 s; share scored within 0.08 of 0.75

test('a missed last attempt is a live rebound and the clocks start when someone has the ball', () => {
  const s = firstSeed(seed => { const st = shooting(seed, 1); st.freeThrow.meter = 0; st.freeThrow.dir = 0; press(st); return st; },
    st => run(st, 8, ai, x => x.phase === 'live'));
  assert.deepEqual([s.freeThrow, s.score], [null, [0, 0]]);
  assert.notEqual(s.ball.holder, null);
  const clock = s.gameClock; run(s, 0.5, ai);
  assert.ok(s.gameClock < clock);
});

test('a made last attempt gives the other team the ball under that hoop', …);
// → phase 'dead', call null, possession 1, inboundSpot.x 14.5, score [1, 0], freeThrow null

test('with the period clock at zero the free throws are shot and then the period ends', () => {
  const s = shooting(1, 2); s.gameClock = 0;
  run(s, 30, pressWhenAiming, st => st.phase === 'quarterEnd');
  assert.equal(s.phase, 'quarterEnd');
  assert.equal(s.freeThrow, null);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/freethrow.test.js`
Expected: FAIL, cannot find module `freethrow.js`.

- [ ] **Step 3: Extract `launchShot` and implement `freethrow.js`**

`setupFreeThrow(state)`: sign = the hoop the shooter attacks. Shooter at `sign * (COURT.halfLength - FT.lineDist)`, `z = 0`, facing the hoop; his two teammates on `FT.offence`, the three opponents on `FT.defence`, each `[fromBaseline, z]` placed at `x = sign * (COURT.halfLength - fromBaseline)`, in slot order. Everyone stops, lands and loses `inbounder` and `shooting`. `giveBall` to the shooter; shot clock 24; phase `'freeThrow'`; stage `'aim'`, `meter 0`, `dir 1`, `t 0`, `armed false`, `live false`.

`stepFreeThrow(state, intents, events, dt)` by stage:
- `'aim'`: add `dt` to `t`. `armed` becomes true the first step the shooter's `shoot` is up. The attempt is thrown when: he is on team 0 and presses `shoot` while armed (chance `ftChance(meter)`); or he is on team 1 and `t >= FT.aiDelay` (chance `FT.aiChance`); or `t >= FT.limit` (chance 0). Both chances are multiplied by `shotFactor` of his energy. Throwing rolls `rand(state)`, calls `launchShot(state, shooter, made, 1)`, sets stage `'flight'`, and sets `live` when this is the last attempt and `state.gameClock > 0`. Otherwise the meter moves by `dir * FT.sweep * dt` and turns at 0 and 1.
- `'flight'`, not `live`: on `events.scored` add 1 to the shooter's team; on that or `events.hitFloor`, take one off `left`, set stage `'pause'` and `t = 0`.
- `'flight'`, `live`: on `events.scored` add 1 and return `'scored'`; when a player holds the ball return `'live'`.
- `'pause'`: after `FT.pause`, return `'over'` if `left` is 0, else hand the ball back to the shooter and go to `'aim'`.

- [ ] **Step 4: Wire the phase into `rules.js` and `step.js`**

- `'dead'` case: when `phaseT` runs out, `state.freeThrow ? setupFreeThrow(state) : setupInbound(state)`.
- New `'freeThrow'` case: `const r = stepFreeThrow(state, intents, events, dt)`. `'scored'` → clear `freeThrow`, `stopPlay(state, 1 - team, baseline spot under that hoop)`. `'live'` → clear `freeThrow`, phase `'live'`. `'over'` → clear `freeThrow`, end the period. While `freeThrow.live`, also run the out-of-bounds check; if it stops play, clear `freeThrow`.
- `step.js`: the move/act table under "Interfaces".

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: free throws with a timing meter"
```

---

### Task 8: Fouls

**Files:**
- Create: `src/sim/fouls.js`
- Modify: `src/sim/players.js` (report contacts), `src/sim/step.js`, `src/sim/rules.js`
- Test: `tests/fouls.test.js`

**Interfaces:**
- Consumes: `newFreeThrow`, `stopPlay`, `makeCall`, `personOf`, `applySubs`, `FOUL`, `CLOCK.shotAfterFoul`.
- Produces:
  - `movePlayers(state, intents, dt) → [[idA, idB], …]` pairs that overlapped this step; it also keeps each player's `setT`
  - `trySteal(state, player) → null | { won, front }`; `applyActions` adds each failed attempt to `stealMisses`
  - `releaseShot(state, player) → { shooter, defender, blocked }`; `applyActions` returns it as `release`
  - `judgeContacts(state, events, dt) → null | { kind, by, on }` with `kind` one of `'reach' | 'shooting' | 'charge' | 'block'`
  - `recordFoul(state, foul) → { shots, ball }`: adds the personal and team foul; for a non-shooting foul, `shots` is 2 in the bonus, else 0, and `ball` is the team that gets it.

- [ ] **Step 1: Write the failing tests**

```js
// `share(make, kind)`: over seeds 1..600, with [state, events] = make(seed), the fraction for which judgeContacts(state, events, DT)
// returns a foul of that kind; with kind null, any foul at all.
test('a failed steal is a reach-in 12% of the time from the front, 30% from behind', () => {
  const reach = front => share(seed => [live(seed), { ...emptyEvents(), stealMisses: [{ by: 3, on: 0, front }] }], 'reach');
  assert.ok(Math.abs(reach(true) - 0.12) < 0.05);
  assert.ok(Math.abs(reach(false) - 0.3) < 0.06);
});

test('an airborne defender on top of the shooter fouls him a quarter of the time; a clean block never', () => {
  const shot = release => share(seed => [live(seed), { ...emptyEvents(), release }], 'shooting');
  assert.ok(Math.abs(shot({ shooter: 0, defender: 3, blocked: false }) - 0.25) < 0.06);
  assert.equal(shot({ shooter: 0, defender: null, blocked: false }), 0);
  assert.equal(shot({ shooter: 0, defender: 3, blocked: true }), 0);
});

// `crash(seed, { speed = 5.95, setT = 0.5, ahead = true })`: holder 0 at (5, 0) moving +x at `speed`,
// defender 3 at (5.5, 0) (or (4.5, 0) when not ahead) with that setT, contacts [[0, 3]].
test('running into a set defender is a charge 60% of the time; into a moving one, a block 15%', () => {
  assert.ok(Math.abs(share(seed => crash(seed, {}), 'charge') - 0.6) < 0.07);
  assert.ok(Math.abs(share(seed => crash(seed, { setT: 0 }), 'block') - 0.15) < 0.05);
});

test('no collision foul below 5.5 m/s, or with a defender behind the handler', () => {
  assert.equal(share(seed => crash(seed, { speed: 5 }), null), 0);
  assert.equal(share(seed => crash(seed, { ahead: false }), null), 0);
});

test('the same defender is judged at most once a second', () => {
  const [s, events] = crash(1, { setT: 0 });
  judgeContacts(s, events, DT);
  assert.equal(s.players[3].foulCooldown, FOUL.cooldown);
  assert.equal(share(seed => { const [st, ev] = crash(seed, {}); st.players[3].foulCooldown = 0.5; return [st, ev]; }, null), 0);
});

test('a foul counts against the player and his team; the 3rd team foul starts the bonus', () => {
  const s = live();
  assert.deepEqual(recordFoul(s, { kind: 'reach', by: 3, on: 0 }), { shots: 0, ball: 0 });
  assert.deepEqual(recordFoul(s, { kind: 'block', by: 4, on: 0 }), { shots: 0, ball: 0 });
  assert.deepEqual(recordFoul(s, { kind: 'reach', by: 3, on: 0 }), { shots: 2, ball: 0 });
  assert.deepEqual([s.rosters[1][0].fouls, s.rosters[1][1].fouls, s.teamFouls], [2, 1, [0, 3]]);
});

test('a charge gives the ball to the defence and never free throws', () => {
  const s = live(); s.teamFouls = [5, 0];
  assert.deepEqual(recordFoul(s, { kind: 'charge', by: 0, on: 3 }), { shots: 0, ball: 1 });
  assert.equal(s.teamFouls[0], 6);
});

// The tests below go through step(). `fouled(setup)` is firstSeed over a state built by `setup(seed)`
// and stepped until a call is made or 3 seconds pass.
test('a reach-in outside the bonus: the fouled team inbounds and the shot clock is at least 14', () => {
  const s = fouled(seed => stealing(seed, { shotClock: 5 }));       // player 3 keeps pressing steal on holder 0
  assert.deepEqual(s.call, { kind: 'reach', team: 1, ball: 0, number: 5, shots: 0 });
  assert.deepEqual([s.phase, s.possession, s.freeThrow, s.shotClock], ['dead', 0, null, 14]);
});

test('the shot clock is left alone when it is above 14', …);        // shotClock 20 → 20 (within 0.1)

test('in the bonus the same foul gives two shots', () => {
  const s = fouled(seed => stealing(seed, { teamFouls: [0, 2] }));
  assert.equal(s.call.shots, 2);
  run(s, 3, idle(), st => st.phase === 'freeThrow');
  assert.deepEqual([s.phase, s.freeThrow.shooter, s.freeThrow.total], ['freeThrow', 0, 2]);
});

test('play carries on until a fouled shot has finished', () => {
  const s = live(); s.pendingFoul = { by: 3, on: 0, shots: 2 };
  shotAt(s, { x: 9, y: 4, z: 0 });                       // helper: the ball in the air as player 0's shot
  step(s, idle(), DT);
  assert.equal(s.phase, 'live');
});

test('a fouled shot that misses gives two shots, or three from behind the arc', …);
// pendingFoul shots 2 (then 3), the ball dropped to the floor → call.kind 'shooting', call.shots 2 (3), freeThrow.total 2 (3)

test('a fouled shot that goes in counts, with one free throw', () => {
  const s = live(); s.pendingFoul = { by: 3, on: 0, shots: 2 };
  shotAt(s, { x: RIM.x, y: 3.5, z: 0 }, 2);             // dropping through the hoop
  run(s, 1, idle(), st => st.phase === 'dead');
  assert.deepEqual([s.score, s.call.kind, s.call.shots, s.freeThrow.total, s.possession], [[2, 0], 'shooting', 1, 1, 0]);
});

test('a charge is a turnover even in the bonus', …);                // via step: call.kind 'charge', call.team 0, possession 1, freeThrow null

test('a player with three fouls is replaced during the stoppage and cannot come back', () => {
  const s = fouled(seed => stealing(seed, { fouls: 2 }));           // the stealer already has two
  step(s, idle(), DT);
  assert.notEqual(s.players[3].person, 0);
  assert.equal(substitute(s, 4, 0), false);
});

test('with no eligible bench player he stays on and the match carries on', () => {
  const s = fouled(seed => stealing(seed, { fouls: 2, benchFouls: 3 }));
  run(s, 3, idle(), st => st.phase === 'inbound');
  assert.deepEqual([s.players[3].person, s.phase], [0, 'inbound']);
});

test('a foul and a travel in the same step give one call, the foul', () => {
  const s = firstSeed(seed => { const [st, ev] = crash(seed, {}); st.players[0].held = true; st.players[0].steps = 2; applyRules(st, ev, DT, idle()); return st; },
    st => st.call?.kind === 'charge');
  assert.deepEqual([s.phase, s.call.kind, s.teamFouls], ['dead', 'charge', [1, 0]]);
});

test('a foul at the buzzer: the shots are taken, then the period ends', () => {
  const s = fouled(seed => stealing(seed, { teamFouls: [0, 2], gameClock: 0 }));      // the foul comes on the very step the clock ran out
  assert.equal(s.phase, 'dead');
  run(s, 40, pressWhenAiming, st => st.phase === 'quarterEnd');
  assert.equal(s.phase, 'quarterEnd');
});

test('team fouls reset each quarter, but overtime carries on from the 4th', …);
// teamFouls [2, 1], end of Q1 → [0, 0] at the start of Q2; end of Q4 tied → still [2, 1] in OT1

test('nobody is fouled during a dead ball, and an inbounder cannot be fouled', …);
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/fouls.test.js`
Expected: FAIL, cannot find module `fouls.js`.

- [ ] **Step 3: Report contacts from `players.js`**

- `movePlayers` returns the overlapping pairs found by `separate`, and updates `setT`: plus `dt` while a player's horizontal speed is under `FOUL.setSpeed`, else 0.
- `trySteal` returns `null` when no attempt was made, otherwise `{ won, front }`.
- `releaseShot` returns `{ shooter, defender, blocked }`, where `defender` is the nearest opponent with `y > 0` within `FOUL.contactDist`.
- `applyActions` collects these into its return value.

- [ ] **Step 4: Implement `fouls.js`**

`judgeContacts(state, events, dt)` first counts every `foulCooldown` down, then returns the first foul found, in this order:
1. Each steal miss: `rand(state) < (front ? FOUL.reachFront : FOUL.reachBack)` → `reach`, by the stealer on the holder.
2. A release with a defender and not blocked: `rand(state) < FOUL.shooting` → `shooting`, by the defender on the shooter.
3. A ball holder on the floor, not inbounding, moving faster than `FOUL.chargeSpeed`: for each contact pair with an opponent who lies ahead of his direction of travel and whose `foulCooldown` is 0, set that cooldown to `FOUL.cooldown`, then: opponent's `setT >= FOUL.setTime` and `rand(state) < FOUL.charge` → `charge`, by the holder on the opponent; opponent not set and `rand(state) < FOUL.block` → `block`, by the opponent on the holder.

`recordFoul(state, foul)`: add 1 to the fouler's personal fouls and his team's fouls. For `charge`: `{ shots: 0, ball: victim's team }`. For `reach` and `block`: `{ shots: teamFouls >= FOUL.bonus ? 2 : 0, ball: victim's team }`. For `shooting`: `{ shots: 0, ball: victim's team }` (the caller supplies the shots).

- [ ] **Step 5: Make the call in `rules.js`**

`livePlay` runs in the order under "Call priority". A helper, `callFoul(state, foul, shots)`:
- `recordFoul`, then free throws = `shots` if given, else the returned `shots`; when non-zero, `state.freeThrow = newFreeThrow(foul.on, n)`.
- `stopPlay(state, ball, sidelineSpot(state.ball), makeCall(foul.kind, fouler's team, { number: fouler's jersey number, shots: n }))`.
- For a defensive foul without free throws, raise the shot clock to `CLOCK.shotAfterFoul` if it is lower.
- Clear `state.pendingFoul`.

Shooting fouls: when judged, store `state.pendingFoul = { by, on, shots: ball.shotValue }` and carry on. On a basket with a pending foul, score it and `callFoul(…, 1)` instead of the normal restart. Otherwise, once `ball.shooter` is null, `callFoul(…, pending.shots)`.

`beginPeriod` resets `teamFouls` when `state.quarter <= CLOCK.quarters`.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: reach-in, shooting, charging and blocking fouls"
```

---

### Task 9: Jump ball

**Files:**
- Modify: `src/sim/rules.js`, `src/sim/step.js`, `src/sim/ai.js`
- Test: `tests/tip.test.js`, `tests/rules.test.js`

**Interfaces:**
- Consumes: `jump`, `lineUp`, `TIP`, `PLAYER.reach`, `PLAYER.pickupRadius`, `PASS.noPickup`.
- Produces: `startMatch` leaves the match in phase `'jumpBall'`; `state.tipWinner`; `beginPeriod` chooses who starts quarters 2 onward from it. The jumpers are the slot-1 players (ids 1 and 4). `state.controlled` is 1 during the tip.

- [ ] **Step 1: Write the failing tests**

```js
// `tip(seed = 1)`: createMatch(seed) then startMatch.
test('the match starts with the two jumpers either side of the centre spot and the ball held above it', () => {
  const s = tip();
  assert.deepEqual([s.phase, s.controlled, s.ball.holder], ['jumpBall', 1, null]);
  assert.deepEqual([s.players[1].x, s.players[1].z, s.players[4].x, s.players[4].z], [-0.6, 0, 0.6, 0]);
  run(s, 0.9);
  assert.deepEqual([s.ball.x, s.ball.y, s.ball.z, s.gameClock], [0, 1.5, 0, CLOCK.quarter]);
});

test('after a second the ball is tossed to about 3.7 m', () => {
  const s = tip(); let top = 0;
  run(s, 2, idle(), st => { top = Math.max(top, st.ball.y); return false; });
  assert.ok(top > 3.6 && top < 3.8, `peak ${top}`);
});

test('nobody but the jumpers can move during the tip', …);
// everyone sprinting +x for 0.9 s: all x unchanged

test('a jumper cannot touch the ball while it is still rising', () => {
  const s = tip();
  run(s, 1.05, only(1, { shoot: true }));               // jumps the instant it is tossed
  run(s, 0.5, idle(), st => st.phase !== 'jumpBall');
  assert.equal(s.phase, 'jumpBall');                    // he is coming down while the ball is still going up
});

test('a well-timed jump taps the ball to the nearest teammate and play is live', () => {
  const s = tip();
  run(s, 3, st => only(1, { shoot: st.ball.vy < 0 && st.ball.y < 3.6 }), st => st.phase === 'live');
  assert.equal(s.phase, 'live');
  assert.deepEqual([s.ball.mode, s.lastTouch], ['pass', 0]);
  run(s, 2, idle(), st => st.ball.holder !== null);
  assert.equal(s.players[s.ball.holder].team, 0);
  step(s, idle(), DT);
  assert.equal(s.tipWinner, 0);
});

test('if nobody jumps the ball lands, play is live and the clock starts', () => {
  const s = tip();
  run(s, 4, idle(), st => st.phase === 'live');
  assert.equal(s.phase, 'live');
  run(s, 0.5);
  assert.ok(s.gameClock < CLOCK.quarter);
});

test('the computer jumps for the tip', () => {
  const s = tip();
  assert.ok(run(s, 4, st => aiIntents(st, DT), st => st.phase === 'live' && st.ball.mode === 'pass'));
});

test('the tip loser starts quarters 2 and 4, the winner quarter 3, and overtime keeps alternating', () => {
  for (const [quarter, starts] of [[2, 0], [3, 1], [4, 0], [5, 1], [6, 0]]) {
    const s = tip(); s.tipWinner = 1; s.quarter = quarter - 1; s.phase = 'quarterEnd'; s.phaseT = 0; s.score = [1, 1];
    step(s, idle(), DT);
    assert.deepEqual([s.quarter, s.phase, s.possession], [quarter, 'inbound', starts], `quarter ${quarter}`);
  }
});
```

`tests/rules.test.js`: "startMatch: team 0 inbounds at half court, clocks stopped" is replaced by the first test above. Other tests that rely on `startMatch` leaving an inbound use the quarter-2 set-up instead.

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/tip.test.js`
Expected: FAIL (phase is `inbound`).

- [ ] **Step 3: Implement**

- `beginPeriod`: in quarter 1, `lineUp`, move the slot-1 players to `x = -TIP.gap` and `+TIP.gap`, `z = 0`, facing each other; put the ball at `(0, TIP.height, 0)` at rest with no holder; `controlled = 1`; `phaseT = TIP.wait`; phase `'jumpBall'`. In later periods the team that starts is `quarter % 2 === 1 ? tipWinner : 1 - tipWinner` (a null `tipWinner` counts as team 0).
- `step.js`: the ball is not stepped during `'jumpBall'` while `phaseT > 0`.
- New `'jumpBall'` case in `applyRules`: count `phaseT` down; when it reaches zero give the ball `vy = TIP.tossV`. After the toss, a jumper on the floor with `shoot` down who has not yet jumped this tip jumps. A jumper may tap when `ball.vy < 0`, he is in the air, he is within `PLAYER.pickupRadius` of the ball horizontally and `p.y + PLAYER.reach >= ball.y`; if both can in the same step, `rand(state)` picks. A tap sends the ball at `TIP.speed` toward his nearest teammate with `vy = 0`, `mode 'pass'`, `lastTouch` his team, `possession` his team, and himself as `noPickupId` for `PASS.noPickup`; phase `'live'`. If `events.hitFloor` comes first, phase `'live'`.
- `livePlay`: while `tipWinner` is null and someone holds the ball, `tipWinner` is that player's team.
- `ai.js`: during `'jumpBall'`, every intent is empty except a jumper's `shoot`, which is true when `ball.vy < 0 && ball.y <= p.ai.tipAt`. `tipAt` is chosen once per player as `TIP.aiJumpAt + (rand(state) * 2 - 1) * TIP.aiError`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: opening jump ball decides who starts each quarter"
```

---

### Task 10: Scoreboard, pause-screen substitutions and jersey numbers

**Files:**
- Modify: `index.html`, `src/render/hud.js`, `src/main.js`, `src/render/actors.js`
- Test: `tests/hud.test.js`

**Interfaces:**
- Consumes: `state.call`, `state.teamFouls`, `state.freeThrow`, `state.rosters`, `state.subQueue`, `state.autoSubs`, `personOf`, `onCourt`, `queueSub`.
- Produces:
  - `callText(call) → string`
  - `rosterLine(state, row, picked) → string` for person `row` of team 0
  - `subNote(state) → string`
  - `hud.update(state, backend, ui = { paused: false, pick: null })`
  - New element ids: `fouls0`, `fouls1`, `energy`, `call`, `ftBox`, `ftText`, `ftBar`, `ftMarker`, `roster0`…`roster4`, `rosterEnergy0`…`rosterEnergy4`, `subNote`.

- [ ] **Step 1: Write the failing tests**

```js
test('calls read as a sentence and say what follows', () => {
  const call = (kind, team, extra) => ({ kind, team, ball: 1 - team, number: null, shots: 0, ...extra });
  assert.equal(callText(call('travel', 0)), "Travelling. Opponent's ball");
  assert.equal(callText(call('doubleDribble', 1)), 'Double dribble. Your ball');
  assert.equal(callText(call('backcourt', 0)), "Backcourt violation. Opponent's ball");
  assert.equal(callText(call('eightSeconds', 0)), "8 seconds. Opponent's ball");
  assert.equal(callText(call('threeSeconds', 1)), '3 seconds. Your ball');
  assert.equal(callText(call('fiveSeconds', 1)), '5 seconds. Your ball');
  assert.equal(callText(call('shotClock', 0)), "Shot clock violation. Opponent's ball");
  assert.equal(callText(call('out', 1)), 'Out of bounds. Your ball');
  assert.equal(callText(call('reach', 1, { number: 8 })), 'Reach-in foul on 8. Your ball');
  assert.equal(callText(call('block', 1, { number: 8, shots: 2 })), 'Blocking foul on 8. Two shots');
  assert.equal(callText(call('shooting', 0, { number: 7, shots: 1 })), 'Shooting foul on 7. One shot');
  assert.equal(callText(call('shooting', 0, { number: 7, shots: 3 })), 'Shooting foul on 7. Three shots');
  assert.equal(callText(call('charge', 0, { number: 4 })), "Charge on 4. Opponent's ball");
});

test('the scoreboard shows team fouls and the energy of the player you control', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.teamFouls = [2, 1]; s.controlled = 1; s.rosters[0][1].energy = 0.4;
  hud.update(s, 'webgl2');
  assert.deepEqual([doc.els.fouls0.textContent, doc.els.fouls1.textContent, doc.els.energy.value], ['Fouls 2', 'Fouls 1', 0.4]);
});

test('the call banner shows during the stoppage and is read out once', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.phase = 'dead'; s.call = { kind: 'travel', team: 0, ball: 1, number: null, shots: 0 };
  hud.update(s, 'webgl2');
  assert.deepEqual([doc.els.call.hidden, doc.els.call.textContent, doc.els.announce.textContent],
    [false, "Travelling. Opponent's ball", "Travelling. Opponent's ball"]);
  s.phase = 'live';
  hud.update(s, 'webgl2');
  assert.equal(doc.els.call.hidden, true);
});

test('a score after a call is announced as the score', …);
// same hud: score [2, 0] → announce 'You 2, opponent 0'

test('the free-throw box shows which attempt it is and where the marker is', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  s.phase = 'freeThrow'; s.freeThrow = { shooter: 0, left: 1, total: 2, stage: 'aim', meter: 0.25 };
  hud.update(s, 'webgl2');
  assert.deepEqual([doc.els.ftBox.hidden, doc.els.ftText.textContent, doc.els.ftMarker.style.left], [false, 'Free throw 2 of 2', '25%']);
  s.freeThrow.shooter = 3;                               // the computer shoots: no meter
  hud.update(s, 'webgl2');
  assert.equal(doc.els.ftBar.hidden, true);
});

test('the pause screen lists your five with where they are, their fouls and what is queued', () => {
  const s = createMatch(); s.rosters[0][3].fouls = 3; s.rosters[0][1].fouls = 1;
  assert.equal(rosterLine(s, 0, false), '1 · No. 4 · on court · 0 fouls');
  assert.equal(rosterLine(s, 1, true), '2 · No. 7 · on court · 1 foul · selected');
  assert.equal(rosterLine(s, 3, false), '4 · No. 15 · fouled out');
  assert.equal(rosterLine(s, 4, false), '5 · No. 23 · bench · 0 fouls');
  assert.equal(subNote(s), 'Automatic substitutions on. No swap queued.');
  s.autoSubs[0] = false; s.subQueue = [{ team: 0, out: 1, in: 4 }];
  assert.equal(subNote(s), 'Automatic substitutions off. Queued: No. 7 off, No. 23 on.');
});

test('the page has every element the scoreboard writes to', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['fouls0', 'fouls1', 'energy', 'call', 'ftBox', 'ftText', 'ftBar', 'ftMarker', 'subNote',
    ...[0, 1, 2, 3, 4].flatMap(i => [`roster${i}`, `rosterEnergy${i}`])]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /F hold ball/);
});
```

`fakeDoc` elements gain a `style: {}` and a `value`. The existing "only one live region" test stays as it is.

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/hud.test.js`
Expected: FAIL (`callText` not exported).

- [ ] **Step 3: Implement `hud.js` and `index.html`**

- `index.html`: team fouls beside each score; a labelled `<progress id="energy" max="1">`; `<p id="call" hidden>` centred under the scoreboard; `#ftBox` with `#ftText` and a bar `#ftBar` containing a centre zone and `#ftMarker`; in `#screenPause`, an ordered list of five rows, each a `<span id="rosterN">` and a `<progress id="rosterEnergyN" max="1">`, then `<p id="subNote">` and a line of help: "1 to 5 choose two players to swap · A automatic substitutions". The controls reminder gains "F hold ball". The meter's centre zone has a visible border as well as a colour.
- `hud.update`: the banner is shown while `phase === 'dead'` and `state.call` is set. `#announce` gets the call text when a new call appears, and the score sentence when the score changes. The free-throw box is shown in phase `'freeThrow'`; the bar only while a team 0 player is aiming.

- [ ] **Step 4: Pause-screen keys in `main.js`**

While paused: `Digit1`…`Digit5` choose a row. The first press stores it in `game.pick`; the second calls `queueSub(state, 0, game.pick, row)` when the rows differ, and clears the pick. `KeyA` flips `state.autoSubs[0]`. Leaving the pause clears the pick. `hud.update` receives `{ paused: game.paused, pick: game.pick }`.

- [ ] **Step 5: Jersey numbers in `actors.js`**

Confirm `Sprite`, `SpriteMaterial` and `CanvasTexture` are exported by `node_modules/three/build/three.webgpu.js`. Each player group gets a sprite above the head showing his jersey number, drawn once per number on a small canvas, white on a dark rounded patch. `sync` swaps the sprite's texture when `player.person` changes.

- [ ] **Step 6: Run the tests, then look at it**

Run: `npm test`
Expected: all PASS.

Then open `http://localhost:5173/` with a hard refresh and check by eye: numbers above heads, fouls and energy on the scoreboard, a call banner after stepping out of bounds, the roster on the pause screen, a queued swap applied at the next stoppage. Check the browser console is free of errors.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: scoreboard for fouls, energy, calls and free throws; pause-screen substitutions; jersey numbers"
```

---

### Task 11: Whole matches, tuning and the owner's play-test

**Files:**
- Modify: `tests/match.test.js`, `src/sim/tuning.js` (values only)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the whole-match tests**

`playMatch(seed)` additionally records every new `state.call`, counts entries into phase `'freeThrow'`, and counts changes of `person` among court players, per team.

```js
const games = [1, 2, 3, 4, 5, 6].map(playMatch);

test('six computer matches all finish', () => {
  for (const g of games) assert.equal(g.state.phase, 'final');
});

test('fouls, free throws and substitutions all happen', () => {
  const fouls = games.flatMap(g => g.calls).filter(c => ['reach', 'shooting', 'charge', 'block'].includes(c.kind));
  assert.ok(fouls.length > 0, 'no fouls in six matches');
  assert.ok(games.some(g => g.freeThrows > 0), 'no free throws in six matches');
  for (const team of [0, 1]) assert.ok(games.some(g => g.subs[team] > 0), `team ${team} never substituted`);
});

test('the whistle blows a sensible amount: 2 to 16 fouls a match on average', () => {
  const perMatch = games.flatMap(g => g.calls).filter(c => ['reach', 'shooting', 'charge', 'block'].includes(c.kind)).length / games.length;
  assert.ok(perMatch >= 2 && perMatch <= 16, `${perMatch} fouls a match`);
});

test('the computer never travels or double dribbles, and rarely commits the timed violations', () => {
  const kinds = games.flatMap(g => g.calls).map(c => c.kind);
  assert.equal(kinds.filter(k => k === 'travel' || k === 'doubleDribble').length, 0);
  const timed = kinds.filter(k => ['backcourt', 'eightSeconds', 'threeSeconds', 'fiveSeconds'].includes(k)).length / games.length;
  assert.ok(timed <= 1.5, `${timed} timed violations a match`);
});

test('energy and foul counts stay in range', () => {
  for (const g of games) for (const p of g.state.rosters.flat()) {
    assert.ok(p.energy >= 0 && p.energy <= 1);
    assert.ok(p.fouls >= 0 && p.fouls <= FOUL.limit + 1);
  }
});
```

The two existing whole-match tests stay.

- [ ] **Step 2: Run them**

Run: `npm test`
Expected: PASS, or a failure that names a number outside its band.

- [ ] **Step 3: Tune**

If a band is missed, change values in `src/sim/tuning.js` only (foul chances, `FOUL.contactDist`, stamina rates), re-run, and record each changed value and its reason in the commit message. If the computer is called for 3 seconds, add the step-out rule now: an offensive player whose `keyT` passes a new `AI.keyLeave: 2` heads for the nearest point outside the key, with a test in `tests/ai.test.js`. If a band cannot be met by tuning, the cause is a bug: use superpowers:systematic-debugging.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: whole matches under the full rules"
```

- [ ] **Step 5: Owner play-test**

Ask the owner to play a full match at `http://localhost:5173/` (hard refresh) and report: how often the whistle blows, whether the free-throw meter is fair, how quickly players tire, and whether the 3-second and travel calls feel right. Adjust `tuning.js` only, re-run `npm test`, commit as `tune: play-test adjustments`.

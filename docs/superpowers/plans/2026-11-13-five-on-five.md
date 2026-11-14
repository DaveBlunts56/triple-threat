# 5 on 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, as the session model: the owner asked for no subagents on other models (2026-11-13). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game can be played five a side as well as three a side, chosen on the start menu, with eight players on each team's roster.

**Architecture:** A match is made with a size (3 or 5) that everything reads from the match itself. The few places that assume three a side take the size instead. The renderer always has ten places for players and shows as many as the match has. Three new players a side are added to the definitions file and built with the existing Blender tools. Before any of that, `src/render/motion.js` is split by job with no change in behaviour.

**Tech Stack:** JavaScript modules, Node's test runner, Three.js 0.187, Blender 4.5 with MPFB for the models, `npm run single`.

**Spec:** `docs/superpowers/specs/2026-11-13-five-on-five-design.md`

## Global Constraints

- Branch `feat/five-on-five`, cut from `feat/graphics-pass-1` (not yet merged). Never push. Merge only on the owner's word.
- Every commit ends with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Stage by path.
- **3 on 3 plays exactly as today.** An existing test changes only where it names the roster's size (five people becoming eight) or the menu's rows.
- The sim never imports from `src/render/`; the renderer never changes the match.
- One self-contained HTML file; report its size after the task that changes it.
- Assets CC0, listed in `assets/CREDITS.md`. All names invented. No ratings.
- Test first wherever Node can reach. After every task: `npm test`.
- The timing page and collector in the session's scratchpad (`bench/`) measure frame rates in Firefox; nothing from them is committed.

## Review Focus

1. **A size the game does not have** (`createMatch(1, 4)`, or a menu that somehow holds another number): the match is made three a side, never with a broken line-up. Test in Task 2.
2. **Changing mode between matches:** five a side, then quit to the menu, then three a side: six players, no stale place shown, nobody from the last match on court. Test in Task 4 (logic) and by eye in Task 3.
3. **A fouled-out player in five a side with the bench used up:** he stays on, as today's rule says, and nothing throws. Test in Task 5.
4. **The free throw's places for ten:** nobody inside the lane who should not be, nobody within a body's width of another, at both hoops. Test in Task 2.
5. **A substitute coming on in five a side:** the right model in the right place, wearing the right number, at each quality level. By eye in Task 5.

---

### Task 1: Split `src/render/motion.js` by job

**Files:**
- Create: `src/render/meter.js`, `src/render/hands.js`, `src/render/bearing.js`, `src/render/checks.js`
- Modify: `src/render/motion.js`, `src/render/actors.js`, `src/render/animator.js`, `src/render/people.js`, `src/main.js`, and the `import` lines of `tests/models.test.js`, `tests/meter.test.js`, `tests/motion.test.js`, `tests/bearing.test.js`, `tests/animator.test.js`, `tests/hands.test.js`, `tests/moves.test.js`

**What moves where** (each function keeps its name, its comment and its body):

| New file | Takes |
|---|---|
| `meter.js` | `SHOT_METER`, `shotMeter` and the helper it uses |
| `hands.js` | `BALL_IN_HAND`, `ballHands`, `dribbleHeight`, `switchSpot`, `dribbleSpot`, `ballSpot`, `carrying`, `crossFrom`, `blendFrom` |
| `bearing.js` | `drawnFacing`, `easeFacing`, `leanOf`, `lookTarget`, `headTurn`, `easeHead`, `chestTip` |
| `checks.js` | `checkGaits`, `checkMotions`, `checkFacts`, `checkHands`, `personName`, `courtPeople`, `keepTrack`, `sized`, `missingPeople` |

`motion.js` keeps `MOTION`, the clip lists, the marks, `legLook`, `legMotion`, `armMotion`, `passArrival`, `crossFade`, `layerOf`, `outOfStep`, `stridePhase`, `airTime`, `jumpShare`, `manOf`, `defending`, `dribbleHand`. The new files import `MOTION` and what else they need from it; `motion.js` imports from none of them (no cycle). If a function listed for a new file is used by `motion.js` itself, it stays in `motion.js` and the table is corrected in the ledger.

- [ ] **Step 1:** `npm test` and note the count (508).
- [ ] **Step 2:** Move the functions; re-point every import. No assertion, name or body changes.
- [ ] **Step 3:** `npm test` — expected: the same 508 pass. `npm run single` — expected: it builds (the pack follows the new files).
- [ ] **Step 4:** Load the game in the browser: a match starts, the players move, the ball sits in the hand, the meter shows on a shot, no console error.
- [ ] **Step 5: Commit** `refactor: the motion module is split by job: meter, hands, bearing and checks`.

---

### Task 2: The match knows its size

**Files:**
- Modify: `src/sim/state.js`, `src/sim/rules.js`, `src/sim/ai.js`, `src/sim/freethrow.js`, `src/sim/tuning.js`, `tests/helpers.js`
- Create: `tests/five.test.js`

**Interfaces (produced):**
- `createMatch(seed = 1, size = 3)`: `state.size` is 3 or 5 (anything else is 3); `2 * size` players; player `id` is on team 0 when `id < size`; `slot = person = id % size`.
- `lineUp(state)`: as today for three; for five the same line with the players `LINEUP.gap[5] = 2.4` metres apart, centred on the middle. `LINEUP = { gap: { 3: 3, 5: 2.4 } }` in `tuning.js`.
- `TIP.slot = { 3: 1, 5: 2 }`: the place in the order of each team's jumper. `isJumper(state, player)` exported from `src/sim/rules.js`; `ai.js` and (in Task 3) the renderer use it.
- `spots(sign, size = 3)` in `ai.js`: for three, today's three; for five, `AI.spots5`, as `[metres out from centre court toward the hoop attacked, z]`: `[5.2, 0]`, `[7.5, -5.5]`, `[7.5, 5.5]`, `[11.6, -6.3]`, `[10.9, AI.lowSpotZ]`. A player's spot is `(slot + turn) % size`.
- `FT.offence5 = [[3.7, -2.75], [3.7, 2.75], [9.5, -3.5], [9.5, 3.5]]`, `FT.defence5 = [[2.3, -2.75], [2.3, 2.75], [5.1, -2.75], [5.1, 2.75], [9, 0]]`; `setupFreeThrow` uses them when the match is five a side.
- `tests/helpers.js`: `live(seed = 1, size = 3)`, `idle(count = 6)`, `only(id, intent, count = 6)`.

- [ ] **Step 1: Write the failing tests** (`tests/five.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, lineUp } from '../src/sim/state.js';
import { startMatch, isJumper } from '../src/sim/rules.js';
import { spots, aiIntents } from '../src/sim/ai.js';
import { setupFreeThrow } from '../src/sim/freethrow.js';
import { step } from '../src/sim/step.js';
import { COURT, DT, PLAYER, RIM, VIOLATION } from '../src/sim/tuning.js';

const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('a match is three a side unless it is made five a side, and no other size exists', () => {
  assert.deepEqual([createMatch().size, createMatch(1, 3).size, createMatch(1, 5).size, createMatch(1, 4).size, createMatch(1, 0).size], [3, 3, 5, 3, 3]);
  const three = createMatch(7), five = createMatch(7, 5);
  assert.deepEqual(three.players.map(p => [p.team, p.slot, p.person]), [[0, 0, 0], [0, 1, 1], [0, 2, 2], [1, 0, 0], [1, 1, 1], [1, 2, 2]]);
  assert.equal(five.players.length, 10);
  assert.deepEqual(five.players.map(p => p.team), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  assert.deepEqual(five.players.map(p => p.slot), [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  assert.deepEqual(five.players.map(p => p.person), [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  assert.deepEqual(five.players.map(p => p.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('five line up either side of the centre line, apart from each other, as three always have', () => {
  const three = createMatch(), five = createMatch(1, 5);
  assert.deepEqual(three.players.map(p => [p.x, p.z]), [[-2, -3], [-2, 0], [-2, 3], [2, -3], [2, 0], [2, 3]]);
  assert.deepEqual(five.players.slice(0, 5).map(p => [p.x, Math.round(p.z * 10) / 10]), [[-2, -4.8], [-2, -2.4], [-2, 0], [-2, 2.4], [-2, 4.8]]);
  assert.ok(five.players.slice(5).every(p => p.x === 2));
  for (const a of five.players) for (const b of five.players) if (a !== b) assert.ok(apart(a, b) >= 2 * PLAYER.radius);
  lineUp(five);
  assert.ok(five.players.every(p => Math.abs(p.z) <= COURT.halfWidth));
});

test('the centres jump the tip in five a side; in three a side the jumper is who he was', () => {
  const three = createMatch(), five = createMatch(1, 5);
  startMatch(three); startMatch(five);
  assert.deepEqual(three.players.filter(p => isJumper(three, p)).map(p => p.id), [1, 4]);
  assert.deepEqual(five.players.filter(p => isJumper(five, p)).map(p => p.id), [2, 7]);
  assert.deepEqual([three.controlled, five.controlled], [1, 2]);
  assert.equal(five.phase, 'jumpBall');
});

test('five have five spots: in the front court, inside the lines, apart, and mirrored for the other team', () => {
  assert.deepEqual(spots(1), spots(1, 3));
  assert.equal(spots(1).length, 3);
  const mine = spots(1, 5), theirs = spots(-1, 5);
  assert.equal(mine.length, 5);
  for (const [i, s] of mine.entries()) {
    assert.ok(s.x > 0 && s.x <= COURT.halfLength - PLAYER.radius && Math.abs(s.z) <= COURT.halfWidth - PLAYER.radius, JSON.stringify(s));
    assert.deepEqual([theirs[i].x, theirs[i].z], [-s.x, s.z]);
    for (const other of mine) if (other !== s) assert.ok(apart(s, other) >= 3, `${JSON.stringify(s)} and ${JSON.stringify(other)}`);
  }
});

test('a free throw in five a side gives all ten a place: nobody in the lane, nobody on top of another, at either hoop', () => {
  for (const shooter of [0, 7]) {
    const s = createMatch(1, 5); startMatch(s);
    s.freeThrow = { shooter, left: 2, total: 2 };
    setupFreeThrow(s);
    const sign = shooter < 5 ? 1 : -1, hoopX = sign * RIM.x;
    for (const p of s.players) {
      assert.ok(Math.abs(p.x) <= COURT.halfLength && Math.abs(p.z) <= COURT.halfWidth, `player ${p.id} is off the court`);
      const fromBaseline = COURT.halfLength - sign * p.x, inLane = Math.abs(p.z) < VIOLATION.keyHalfWidth && fromBaseline < VIOLATION.keyDepth;
      if (p.id !== shooter) assert.ok(!inLane, `player ${p.id} stands in the lane`);
      for (const q of s.players) if (q !== p) assert.ok(apart(p, q) >= 2 * PLAYER.radius, `players ${p.id} and ${q.id} overlap`);
      assert.ok(Math.abs(Math.atan2(-p.z, hoopX - p.x) - p.facing) < 1e-9);   // all face the hoop
    }
    assert.equal(s.phase, 'freeThrow');
  }
});

test('the computer plays whole five-a-side matches against itself: they end, both score, nobody leaves, calls are sane', () => {
  for (const seed of [1, 2, 3]) {
    const s = createMatch(seed, 5); startMatch(s);
    const calls = {}; let last = null, steps = 0;
    while (s.phase !== 'final' && steps < 400000) {
      step(s, aiIntents(s, DT), DT); steps++;
      if (s.call && s.call !== last) calls[s.call.kind] = (calls[s.call.kind] ?? 0) + 1;
      last = s.call;
      if (steps % 30 === 0) for (const p of s.players)
        assert.ok(Math.abs(p.x) <= COURT.halfLength + COURT.margin + 1 && Math.abs(p.z) <= COURT.halfWidth + COURT.margin + 1 && Number.isFinite(p.x + p.z + p.y), `seed ${seed}: player ${p.id} at ${p.x}, ${p.z}`);
    }
    assert.equal(s.phase, 'final', `seed ${seed} never ended`);
    assert.ok(s.score[0] >= 10 && s.score[1] >= 10, `seed ${seed}: ${s.score}`);
    assert.ok(s.score[0] + s.score[1] <= 260, `seed ${seed}: ${s.score}`);
    for (const [kind, count] of Object.entries(calls)) assert.ok(count <= 60, `seed ${seed}: ${count} calls of ${kind}`);
    assert.equal(s.players.length, 10);
  }
});
```

- [ ] **Step 2:** `node --test tests/five.test.js` — expected: FAIL (`isJumper` is not exported).
- [ ] **Step 3: Implement.** Find every place that assumes six players or three a side (`grep -nE "length: 6|slot === 1|% 3|id < 3" src/sim`) and make it read the match's size.
- [ ] **Step 4:** `npm test` — expected: all PASS, the 508 old ones unchanged.
- [ ] **Step 5: Commit** `feat: a match is made three or five a side, and the rules, the tip, the spots and the free throw follow`.

If the whole-match test shows five a side is broken in a way the spec does not foresee (a call made hundreds of times, a score of nothing), find the cause before changing any number, and record it in the ledger.

---

### Task 3: The renderer draws as many players as the match has

**Files:**
- Modify: `src/render/people.js`, `src/render/actors.js`, `src/render/motion.js` (the tip's jumper), `src/render/checks.js` if `courtPeople` needs the size
- Test: `tests/moves.test.js` (the tip's jumper in five a side)

**Interfaces (produced):**
- `loadPeople()` makes ten groups. `update(state, dt)` fills and shows the first `state.players.length` and hides the rest; a place whose player changed between matches is reset as a substitution is today.
- `createActors` makes ten capsules for the fallback, each coloured each frame for the team of the player in its place; ten labels; the rest hidden.
- The `tip` motion is given to a jumper as `isJumper(state, player)` says.

- [ ] **Step 1: Write the failing test:** in `tests/moves.test.js`, beside the existing tip test: in a five-a-side match in the `jumpBall` phase, the player in the air in place 2 gets the `tip` arm motion and the player in place 1 does not.
- [ ] **Step 2:** Run it — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm test` — expected: all PASS.
- [ ] **Step 5: By eye:** from the console, `game.state = (await import('./src/sim/state.js')).createMatch(1, 5)` then Enter: ten players line up, the centres jump, the game plays at both ends; a free throw shows ten in place; then the same with a three-a-side match: six players and no stray model or label (Review Focus 2). With `assets/players.glb` moved aside for one load: ten capsules in the right colours.
- [ ] **Step 6: Commit** `feat: the renderer draws as many players as the match has, up to ten`.

---

### Task 4: The Mode row

**Files:**
- Modify: `src/menu.js`, `src/pause.js` (`quitToMenu`), `src/main.js` (`newMatch` takes a size), `src/render/hud.js` (`MENU_WORDS`, `MENU_SLOTS`, `menuText`), `index.html` (a fifth row), `tests/menu.test.js`, `tests/hud.test.js`, `tests/pause.test.js`

**Interfaces (produced):**
- `MENU.main = ['play', 'mode', 'teams', 'controls', 'settings']`. `createMenu()` gains `size: 3`.
- `menuKey`: Enter or Space on `mode` switches `menu.size` between 3 and 5 and returns `null`.
- `menuText`: `Mode: 3 on 3` or `Mode: 5 on 5`.
- `startFromMenu(game, keyboard, newMatch)`: makes a new match with `newMatch(game.menu.size)` when the last one is over or the waiting one is not of the menu's size; then as today.
- `quitToMenu(game, keyboard, newMatch)`: the waiting match is `newMatch(game.menu.size)`.
- `main.js`: `newMatch = size => createMatch(Date.now() % 1e6, size)`.

- [ ] **Step 1: Write the failing tests.** `tests/menu.test.js`: the main list is the five rows; Enter and Space on Mode switch 3, 5, 3 and return `null`; the rows after it open their panels and go back to their own row (the existing test's row numbers move down one); starting from the menu with `size` 5 gives a match with ten players, starting again after a final gives ten again, and switching back to 3 before Play gives six (Review Focus 2). `tests/hud.test.js`: the main list's five texts with `Mode: 3 on 3`, then `Mode: 5 on 5` after the switch, announced; the page has `menuRow4`. `tests/pause.test.js`: quitting from a five-a-side match with the menu on 5 leaves a ten-player match waiting.
- [ ] **Step 2:** Run them — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** `npm test` — expected: all PASS.
- [ ] **Step 5: By eye:** the menu's five rows fit the disc; Mode switches; Play starts that size; play again and quit keep it.
- [ ] **Step 6: Commit** `feat: the start menu chooses 3 on 3 or 5 on 5`, then `npm run single` and send the build: five a side is playable from here.

---

### Task 5: Eight a side

**Files:**
- Modify: `assets/source/people.json` (six rows), `assets/players.glb` (rebuilt), `src/sim/tuning.js` (`ROSTER`), `src/pause.js` (keys 1 to 8), `src/render/hud.js` (eight roster rows, eight a side in the Teams panel, the hint's words), `index.html` (rows and the Teams panel's size), `assets/CREDITS.md` if an asset is new, `tests/state.test.js`, `tests/hud.test.js`, `tests/roster.test.js`, `tests/pause.test.js`, `tests/models.test.js`, `tests/five.test.js`

**Interfaces (produced):**
- `ROSTER.numbers = [[4, 7, 11, 15, 23, 1, 13, 32], [5, 8, 10, 21, 33, 2, 14, 30]]`; `ROSTER.names` gains `'Marcus Bell', 'Noah Vance', 'Idris Kane'` and `'Rafael Ortiz', 'Jamal Whitaker', 'Bogdan Ilic'`; `ROSTER.positions = ['PG', 'SF', 'C', 'SG', 'PF', 'PG', 'SF', 'C']`.
- The six new rows of `people.json`, each `{ team, number, height, build, skin, hair, hairColour, face }` from the skins, hair and builds the file already uses, no two players of a team alike:
  - team 0: No. 1 (1.90, slim), No. 13 (2.00, athletic), No. 32 (2.10, strong)
  - team 1: No. 2 (1.87, athletic), No. 14 (1.99, slim), No. 30 (2.11, strong)
- The pause menu's Substitutions list and keys cover eight; its hint reads `1 to 8 swap two players · A automatic substitutions · Esc back`.
- The Teams panel lists eight a side: `teamPlayer{team}{0..7}`.

- [ ] **Step 1: Build the models.** Add the six rows; run the build as `assets/source/README.md` says; check the build's own report and look at a render of each new player, dressed (never an unclothed body). `assets/players.glb` now holds sixteen.
- [ ] **Step 2: Write the failing tests.** `tests/state.test.js`: each team has eight people with the numbers, names and positions above; three on court in three a side, five in five a side. `tests/models.test.js`: its checks run over sixteen. `tests/roster.test.js`: a queued swap and the automatic rules reach rows 6 to 8; in five a side a tired starter is replaced from the bench. `tests/five.test.js`: a fouled-out player is replaced, and with all three bench players fouled out too he stays on and nothing throws (Review Focus 3). `tests/pause.test.js`: `Digit6` to `Digit8` pick rows. `tests/hud.test.js`: the roster's eight lines, the Teams panel's sixteen, the new hint, the page's ids.
- [ ] **Step 3:** Run them — expected: FAIL.
- [ ] **Step 4: Implement** the data and where it shows.
- [ ] **Step 5:** `npm test` — expected: all PASS. `npm run single` — report the size.
- [ ] **Step 6: By eye:** the Teams panel with eight a side inside the disc; the pause list with eight; in five a side bring a new player on (keys on the pause menu), resume: he is there in his number at Low and at High (Review Focus 5); in three a side the bench is five.
- [ ] **Step 7: Commit** `feat: eight players a side: three new players each, on the bench in 5 on 5` (the model file and the data may be two commits).

---

### Task 6: The check, and the owner's play-test

- [ ] **Step 1:** `npm test`; `npm run single`; the single file opened as the Chromebook opens it: it loads, both modes start, one request, no console error.
- [ ] **Step 2:** Time five a side in Firefox with the timing page at each level, and three a side beside it. Record both in the ledger. If five a side on High falls under 60 frames a second there, say so and say what costs it.
- [ ] **Step 3:** Send the build with a picture of five a side and ask the owner:
  1. How does five a side play: the spacing, the scoring, how hard it is?
  2. Does it hold its frame rate on the Chromebook and on the PC?
  3. Are the three new players a side, and their names, what you want?
  4. Anything in three a side that changed? It should not have.

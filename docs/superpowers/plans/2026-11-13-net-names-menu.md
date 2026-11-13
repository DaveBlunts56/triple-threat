# Net, Names and Positions, Start Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A net that moves when the ball goes through it, players with names and positions, and a futuristic start menu with Play, Teams, Controls and Settings.

**Architecture:** The sim changes only in its roster data (names, positions, team names). The net is a small particle net stepped in the renderer (`src/render/net.js`, plain logic) and drawn by the scene as a patterned sleeve. The menu's state and keys are plain logic in `src/menu.js`, drawn by `src/render/hud.js` from markup and styles in `index.html`, as the pause screen is.

**Tech Stack:** JavaScript modules with no bundler, Three.js 0.187 (WebGPU with WebGL 2 fallback), Node's test runner (`npm test`), `npm run single` for the one-file build.

**Spec:** `docs/superpowers/specs/2026-11-13-net-names-menu-design.md`

## Global Constraints

- Branch `feat/net-names-menu`, cut from `main`. Never push. Merge only on the owner's word.
- Every commit message ends, after a blank line, with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Stage files by path; never `git add -A`.
- Nothing under `src/sim/` changes except the roster data and what carries it (Task 1). The sim never imports from `src/render/`. The renderer never changes sim state.
- The game must run from the single file (`npm run single` → `dist/triple-threat.html`) with no network request and no console error, under 25 MB. No new asset file, font or picture: only HTML, CSS and pictures painted on a canvas at start-up.
- `G` still switches quality on any screen. Controls in play are unchanged.
- All names are invented. No rating, no change to how anyone plays.
- Test first: each test is written and seen to fail before the code that passes it.
- After any change the owner will play: `npm run single`.

## Review Focus

1. **A ball that is placed, not thrown** (a new match, an inbound, a free throw) must not be swept through the net as if it flew there. Test in Task 2.
2. **A stalled frame or a paused one:** a step of 0.1 s gives finite numbers and a step of 0 changes nothing. Test in Task 2.
3. **A key still held when Play is chosen** (Space or Enter) must not jump, shoot or move anyone on the match's first step. Test in Task 4.
4. **The whistle names the player who fouled even if he is substituted during the stoppage**: the name is read when the foul is called, as the number is. Test in Task 1.
5. **The automatic-substitutions choice survives "play again"** from the final screen, not only the first match. Test in Task 4.

---

### Task 1: Names, positions and team names

**Files:**
- Modify: `src/sim/tuning.js` (`ROSTER`), `src/sim/state.js` (`createMatch`, new `surname`), `src/sim/rules.js` (the foul call, about line 48), `src/render/hud.js` (`callText`, `rosterLine`, `subNote`, the new `who` label), `index.html` (the `who` label beside the energy bar)
- Test: `tests/state.test.js`, `tests/hud.test.js`, `tests/fouls.test.js`

**Interfaces:**
- Produces:
  - `ROSTER.teams = ['Harbor City Waves', 'Red Rock Scorpions']`
  - `ROSTER.names = [['Jalen Cross', 'Theo Marsh', 'Darius Stone', 'Sam Okoro', 'Andre Volkov'], ['Kai Mercer', 'Luca Reyes', 'Viktor Lund', 'Devon Hale', 'Emeka Bright']]`
  - `ROSTER.positions = ['PG', 'SF', 'C', 'SG', 'PF']` (by roster row, the same for both teams). `ROSTER.numbers` is unchanged.
  - Each roster entry made by `createMatch` gains `name` and `position`.
  - `surname(person) -> string` in `src/sim/state.js`: the last word of `person.name`.
  - A foul's call gains `name`: the fouler's full name, read when the foul is called (set beside `number` in `rules.js`; a call that names nobody has no `name`).
  - `callText(call)`: with a number, `on <surname> (<number>)`.
  - `rosterLine(state, row, picked)`: `<row + 1> · <position> · <name> · No. <number> · <as today>`.
  - `subNote(state)`: queued swaps name surnames: `Marsh off, Volkov on`.
  - `whoText(state) -> string`: the player you control as `<surname> · <position> · <number>`, written by `hud.update` to the element `who`.

- [ ] **Step 1: Write the failing tests**

In `tests/state.test.js`, add:

```js
test('every player has a name and a position, and the first three are a guard, a forward and a centre', () => {
  const s = createMatch();
  assert.deepEqual(s.rosters.map(r => r.map(p => p.name)), [
    ['Jalen Cross', 'Theo Marsh', 'Darius Stone', 'Sam Okoro', 'Andre Volkov'],
    ['Kai Mercer', 'Luca Reyes', 'Viktor Lund', 'Devon Hale', 'Emeka Bright']]);
  for (const r of s.rosters) assert.deepEqual(r.map(p => p.position), ['PG', 'SF', 'C', 'SG', 'PF']);
  assert.deepEqual(ROSTER.teams, ['Harbor City Waves', 'Red Rock Scorpions']);
  assert.equal(surname(s.rosters[0][4]), 'Volkov');
});
```

(import `ROSTER` from `../src/sim/tuning.js` and `surname` from `../src/sim/state.js`).

In `tests/hud.test.js`, change the assertions of the existing tests to the new texts, and add the `who` label:

```js
// in 'calls read as a sentence and say what follows'
assert.equal(callText(call('reach', 1, { number: 8, name: 'Luca Reyes' })), 'Reach-in foul on Reyes (8). Your ball');
assert.equal(callText(call('block', 1, { number: 8, name: 'Luca Reyes', shots: 2 })), 'Blocking foul on Reyes (8). Two shots');
assert.equal(callText(call('shooting', 0, { number: 7, name: 'Theo Marsh', shots: 1 })), 'Shooting foul on Marsh (7). One shot');
assert.equal(callText(call('shooting', 0, { number: 7, name: 'Theo Marsh', shots: 3 })), 'Shooting foul on Marsh (7). Three shots');
assert.equal(callText(call('charge', 0, { number: 4, name: 'Jalen Cross' })), "Charge on Cross (4). Opponent's ball");

// in 'the pause screen lists your five ...'
assert.equal(rosterLine(s, 0, false), '1 · PG · Jalen Cross · No. 4 · on court · 0 fouls');
assert.equal(rosterLine(s, 1, true), '2 · SF · Theo Marsh · No. 7 · on court · 1 foul · selected');
assert.equal(rosterLine(s, 3, false), '4 · SG · Sam Okoro · No. 15 · fouled out');
assert.equal(rosterLine(s, 4, false), '5 · PF · Andre Volkov · No. 23 · bench · 0 fouls');
assert.equal(subNote(s), 'Automatic substitutions off. Queued: Marsh off, Volkov on.');   // after the queue is set

// in 'the pause screen is filled in ...'
['5 · PF · Andre Volkov · No. 23 · bench · 0 fouls · selected', 0.5, 'Automatic substitutions on. No swap queued.']

test('a label names the player you control: surname, position, number', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch();
  hud.update(s, 'webgl2');
  assert.equal(doc.els.who.textContent, 'Cross · PG · 4');
  s.controlled = 2;
  hud.update(s, 'webgl2');
  assert.equal(doc.els.who.textContent, 'Stone · C · 11');
});
```

Add `'who'` to the ids checked by `'the page has every element the scoreboard writes to'`.

In `tests/fouls.test.js`, the two assertions on a whole call gain the name, and the first also shows the name outlives a substitution (import `substitute` from `../src/sim/roster.js`):

```js
assert.deepEqual(s.call, { kind: 'reach', team: 1, ball: 0, number: 5, name: 'Kai Mercer', shots: 0 });
substitute(s, 3, 3);                                   // he is taken off during the stoppage
assert.deepEqual([s.call.number, s.call.name], [5, 'Kai Mercer']);

assert.deepEqual(s.call, { kind: 'charge', team: 0, ball: 1, number: 4, name: 'Jalen Cross', shots: 0 });
```

- [ ] **Step 2: Run them**

Run: `npm test`
Expected: the new and changed assertions FAIL (`surname` is not exported; texts differ); everything else passes.

- [ ] **Step 3: Implement** the interfaces above. The `who` element is a `<span id="who">` inside the `label.energy` of `#hud`, above the bar.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tuning.js src/sim/state.js src/sim/rules.js src/render/hud.js index.html tests/state.test.js tests/hud.test.js tests/fouls.test.js
git commit -m "feat: players have names and positions, shown on the pause screen, in calls and beside the energy bar"
```

---

### Task 2: The net's physics

**Files:**
- Create: `src/render/net.js`, `tests/net.test.js`

**Interfaces:**
- Consumes: `RIM` (`x`, `height`, `radius`, `tube`), `BALL` (`radius`, `gravity`), `DT` from `src/sim/tuning.js`. A ball is `{ x, y, z, vx, vy, vz }`, as `state.ball` is.
- Produces, in `src/render/net.js` (no Three.js):
  - `NET = Object.freeze({ strings: 12, knots: 5, length: 0.40, bottom: 0.09, stretch: 1.1, give: 2, skin: 0.01, jump: 2, ... })`: `strings` round the rim; `knots` below the rim on each string; `length` metres from the rim to the bottom row at rest; `bottom` the bottom row's radius at rest; `stretch` the most a string's segment (from one knot to the next one down) may be of its rest length; `give` the most a tie (between neighbouring strings in one row) may be of its rest length: the ties are elastic, which is what lets the ball open a net narrower than itself; `skin` metres added to the ball's radius where it pushes knots; `jump` metres: a ball that moved farther than this in one call was placed, not thrown. Add the numbers the physics needs (drag, how firmly a tie pulls back, constraint passes, the rim shake) with a comment each.
  - `createNet(sign) -> net`: the net of the hoop at `x = sign * RIM.x`. `net.points` is a `Float32Array` of world coordinates, three per point, `(NET.knots + 1) * NET.strings` points, row by row from the rim down (row 0 is on the rim and never moves; point `row * NET.strings + string`). `net.rest` is the same layout at rest. At rest, row `r` is at height `RIM.height - NET.length * r / NET.knots` and radius running evenly from `RIM.radius` to `NET.bottom`.
  - `stepNet(net, from, to, dt)`: advances the net by `dt` seconds while the ball goes from `from` to `to` (two balls; `from` may be `null`, meaning the same as `to`). It works in `Math.ceil(dt / DT)` equal sub-steps, the ball moving evenly from `from` to `to` across them. In each: gravity and drag move the free knots; a knot inside the ball (its radius plus `NET.skin`) is pushed out to its surface; each string's segments are held to their rest lengths, firmly, so that none ends a step more than `NET.stretch` times its rest length; each tie pulls its two knots back toward its rest length softly, like elastic, and never ends a step more than `NET.give` times it. Where the ball and the strings disagree the strings win: a knot may end a step a little inside the ball. If the ball is touching the rim's ring at `to` and its velocity changed between `from` and `to` by more than gravity explains, by over 1 m/s, the free knots are given a small kick along that change. If `from` and `to` are more than `NET.jump` apart, the ball is taken to be at `to` throughout. `dt <= 0` changes nothing.

- [ ] **Step 1: Write the failing tests** (`tests/net.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NET, createNet, stepNet } from '../src/render/net.js';
import { BALL, DT, RIM } from '../src/sim/tuning.js';

const ball = (x, y, z, vx = 0, vy = 0, vz = 0) => ({ x, y, z, vx, vy, vz });
const far = ball(0, 1, 0);
const count = (NET.knots + 1) * NET.strings;
// The farthest any knot is from where it rests, in metres.
const off = net => Math.max(...Array.from({ length: count }, (_, i) =>
  Math.hypot(net.points[3 * i] - net.rest[3 * i], net.points[3 * i + 1] - net.rest[3 * i + 1], net.points[3 * i + 2] - net.rest[3 * i + 2])));
const p = (net, row, string) => { const i = 3 * (row * NET.strings + (string % NET.strings)); return [net.points[i], net.points[i + 1], net.points[i + 2]]; };
const r = (net, row, string) => { const i = 3 * (row * NET.strings + (string % NET.strings)); return [net.rest[i], net.rest[i + 1], net.rest[i + 2]]; };
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// The most any string segment is stretched, and the most any tie is, each as a share of its rest length.
function stretch(net) {
  let most = 0;
  for (let row = 0; row < NET.knots; row++) for (let s = 0; s < NET.strings; s++)
    most = Math.max(most, gap(p(net, row, s), p(net, row + 1, s)) / gap(r(net, row, s), r(net, row + 1, s)));
  return most;
}
function given(net) {
  let most = 0;
  for (let row = 1; row <= NET.knots; row++) for (let s = 0; s < NET.strings; s++)
    most = Math.max(most, gap(p(net, row, s), p(net, row, s + 1)) / gap(r(net, row, s), r(net, row, s + 1)));
  return most;
}
const firm = net => stretch(net) <= NET.stretch + 1e-6 && given(net) <= NET.give + 1e-6;
// Drops a ball straight down through the middle of the hoop at `speed`, one frame at a time, and returns the farthest a knot got.
function swish(net, sign, speed = 5) {
  let most = 0, held = true, last = ball(sign * RIM.x, RIM.height + 0.3, 0, 0, -speed, 0);
  for (let y = last.y; y > RIM.height - 1; y -= speed * DT) {
    const now = ball(sign * RIM.x, y, 0, 0, -speed, 0);
    stepNet(net, last, now, DT); last = now;
    most = Math.max(most, off(net)); held &&= firm(net);
  }
  return { most, held };
}

test('the net hangs from the rim as a sleeve that narrows to less than the ball, at either hoop', () => {
  for (const sign of [1, -1]) {
    const net = createNet(sign);
    assert.equal(net.points.length, 3 * count);
    for (let s = 0; s < NET.strings; s++) {
      const top = p(net, 0, s), low = p(net, NET.knots, s);
      assert.ok(Math.abs(Math.hypot(top[0] - sign * RIM.x, top[2]) - RIM.radius) < 1e-6 && Math.abs(top[1] - RIM.height) < 1e-6);
      assert.ok(Math.abs(Math.hypot(low[0] - sign * RIM.x, low[2]) - NET.bottom) < 1e-6 && Math.abs(low[1] - (RIM.height - NET.length)) < 1e-6);
    }
    assert.ok(NET.bottom < BALL.radius);
  }
});

test('left alone the net hangs where it was made and is still', () => {
  const net = createNet(1);
  for (let i = 0; i < 120; i++) stepNet(net, far, far, DT);
  assert.ok(off(net) < 0.01, `${off(net)} m from its shape`);                          // gravity may settle it a little
  const then = Float32Array.from(net.points);
  for (let i = 0; i < 30; i++) stepNet(net, far, far, DT);
  const moved = Math.max(...then.map((v, i) => Math.abs(v - net.points[i])));
  assert.ok(moved < 0.001, `still moving ${moved} m`);
});

test('a ball falling through pushes the net out, never stretches a string more than a tenth or a tie to more than double, and the net settles within two seconds', () => {
  for (const sign of [1, -1]) {
    const net = createNet(sign), { most, held } = swish(net, sign);
    assert.ok(most >= 0.03, `pushed ${most} m`);
    assert.ok(held, 'a string or a tie stretched too far');
    for (let i = 0; i < 120; i++) { stepNet(net, far, far, DT); assert.ok(firm(net)); }
    assert.ok(off(net) < 0.01, `${off(net)} m from rest after two seconds`);
  }
});

test('the rim row never moves', () => {
  const net = createNet(1); swish(net, 1);
  for (let s = 0; s < NET.strings; s++) assert.deepEqual(p(net, 0, s), r(net, 0, s));
});

test('a ball that passes half a metre away moves nothing', () => {
  const net = createNet(1);
  for (let y = 4; y > 2; y -= 5 * DT) stepNet(net, ball(RIM.x - RIM.radius - 0.5 - BALL.radius, y + 5 * DT, 0), ball(RIM.x - RIM.radius - 0.5 - BALL.radius, y, 0), DT);
  assert.ok(off(net) < 0.001);
});

test('a ball that bounces off the rim shakes the net without touching it', () => {
  const net = createNet(1), x = RIM.x - RIM.radius, y = RIM.height + BALL.radius + RIM.tube;   // resting on the front of the rim
  stepNet(net, ball(x, y + 0.05, 0, 0, -3, 0), ball(x, y, 0, 0, 2, 0), DT);                       // it came down and went back up
  let most = 0;
  for (let i = 0; i < 12; i++) { stepNet(net, far, far, DT); most = Math.max(most, off(net)); }
  assert.ok(most >= 0.005, `shaken ${most} m`);
});

test('a ball that is placed somewhere new is not swept through the net', () => {
  const net = createNet(1);
  stepNet(net, ball(RIM.x, RIM.height + 1.5, 0), ball(RIM.x, RIM.height - 1.5, 0), DT);          // 3 m in one frame: a placement
  assert.ok(off(net) < 0.001);
});

test('a stalled frame and a paused one are safe', () => {
  const net = createNet(1), before = Float32Array.from(net.points);
  stepNet(net, ball(RIM.x, RIM.height + 0.1, 0), ball(RIM.x, RIM.height - 0.2, 0), 0);
  assert.deepEqual(net.points, before);                                                          // no time, no change
  stepNet(net, ball(RIM.x, RIM.height + 0.3, 0, 0, -5, 0), ball(RIM.x, RIM.height - 0.2, 0, 0, -5, 0), 0.1);
  stepNet(net, null, ball(RIM.x, RIM.height - 0.2, 0), 0.1);
  assert.ok(net.points.every(Number.isFinite));
  assert.ok(firm(net));
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/net.test.js`
Expected: FAIL (`src/render/net.js` does not exist).

- [ ] **Step 3: Implement `src/render/net.js`.** Position-based (Verlet) knots are the simplest way to keep the strings from stretching; keep each knot's last place rather than a velocity. Tune drag, the ties' firmness and the number of constraint passes until the tests pass with margin: the bottom ring must open from 0.09 m to more than the ball's 0.12 m (its ties stretch by about half) and close again.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/net.js tests/net.test.js
git commit -m "feat: a net of knotted strings that the ball pushes and that swings back"
```

---

### Task 3: The net is drawn and moves in the game

**Files:**
- Modify: `src/render/scene.js` (`buildHoop`, `createScene`), `src/main.js` (the frame)
- Test: by eye, in the browser (the scene needs a renderer)

**Interfaces:**
- Consumes: `NET`, `createNet(sign)`, `stepNet(net, from, to, dt)` from Task 2.
- Produces: `createScene(...)` returns, with what it returns today, `swayNets(ball, dt)`: steps both nets with the ball as it was on the last call and as it is now, then updates what is drawn. `main.js` calls it once a frame with `state.ball` and the same seconds it gives `actors.sync` (match time in play, none while paused, real time on the start and final screens).

- [ ] **Step 1: Implement.**
  - In `buildHoop(s)`, replace the wireframe cylinder with a mesh whose points are the net's: `NET.knots + 1` rows by `NET.strings + 1` columns, the last column a copy of the first, so a picture can run once round the net and meet itself. Its picture is painted once on a canvas: a clear background with a faint white wash (about 15% opaque) and, in each cell of a `NET.strings` by `NET.knots` grid, both diagonals in white, about a tenth of a cell thick, so the cells read as a net's diamonds. Material: unlit, the picture as its colour and its transparency, both sides drawn, not written to the depth buffer.
  - `swayNets` copies each net's points into its mesh every frame and marks them changed; the mesh must never be culled as off-screen while its points move (recompute its bounds or turn frustum culling off for it).
  - The scene keeps the last ball it was given (a copy of the six numbers), starting at `null`.
- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 3: Check it in the browser** at `http://127.0.0.1:5173/` (a server is running; do not start another). `globalThis.game` is the match, for setting up a shot from the console.

| Check | Expected |
|---|---|
| Both hoops, from the game camera, ball away | A white net sleeve hangs still under each rim and reads as a net, not as hair-thin lines |
| A made shot at each hoop | The net bulges, is dragged down and swings back; nothing stretches into spikes |
| A shot that hits the rim and stays out | The net shivers |
| Esc during a swing | The net stops with the game and goes on when it resumes |
| G (Low) | The same net, the same motion |
| The console | No error or warning |

Save a picture of a make with the net pushed out as `dist/net-make.jpg`. If the page will not run because the pane is hidden, say so in the report and say exactly what was not seen.

- [ ] **Step 4: Commit**

```bash
git add src/render/scene.js src/main.js
git commit -m "feat: each hoop's net is drawn as a sleeve and moves with the ball"
```

---

### Task 4: The menu's state and keys

**Files:**
- Create: `src/menu.js`, `tests/menu.test.js`

**Interfaces:**
- Consumes: `startMatch(state)` from `src/sim/rules.js`; `createMatch(seed)` from `src/sim/state.js`; a keyboard as made by `createKeyboard` (`intent()`).
- Produces, in `src/menu.js` (no page, no Three.js):
  - `MENU = Object.freeze({ main: ['play', 'teams', 'controls', 'settings'], settings: ['quality', 'autoSubs'] })`: the rows of each panel that has rows.
  - `createMenu() -> { panel: 'main', row: 0, autoSubs: true }`. `panel` is `'main'`, `'teams'`, `'controls'` or `'settings'`; `row` is the selected row of the panel shown; `autoSubs` is the menu's choice for your team.
  - `menuRows(menu) -> string[]`: the rows of the panel shown (`[]` for Teams and Controls).
  - `menuKey(menu, code) -> 'play' | 'quality' | null`: one key. `ArrowDown` or `KeyS` moves the bar down, `ArrowUp` or `KeyW` up, wrapping at both ends. `Enter` or `Space` chooses: on the main list `play` returns `'play'`, and `teams`, `controls`, `settings` open that panel with its bar on row 0; in Settings, `quality` returns `'quality'` and `autoSubs` flips `menu.autoSubs`. `Escape` or `Backspace` in a panel returns to the main list with the bar on the entry that opened it; on the main list they do nothing. Any other key does nothing.
  - `menuPoint(menu, row)`: the mouse is over row `row` of the panel shown: selects it if the panel has that row.
  - `startFromMenu(game, keyboard, newMatch)`: starts play from the menu or the final screen. If `game.state.phase` is `'final'`, `game.state = newMatch()`. Then `startMatch(game.state)`, `game.state.autoSubs[0] = game.menu.autoSubs`, and the keys held right now are made the controlled player's last-seen keys (`state.players[state.controlled].prev = keyboard.intent()`), so a key still down from the menu is not a fresh press. `game` is `{ state, menu, ... }`.

- [ ] **Step 1: Write the failing tests** (`tests/menu.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU, createMenu, menuRows, menuKey, menuPoint, startFromMenu } from '../src/menu.js';
import { createKeyboard } from '../src/input.js';
import { createMatch } from '../src/sim/state.js';
import { aiIntents } from '../src/sim/ai.js';
import { step } from '../src/sim/step.js';
import { DT } from '../src/sim/tuning.js';

const keys = (menu, ...codes) => codes.map(code => menuKey(menu, code));
const key = (type, code) => Object.assign(new Event(type, { cancelable: true }), { code });

test('the main list is Play, Teams, Controls, Settings, with the bar on Play', () => {
  const m = createMenu();
  assert.deepEqual([m.panel, m.row, m.autoSubs, menuRows(m)], ['main', 0, true, ['play', 'teams', 'controls', 'settings']]);
  assert.deepEqual(MENU.settings, ['quality', 'autoSubs']);
});

test('the bar moves down and up by arrows or W and S, and wraps at both ends', () => {
  const m = createMenu();
  keys(m, 'ArrowDown', 'KeyS'); assert.equal(m.row, 2);
  keys(m, 'ArrowDown', 'ArrowDown'); assert.equal(m.row, 0);
  keys(m, 'ArrowUp'); assert.equal(m.row, 3);
  keys(m, 'KeyW'); assert.equal(m.row, 2);
  assert.deepEqual(keys(m, 'KeyX', 'ArrowLeft'), [null, null]); assert.equal(m.row, 2);
});

test('Enter or Space on Play asks for the match to start and changes nothing', () => {
  for (const code of ['Enter', 'Space']) {
    const m = createMenu();
    assert.equal(menuKey(m, code), 'play');
    assert.deepEqual([m.panel, m.row], ['main', 0]);
  }
});

test('Teams, Controls and Settings open inside the menu, and Esc or Backspace go back to the entry that opened them', () => {
  for (const [row, panel, rows] of [[1, 'teams', []], [2, 'controls', []], [3, 'settings', ['quality', 'autoSubs']]]) {
    for (const back of ['Escape', 'Backspace']) {
      const m = createMenu(); m.row = row;
      assert.equal(menuKey(m, 'Enter'), null);
      assert.deepEqual([m.panel, m.row, menuRows(m)], [panel, 0, rows]);
      assert.ok(!keys(m, 'ArrowDown', 'Enter').includes('play'));                        // moving and choosing in a panel never starts a match
      assert.equal(menuKey(m, back), null);
      assert.deepEqual([m.panel, m.row], ['main', row]);
    }
  }
  const m = createMenu(); m.row = 2;
  assert.deepEqual(keys(m, 'Escape', 'Backspace'), [null, null]);
  assert.deepEqual([m.panel, m.row], ['main', 2]);                                      // on the main list they do nothing
});

test('a panel with no rows ignores the bar keys and Enter', () => {
  const m = createMenu(); m.row = 1; menuKey(m, 'Enter');
  assert.deepEqual(keys(m, 'ArrowDown', 'ArrowUp', 'Enter', 'Space'), [null, null, null, null]);
  assert.deepEqual([m.panel, m.row], ['teams', 0]);
});

test('in Settings, Enter on Quality asks for the quality switch and Enter on Automatic substitutions flips the choice', () => {
  const m = createMenu(); m.row = 3; menuKey(m, 'Enter');
  assert.equal(menuKey(m, 'Enter'), 'quality');
  assert.equal(m.autoSubs, true);
  assert.deepEqual(keys(m, 'ArrowDown', 'Space'), [null, null]);
  assert.equal(m.autoSubs, false);
  menuKey(m, 'Enter'); assert.equal(m.autoSubs, true);
  keys(m, 'ArrowDown'); assert.equal(m.row, 0);                                         // two rows: it wraps
});

test('pointing with the mouse selects a row the panel has, and no other', () => {
  const m = createMenu();
  menuPoint(m, 2); assert.equal(m.row, 2);
  menuPoint(m, 4); menuPoint(m, -1); assert.equal(m.row, 2);
  m.row = 1; menuKey(m, 'Enter'); menuPoint(m, 1); assert.equal(m.row, 0);              // Teams has no rows
});

function onMenu() {
  const target = new EventTarget(), keyboard = createKeyboard(target);
  const game = { state: createMatch(7), menu: createMenu() };
  const down = code => target.dispatchEvent(key('keydown', code)), up = code => target.dispatchEvent(key('keyup', code));
  const frame = () => { const intents = aiIntents(game.state, DT); intents[game.state.controlled] = keyboard.intent(); step(game.state, intents, DT); return intents[game.state.controlled]; };
  return { game, keyboard, down, up, frame };
}

test('starting from the menu begins the match with the menu\'s choice of automatic substitutions, and again after a final', () => {
  const { game, keyboard } = onMenu();
  game.menu.autoSubs = false;
  startFromMenu(game, keyboard, () => createMatch(8));
  assert.notEqual(game.state.phase, 'start');
  assert.deepEqual(game.state.autoSubs, [false, true]);
  game.state.phase = 'final'; game.state.score = [9, 4];
  const old = game.state;
  startFromMenu(game, keyboard, () => createMatch(9));
  assert.notEqual(game.state, old);
  assert.deepEqual([game.state.score, game.state.autoSubs], [[0, 0], [false, true]]);
  assert.notEqual(game.state.phase, 'final');
});

test('a key still held when Play is chosen is not a fresh press in the match', () => {
  const { game, keyboard, down, up, frame } = onMenu();
  down('Space'); down('KeyS');                                                          // held on the menu, never let go
  startFromMenu(game, keyboard, () => createMatch(8));
  const me = game.state.players[game.state.controlled];
  assert.deepEqual([me.prev.shoot, me.prev.moveZ], [true, 1]);                          // already seen: not a fresh press
  up('Space'); up('KeyS');
  assert.deepEqual([frame().shoot, frame().moveZ], [false, 0]);
  down('Space');
  assert.equal(frame().shoot, true);                                                    // a new press is seen as one
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/menu.test.js`
Expected: FAIL (`src/menu.js` does not exist).

- [ ] **Step 3: Implement `src/menu.js`.** Remember which main row opened a panel in the menu itself (a field the tests do not read).

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/menu.js tests/menu.test.js
git commit -m "feat: the start menu's entries, panels, settings and keys"
```

---

### Task 5: The menu on the page

**Files:**
- Modify: `index.html` (the `#screenStart` section and its styles), `src/render/hud.js` (draws the menu), `src/main.js` (keys, mouse, starting play)
- Test: `tests/hud.test.js`

**Interfaces:**
- Consumes: `MENU`, `createMenu`, `menuRows`, `menuKey`, `menuPoint`, `startFromMenu` (Task 4); `ROSTER.teams`, `ROSTER.names`, `ROSTER.positions`, `ROSTER.numbers` (Task 1); `QUALITY[level].label`; `toggleQuality`.
- Produces:
  - `game.menu = createMenu()` in `main.js`, passed to the hud inside `ui` (`ui.menu`), with `ui.quality` as today.
  - `menuText(menu, row, quality) -> string` in `hud.js`: the words of row `row` of the panel shown: `Play`, `Teams`, `Controls`, `Settings`; in Settings `Quality: High` or `Quality: Low`, and `Automatic substitutions: On` or `Automatic substitutions: Off`.
  - Elements the hud writes while the phase is `start` and `ui.menu` is given: `menuRow0` to `menuRow3` (text; hidden when the panel has no such row; `ariaSelected` `'true'` on the selected row and `'false'` on the others), `menuTeams` and `menuControls` (hidden unless that panel is shown), `menuHint` (`↑ ↓ choose · Enter select` on the main list; `↑ ↓ choose · Enter change · Esc back` in Settings; `Esc back` in Teams and Controls), `teamName0`, `teamName1` (the teams' names) and `teamPlayer00` to `teamPlayer14` (team then row: `PG · 4 · Jalen Cross`). On the menu, `announce` is given the selected row's words (or the panel's name, `Teams` or `Controls`, when it has no rows) in place of the score.
  - Keys in `main.js`: while the phase is `start`, a keydown goes to `menuKey(game.menu, e.code)` (and `preventDefault` for the keys the menu uses); `'play'` calls `startFromMenu(game, keyboard, newMatch)`; `'quality'` switches quality as `G` does. On the final screen Enter calls `startFromMenu` too. Esc does not pause on the menu (it already cannot: `setPaused` refuses outside play). Each `menuRow` element gets `mouseenter` → `menuPoint(game.menu, row)` and `click` → `menuPoint` then the same as Enter.

- [ ] **Step 1: Write the failing tests** (in `tests/hud.test.js`; import `createMenu`, `menuKey` from `../src/menu.js` and `menuText` from the hud)

```js
test('the start menu shows its rows with the bar on the selected one, and announces it', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  const show = () => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high' });
  show();
  assert.deepEqual([0, 1, 2, 3].map(i => e[`menuRow${i}`].textContent), ['Play', 'Teams', 'Controls', 'Settings']);
  assert.deepEqual([0, 1, 2, 3].map(i => e[`menuRow${i}`].ariaSelected), ['true', 'false', 'false', 'false']);
  assert.deepEqual([e.menuTeams.hidden, e.menuControls.hidden, e.menuHint.textContent, e.announce.textContent],
    [true, true, '↑ ↓ choose · Enter select', 'Play']);
  menuKey(menu, 'ArrowDown'); show();
  assert.deepEqual([e.menuRow0.ariaSelected, e.menuRow1.ariaSelected, e.announce.textContent], ['false', 'true', 'Teams']);
});

test('the Teams panel lists both teams by position, number and name', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  menuKey(menu, 'ArrowDown'); menuKey(menu, 'Enter');
  hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high' });
  assert.deepEqual([e.menuTeams.hidden, e.menuControls.hidden, e.menuHint.textContent, e.announce.textContent], [false, true, 'Esc back', 'Teams']);
  assert.ok([0, 1, 2, 3].every(i => e[`menuRow${i}`].hidden));
  assert.deepEqual([e.teamName0.textContent, e.teamName1.textContent], ['Harbor City Waves', 'Red Rock Scorpions']);
  assert.deepEqual([e.teamPlayer00.textContent, e.teamPlayer04.textContent, e.teamPlayer12.textContent],
    ['PG · 4 · Jalen Cross', 'PF · 23 · Andre Volkov', 'C · 10 · Viktor Lund']);
});

test('the Settings panel shows each setting with its value, and a change is announced', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), e = doc.els, menu = createMenu();
  const show = quality => hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality });
  menu.row = 3; menuKey(menu, 'Enter'); show('high');
  assert.deepEqual([e.menuRow0.textContent, e.menuRow1.textContent, e.menuRow2.hidden, e.menuRow3.hidden, e.menuHint.textContent],
    ['Quality: High', 'Automatic substitutions: On', true, true, '↑ ↓ choose · Enter change · Esc back']);
  show('low');
  assert.deepEqual([e.menuRow0.textContent, e.announce.textContent], ['Quality: Low', 'Quality: Low']);
  menuKey(menu, 'ArrowDown'); menuKey(menu, 'Enter'); show('low');
  assert.deepEqual([e.menuRow1.textContent, e.announce.textContent], ['Automatic substitutions: Off', 'Automatic substitutions: Off']);
  assert.equal(menuText(menu, 0, 'high'), 'Quality: High');
});

test('in play the menu writes nothing and the score is announced as before', () => {
  const doc = fakeDoc(), hud = createHud(doc), s = createMatch(), menu = createMenu();
  s.phase = 'live'; s.score = [2, 0];
  hud.update(s, 'webgl2', { paused: false, pick: null, menu, quality: 'high' });
  assert.equal(doc.els.announce.textContent, 'You 2, opponent 0');
});

test('the page has the menu: four rows, both panels, ten players, every key in the controls panel, and a ring that stops for reduced motion', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['menuRow0', 'menuRow1', 'menuRow2', 'menuRow3', 'menuTeams', 'menuControls', 'menuHint', 'teamName0', 'teamName1',
    ...[0, 1].flatMap(t => [0, 1, 2, 3, 4].map(i => `teamPlayer${t}${i}`))]) assert.match(html, new RegExp(`id="${id}"`), id);
  const controls = html.match(/id="menuControls"[\s\S]*?<\/(?:ul|dl|div)>/)[0];
  for (const word of ['WASD', 'Shift', 'Space', 'E', 'Q', 'F', 'Esc', 'G']) assert.match(controls, new RegExp(`\\b${word}\\b`), word);
  assert.match(html, /prefers-reduced-motion/);
  assert.doesNotMatch(html, /Press Enter to play</);
  assert.equal((html.match(/<[^>]*aria-live[^>]*>/g) ?? []).length, 1);                // still one live region
});
```

- [ ] **Step 2: Run them**

Run: `node --test tests/hud.test.js`
Expected: the five new tests FAIL (`menuText` is not exported); the rest pass.

- [ ] **Step 3: Implement.** The look is the mockup the owner approved. Its styles, to be carried into `index.html` under `#screenStart` (rename the classes as fits; keep the numbers):

```css
/* background, on the full-window section */
background:
  radial-gradient(60vmax 40vmax at 18% 22%, rgba(255, 255, 255, .85), transparent 60%),
  radial-gradient(50vmax 36vmax at 85% 78%, rgba(150, 215, 255, .75), transparent 62%),
  radial-gradient(70vmax 50vmax at 70% 10%, rgba(90, 170, 240, .55), transparent 65%),
  linear-gradient(160deg, #cfeaff 0%, #7fbdea 38%, #2f77bd 70%, #0c2f63 100%);
font-family: "Arial Narrow", "Helvetica Neue", Arial, system-ui, sans-serif;

.stage { --d: min(78vh, 78vw); position: relative; width: var(--d); height: var(--d); }
.ring { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; }
.ring.one { transform: scale(1.09); border: 2px solid rgba(140, 220, 255, .9);
            box-shadow: 0 0 18px 2px rgba(70, 180, 255, .8), inset 0 0 18px 2px rgba(70, 180, 255, .5); }
.ring.two { transform: scale(1.18); border: 1px dashed rgba(200, 240, 255, .75); animation: turn 60s linear infinite; }
.ring.three { transform: scale(1.27); border: 1px solid rgba(255, 255, 255, .35); }
@keyframes turn { to { transform: scale(1.18) rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ring.two { animation: none; } }
.rim { position: absolute; inset: 0; border-radius: 50%; padding: calc(var(--d) * .022); box-sizing: border-box;
       background: conic-gradient(from 210deg, #f7f9fb, #8a95a3, #eef2f6, #6f7a88, #ffffff, #9aa5b2, #e6ebf0, #7a8593, #f7f9fb);
       box-shadow: 0 0 0 2px rgba(255, 255, 255, .6), 0 0 60px 14px rgba(60, 170, 255, .65), 0 30px 60px rgba(4, 20, 50, .45); }
.face { position: relative; width: 100%; height: 100%; border-radius: 50%; overflow: hidden; box-sizing: border-box;
        border: 3px solid #58c8ff; box-shadow: inset 0 0 40px 6px rgba(70, 180, 255, .55);
        background: radial-gradient(circle at 50% 18%, #3f86d8 0%, #174a93 42%, #0a2456 72%, #061737 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center; }
.face::before { content: ""; position: absolute; left: 6%; right: 6%; top: 2%; height: 46%; border-radius: 50% 50% 46% 46% / 62% 62% 38% 38%;
                background: linear-gradient(rgba(255, 255, 255, .42), rgba(255, 255, 255, .06) 70%, transparent); pointer-events: none; }
h1 { margin: 0 0 calc(var(--d) * .035); font-size: calc(var(--d) * .05); font-weight: 700; letter-spacing: .32em; text-indent: .32em;
     color: #cfeeff; text-shadow: 0 0 14px rgba(110, 200, 255, .9); }
row { margin: calc(var(--d) * .012) 0; padding: calc(var(--d) * .016) 0; text-align: center; cursor: pointer; width: 100%;
      font-size: calc(var(--d) * .082); font-weight: 800; font-style: italic; letter-spacing: .04em; text-transform: uppercase;
      text-shadow: 0 2px 0 rgba(0, 20, 60, .7), 0 0 10px rgba(0, 20, 60, .6); }
row[aria-selected="true"] { background: linear-gradient(90deg, transparent, #1f9dff 12%, #7ad6ff 50%, #1f9dff 88%, transparent);
      box-shadow: 0 0 26px 4px rgba(70, 185, 255, .85); text-shadow: 0 2px 0 rgba(0, 40, 110, .8); }
.hint { margin: calc(var(--d) * .035) 0 0; font-size: calc(var(--d) * .026); letter-spacing: .12em; color: #bfe6ff; }
.floor { position: absolute; left: 10%; right: 10%; top: 101%; height: 9%; border-radius: 50%;
         background: radial-gradient(closest-side, rgba(120, 210, 255, .55), transparent); filter: blur(6px); }
```

  - The rows are a list announced as options (`role="listbox"` and `role="option"`), three rings and the floor glow are decoration (`aria-hidden`).
  - The Settings rows are longer than the main entries: size them (about `calc(var(--d) * .045)`) so `Automatic substitutions: Off` fits inside the disc on one line. The Teams panel shows the two teams side by side inside the disc, each name in its team's colour (`#2f6fe0` lightened enough to read on the dark face, and `#ff8f8f`), text about `calc(var(--d) * .03)`. The Controls panel lists each key and what it does at about the same size.
  - The title, the `section.screen` rules shared with the pause and final screens, and those two screens' looks must not change.
- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Check it in the browser** at `http://127.0.0.1:5173/`.

| Check | Expected |
|---|---|
| The page loads | The disc menu on the icy-blue background, the bar on Play; no court, scoreboard or controls line showing through |
| Up, Down, W, S | The bar moves and wraps |
| Enter on Teams, Controls, Settings; Esc | Each opens inside the disc and fits inside it; Esc returns with the bar where it was |
| Settings: Enter on Quality | The row and the corner label change together; G does the same from the menu |
| Settings: automatic substitutions Off, then Play, then Esc in the match | The pause screen says automatic substitutions are off |
| Space held on Play | The match starts and nobody jumps |
| The mouse | Pointing moves the bar; clicking chooses |
| A window 1366 by 768 and a narrow tall one | The disc keeps its shape and nothing spills out of it |
| The final screen, Enter | A new match starts, as before |
| The console | No error or warning |

Save pictures of the main list and of the Teams panel as `dist/menu-main.jpg` and `dist/menu-teams.jpg`.

- [ ] **Step 6: Commit**

```bash
git add index.html src/render/hud.js src/main.js tests/hud.test.js
git commit -m "feat: a start menu with Play, Teams, Controls and Settings"
```

---

### Task 6: The single file, and the owner's play-test

**Files:** none changed unless a check fails.

- [ ] **Step 1:** `npm test` — expected: all PASS.
- [ ] **Step 2:** `npm run single` — expected: `dist/triple-threat.html` written, under 25 MB.
- [ ] **Step 3:** Open the single file from disk in the browser (as the Chromebook does): the menu shows, Play starts a match, a make moves the net, the pause roster shows names, no console error, no network request.
- [ ] **Step 4 (the controller's):** Send `dist/triple-threat.html`, `dist/menu-main.jpg` and `dist/net-make.jpg` to the owner and ask:
  1. Can you tell a make from a miss now, at both hoops?
  2. Does the net look right, or too stiff, too loose, too faint?
  3. The menu on the Chromebook: does it look right, and does it slow anything down?
  4. Are the names, positions and team names what you want?

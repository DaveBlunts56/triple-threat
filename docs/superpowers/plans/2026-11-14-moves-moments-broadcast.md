# Player moves, big moments, broadcast feel and sound: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, by the session model alone (the owner's standing rule: no subagents of other models). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five player moves on keys the owner can change, settings that are remembered, statistics, big moments, commentary as captions and a voice, panels, replays, and sound from CC0 recordings.

**Architecture:** The sim (`src/sim/`) gains the moves, the statistics and a small record of what last happened (`state.last`); it still never imports from the renderer. Everything that only watches the match lives outside it in three new folders: `src/broadcast/` (moments, commentary, voice, director), `src/audio/` (cues, player) and `src/replay.js`. Keys and saved settings are two small modules, `src/keys.js` and `src/prefs.js`, used by both menus. `src/main.js` only wires them.

**Tech stack:** Plain ES modules, no bundler. `node --test`. Blender 4.5 for motions. ffmpeg (libvorbis) for sounds. Web Audio and `speechSynthesis` in the browser.

**Spec:** `docs/superpowers/specs/2026-11-14-moves-moments-broadcast-design.md`

## Global constraints

- The sim never imports from `src/render/`, `src/broadcast/`, `src/audio/`, `src/replay.js`, `src/keys.js` or `src/prefs.js`. None of those may change the match: a match stepped with them is, step for step, the match stepped without them.
- A green release draws no random number; the order in which the sim draws random numbers changes only where this plan says a move draws one.
- A player rated 70 throughout, who uses no move, plays exactly as today. Tests of the game's own numbers use `plain(s)` players.
- One HTML file (`npm run single` → `dist/triple-threat.html`), no size cap, no second build.
- Assets CC0 only (Mixamo motion as before, baked, never its `.fbx`), each listed in `assets/CREDITS.md`. Downloads: exactly the sixteen sound files in Task 17 and nothing else; if one is missing or is not what its page says, stop and ask.
- All names invented. No real team, league, brand or person in any line of commentary or any panel.
- Never push. Never merge. Commit with explicit paths; messages end `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- After each stage: `npm test`, `npm run single`, send `dist/triple-threat.html` with SendUserFile (say it shows only in the desktop app), and go on to the next stage without waiting.
- Measure before Stage 1 and after Tasks 6 and 14 with `pace.mjs`, `shots5.mjs` and `byplayer.mjs` in the scratchpad's `balance/` folder, 10 matches, three a side and five. Today: five a side about 52 points and 13.6 s a possession; three a side about 59 and 12.5 s. Hold scoring and pace within a tenth, steals within a tenth.

## Review focus

Each has its test in the task named.

1. **Storage that throws.** `localStorage` missing, or throwing on read or write (a file opened from Drive, a private window): the game must start and play, with defaults. Task 1.
2. **A saved value from an older or broken file.** Not JSON, a number where a word belongs, an action that no longer exists, two actions on one key: each bad value is dropped alone and the rest apply. Tasks 1 and 2.
3. **A key held while it is rebound, or while a panel opens.** The key that was pressed to choose "press a key" (Enter) or to skip a panel must not act in the match. Tasks 3 and 13.
4. **A move at the wrong moment.** In the air, while gathering a shot, with the dribble picked up, as an inbounder, during a free throw, or with a second move still running: nothing happens, and no travel or double dribble is called. Tasks 4 and 5.
5. **A replay or a panel across a change of screen.** Pausing, quitting to the menu, the match ending, or the window losing focus while a replay, a slow-motion or a panel is up: it ends cleanly, the match is where it was, and no key is stuck. Tasks 13 and 15.

---

# Stage 1: moves, the Keys panel, remembered settings

### Task 1: Remembered settings

**Files:** Create `src/prefs.js`, `tests/prefs.test.js`. Modify `src/main.js`, `src/menu.js`, `src/pause.js`.

**Produces:**

```js
export const PREFS_KEY = 'tripleThreat.settings.v1';
// quality: null means the game chooses its own level. keys: { action: code }, only what differs from DEFAULT_KEYS is needed.
export const DEFAULT_PREFS = Object.freeze({ quality: null, camera: '2k', difficulty: 'allstar', minutes: 3, size: 3,
  autoSubs: true, commentary: 'voice', replays: true, sound: 'full', keys: {} });
export const storageOf = () => Storage | null;          // globalThis.localStorage, or null if reading it throws
export function readPrefs(storage) → prefs;             // never throws; every field checked on its own
export function writePrefs(storage, prefs) → boolean;   // false if there is no storage or it threw
```

Valid values: `quality` null or one of `QUALITY.order`; `camera` '2k' | 'broadcast'; `difficulty` one of `DIFFICULTY.order`; `minutes` one of `MATCH.minutes`; `size` 3 | 5; `autoSubs`, `replays` booleans; `commentary` 'voice' | 'captions' | 'off'; `sound` 'full' | 'quiet' | 'off'; `keys` a plain object (its entries are checked in Task 2).

- [ ] **Step 1: tests** in `tests/prefs.test.js`, with `const box = (text) => ({ getItem: () => text, setItem(k, v) { this.saved = [k, v]; } })`:
  - `readPrefs(null)` and `readPrefs(box(null))` deep-equal `DEFAULT_PREFS`.
  - `readPrefs(box('{"difficulty":"legend","camera":"broadcast","minutes":8,"size":5,"quality":"low"}'))` has those five and defaults for the rest.
  - `readPrefs(box('not json'))`, `readPrefs(box('[1]'))`, `readPrefs(box('7'))` are the defaults.
  - One bad field leaves the others: `{"difficulty":"godlike","camera":"broadcast","minutes":"8","autoSubs":"no"}` gives camera 'broadcast' and defaults for the three bad ones.
  - A storage whose `getItem` throws gives the defaults; one whose `setItem` throws makes `writePrefs` return false and does not throw.
  - `writePrefs(b, prefs)` calls `setItem(PREFS_KEY, json)` and `readPrefs` of that json deep-equals `prefs`.
  - `storageOf()` in node (no `localStorage`) is null.
- [ ] **Step 2:** run `node --test tests/prefs.test.js`; expected: fails, no `src/prefs.js`.
- [ ] **Step 3:** implement `src/prefs.js`.
- [ ] **Step 4:** wire it. In `src/main.js`: `const storage = storageOf(), prefs = readPrefs(storage), save = () => writePrefs(storage, prefs)`. `createMenu(prefs)` takes its `size, difficulty, minutes, autoSubs` from prefs (signature `createMenu(prefs = DEFAULT_PREFS)`; test in `tests/menu.test.js`: `createMenu({ ...DEFAULT_PREFS, size: 5, difficulty: 'legend', minutes: 8, autoSubs: false })` has those). `game.camera = prefs.camera`. If `prefs.quality`, set `quality.level = prefs.quality; quality.settled = true` before `showQuality()`. After every `onMenu`, `onPause`, the quality key and the camera key, call `remember()`: copy `game.menu.size/difficulty/minutes/autoSubs`, `game.camera` into prefs, and `quality.level` into `prefs.quality` only when the user stepped it (G or the Quality row; not `autoQuality`), then `save()`.
- [ ] **Step 5:** `npm test`; expected: all pass (643 + new).
- [ ] **Step 6:** in the browser pane at `http://127.0.0.1:5173/`: set Legend, Broadcast, 5 on 5, Low; reload; the menu shows them. Then `localStorage.setItem('tripleThreat.settings.v1', 'x')`, reload: defaults, no console error.
- [ ] **Step 7:** commit `feat: the game remembers its settings`.

### Task 2: Keys that can be changed

**Files:** Create `src/keys.js`, `tests/keys.test.js`. Modify `src/input.js`, `src/sim/state.js` (`emptyIntent`), `src/main.js`, `src/playlist.js`, `tests/input.test.js`, `tests/playlist.test.js`.

**Produces:**

```js
export const ACTIONS = ['up', 'left', 'down', 'right', 'sprint', 'shoot', 'pass', 'steal', 'hold',
  'cross', 'legs', 'back', 'stepBack', 'fade', 'plays', 'timeout', 'camera', 'quality'];
export const DEFAULT_KEYS = Object.freeze({ up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD', sprint: 'Shift', shoot: 'Space',
  pass: 'KeyE', steal: 'KeyQ', hold: 'KeyF', cross: 'KeyJ', legs: 'KeyK', back: 'KeyL', stepBack: 'KeyI', fade: 'KeyU',
  plays: 'KeyT', timeout: 'KeyZ', camera: 'KeyC', quality: 'KeyG' });
export const ACTION_WORDS = { up: 'Move up', left: 'Move left', down: 'Move down', right: 'Move right', sprint: 'Sprint',
  shoot: 'Shoot / jump', pass: 'Pass / switch player', steal: 'Steal', hold: 'Hold the ball', cross: 'Crossover',
  legs: 'Between the legs', back: 'Behind the back', stepBack: 'Step-back', fade: 'Post fade', plays: 'Plays',
  timeout: 'Timeout', camera: 'Camera', quality: 'Quality' };
export const keyOf = code => string;            // 'ShiftLeft' and 'ShiftRight' → 'Shift'; anything else unchanged
export const bindable = key => boolean;         // Key*, Digit*, Space, Shift, Tab, Arrow*, and Minus Equal BracketLeft BracketRight
                                                // Backslash Semicolon Quote Comma Period Slash Backquote. Nothing else.
export const createKeys = (saved = {}) => keys; // DEFAULT_KEYS, then each saved entry applied with bind(), in ACTIONS order
export function bind(keys, action, key) → boolean;   // false (nothing changes) if not bindable or no such action;
                                                     // if another action has `key`, that action takes this one's old key
export const resetKeys = keys => void;          // back to DEFAULT_KEYS, in place
export const actionOf = (keys, code) => action | null;   // by keyOf(code)
export const keyLabel = key => string;          // 'KeyW' → 'W', 'Digit1' → '1', 'ArrowUp' → '↑' (↓ ← →), 'Space', 'Shift', 'Tab',
                                                // punctuation as its character
export const savedKeys = keys => object;        // only the entries that differ from DEFAULT_KEYS, for prefs.keys
```

`createKeyboard(target, keys)` reads its codes through `keys` (the live object, so a change is seen at once). The Intent gains five booleans: `cross, legs, back, stepBack, fade`; `emptyIntent()` in `src/sim/state.js` gains them, false. `steer` is unchanged.

- [ ] **Step 1: tests** in `tests/keys.test.js`:
  - every action in `ACTIONS` has a key in `DEFAULT_KEYS` and words in `ACTION_WORDS`; no two defaults are the same key.
  - `bind(keys, 'cross', 'KeyR')` → true, `keys.cross === 'KeyR'`.
  - a swap: `bind(keys, 'cross', 'KeyK')` → `keys.cross === 'KeyK'` and `keys.legs === 'KeyJ'`; after any sequence of 50 binds from a seeded list, the 18 keys are still 18 different keys.
  - `bind(keys, 'cross', k)` is false and changes nothing for `k` of 'Escape', 'Enter', 'Backspace', 'ControlLeft', 'AltLeft', 'MetaLeft', 'F5', 'CapsLock'; and for an action 'fly'.
  - `keyOf('ShiftRight') === 'Shift'`; `actionOf(keys, 'ShiftRight') === 'sprint'`.
  - `createKeys({ cross: 'KeyR', fly: 'KeyX', legs: 7, back: 'Escape' })` has cross R and everything else default (Review focus 2); `createKeys({ cross: 'KeyK', legs: 'KeyK' })` has 18 different keys.
  - `savedKeys(createKeys())` is `{}`; `createKeys(savedKeys(k))` deep-equals `k` after three binds.
  - `keyLabel`: 'KeyW' → 'W', 'Digit0' → '0', 'ArrowLeft' → '←', 'Slash' → '/'.
- [ ] **Step 2:** run; expected: fails, no `src/keys.js`.
- [ ] **Step 3:** implement `src/keys.js`.
- [ ] **Step 4: tests** added to `tests/input.test.js`: with default keys the intent is as today for every existing key, and `KeyJ` gives `cross: true`, `KeyU` `fade: true`; after `bind(keys, 'shoot', 'KeyP')`, `KeyP` gives `shoot: true` and `Space` gives nothing; `preventDefault` is called for a bound key and not for an unbound one. In `tests/playlist.test.js`: `playListKey(game, code, keys)` opens on `keys.plays`; with the list open a digit calls its play even when that digit is bound to a move (the page then drops that key, so the move does not also happen: `keyboard.drop([code])` after any key the list took).
- [ ] **Step 5:** change `createKeyboard`, `emptyIntent`, `playListKey(game, code, keys)`; in `src/main.js` build `const keys = createKeys(prefs.keys)` and replace the literal `'KeyG'`, `'KeyC'`, `'KeyZ'` with `actionOf(keys, e.code)`. On the start menu and the pause menu the quality and camera keys act only when the code is not one of `MENU_KEYS`.
- [ ] **Step 6:** `npm test`; expected: all pass.
- [ ] **Step 7:** commit `feat: every key is read through a table that can be changed`.

### Task 3: The Keys panel in both menus, and Controls that show the keys as they are

**Files:** Modify `src/keys.js`, `src/menu.js`, `src/pause.js`, `src/render/hud.js`, `index.html`, `src/main.js`, `tests/keys.test.js`, `tests/menu.test.js`, `tests/pause.test.js`, `tests/hud.test.js`.

**Produces:**

```js
// src/keys.js
export const KEY_ROWS = [...ACTIONS, 'reset'];                       // 19 rows
export const createKeysPanel = () => ({ row: 0, listening: false });
// One key on the Keys panel. Returns 'changed' (save), 'back' (leave the panel) or null.
export function keysPanelKey(panel, code, keys) → 'changed' | 'back' | null;
// src/render/hud.js
export function keysText(keys, row, panel) → string;   // 'Crossover: J' · 'Crossover: press a key…' (the row listening) · 'Reset all keys'
export const controlsLines = keys => [label, words][]; // 11 pairs, below
export const hintLine = keys => string;                // the line under the court
```

`keysPanelKey`: while `listening`, Escape stops listening and nothing changes; a bindable key binds the row's action, stops listening and returns 'changed'; any other key is ignored and it keeps listening. Not listening: ArrowDown/KeyS and ArrowUp/KeyW move the row (wrapping); Enter or Space on an action row starts listening, on 'reset' calls `resetKeys` and returns 'changed'; Escape or Backspace returns 'back'.

`MENU.settings` gains `'keys'` as its last row (`['quality', 'autoSubs', 'camera', 'difficulty', 'quarter', 'keys']`), `PAUSE.settings` likewise. Choosing it sets `menu.panel = 'keys'` and `menu.keys = createKeysPanel()`. While `panel === 'keys'`, `menuKey(menu, code, keys)` and `pauseKey(game, code, keys)` hand the key to `keysPanelKey`: 'back' returns to the settings panel with the bar on the Keys row; 'changed' is returned to the page as `'keys'` so that it saves. `menuRows`/`pauseRows` return `KEY_ROWS` for the panel.

`controlsLines(keys)`, labels built with `keyLabel`: `['W A S D', 'move']` (the four move keys in order up, left, down, right, joined by spaces), `[sprint, 'sprint']`, `[shoot, 'shoot / jump']`, `[pass, 'pass / switch']`, `[steal, 'steal']`, `[hold, 'hold ball']`, `['J · K · L', 'crossover · between the legs · behind the back']`, `['I · U', 'step-back · post fade']`, `['Esc', 'pause']`, `['G · C', 'quality · camera']`, `['T · Z', 'plays · timeout']`. `hintLine(keys)` is the same content on one line, `·` between entries, in today's wording for the entries that exist today.

Page: both Controls `<dl>`s become eleven empty `<dt id="ctlK0">`/`<dd id="ctlW0">` pairs (`pctlK0`/`pctlW0` in the pause screen), filled by the hud. `#menuList` and `#pauseList` get nine `<li>` each (`menuRow0..8`, `pauseRow0..8`; `PAUSE_SLOTS = 9`), hidden beyond the panel's rows. One new `<ul id="keyRows">` of 19 `<li id="keyRow0..18" role="option">`, in two columns, shown over either screen while its panel is 'keys' and hidden otherwise; the row listening has class `listening`. A click on a row is Enter on it.

- [ ] **Step 1: tests**
  - `tests/keys.test.js`: Enter on row 9 (`cross`) listens; then `KeyR` → 'changed', `keys.cross === 'KeyR'`, not listening. Listening + Escape → null, not listening, keys unchanged. Listening + `Enter`, `F5`, `ControlLeft` → null, still listening, unchanged. Listening + `KeyW` on row `cross` → cross is W and `up` is J (the swap), and the panel still moves with ArrowDown. Enter on 'reset' → 'changed' and keys deep-equal `DEFAULT_KEYS`. Escape when not listening → 'back'.
  - `tests/menu.test.js` and `tests/pause.test.js`: the Keys row opens the panel; 'back' returns to settings with `row` on 'keys'; a bind returns `'keys'`; in pause, Escape on the Keys panel does not resume; `setPaused(game, kb, true)` while the Keys panel is listening leaves no panel listening.
  - `tests/hud.test.js`: `keysText(keys, 9, { row: 9, listening: false }) === 'Crossover: J'`; listening → `'Crossover: press a key…'`; row 18 → `'Reset all keys'`; `controlsLines(DEFAULT_KEYS)[0]` is `['W A S D', 'move']` and after `bind(keys, 'sprint', 'KeyX')` the second is `['X', 'sprint']`; `hintLine(DEFAULT_KEYS)` starts `'W A S D move · Shift sprint · Space shoot / jump'`.
- [ ] **Step 2:** run the four files; expected: the new tests fail.
- [ ] **Step 3:** implement, page markup and CSS included. In `src/main.js` the keydown listener passes `keys` to both menus; on `'keys'` it sets `prefs.keys = savedKeys(keys)` and saves; and it calls `keyboard.drop()` after every key the Keys panel took, so a key just bound does not act (Review focus 3).
- [ ] **Step 4:** `npm test`; expected: all pass.
- [ ] **Step 5:** browser pane at 1366×768 and at desktop size: the Keys panel fits without scrolling in both menus; bind Crossover to R, reload, it is still R; Reset; Controls shows the change. Keep `dist/keys-panel.jpg`.
- [ ] **Step 6:** commit `feat: a Keys panel in both menus; Controls show the keys as they are`.

### Task 4: The three dribble moves

**Files:** Create `src/sim/moves.js`, `tests/dribblemoves.test.js`. Modify `src/sim/tuning.js`, `src/sim/state.js` (`createPlayer`, `lineUp`), `src/sim/players.js`.

**Tuning** (`src/sim/tuning.js`):

```js
export const MOVES = f({
  cross: f({ time: 0.30, push: 1.5, keep: 0.5, steal: 1.5, hidden: false }),
  legs: f({ time: 0.40, push: 1.1, keep: 0.5, steal: 0.5, hidden: false }),
  back: f({ time: 0.50, push: 1.2, keep: 1, steal: 1, hidden: true }),    // hidden: a reach from the front cannot win it
  stepBack: f({ time: 0.35, push: 1.3 }),
  gap: 0.3,            // seconds after a move before another may start
  cost: 0.02,          // energy a move takes
  tired: 0.6,          // the share of its push a move keeps at no energy (all of it at full, in a straight line between)
  near: 1.6,           // metres: a defender this close can be beaten
  late: 0.25, latePer10: 0.1, lateMax: 0.6,   // seconds he is late at equal ratings; more per 10 points of Handle over Defence
  leaning: 0.5,        // m/s: a defender already moving the move's way this fast is not late
  ankle: f({ edge: 15, wrong: 1, chance: 0.25, time: 1 }),   // Handle less Defence at least; m/s he moves the wrong way; how often; seconds down
  side: 0.3,           // how far across the move keys must point for them to choose the side
  fade: f({ within: 5.5, drift: 0.8, contest: 0.6, make: 0.92, block: 0.6 }),
});
```

**Produces** (`src/sim/moves.js`):

```js
export const DRIBBLES = ['cross', 'legs', 'back'];
export const canMove = (state, p) => boolean;   // holds the ball, on the floor, dribble alive (!p.held), not shooting, not an
                                                // inbounder, phase 'live', no move running, p.moveWait <= 0
// Starts `kind` ('cross' | 'legs' | 'back' | 'stepBack') for the ball handler if he may. Returns whether it started.
export function startMove(state, p, kind, intent) → boolean;
// One step of the move `p` is in: sets his velocity; ends it when its time is up. Called from movePlayers before moveOne.
export function stepMove(state, p, dt) → void;
export const lateBy = (state, handler, defender) => seconds;   // clamp(late + (handle − defence) / 10 × latePer10, 0, lateMax)
```

Player fields (in `createPlayer`; `lineUp` clears them): `move: null` or `{ kind, t, dx, dz, cx, cz }` (unit direction of the push; the velocity he had when it began), `moveWait: 0`, `lateT: 0` (seconds he cannot steer), `stumbleT: 0`, `moved: -Infinity` (the time his last move ended, for the renderer and the computer).

Rules of a move:

- **Side.** `across` is the unit vector at right angles to the line from him to the hoop he attacks. If the intent's move, dotted with `across`, is beyond `±MOVES.side`, the push goes that way. Otherwise away from the nearest opponent within `MOVES.near` (the side he is not on); with nobody near, toward the middle of the court (z toward 0).
- **Motion.** For its `time` his velocity is `(dx, dz) × push × tiredness / time + (cx, cz) × keep`, where tiredness is `MOVES.tired + (1 − MOVES.tired) × energy`. He ignores the move keys. `p.steps` does not grow. At the end `p.move = null`, `p.moveWait = MOVES.gap`, `p.moved = state.time`, and he steers again from the velocity he has.
- **Cost.** `spend(state, p, MOVES.cost)` at the start.
- **The defender.** The nearest opponent, if within `MOVES.near` and on the floor: if his velocity along `(dx, dz)` is below `MOVES.leaning`, `defender.lateT = lateBy(...)`. If also Handle less Defence is at least `ankle.edge` and his velocity along `(dx, dz)` is at or below `−ankle.wrong`, one random number is drawn; below `ankle.chance` he stumbles: `stumbleT = lateT = ankle.time` and `state.last.stumble = { by: p.id, on: defender.id, at: state.time }`. No number is drawn otherwise.
- **Late.** In `moveOne`, a player with `lateT > 0` is treated as holding no move key (he brakes). `lateT`, `stumbleT` and `moveWait` count down in `movePlayers`.
- **Reaches.** In `trySteal`, when the holder is in a dribble move: the chance is multiplied by that move's `steal`; and if the move is `hidden` and the reach is from the front, the chance is 0 (the random number is still drawn, so the order of draws does not depend on it).
- **Ended early.** Losing the ball, a whistle (`phase` leaving 'live'), or a shot press ends the move at once with `moveWait = MOVES.gap`.

`state.last` is new in `createMatch`: `{ stumble: null, score: null, block: null, steal: null }`. Only this task's `stumble` is written now.

`applyActions`: for the holder, after pass and before shoot: `for (const kind of DRIBBLES) if (pressed(kind) && startMove(state, p, kind, intent)) break;`.

- [ ] **Step 1: tests** (`tests/dribblemoves.test.js`, plain players, `s.playWait = [Infinity, Infinity]`, opponents moved far away unless the test needs one):
  - each of the three: after `time` seconds he has moved `push` metres across (±0.05) from a standing start, toward +across with the move keys pointing that way and toward −across the other way; with a defender 1 m to one side and no keys, away from him.
  - from a run at 4 m/s toward the hoop: after a crossover his speed toward the hoop during the move was 2 m/s (±0.1); after behind the back, 4.
  - nothing happens (returns false, `p.move === null`, no call) for: no ball; in the air; `p.held`; `p.shooting`; an inbounder; phase 'dead'; a second press during a move; a press within 0.3 s of the last move's end (Review focus 4). A press 0.31 s after starts one.
  - energy falls by `MOVES.cost`; at energy 0 the push is `0.6 × push`.
  - `lateBy`: 0.25 at 70 against 70; 0.45 at 90 against 70; 0 at 45 against 70; 0.6 at 99 against 40.
  - a standing defender 1.2 m away gets `lateT === 0.25` and does not move for 0.25 s though his intent says run; one already moving the move's way at 1 m/s gets 0; one 2 m away gets 0.
  - ankle-breaker: handler Handle 90, defender Defence 70 moving the wrong way at 1.5 m/s: over 400 seeds the defender stumbles in 20% to 30% of them, and `state.last.stumble` names both; with Defence 80 (edge 10), never, and the seed is unchanged by the move (`s.seed` before equals after).
  - reaches: 2000 front reaches at a holder in each move against 2000 at a plain dribbler, same seeds: crossover wins 1.5 times as often (±0.15), between the legs 0.5 (±0.1), behind the back never; from behind, behind the back wins as often as plain (±0.1).
  - a whistle during a move (`s.phase = 'dead'`) ends it.
- [ ] **Step 2:** run; expected: fails, no `src/sim/moves.js`.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npm test`; expected: all pass, the 643 old ones unchanged (nobody presses a move key in them).
- [ ] **Step 5:** commit `feat: crossover, between the legs and behind the back`.

### Task 5: Step-back and post fade

**Files:** Modify `src/sim/moves.js`, `src/sim/players.js`, `src/sim/state.js`, `tests/dribblemoves.test.js`.

- **Step-back** is `startMove(state, p, 'stepBack', intent)`: the push is straight away from the hoop he attacks, `MOVES.stepBack.push` in `MOVES.stepBack.time`, keeping none of his speed; he faces the hoop throughout; at the end his velocity is zero. The defender rule is Task 4's, with no ankle-breaker. The dribble stays alive.
- **Fade.** New player field `fading: false`. In `applyActions`, `pressed('fade')` on the floor starts a shot exactly as `pressed('shoot')` does, and sets `p.fading = dist(p, hoop) <= MOVES.fade.within`. While `p.fading`, `continueShot` reads `intent.fade` where it reads `intent.shoot`. At the take-off of a fading shot his velocity is set to the unit vector away from the hoop times `MOVES.fade.drift / (2 × PLAYER.shotJumpV / BALL.gravity)`. While fading: `contest()` returns `1 − (1 − c) × MOVES.fade.contest` for the plain value `c`; `makeChance` is multiplied by `MOVES.fade.make`; a blocker must be within `BLOCK.reach × MOVES.fade.block`. `fading` is cleared wherever `shooting` is.
- The shot's value and zone are judged where he lets go, as now.

- [ ] **Step 1: tests**
  - step-back from 6.2 m: after 0.35 s he is 7.5 m from the hoop (±0.05), stopped, `p.held === false`, facing the hoop; a shot then from behind the line scores 3 (`isThree` at his spot).
  - step-back refused in the same cases as Task 4's.
  - fade at 4 m with a defender 0.6 m in front: `contest` is `1 − (1 − c) × 0.6` of the plain `c`; `makeChance` with nobody near is 0.92 of the plain shot's from the same spot and time; he lands 0.8 m further from the hoop (±0.1) than he took off.
  - fade pressed at 7 m: `p.fading === false`, and the shot is in every way the plain one (same `makeChance`, no drift).
  - the fade key held and let go at `SHOT_BEST` is green exactly when the plain shot would be at that contest.
  - a block: a jumper 1.0 m in front blocks plain shots in some of 300 seeds and fades in none (`BLOCK.reach × 0.6 = 0.72`).
  - `fading` is false after the release, after a block, after a travel on landing.
- [ ] **Step 2:** run; expected: the new tests fail.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npm test`; expected: all pass.
- [ ] **Step 5:** commit `feat: the step-back and the post fade`.

### Task 6: The computer uses the moves

**Files:** Modify `src/sim/ai.js`, `src/sim/tuning.js`, `tests/ai.test.js`.

**Tuning:** `AI` gains `moveAt: 78` (Handle), `moveNear: 1.5`, `moveEvery: 2.5` (seconds between one player's moves), `stepAt: 82` (the rating for the spot from which he steps back), `stepNear: 1.3`, `fadeAt: 80` (Inside), `fadeNear: 1.5`, `mateMoves: 0.6`. Each `DIFFICULTY.levels` entry gains `moves`: rookie 0.15, starter 0.35, allstar 0.6, superstar 0.8, legend 1 (how often the computer's team takes a move that is right; team-mates use `AI.mateMoves`).

**Behaviour**, in `planWithBall`, each tried only when `state.time − p.moved >= AI.moveEvery` and one random number is under the level's `moves`:

- **Fade:** he has Inside ≥ `fadeAt` or the role 'Post scorer'; within `MOVES.fade.within`; an opponent within `fadeNear`; and it is not a clear lay-up (`dist > AI.layupDist` or the lane is not clear). `ai.action = 'fade'`, timed as his shots are.
- **Step-back:** where he would otherwise shoot from mid-range or three but an opponent is within `stepNear`: his rating for that zone ≥ `stepAt`, or his role is 'Shot creator' or 'Sharpshooter'. `ai.action = 'stepBack'`, and he plans again as the move ends.
- **Dribble move:** where he would otherwise drive: Handle ≥ `moveAt` and an opponent within `moveNear` in front. Between the legs if that opponent reached within the last second (`stealCooldown > 0`) and he is slower than 3 m/s; behind the back if he reached and he is faster; else a crossover. The side is away from the opponent.

`act()`: `'cross' | 'legs' | 'back' | 'stepBack'` press that intent once (`!p.prev[kind]`) and clear the action; `'fade'` is held and released as `'shoot'` is, on `intent.fade`.

- [ ] **Step 1: tests** (`tests/ai.test.js`, `s.difficulty = 'legend'`, team 1 handler, no coach, no waiting):
  - Handle 90, a defender 1 m in front, a lane to drive: within 1 s `p.move` is a dribble move. With Handle 70: never in 3 s.
  - the same with the defender's `stealCooldown = 0.5`: the move is 'legs' standing, 'back' at a run.
  - a 'Shot creator' with Mid-range 88 at 5 m, defender 1 m away: he steps back and then shoots. A 'Rim protector' with Mid-range 60: never steps back.
  - a 'Post scorer' with Inside 88 at 3.5 m, defender on him, lane blocked: his shot is a fade (`p.fading` true at the jump). With a clear lane at 2 m: a plain shot.
  - on 'rookie', over 200 seeds the handler of the first test moves in fewer than a quarter as many as on 'legend'.
  - a team-mate of yours (team 0, not controlled) with Handle 90 also moves.
- [ ] **Step 2:** run; expected: the new tests fail.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npm test`; expected: all pass. Tests elsewhere that this changes legitimately (a plain 70 player never qualifies, so there should be none): fix the scene, not the number, and ledger it.
- [ ] **Step 5:** measure (Global constraints). If scoring or steals are out by more than a tenth, change `MOVES.late` first (0.25 → 0.2), then `AI.moveEvery`; ledger what was changed and the numbers.
- [ ] **Step 6:** commit `feat: the computer's players use the moves that suit them`.

### Task 7: The motions

**Files:** Modify `tools/blender/poses.py`, `tools/blender/build_motion.py`, `assets/motion.glb`, `assets/motion.json`, `src/render/motion.js`, `src/render/hands.js`, `src/render/actors.js`, `assets/source/README.md`, `assets/CREDITS.md`, `tests/poses.test.js`, `tests/motion.test.js`, `tests/hands.test.js`, `tests/animator.test.js`.

**The build.** `build_motion.py` gains:

```python
OPTIONAL = {'crossover': 'once', 'betweenLegs': 'once', 'behindBack': 'once', 'stepBack': 'once', 'fade': 'held',
            'celebrate': 'once', 'dejected': 'once', 'stumble': 'once'}   # taken from assets/source/mixamo/<name>.fbx if it is there
MIRRORS.update({'crossoverLeft': 'crossover', 'betweenLegsLeft': 'betweenLegs', 'behindBackLeft': 'behindBack'})
```

For each name in `OPTIONAL`: if its `.fbx` is there, it is read as the other clips are, its travel is taken out, and its fact is `from: 'clip'`; a clip whose rest pose is out by more than `REST_GAP` prints `refused <name>.fbx: <reason>` and is treated as absent, and the build goes on. Otherwise, if `poses.py` has a motion of that name, that is used, `from: 'hand'`. Otherwise the motion is absent from both files. The eight clips in `CLIPS` are still required.

**By hand** (`poses.py`, arms layer only, as its rules say): `crossover` (0.30 s: the right hand sweeps low across the knees to the left, the trunk turning with it), `betweenLegs` (0.40 s: the right hand goes down and in toward the hips, the left reaches down behind the knee), `behindBack` (0.50 s: the right arm wraps behind the hip, the left reaches back), `stepBack` (0.35 s: both hands bring the ball in to the chest, the trunk tipping forward then upright), `fade` (held: the set point of `shoot` with `Spine1` and `Spine2` tipped back 12° each). The three dribbles are written for a ball starting in the right hand.

**The renderer.**

- `ARM_CLIPS` gains whichever of the new names `assets/motion.json` has; `LEG_CLIPS` gains those among them whose fact is `from: 'clip'` (a whole-body clip plays on both layers; a hand-made one leaves the legs to the gait).
- `armMotion`: a player with `p.move` plays that move's clip placed by hand, `at: p.move.t / MOVES[kind].time` (names: cross → `crossover`, legs → `betweenLegs`, back → `behindBack`, stepBack → `stepBack`), the `Left` twin when the ball starts in his left hand. A player with `p.shooting && p.fading` plays `fade` in place of `shoot`, at the same share. `legMotion` does the same for a whole-body clip.
- A stumbling defender (`p.stumbleT > 0`) plays `stumble` on both layers if it exists; otherwise he stands in `stance`.
- **The hand.** `noteChanges`: when a dribble move ends (`before.move && !p.move`), `marks.hand[id]` becomes the other hand and `marks.switched[id] = 0`, so it is kept for `MOTION.handStick`.
- **The ball.** `hands.js`: `switchSpot(from, to, share, radius, via = 'front')`: `'under'` (between the legs) dips to `radius` at the middle and passes 0.15 m behind the line between the hands; `'behind'` passes 0.3 m behind it at hand height. During a dribble move the ball is drawn on that path with `share = p.move.t / time`.

- [ ] **Step 1: tests**
  - `tests/poses.test.js`: the five hand-made motions are in the shipped file with the lengths above; each turns no leg bone, `Hips` or `Spine`; `fade` at its end differs from `shoot` at its end only in `Spine1`, `Spine2` and what hangs from them; the eight downloaded motions' durations and gaits equal those in the file before this task (kept in the test as numbers read from the file now).
  - `tests/motion.test.js`: `armMotion` for a player with `move: { kind: 'cross', t: 0.15 }` is `{ clip: 'crossover', at: 0.5 }`, and `crossoverLeft` with `marks.hand` left; fading and shooting gives `fade`; after a move ends `marks.hand` has flipped and `marks.switched` is 0; with facts that lack `stumble`, a stumbling player's legs are `stance`.
  - `tests/hands.test.js`: `switchSpot` with `'under'` is at height `radius` at share 0.5 and behind the line; `'behind'` is 0.3 m behind; `'front'` is as before for the cases already tested.
- [ ] **Step 2:** run; expected: the new tests fail.
- [ ] **Step 3:** write the poses and the build changes; run `blender-4.5 --background --python tools/blender/build_motion.py -- --shots <scratchpad>/strips`; expected: it lists the eight clips, the hand-made motions, and for each `OPTIONAL` name either `clip`, `hand` or `absent`; `assets/motion.glb` and `.json` are rewritten.
- [ ] **Step 4:** look at the five film strips (Read the pictures): nothing through the body, hands meet the ball's path. Fix poses and rebuild until they read.
- [ ] **Step 5:** implement the renderer changes; `npm test`; expected: all pass.
- [ ] **Step 6:** browser pane: a still of each move from the 2K camera with the ball drawn in the hand it is going to; keep `dist/moves-*.jpg`. No console error.
- [ ] **Step 7:** `assets/source/README.md`: the optional clips, their file names and that an absent one is made by hand. `assets/CREDITS.md`: a row for each optional clip that is there, with its Mixamo name (ask the owner for the name if a file is there and its name is not known).
- [ ] **Step 8:** commit `feat: motions for the five moves, by hand until a clip is there`.

### Task 8: Stage 1 out

- [ ] **Step 1:** `npm test`; `npm run single`; open `dist/triple-threat.html` from disk in the browser pane: no console error, a move on J works, the Keys panel works, a changed setting survives a reload of the file.
- [ ] **Step 2:** SendUserFile `dist/triple-threat.html`, caption: stage 1 of 4; shows only in the desktop app.
- [ ] **Step 3:** ledger line; go on.

---

# Stage 2: statistics, big moments, broadcast

### Task 9: Statistics

**Files:** Create `src/sim/stats.js`, `tests/stats.test.js`. Modify `src/sim/state.js`, `src/sim/players.js`, `src/sim/rules.js`, `src/sim/freethrow.js`, `src/sim/violations.js`, `src/sim/roster.js` (a player taken off keeps his line).

**Produces:**

```js
export const STAT_KEYS = ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'reb', 'ast', 'stl', 'blk', 'tov'];
export const emptyLine = () => ({ pts: 0, ... });           // every key 0
export function note(state, player, key, n = 1) → void;     // adds to personOf(state, player).stats[key]
export const teamLine = (state, team) => line;              // the sum of that team's eight
export const gameScore = line => number;   // pts + 0.4 fgm − 0.7 fga − 0.4 (fta − ftm) + 0.7 reb + 0.7 ast + stl + 0.7 blk − tov
export const playerOfGame = state => ({ team, row });       // the highest gameScore; ties to the winning team, then the lower row
```

Each roster entry gains `stats: emptyLine()` (fouls stay in `person.fouls`). `state.teamStats = [{ lead: 0, run: 0 }, { lead: 0, run: 0 }]`, kept in `addPoints` (biggest lead, longest run). `state.last` is filled:

- `score = { team, by, row, points, at, shotAt, clock, x, z, far, green, how, assist, fouled, tied, lead }`: `by` the player id and `row` his roster row; `shotAt` and `clock` the match time and the game clock when the ball left his hand; `far` metres from the hoop; `assist` a player id or null; `fouled` whether a shooting foul is pending on it; `tied`/`lead` whether the basket tied the game or took the lead.
- `block = { by, on, at, chase }`: `chase` when, at the block, the blocker is moving toward that hoop faster than 4 m/s and is no nearer to it than 0.5 m short of the shooter (he came from behind).
- `steal = { by, on, at }`: a reach that won the ball, or a pass caught by the other team (`on` is the passer).

What is counted where: `fga` (and `tpa`) at every release, a blocked one too; `blk`; `fgm`/`tpm`/`pts` when the ball scores from the floor; `fta`/`ftm`/`pts` in `freethrow.js`; `reb` to whoever first holds a ball that missed (a shot or the last free throw) before the other team or the floor out of bounds; `ast` to the passer when the scorer let the ball go within 3 s of catching his pass; `stl` and `tov` together; `tov` also for a violation that gives the ball away (to the player the call names).

`ball.made` is set by `launchShot` (whether the throw is on target), for Task 10's slow-motion; `state.shot.clock = state.gameClock` at the release.

- [ ] **Step 1: tests** (`tests/stats.test.js`): one scene each, by hand: a made two (pts 2, fgm 1, fga 1); a made three; a miss (fga only) rebounded by a defender (reb 1) and by a team-mate (reb 1 to him); a blocked shot (fga to the shooter, blk to the blocker, `state.last.block` set); a pass, a catch and a release 2 s later that scores (ast 1), 3.5 s later (ast 0); a won reach (stl, tov, `state.last.steal`); an intercepted pass (stl to the catcher, tov to the passer); a travel (tov); two free throws, one made (fta 2, ftm 1, pts 1); a player substituted off keeps his line and the man who comes on has his own. `state.last.score` after a made three from 7.5 m has `points: 3`, `far` within 0.1 of 7.5, `green` as the shot was. Whole matches by the computer, 3 a side and 5, four seeds each: for each team `teamLine.pts === state.score[team]`; `fgm <= fga`; team rebounds sum to (missed shots that stayed in play) within the count of balls that went out; `teamStats.lead` is the largest lead seen step by step.
- [ ] **Step 2:** run; expected: fails, no `src/sim/stats.js`.
- [ ] **Step 3:** implement. `step(state, intents, dt)` now returns its `events` object (it returned nothing).
- [ ] **Step 4:** `npm test`; expected: all pass. The whole-match seeds give the same final scores as before this task (nothing here draws a random number or moves anybody): check with `git stash` on three seeds and ledger it.
- [ ] **Step 5:** commit `feat: the match keeps a box score`.

### Task 10: Moments

**Files:** Create `src/broadcast/moments.js`, `tests/moments.test.js`. Modify `src/main.js`.

**Produces:**

```js
export const MOMENT = { ankleWithin: 4, stealWithin: 5, deep: 8.5, clutchClock: 60, winnerClock: 10, buzzer: 1, poster: 1.5,
  posterNear: 1, run: 8, runStep: 4, comeback: 10, perfect: 7, slow: 0.25, slowWithin: 0.5 };
// In order of size, biggest first. star: it gets a replay.
export const KINDS = ['winner', 'buzzer', 'ankle', 'block', 'andOne', 'poster', 'stealScore', 'deep', 'clutch', 'onFire',
  'heatingUp', 'run', 'comeback', 'perfect'];
export const STARS = new Set(['winner', 'buzzer', 'ankle', 'block', 'andOne', 'poster']);
export const createWatch = () => watch;
// One step of watching. Returns what happened in it: moments { kind, team, row, name, at, star, rank, words } and plain
// happenings for the commentary { kind: 'made' | 'miss' | 'rebound' | 'steal' | 'foul' | 'violation' | 'periodEnd' |
// 'timeout' | 'sub' | 'play' | 'tip' | 'freeThrow', team, row, name, at, ... }.
export function watchStep(watch, state, events) → happening[];
export const slowFor = state => number;   // MOMENT.slow while a made buzzer-beater or game-winner is within slowWithin of the rim, else 1
```

Each moment's condition is the spec's section 3, on `state.last`, `state.score`, `state.run`, `state.teamStats`, the roster streaks and `state.quarter`/`gameClock`:

- `ankle`: a basket by the handler of `last.stumble`, or assisted by him, within `ankleWithin` of it. `block`: a new `last.block` (words say "chase-down" when `chase`). `andOne`: `last.score.fouled`. `buzzer`: `last.score.clock <= MOMENT.buzzer`. `winner`: the lead taken with `gameClock <= winnerClock` in the fourth period or overtime — announced when the period ends with that team still ahead and no later basket by the other; until then it is a `clutch`. `poster`: `far <= poster` with an opponent within `posterNear` of the scorer at the release. `stealScore`: a basket by the stealing team within `stealWithin` of `last.steal`. `deep`: three points from `far > deep`. `clutch`: `tied` or `lead` with `gameClock <= clutchClock` in the fourth or overtime. `heatingUp`/`onFire`: the scorer's streak reaching 3 / 5. `run`: `state.run[team]` reaching `run`, then each `runStep` more. `comeback`: a team that trailed by `comeback` or more (the watch keeps each team's worst deficit) ties or leads; once per deficit. `perfect`: team 0's controlled scorer, `green`, `far >= perfect`.
- One step can meet several; all are returned, sorted by `KINDS`.

`src/main.js`: `owed += elapsed * slowFor(state)`; every step's `events` go to `watchStep`, and what it returns is kept on `game.heard` for this frame.

- [ ] **Step 1: tests** (`tests/moments.test.js`): for each kind a state built by hand that meets it and one that just misses (a three from 8.4 m; a basket 4.1 s after the stumble; a clock of 61; a streak of 2; a run of 7; a deficit of 9; a green from 6.9 m; your team-mate's green, not yours). A basket that is both an and-one and a deep three returns both, and-one first. `winner` is not returned at the basket and is at the period's end; not if the other team scored after. A run of 8 then 12 gives 'run' twice and not at 10. `slowFor`: 0.25 only for `ball.made`, mode 'shot', within 0.5 m of the rim, and a shot that is a buzzer-beater or would be a winner; 1 for the same shot not made. Watching changes nothing: `JSON.stringify(state)` before equals after `watchStep`.
- [ ] **Step 2:** run; expected: fails, no module.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npm test`; expected: all pass.
- [ ] **Step 5:** commit `feat: big moments are noticed`.

### Task 11: Commentary: captions and a voice

**Files:** Create `src/broadcast/commentary.js`, `src/broadcast/voice.js`, `tests/commentary.test.js`, `tests/voice.test.js`. Modify `src/menu.js`, `src/pause.js`, `src/render/hud.js`, `index.html`, `src/main.js`, `src/prefs.js` users.

**Produces:**

```js
// commentary.js
export const LINES = { [kind]: string[] };        // at least 3 wordings for each happening and moment kind, 2 for 'tip' and 'winner'
export const createBooth = () => ({ last: {}, rank: -1, until: 0 });
export function lineFor(booth, happening, state) → string;     // the next wording for its kind, never the one used last for that kind
export const secondsFor = text => number;                      // clamp(text.length × 0.065, 1.6, 5)
// Offers a line at real time `now`. Returns it if it should be shown and spoken, else null: a line is dropped while one of
// the same or a higher rank is still being said; a higher one cuts in.
export function say(booth, line, rank, now) → string | null;
export const RANK = { plain: 0, stat: 0, score: 1, call: 2, moment: 3, star: 4 };
export const COMMENTARY = ['voice', 'captions', 'off'];
export const nextCommentary = (now, hasVoice) => string;       // without a voice: captions ↔ off
// voice.js
export function createVoice(synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance)
  → { available: boolean, speak(text, cutIn), stop() };        // an English voice if there is one; rate 1.15
```

Wordings use `{name}` (the player's surname), `{team}`, `{other}`, `{play}`, `{pts}`, `{n}`; every placeholder a kind's wordings use is supplied for that kind. Stat lines (`kind: 'stat'`) are offered at a dead ball when nothing has been said for 6 s: a hot hand, a run, a team's shooting from `teamLine`.

Settings row `'commentary'` in both menus, after `'difficulty'` (pause) and `'quarter'` (start): words `Commentary: Voice and captions` / `Captions only` / `Off`, and `Commentary: Captions only (no voice in this browser)` when `!voice.available` and the value is not 'off'. Saved in prefs.

Page: `<div id="caption" aria-live="off" hidden>` above the scorebug, one line, fading out when its time is up.

`src/main.js`: for each happening in `game.heard`, `say(...)`; a returned line sets `game.caption = { text, until }` and, when the setting is 'voice', `voice.speak(text, rank >= RANK.moment)`. Pausing calls `voice.stop()`.

- [ ] **Step 1: tests**
  - `tests/commentary.test.js`: every kind `watchStep` can return has wordings; every wording's placeholders are filled by `lineFor` for a sample happening (no `{` left in the result); no wording contains a name that is not in `ROSTER.names` or the team names; `lineFor` twenty times for one kind never repeats its previous wording; `say`: a plain line while a moment is being said → null; a star while a score is being said → the star; after `until`, a plain line is said; `secondsFor('Good!') === 1.6`. `nextCommentary`: with a voice the cycle is voice → captions → off → voice; without one, captions → off → captions, and 'voice' goes to 'captions'.
  - `tests/voice.test.js` with a fake synth `{ getVoices: () => [{ lang: 'fr-FR' }, { lang: 'en-GB', name: 'a' }], speak(u) { this.said = u; }, cancel() { this.cancelled = true; } }`: `available` true and the en-GB voice chosen; `speak(t, true)` cancels first; with `synth` undefined, `available` false and `speak` does nothing and does not throw; with `getVoices: () => []`, available is still true (a default voice speaks).
  - `tests/menu.test.js`, `tests/pause.test.js`, `tests/hud.test.js`: the row cycles and its words.
- [ ] **Step 2:** run; expected: fail.
- [ ] **Step 3:** implement; write the wordings.
- [ ] **Step 4:** `npm test`; expected: all pass.
- [ ] **Step 5:** browser pane: a computer-only minute with captions on; read ten captions for sense; keep `dist/caption.jpg`. Whether the voice speaks here is noted, not required.
- [ ] **Step 6:** commit `feat: a commentator, in captions and in the browser's voice`.

### Task 12: Banners, lower thirds, celebrations

**Files:** Create `src/broadcast/director.js`, `tests/director.test.js`. Modify `src/render/hud.js`, `index.html`, `src/render/motion.js`, `src/render/actors.js`, `src/render/life.js`, `src/main.js`, `tests/hud.test.js`, `tests/motion.test.js`, `tests/life.test.js`.

**Produces:**

```js
export const SHOW = { banner: 2.6, lower: 4, celebrate: 1.6, lineups: 4 };
export const createDirector = () => director;
// What is on the screen at real time `now`, given what was heard this frame:
// { banner: { words, name, team } | null, lower: { title, lines[] } | null, celebrate: id | null, dejected: id | null }
export function direct(director, heard, state, now) → show;
export const BANNER_WORDS = { ankle: 'ANKLE-BREAKER', block: 'BLOCKED', andOne: 'AND ONE', buzzer: 'BUZZER-BEATER', winner: 'GAME-WINNER',
  poster: 'POSTER', stealScore: 'STEAL AND SCORE', deep: 'FROM DEEP', clutch: 'CLUTCH', heatingUp: 'HEATING UP', onFire: 'ON FIRE',
  run: '{n}-0 RUN', comeback: 'COMEBACK', perfect: 'PERFECT RELEASE' };
```

A new moment replaces the banner only if it is not smaller (`KINDS` order) than the one showing. Lower thirds, each for `SHOW.lower`, one at a time, the newest replacing: a free-throw shooter (`'{name}'`, `'Free throws {ftm}/{fta}'`); a substitution (`'IN {name}'`, `'OUT {name}'`); a player reaching 10, 20, 30 points or heating up (`'{name}'`, `'{pts} PTS · {fgm}/{fga} FG · {tpm}/{tpa} 3PT'`); a timeout (`'TIMEOUT {team}'`, `'{a} left · {b} left'`). `celebrate` is the scorer of a moment that is a basket, `dejected` his nearest opponent at the basket, both for `SHOW.celebrate`.

Renderer: `actors.sync(state, dt, show)`; `armMotion` plays `celebrate` (or `handUp` if the clip is absent) for the celebrating player when he does not hold the ball, and `dejected` if that clip exists. `stepLife(life, state, dt, heard)`: a moment for the home team (team 0) sets `cheer[0]` to `LIFE.cheerThree`; one against it sets a new `life.groan` to 1.5 s.

Page: `<div id="banner" hidden><b id="bannerWords"></b><span id="bannerName"></span></div>` top centre, in the scoring team's colour, sliding in; `<div id="lower" hidden>` above the scorebug's left end.

- [ ] **Step 1: tests** (`tests/director.test.js`): a banner shows for 2.6 s and goes; 'deep' while 'andOne' shows does not replace it; 'buzzer' does; '{n}-0 RUN' is filled (`'12-0 RUN'`); each lower third's lines from a state built by hand; the newest lower third replaces; `celebrate`/`dejected` ids and their time; nothing is shown before or after a match (`phase` 'start', 'final'). `tests/motion.test.js`: the celebrating player's arms; with facts lacking `celebrate`, `handUp`; a celebrating player who has the ball dribbles. `tests/life.test.js`: a home moment raises the home cheer; an away one sets `groan`.
- [ ] **Step 2:** run; expected: fail.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npm test`; expected: all pass.
- [ ] **Step 5:** browser pane at 1366×768: a banner, a lower third and a caption together do not overlap the scorebug, the tags or each other; keep `dist/banner.jpg`.
- [ ] **Step 6:** commit `feat: banners, lower thirds and a celebration for big moments`.

### Task 13: Panels and the box score

**Files:** Modify `src/broadcast/director.js`, `src/render/hud.js`, `index.html`, `src/pause.js`, `src/main.js`, `tests/director.test.js`, `tests/hud.test.js`, `tests/pause.test.js`.

**Produces:**

```js
// director.js
export function panelFor(director, state, now) → 'lineups' | 'period' | 'half' | null;
export const skipPanel = director => void;
// hud.js
export const boxRow = (state, team, row) => string[];   // [name, pts, 'fgm/fga', 'tpm/tpa', 'ftm/fta', reb, ast, stl, blk, tov, fouls]
export const lineupRow = (state, team, slot) => string; // 'PG · Jalen Cross ★ · Playmaker · 88'
export const periodLines = state => string[];           // the score by period, and each team's leading scorer
export const halfLines = state => [label, a, b][];      // 'Field goals' '12/27 (44%)' ... 'Threes', 'Rebounds', 'Turnovers'
export const potgLine = state => string;                // 'PLAYER OF THE GAME · Kai Mercer · 24 PTS · 6 REB · 5 AST'
```

- **Line-ups:** when a match starts (`phase` becomes 'jumpBall' from 'start' or 'final'), for `SHOW.lineups` of real time; while it is up `src/main.js` does not step the match. Any key skips it; the keys held then are dropped (Review focus 3).
- **Period and half-time:** shown while `phase === 'quarterEnd'` (half-time's after the second period); they do not hold the match, which waits there by its own rules.
- **Final:** the final screen gains `potgLine` and the box score of both teams (starters first, then the bench, then the team's totals).
- **Pause:** `PAUSE.main` becomes `['resume', 'subs', 'box', 'controls', 'settings', 'quit']`; the `box` panel shows the same table; Escape goes back.
- Pausing or quitting while the line-ups are up ends them (Review focus 5).

- [ ] **Step 1: tests:** `panelFor` through a match's phases; a skip; the match is not stepped during line-ups and is after; `boxRow` for a line built by hand; `halfLines` percentages (`0/0` shows `0/0 (0%)`); `potgLine` names `playerOfGame`; the pause list's new row and panel, and that the rows after it still work by name; quitting during line-ups leaves `panelFor` null.
- [ ] **Step 2:** run; expected: fail.
- [ ] **Step 3:** implement, page markup and CSS included (tables with `font-variant-numeric: tabular-nums`).
- [ ] **Step 4:** `npm test`; expected: all pass.
- [ ] **Step 5:** browser pane, 1366×768 and desktop: line-ups, a period panel, half-time, final with box score, the pause box score; five a side fits. Keep `dist/panel-*.jpg`.
- [ ] **Step 6:** commit `feat: line-ups, period and half-time panels, a player of the game and a box score`.

### Task 14: Stage 2 out

- [ ] **Step 1:** measure (Global constraints); expected: the same numbers as after Task 6, since Stage 2 only watches. Ledger them.
- [ ] **Step 2:** `npm test`; `npm run single`; open the file from disk: no console error; a caption, a banner and the final box score seen.
- [ ] **Step 3:** SendUserFile, caption: stage 2 of 4. Ledger line; go on.

---

# Stage 3: replays

### Task 15: Replays

**Files:** Create `src/replay.js`, `tests/replay.test.js`. Modify `src/render/scene.js`, `src/render/actors.js`, `src/render/hud.js`, `index.html`, `src/menu.js`, `src/pause.js`, `src/main.js`.

**Produces:**

```js
export const REPLAY = { keep: 8, before: 4, after: 1, speed: 0.5, apart: 20 };
export const createRecorder = () => ({ frames: [], held: null, shown: -Infinity, playing: null });
export function record(rec, state) → void;      // one frame a step: structuredClone(state); frames older than `keep` are dropped
export function hold(rec, moment) → void;       // sets aside the frames from moment.at − before to moment.at + after for a star
                                                // moment; called every step until `after` has passed; a bigger moment replaces
export const stopped = state => boolean;        // phase 'dead', 'inbound', 'freeThrow' (not live), 'quarterEnd' or 'final'
export function due(rec, state) → boolean;      // something held, play stopped, and (apart seconds since the last, or it is a
                                                // buzzer-beater or a game-winner)
export function start(rec, state) → void;       // playing = { frames, at: 0 }; shown = state.time; held = null
export function frameAt(rec, dt) → state | null; // advances by dt × speed of real time; null when it has ended (playing = null)
export const skip = rec => void;
```

`structuredClone` of the whole state is the shortcut here: `// shortcut: clones the whole match state 60 times a second (about 10 KB each); if a Chromebook stutters, clone only what the renderer reads.`

`src/main.js`: after each step `record`, and `hold` for the biggest star moment of the last second. When `prefs.replays` and `due(...)`, `start`. While `rec.playing`: the match is not stepped; the frame from `frameAt` is drawn (`actors.sync(frame, dt × speed, null)`, `view.follow`, the scorebug shows the frame's clock and score); `view.setCamera('replay', sign)` puts the camera 1.6 m up, 1.5 m in front of the baseline of the hoop attacked and 5.5 m to the side the ball is on, looking at the ball; a `REPLAY` mark shows. Any keydown calls `skip` and is dropped. When it ends: the camera returns to `game.camera`, `actors.cut()` forgets what the last frame looked like (so the jump back is not read as catches and releases), and play goes on. Pausing, quitting, or the window losing focus calls `skip` first (Review focus 5). The line-ups panel and a replay never show together: the panel waits.

Settings row `'replays'` in both menus after `'commentary'`: `Replays: On` / `Off`. Saved.

- [ ] **Step 1: tests** (`tests/replay.test.js`): after 10 s of steps `frames` spans 8 s (±1 frame); `hold` for a moment at t sets aside 5 s of frames ending 1 s after it, and at a stop 0.4 s after the moment sets aside what there is; `due` false while live, true at 'dead', false within 20 s of the last, true within 20 s for 'buzzer'; `frameAt` at half speed returns the recorded frames in order, each a deep copy equal to the state at that step, and null after 10 s of real time for 5 s of frames; `skip` ends it; a bigger moment replaces a held smaller one and not the reverse. **The match is untouched:** two matches from one seed, one recorded, held and replayed at every chance, one not: `JSON.stringify` of the two states is equal every 600 steps through a whole computer match. `tests/menu.test.js`/`pause.test.js`/`hud.test.js`: the row.
- [ ] **Step 2:** run; expected: fail.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npm test`; expected: all pass.
- [ ] **Step 5:** browser pane: force a block (`game.state` by hand), see the replay start at the next stop, its camera, the mark, a key skipping it, and the players standing right afterwards; then pause during one. Keep `dist/replay.jpg`. Time five a side on High with recording on in Firefox with the bench (`bench/run.sh`): ledger the frame rate against 122.
- [ ] **Step 6:** commit `feat: replays after the biggest moments`.

### Task 16: Stage 3 out

- [ ] `npm test`; `npm run single`; open from disk, no console error; SendUserFile, caption: stage 3 of 4; ledger; go on.

---

# Stage 4: sound

### Task 17: The recordings

**Files:** Create `tools/sound/cuts.json`, `tools/sound/build.mjs`, `assets/sounds/*.ogg`, `tests/sounds.test.js`. Modify `.gitignore` (`assets/source/sounds/`), `assets/CREDITS.md`, `src/render/assets.js`, `tests/single-file.test.js`.

**The sixteen files, and nothing else.** Each page states CC0. Saved in `assets/source/sounds/` (not committed), each in a call of its own with `curl -L --fail -o`.

| # | Save as | Recording | Page | Download | Size |
|---|---|---|---|---|---|
| 1 | `squeak.ogg` | Gnashing basketball (shoes squeaking, indoors), ThibaudVaerman | bigsoundbank.com/gnashing-basketball-s0938.html | its OGG | 336 KB |
| 2 | `horn.ogg` | Horn #5 | bigsoundbank.com/horn-5-s2524.html | its OGG | 70 KB |
| 3 | `buzzer.ogg` | Low frequency continuous buzzer | bigsoundbank.com/low-frequency-continuous-buzzer-s0593.html | its OGG | 130 KB |
| 4 | `murmur.ogg` | Crowd of 50-60 people #1 | bigsoundbank.com/crowd-of-50-60-people-1-s3515.html | its OGG | 1.6 MB |
| 5 | `applause.ogg` | Applause 600 people | bigsoundbank.com/applause-600-people-s0021.html | its OGG | 933 KB |
| 6 | `yeah.ogg` | Shouts and applauses of teens #1 | bigsoundbank.com/shouts-and-applauses-of-teens-1-s0236.html | its OGG | 137 KB |
| 7 | `whistle.wav` | Referee whistle blow, gymnasium, SpliceSound | commons.wikimedia.org/wiki/File:218318_splicesound_referee-whistle-blow-gymnasium.wav | the original file | 477 KB |
| 8 | `bounce.mp3` | Basketball bounce, cribbler (5.6 s) | freesound.org/people/cribbler/sounds/396309/ | its preview | about 90 KB (original 1.6 MB) |
| 9 | `drop.mp3` | ball basketball drop, shakaharu (16.2 s) | freesound.org/people/shakaharu/sounds/88498/ | its preview | about 260 KB (8.9 MB) |
| 10 | `net.mp3` | Basketball Net Swish Sound, Hann90 (6.0 s) | freesound.org/people/Hann90/sounds/518048/ | its preview | about 96 KB (1.5 MB) |
| 11 | `hoop.mp3` | basketball through hoop, 21100495 (11.6 s) | freesound.org/people/21100495/sounds/655323/ | its preview | about 186 KB (3.2 MB) |
| 12 | `rim.mp3` | basketball (a ball hitting a rim), reedhos (7.3 s) | freesound.org/people/reedhos/sounds/244348/ | its preview | about 118 KB (633 KB) |
| 13 | `board.mp3` | Basketball backboard, PerMagnusLindborg (0.6 s) | freesound.org/people/PerMagnusLindborg/sounds/324247/ | its preview | about 10 KB (174 KB) |
| 14 | `boo.mp3` | Crowd Sport 01 - Booing, Julien_Matthey (16.4 s) | freesound.org/people/Julien_Matthey/sounds/557189/ | its preview | about 263 KB (9.0 MB) |
| 15 | `groan.mp3` | crowd oh, disappointed, mrrap4food (5.0 s) | freesound.org/people/mrrap4food/sounds/619007/ | its preview | about 80 KB (82 KB) |
| 16 | `gasp.mp3` | small crowd gasp shock surprise, HowardV (8.6 s) | freesound.org/people/HowardV/sounds/264376/ | its preview | about 138 KB (1.6 MB) |

About 4.9 MB in all. "Its preview" is the `-hq.mp3` file the Freesound page itself plays to everyone; the original needs an account. If the owner has put an original in `assets/source/sounds/` under the same name with its own extension, that is used and nothing is fetched for it. Two recordings of real basketball crowds on Freesound were left out on purpose: a real game may carry an announcer or music, and I cannot listen to check.

**The cuts.** `tools/sound/cuts.json` is a list of `{ out, src, start, end, gain, fadeIn, fadeOut, loop }`; `node tools/sound/build.mjs` runs ffmpeg once for each: mono, 44.1 kHz, `libvorbis -q:a 3`, loudness evened with the entry's `gain`, written to `assets/sounds/<out>.ogg`. The outputs: `bounce1..3`, `rim1..2`, `board`, `net`, `swish`, `squeak1..3`, `catch` (the quietest bounce take, 0.12 s), `whistle`, `whistleLong`, `horn`, `buzzer`, `murmur` (a 30 s loop whose ends cross-fade), `cheer` (yeah), `cheerBig` (yeah over applause, 5 s), `groan`, `gasp`, `boo` (6 s), `distract` (a 6 s loop of the boo, lower). Start and end times come from `ffmpeg -af silencedetect` and `astats` on each source: each single hit from its onset to 0.25 s after it falls below −40 dB. I cannot hear them; the owner's ears are the check.

`SOUNDS` in `src/render/assets.js` is the list of output names; `ASSETS` gains `assets/sounds/<name>.ogg` for each, so `npm run single` packs them.

- [ ] **Step 1:** fetch the sixteen, one call each; after each: `ffprobe` its duration against the table (±0.3 s) and that it decodes. One that fails either check: stop and ask.
- [ ] **Step 2: tests** (`tests/sounds.test.js`): every name in `SOUNDS` has a file in `assets/sounds/`; each starts with `OggS`; each one-shot is under 60 KB and each loop under 400 KB; the folder is under 1.6 MB; `cuts.json` names only the sixteen sources and every output once. `tests/single-file.test.js`: the built file holds every sound.
- [ ] **Step 3:** run; expected: fail (no files).
- [ ] **Step 4:** write `cuts.json` from the measurements and `build.mjs`; run it; expected: 23 files written.
- [ ] **Step 5:** `npm test`; expected: all pass.
- [ ] **Step 6:** `assets/CREDITS.md`: a section "Sounds (all CC0)" with a row for each of the sixteen: recording, author, page, what it is used for; and the line that Freesound's were taken as the page's preview file.
- [ ] **Step 7:** commit `feat: sixteen CC0 recordings, cut into the game's sounds` (the `.ogg` files, the tool, the credits; not `assets/source/sounds/`).

### Task 18: Hearing the match

**Files:** Create `src/audio/cues.js`, `src/audio/player.js`, `tests/cues.test.js`, `tests/player.test.js`. Modify `src/menu.js`, `src/pause.js`, `src/render/hud.js`, `src/main.js`.

**Produces:**

```js
// cues.js: what should sound, from the match alone. No Web Audio here.
export const CUE = { squeakAt: 14, squeakFrom: 3, squeakApart: 0.25, bounceQuiet: 0.25, bed: 0.3, bedClose: 0.3, bedLeft: 0.2 };
export const createEars = () => ears;
// One step of listening. Returns { shots: [{ name, gain, rate }], bed: 0..1, distract: 0..1 }.
export function hear(ears, state, events, heard, life) → cues;
// player.js
export const LEVELS = { full: 1, quiet: 0.4, off: 0 };
export const nextSound = now => string;         // full → quiet → off → full
export function createPlayer(Context = globalThis.AudioContext ?? globalThis.webkitAudioContext)
  → { ready: boolean, load(urls) → Promise, wake(), play(name, gain, rate), bed(gain), distract(gain), level(name) };
```

What `hear` returns, each once for its event:

- `bounce1..3` (in turn): `events.hitFloor` with `gain` from the ball's speed down (clamped 0.25 to 1); and each bounce of a dribble (the dribble's `|sin|` in `carryBall` passing through zero), at 0.7.
- `rim1..2` on `events.hitRim`, `board` on `events.hitBoard`, at most one each per 0.1 s.
- `swish` on a basket whose flight touched neither (the ears note rim and board since the release); `net` on any other basket.
- `squeak1..3`: a player on the floor above `squeakFrom` m/s whose velocity changed by more than `squeakAt` m/s² in the step; every dribble move's start; a stumble. At most one per player per `squeakApart`, gain 0.5.
- `catch`: a pass caught (holder changes while `ball.mode` was 'pass').
- `whistle` on a new `state.call`; `whistleLong` and `horn` at a period's end; `buzzer` on a shot-clock violation.
- `cheer` on a home basket, `cheerBig` on a home moment; `groan` on a visitors' basket; `gasp` on a visitors' moment or a block either way; `boo` when `life.boo` rises from 0.
- `bed = CUE.bed + CUE.bedClose × closeness × lateness − CUE.bedLeft × life.left`, where closeness is `1 − min(1, |margin| / 12)` and lateness the share of the match played; `distract = life.distract > 0 ? 0.6 : 0`.

`rate` varies each one-shot's pitch by ±6%, from a counter, not from the match's dice.

The player: one `AudioContext`; buffers decoded from `assetUrl('assets/sounds/<name>.ogg')`; one-shots through a gain node; the two loops on their own gain nodes, eased over 0.5 s; a master gain set by the level. `wake()` resumes the context and is called on the first keydown and the first click. Without `AudioContext`, or if loading fails, `ready` is false and every method does nothing. Pausing eases the master to 0; a replay plays no one-shots.

Settings row `'sound'` in both menus after `'replays'`: `Sound: Full` / `Quiet` / `Off`. Saved. The settings rows are then: start menu `quality, autoSubs, camera, difficulty, quarter, commentary, replays, sound, keys` (nine); pause the same without `quarter` (eight).

- [ ] **Step 1: tests** (`tests/cues.test.js`): each bullet above as a scene: the cue is returned in the step of its event and not in the next; three floor hits give `bounce1, bounce2, bounce3`; a dribbling handler gives a bounce every `1 / PLAYER.dribbleRate` s; a made shot that touched the rim gives `net`, one that touched nothing `swish`; a sprinting player stopped dead squeaks once, not every step; a tied game in the last minute has a louder bed than a 20-point game in the first, and a crowd that has left a quieter one; `hear` changes nothing in the state (JSON equal) and draws no random number (`state.seed` equal). `tests/player.test.js` with a fake context (records created nodes and gain values): `play` before `load` does nothing; `level('off')` sets the master to 0; `level('quiet')` to 0.4; with `Context` undefined nothing throws and `ready` is false; `nextSound` cycles. Menus and hud: the row.
- [ ] **Step 2:** run; expected: fail.
- [ ] **Step 3:** implement; wire in `src/main.js`: `hear` every step, its one-shots played after the frame's steps (the same name at most once a frame), the loops set every frame.
- [ ] **Step 4:** `npm test`; expected: all pass.
- [ ] **Step 5:** browser pane: no console error; after a key press `player.ready` is true and the context's state is 'running'; a computer-only half minute logs the names played (a temporary `console.debug`, removed after): bounces, a net or rim, squeaks, a whistle or the horn all appear.
- [ ] **Step 6:** commit `feat: the match is heard: the ball, the rim, shoes, whistles and the crowd`.

### Task 19: Stage 4 out, and the whole branch read again

- [ ] **Step 1:** `npm test`; `npm run single`; `ls -l dist/triple-threat.html` (expected about 36 MB); open from disk: no console error, sound after a key press, a setting survives a reload.
- [ ] **Step 2:** measure once more (Global constraints); ledger.
- [ ] **Step 3:** read the whole branch's diff against the spec, section by section, and the five Review focus lines; fix what is wrong with a failing test first. This is a self-review by the author; say so in the last message.
- [ ] **Step 4:** SendUserFile, caption: stage 4 of 4.
- [ ] **Step 5:** the last message: what was built, every `Ruling:` from the ledger with its cost if wrong, what was not checked (not heard, not played by hand, the Chromebook, the voice there), and that nothing is merged.

# Graphics Pass 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, as the session model: the owner asked for no subagents on other models (2026-11-13). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The court, the hall around it and the light look far better: four quality levels, an arena environment and filmic tone mapping, a scanned wood floor, stands with a crowd, post-processing, and mirror reflections on the floor.

**Architecture:** The current renderer is upgraded in place. `src/render/quality.js` holds the four levels and the game's own choice as plain logic. `src/render/scene.js` hands the light, the floor, the arena and the post-processing chain to four new modules, each told the level when it changes. Where seats and boards stand is plain logic in `src/render/layout.js`, tested in Node. Nothing under `src/sim/` changes.

**Tech Stack:** Three.js 0.187 (`three/webgpu`: `WebGPURenderer` with its WebGL 2 fallback, `PostProcessing`, `PMREMGenerator`; `three/tsl`: `pass`, `mrt`, `reflector`; `three/addons/tsl/display`: `ao`, `bloom`, `fxaa`, `smaa`), Node's test runner, `npm run single`.

**Spec:** `docs/superpowers/specs/2026-11-13-graphics-pass-1-design.md`

## Global Constraints

- Branch `feat/graphics-pass-1`. Never push. Merge only on the owner's word.
- Every commit ends with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Stage by path.
- Nothing under `src/sim/` changes. The renderer only reads the match.
- One self-contained HTML file; no size cap; report its size after every task.
- Everything works on WebGPU and on WebGL 2. An effect that fails on WebGL 2 is left off there, and the owner is told which.
- Assets are CC0 and listed in `assets/CREDITS.md`. The only download is the three "Wood Floor" files from Poly Haven. No real brand, team, league or person in the arena.
- If the players' files or the floor's files fail to load, the game still plays (capsules; today's painted floor).
- Test first wherever Node can reach. After every task: `npm test`, `npm run single`, a picture from the game camera at 1366 by 768, and the build sent to the owner.
- Before reading a Three.js API from memory, read it in `node_modules/three` (source and `examples/jsm`).

## Review Focus

1. **A missing or broken floor file:** the game must start on today's painted floor, not on a black or untextured one. Checked in Task 3 by renaming a file and loading the page.
2. **Changing level again and again** (G held, Settings): no error, no growth in memory, the same picture for the same level. Checked in Tasks 1, 5 and 6 by stepping round the four levels twenty times and reading `renderer.info`.
3. **Resizing the window:** the post-processing buffers and the mirror follow the new size. Checked in Tasks 5 and 6 at 1366 by 768, 800 by 600 and a narrow tall window.
4. **The camera's view:** nothing of the arena between any camera position and any point of the court. Test in Task 4.
5. **The start, pause and final screens:** the scene behind them still draws with every effect and costs no more than play. Checked in Task 7.

---

### Task 1: Four quality levels

**Files:**
- Modify: `src/render/quality.js`, `src/main.js`, `src/render/people.js` (`atEachLevel`, `setQuality`), `src/render/scene.js` (`setQuality`), `tests/quality.test.js`

**Interfaces (produced):**
- `QUALITY.order = ['low', 'medium', 'high', 'ultra']`, and for each level `{ label, pixelRatio, shadow, soft, textures, floor, crowd, aa, ao, bloom, mirror }` with exactly these values:

| | low | medium | high | ultra |
|---|---|---|---|---|
| label | Low | Medium | High | Ultra |
| pixelRatio | 0.75 | 1 | 2 | 2 |
| shadow | 1024 | 1024 | 2048 | 4096 |
| soft | false | true | true | true |
| textures | 0.5 | 0.5 | 1 | 1 |
| floor | 1024 | 1024 | 2048 | 2048 |
| crowd | 0.15 | 0.5 | 1 | 1 |
| aa | 'none' | 'fxaa' | 'smaa' | 'smaa' |
| ao | false | false | true | true |
| bloom | false | false | true | true |
| mirror | 0 | 0 | 0.5 | 1 |

- `QUALITY.autoAfter = 3`, `autoBelow = 40`, `longest = 100`, as now.
- `createQuality() -> { level: 'high', seconds: 0, frames: 0, settled: false }`, as now.
- `autoQuality(q, ms, playing) -> boolean`: as now, but a slow measurement steps down ONE level and starts measuring again; it settles when a measurement is fast enough or the level reaches Low. It never steps up.
- `stepQuality(q)` replaces `toggleQuality`: the next level in `QUALITY.order`, wrapping from Ultra to Low; settles.

- [ ] **Step 1: Write the failing tests.** In `tests/quality.test.js` (the helper `play(q, ms, seconds, playing)` is already there): replace the first test with one asserting the table above cell by cell, `QUALITY.order`, and that `QUALITY` and every level are frozen. Change every `toggleQuality` to `stepQuality`. Change the tests that expect one slow measurement to end on Low to expect Medium. Add:

```js
test('the game steps down one level at a time: two slow measurements end on Low, and it never climbs', () => {
  const q = createQuality();
  assert.equal(play(q, 40, 3.1), 1);                       // 25 frames a second
  assert.deepEqual([q.level, q.settled], ['medium', false]);
  assert.equal(play(q, 40, 3.1), 1);
  assert.deepEqual([q.level, q.settled], ['low', true]);
  assert.equal(play(q, 5, 10), 0);                         // fast now, and it stays on Low
  assert.equal(q.level, 'low');
});

test('one slow measurement then a fast one settles on Medium', () => {
  const q = createQuality();
  play(q, 40, 3.1);
  assert.equal(play(q, 16, 3.1), 0);
  assert.deepEqual([q.level, q.settled], ['medium', true]);
  assert.equal(play(q, 40, 10), 0);                        // settled: a slow spell later changes nothing
});

test('G steps Low, Medium, High, Ultra and round again, and only G reaches Ultra', () => {
  const q = createQuality(), seen = [];
  for (let i = 0; i < 5; i++) { stepQuality(q); seen.push(q.level); }
  assert.deepEqual(seen, ['ultra', 'low', 'medium', 'high', 'ultra']);
  assert.equal(q.settled, true);
  assert.equal(play(q, 40, 10), 0);
});
```

- [ ] **Step 2:** `node --test tests/quality.test.js` — expected: FAIL (`stepQuality` is not exported).
- [ ] **Step 3: Implement.** `main.js` uses `stepQuality` for `G` and for both menus' `'quality'`. `people.js` makes each picture once per distinct `textures` value and gives every level its picture. `scene.js` `setQuality` reads `pixelRatio` and `shadow` of any of the four.
- [ ] **Step 4:** `npm test` — expected: all PASS (the hud tests' `Quality: High` and `Quality: Low` rows still hold).
- [ ] **Step 5: By eye** at `http://127.0.0.1:5173/`: G steps the corner label Low, Medium, High, Ultra; both Settings rows show the same; twenty steps round give no console error.
- [ ] **Step 6: Commit** `feat: four quality levels, chosen by the game one step at a time or by G`, then `npm run single` and send the build.

---

### Task 2: Light, tone mapping and materials

**Files:**
- Create: `src/render/light.js`
- Modify: `src/render/scene.js` (lights out of it; hoop materials), `src/render/actors.js` (the ball)

**Interfaces (produced):**
- `createLight(renderer, scene) -> { setQuality(level) }`: builds a hidden scene of bright panels over a dark bowl, turns it into `scene.environment` with `PMREMGenerator` after `renderer.init()`, adds the one shadow-casting key light, and sets filmic tone mapping and exposure. `setQuality` sets the shadow map's size and whether it is soft.
- The ball's colour (with seams) and its pebbled bumps are painted on canvases at start-up.
- Rim: metal. Backboards: glass with white markings. Supports: padded.

- [ ] **Step 1: Implement.** There is no Node test for this task: nothing in it is plain logic. Keep the court about as bright as it is now (compare a screenshot before and after) with nothing bleached white.
- [ ] **Step 2:** `npm test` — expected: all PASS.
- [ ] **Step 3: By eye,** at both ends of the court, on Low and on High: the ball, rim and glass show the arena's lights; players are lit from above with a soft shadow at Medium and above and a hard one on Low; skin and kits are not washed out; the capsule fallback (rename `assets/players.glb` for one load, then put it back) is lit the same way; no console error.
- [ ] **Step 4: Commit** `feat: the arena's own light, filmic tone mapping and physically based hoops and ball`, build, picture, send.

---

### Task 3: The floor's wood

**Files:**
- Create: `assets/floor/wood_floor_diff_2k.jpg`, `assets/floor/wood_floor_nor_gl_2k.jpg`, `assets/floor/wood_floor_rough_2k.jpg` (downloaded), `src/render/floor.js`
- Modify: `src/render/assets.js` (`ASSETS`), `assets/CREDITS.md`, `src/render/scene.js`, `tests/assets.test.js`, `tests/single-file.test.js`

**Interfaces (produced):**
- `ASSETS` gains the three paths, after the three it has.
- `createFloor(scene) -> Promise<{ setQuality(level) }>`: the hall's floor in the scanned wood, repeated every 1.7 m, with the court's paint (lines, key, circles, run-off) as a layer over it. The 1k pictures for Low and Medium are made from the 2k files at load. If a floor file fails to load it resolves to today's painted floor and warns in the console.

- [ ] **Step 1: Download** the three files from Poly Haven's file API (`https://api.polyhaven.com/files/wood_floor` gives the URLs) into `assets/floor/`, and check each is a JPEG of the size the spec states.
- [ ] **Step 2: Write the failing tests.** `tests/assets.test.js`: `ASSETS` is the six paths in order; `assets/CREDITS.md` names each of the three files, "Poly Haven", "Dimitrios Savva" and "CC0". `tests/single-file.test.js`: the pack test's expected keys are the six paths, and a floor file is embedded byte for byte.
- [ ] **Step 3:** `npm test` — expected: those FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5:** `npm test` — expected: all PASS.
- [ ] **Step 6: By eye:** planks run along the court's length and read as wood from the game camera, not as noise or stripes; the lines are crisp; the gloss catches the arena's lights; Low and Medium look softer, not broken. Rename one floor file for one load: the game starts on the painted floor with a console warning (Review Focus 1). Put it back.
- [ ] **Step 7: Commit** `feat: a scanned wood floor under the court's paint`, build (report the new size), picture, send.

---

### Task 4: The arena

**Files:**
- Create: `src/render/layout.js`, `src/render/arena.js`, `tests/layout.test.js`
- Modify: `src/render/scene.js`, `src/main.js` (the scoreboard is told the match each frame)

**Interfaces (produced), in `src/render/layout.js` (plain logic):**
- `ARENA`: the frozen numbers of the hall: the clear floor round the court (`clearX: 16.5`, `clearZ: 9.6`: nothing stands nearer the middle than this), each stand's first row, row depth and rise, how many rows, and the camera's places (`camera: { height: 11, back: 18, maxX: 9 }`, the same numbers as `scene.js`'s `CAMERA`, which now reads them from here).
- `seats() -> [{ x, y, z, facing }]`: every seat, the same list every time; `y` is the seat's height, `facing` the angle its occupant faces.
- `shown(seats, share) -> seats`: the first `Math.round(seats.length * share)` seats in a fixed shuffled order (seeded, so the same seats every time, and a smaller share is always a subset of a larger one).
- `boards() -> [{ x, y, z, width, height, facing, words }]`: the ad boards, the scorer's table and the hanging scoreboard's faces. Words are from `['TRIPLE THREAT', 'HARBOR CITY WAVES', 'RED ROCK SCORPIONS']` only.
- `blocks(box, from, to) -> boolean`: does the straight line from `from` to `to` pass through the axis-aligned `box`?
- `scoreLines(state) -> { home, away, period }`: `'WAV 28'`, `'SCO 26'`, `'3RD'`.

**In `src/render/arena.js`:** `createArena(scene) -> { setQuality(level), show(state) }`: the stands as stepped tiers, the crowd as two instanced meshes (bodies in varied colours, heads) whose count follows `QUALITY[level].crowd`, the boards with their words painted on lit canvases, the table, the hanging scoreboard repainted only when `scoreLines` changes, the dark upper level and the visible light panels.

- [ ] **Step 1: Write the failing tests** (`tests/layout.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, seats, shown, boards, blocks, scoreLines } from '../src/render/layout.js';
import { QUALITY } from '../src/render/quality.js';
import { COURT } from '../src/sim/tuning.js';
import { createMatch } from '../src/sim/state.js';

const HEAD = 1.3;   // metres from a seat up to the top of a seated head
// The space a seated person takes up.
const body = s => ({ min: { x: s.x - 0.3, y: s.y, z: s.z - 0.3 }, max: { x: s.x + 0.3, y: s.y + HEAD, z: s.z + 0.3 } });
const cameras = [-ARENA.camera.maxX, 0, ARENA.camera.maxX].map(x => ({ x, y: ARENA.camera.height, z: ARENA.camera.back }));
// Points of the court the camera must always see: the floor's corners and edges, and a ball six metres up over each hoop.
const sights = [];
for (const x of [-COURT.halfLength, -7, 0, 7, COURT.halfLength]) for (const z of [-COURT.halfWidth, 0, COURT.halfWidth]) sights.push({ x, y: 0, z }, { x, y: 2, z });
sights.push({ x: 12.4, y: 6, z: 0 }, { x: -12.4, y: 6, z: 0 });

test('there are between one and four thousand seats, the same every time, on all four sides', () => {
  const all = seats();
  assert.ok(all.length >= 1000 && all.length <= 4000, `${all.length} seats`);
  assert.deepEqual(seats(), all);
  for (const side of [s => s.z < -ARENA.clearZ, s => s.z > ARENA.clearZ, s => s.x < -ARENA.clearX, s => s.x > ARENA.clearX])
    assert.ok(all.filter(side).length >= 100);
});

test('no seat, board or table stands on the court or its run-off', () => {
  for (const s of seats()) assert.ok(Math.abs(s.x) >= ARENA.clearX || Math.abs(s.z) >= ARENA.clearZ, JSON.stringify(s));
  for (const b of boards().filter(b => b.y < 6))            // the hanging scoreboard is overhead
    assert.ok(Math.abs(b.x) >= COURT.halfLength + 0.5 || Math.abs(b.z) >= COURT.halfWidth + 0.5, JSON.stringify(b));
});

test('nothing in the arena comes between the camera and the court, wherever the camera is', () => {
  const things = [...seats().map(body),
    ...boards().map(b => ({ min: { x: b.x - b.width / 2, y: b.y - b.height / 2, z: b.z - b.width / 2 }, max: { x: b.x + b.width / 2, y: b.y + b.height / 2, z: b.z + b.width / 2 } }))];
  for (const from of cameras) for (const to of sights) for (const box of things)
    assert.ok(!blocks(box, from, to), `the view from ${JSON.stringify(from)} to ${JSON.stringify(to)} is blocked by ${JSON.stringify(box)}`);
});

test('a line through a box is blocked, one past it is not', () => {
  const box = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } };
  assert.equal(blocks(box, { x: -5, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }), true);
  assert.equal(blocks(box, { x: -5, y: 3, z: 0 }, { x: 5, y: 3, z: 0 }), false);
  assert.equal(blocks(box, { x: -5, y: 1, z: 0 }, { x: -2, y: 1, z: 0 }), false);          // it stops short
});

test('each quality level shows its share of the crowd, always the same people, and a fuller crowd keeps the thinner one', () => {
  const all = seats();
  const at = level => shown(all, QUALITY[level].crowd);
  assert.deepEqual(QUALITY.order.map(level => at(level).length), [0.15, 0.5, 1, 1].map(share => Math.round(all.length * share)));
  assert.deepEqual(at('low'), at('low'));
  const medium = new Set(at('medium'));
  assert.ok(at('low').every(seat => medium.has(seat)));
  for (const side of [s => s.z < -ARENA.clearZ, s => s.x > ARENA.clearX]) assert.ok(at('low').filter(side).length >= 10);   // thin, not empty
});

test('the boards carry only the game\'s own words, and the scoreboard says the score and the period', () => {
  for (const b of boards()) assert.ok(['TRIPLE THREAT', 'HARBOR CITY WAVES', 'RED ROCK SCORPIONS', ''].includes(b.words), b.words);
  const s = createMatch(); s.score = [28, 26]; s.quarter = 3;
  assert.deepEqual(scoreLines(s), { home: 'WAV 28', away: 'SCO 26', period: '3RD' });
});
```

- [ ] **Step 2:** `node --test tests/layout.test.js` — expected: FAIL (`src/render/layout.js` does not exist).
- [ ] **Step 3: Implement** `layout.js`, then `arena.js`. From the game camera only the first rows of the far stands and the ends are in frame, so that is where detail goes; the rest is seen in the floor's mirror and by pass 2's cameras.
- [ ] **Step 4:** `npm test` — expected: all PASS.
- [ ] **Step 5: By eye,** at both ends and centre court, at each level: the far stands and the ends read as a crowd, thinner on Low and Medium; boards are lit and legible; nothing floats, flickers or z-fights; nothing covers the court; the frame rate on this machine at High is not lower than before by more than a tenth.
- [ ] **Step 6: Commit** `feat: stands, a crowd, lit boards, a scorer's table and a hanging scoreboard`, build, picture, send.

---

### Task 5: Post-processing

**Files:**
- Create: `src/render/post.js`
- Modify: `src/render/scene.js` (`render` goes through it)

**Interfaces (produced):**
- `createPost(renderer, scene, camera) -> { render(), setQuality(level), missing }`: Low draws straight to the screen. Medium adds FXAA. High and Ultra add ambient occlusion, bloom and a vignette before SMAA. The chain is built once per change of level. An effect that throws on this backend is left out and named in `missing` (an array of words), and the corner label shows it (`· no ambient occlusion`).

- [ ] **Step 1: Implement,** reading `node_modules/three/examples/jsm/tsl/display/{GTAONode,BloomNode,FXAANode,SMAANode}.js` and a current example that uses `PostProcessing` with `mrt` first.
- [ ] **Step 2:** `npm test` — expected: all PASS (add a hud test for the corner label's `missing` words, seen failing first).
- [ ] **Step 3: By eye:** on High, soft contact shadow under feet, the rim and the stands; lights and boards glow, skin and the floor do not; edges are clean; Low is pixel for pixel what it was before this task; twenty steps round the levels leave `renderer.info.memory` where it started (Review Focus 2); resizing the window (Review Focus 3).
- [ ] **Step 4: Commit** `feat: ambient occlusion, bloom, a vignette and anti-aliasing, by quality level`, build, picture, send.

---

### Task 6: Floor reflections

**Files:**
- Modify: `src/render/floor.js`

**Interfaces (produced):**
- On High the floor mirrors the scene at half size, blurred; on Ultra at full size. Low and Medium have no mirror pass at all. The gloss map breaks the mirror along the planks; the paint mirrors a little less than the wood.

- [ ] **Step 1: Implement,** reading `node_modules/three/src/nodes/utils/ReflectorNode.js` and an example that uses `reflector` first.
- [ ] **Step 2:** `npm test` — expected: all PASS.
- [ ] **Step 3: By eye:** players, the ball, the hoops, the boards and the ceiling's lights are mirrored in the right place and upside down; the mirror does not show on Low or Medium and costs nothing there (`renderer.info.render.calls` is as in Task 5); the players' labels and the yellow ring are not doubled oddly; resizing and stepping levels (Review Focus 2 and 3). Measure the frame time on High with and without the mirror on this machine and tell the owner.
- [ ] **Step 4: Commit** `feat: the floor mirrors the game on High and Ultra`, build, picture, send.

---

### Task 7: Tuning, and the owner's play-test

**Files:** as the tuning needs; `assets/CREDITS.md` if anything was added.

- [ ] **Step 1:** At each level, at both ends and centre court, from the game camera at 1366 by 768: one picture each (twelve). Fix what looks wrong: exposure, bloom reach, crowd colours, board brightness, shadow softness. Each fix is a small commit.
- [ ] **Step 2:** The start, pause and final screens over the new scene (Review Focus 5): nothing shows through wrongly; the frame time on the start menu is no worse than in play.
- [ ] **Step 3:** `npm test`; `npm run single`; open the single file as the Chromebook does (served alone with the sandbox header, since the built-in browser refuses `file://`): it loads, plays, and makes one request.
- [ ] **Step 4:** Send the build and four pictures (one per level) and ask the owner:
  1. At home: does High hold 60 frames a second? Does Ultra? Does anything look wrong on WebGPU?
  2. On the Chromebook: which level does the game settle on, at what frame rate, and how long does the file take to open?
  3. What looks least like a real arena: the crowd, the light, the floor, the boards?
  4. Is the mirror on High worth its cost, or should only Ultra have it?

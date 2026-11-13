# Realistic Players, Stages 2 to 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The one approved player becomes ten distinct players in numbered team kits at two quality levels (stage 2), who dribble, hold, shoot, pass, catch, reach, contest and guard with the ball drawn in the hand (stage 3), filmed up close at free throws and the tip, and who walk to their spots at stoppages (stage 4).

**Architecture:** `tools/blender/` keeps building every file under `assets/` from `assets/source/people.json` and the Mixamo downloads. On the game side, `src/render/motion.js` stays the pure, Three-free place where the match is turned into "which motion, how strongly, how fast"; `src/render/animator.js` plays that on two layers (legs, and arms with torso); `people.js` owns the ten models and shows the six on court; `kit.js`, `quality.js` and `camera.js` are small pure modules with thin Three.js callers. The only change under `src/sim/` is walking to spots, in stage 4.

**Tech Stack:** as stage 1: Three.js 0.187 (`WebGPURenderer`, WebGL 2 fallback), plain ES modules, `node --test`, Blender 4.5.16 with MPFB 2.0.18 run without a window.

**Spec:** `docs/superpowers/specs/2026-11-12-realistic-players-design.md` ("Order of work" items 2, 3 and 4).

**Branch:** `feat/realistic-players`, continuing from stage 1.

**Stages and gates:** Tasks 1 to 6 are stage 2, Tasks 7 to 12 stage 3, Tasks 13 to 16 stage 4. Each stage ends with a rebuilt single file sent to the owner and the owner's play-test. The next stage starts only after the owner says so. What the owner reports may change later tasks; such changes are ledgered as rulings.

## Global Constraints

- Earlier constraints hold: nothing under `src/sim/` imports Three.js or touches the DOM; the only npm dependency is `three@0.187.0`; `npm test` passes before every commit; commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Never push; merge only when the owner says.
- Under `src/sim/` only walking to spots changes (Tasks 14 and 15). The models read the match; they never steer it.
- Choosing a motion is plain logic in `src/render/motion.js`, with no Three.js import, tested in Node.
- Render-side numbers live in one frozen object at the top of the module that uses them.
- Targets: 60 frames a second on this computer at High; 30 on the Chromebook at Low, as the owner reports; at most 20,000 triangles per player; single file at most 25 MB.
- Numbers the spec fixes: motions cross-fade in 0.15 s (`MOTION.fade`); the ball blends from hand to flight in 0.1 s; a defender is drawn facing his man within 4 m; camera moves take 0.6 s and never cut; quality drops to Low once if the first 3 s of play average under 40 frames a second; the corner label reads like `WebGPU · High · 60 fps`; a walk to a spot is cut short after 6 s; the usual stoppage pause is 1.5 s (`CLOCK.dead`).
- Not in this milestone: bench players are not drawn; faces and fingers do not animate beyond what a clip contains; no cloth, arena, sound, replays or names. Height and build are looks only.
- Assets: generator assets are CC0 only and each is listed in `assets/CREDITS.md`. Mixamo downloads, `.fbx`, `.blend` and pack zips stay out of the repository. No unclothed body geometry and no unused part of a skin picture is shipped; only dressed renders are shown to the owner.
- Blender: `blender-4.5 --background --python tools/blender/<script>.py -- --shots DIR`. Results are judged from the rendered pictures.
- Mixamo: Claude drives mixamo.com in the app's built-in browser; the owner only signs in if it is logged out. The character `MIXAMO-UPLOAD` is already in the account. Settings: FBX Binary, With Skin, 30 frames per second, no keyframe reduction, "In Place" unticked. A download lands as `~/Downloads/.org.chromium.Chromium.*` and is copied into `assets/source/mixamo/`.
- After any change the owner will play: `npm run single`, then send `dist/triple-threat.html`.

## Review Focus

Conditions the spec implies but does not spell out, most likely first. Each has a test or a stated check in the task named.

1. A substitution in the middle of a match: the incoming person's own model stands where the outgoing one stood, starts from a whole pose, and the outgoing model is no longer drawn. (Tasks 3 and 10)
2. The quality level changed again and again, by G or automatically, including while paused: the automatic choice happens at most once, never after G, and time on the start screen, paused or stalled does not count. (Task 5)
3. A one-off arm motion cut short by the next: a pass caught at once, a shooter who lands still holding the ball, a steal reach by a player who then gets the ball. The arms always show the newest thing and never a half pose. (Tasks 9 and 10)
4. A walk to a spot that cannot finish: another body stands on the spot or in the way, or the walker is the player the owner controls and keys are held. He is placed after 6 s, his keys do nothing, and play resumes. (Task 14)
5. A file that lacks something the tables name: a roster number with no model, or a motion missing from `motion.glb`. The game plays with capsules and one warning; it never freezes. (Tasks 3 and 10)

---

# Stage 2: the full teams

### Task 1: Ten people

**Files:**
- Modify: `assets/source/people.json`, `tools/blender/build_players.py`, `tests/models.test.js`, `assets/CREDITS.md`
- Rebuild: `assets/players.glb`

**Interfaces:**
- Consumes: `ROSTER.numbers` from `src/sim/tuning.js`: `[[4, 7, 11, 15, 23], [5, 8, 10, 21, 33]]`.
- Produces: `assets/players.glb` with ten roots `player-<team>-<number>`, each one mesh on its own copy of the 52-bone skeleton. A row of `people.json` is `{ team, number, height, build, skin, hair, hairColour, face }`; `hair` may be `null` (bald); `face: 0` means the generator's own face. The file holds one `jersey` and one `shorts` material, shared by all ten.

The table (row 0-4 is the approved player and must come out unchanged, so his `face` becomes 0):

| Team | No. | Height | Build | Skin | Hair | Hair colour | Face |
|---|---|---|---|---|---|---|---|
| 0 | 4 | 1.96 | athletic | young_african_male | short02 | #1d1a17 | 0 |
| 0 | 7 | 1.88 | slim | young_caucasian_male | short01 | #5a3a22 | 2 |
| 0 | 11 | 2.03 | strong | middleage_african_male | null | #000000 | 3 |
| 0 | 15 | 1.93 | athletic | young_asian_male | short03 | #111111 | 4 |
| 0 | 23 | 2.08 | strong | young_caucasian_male2 | short04 | #c9a050 | 5 |
| 1 | 5 | 1.85 | slim | young_asian_male | short02 | #151515 | 6 |
| 1 | 8 | 1.98 | athletic | middleage_caucasian_male | short01 | #3b2a1e | 7 |
| 1 | 10 | 2.01 | strong | young_african_male | afro01 | #17120f | 8 |
| 1 | 21 | 1.91 | athletic | middleage_asian_male | short04 | #222222 | 9 |
| 1 | 33 | 2.06 | strong | young_african_male | short03 | #1a1512 | 10 |

- [ ] **Step 1: Write the failing tests** (`tests/models.test.js`)

```js
import { statSync } from 'node:fs';
import { ROSTER } from '../src/sim/tuning.js';

test('the table has the ten people the rosters name, each one different', () => {
  for (const team of [0, 1]) assert.deepEqual(people.filter(p => p.team === team).map(p => p.number), [...ROSTER.numbers[team]]);
  for (const p of people) assert.ok(p.height >= 1.85 && p.height <= 2.08, `${rootName(p)}: ${p.height} m`);
  assert.equal(new Set(people.map(p => [p.skin, p.hair, p.hairColour, p.build, p.face].join())).size, 10);
});

test('the player file leaves room in the single file: under 9 MB', () => {
  assert.ok(statSync('assets/players.glb').size < 9e6, `${(statSync('assets/players.glb').size / 1e6).toFixed(1)} MB`);
});
```

Change `heightOf` so that `maxY` is the highest point of the primitive whose material name starts with `skin`, and tighten the height check to `< 0.03`: an afro or a bald head must not change how tall a player measures.

- [ ] **Step 2: Run them**

Run: `node --test tests/models.test.js`
Expected: the first new test FAILS (one row in the table).

- [ ] **Step 3: Fill in the table and extend `build_players.py`**

- `face_targets(seed) -> [(path, weight)]`: `[]` for 0. Otherwise list the `.target.gz` files under MPFB's `data/targets/` in `head`, `nose`, `chin`, `cheek`, `mouth`, `eyes` and `forehead`, sorted; group them by file name without its last `-word` (so `nose-hump-incr` and `nose-hump-decr` are one group); with `random.Random(seed)` pick 6 groups, one file from each, and a weight between 0.3 and 0.8. Apply each with `TargetService.load_target(body, path, weight=w)` in `make_body`, straight after `create_human` and before the skin, skeleton and fitted parts.
- Hair: no hair part when `row['hair']` is null. Otherwise the hair picture is recoloured: each pixel becomes `hairColour` scaled by that pixel's brightness over the picture's average brightness; alpha is untouched.
- Pictures are shared: one image per skin name, one per (hair, hairColour), one each for shoes, eyes, brows and lashes, however many players use them. A shared skin picture is painted over only where no player who uses it has a face left (`blank_unused_skin` over the union).
- `main()` builds all ten; `--shots` renders each as in stage 1.

- [ ] **Step 4: Build and look**

Run: `blender-4.5 --background --python tools/blender/build_players.py -- --shots <scratch>/shots`
Expected: ten `BUILD player-…` lines, each under 20,000 triangles. In the pictures: ten visibly different men, all dressed, nothing poking through the kit, bald head clean, afro not cut off, and `player-0-4` looking as he did.

- [ ] **Step 5: Run the tests, update the credits, commit**

Run: `npm test` — Expected: all PASS.
In `assets/CREDITS.md` add the skins and hair now used, and move the base mesh, body targets and Mixamo rig rows under MPFB, where they ship from.

```bash
git add assets/source/people.json assets/players.glb assets/CREDITS.md tools/blender/build_players.py tests/models.test.js
git commit -m "feat: ten different players from the table"
```

---

### Task 2: Kit panels the game can paint on

**Files:**
- Modify: `tools/blender/build_players.py`, `tests/models.test.js`, `tests/glb.js`
- Rebuild: `assets/players.glb`

**Interfaces:**
- Produces: every jersey and shorts has texture coordinates laid out as two panels. In the exported file (v runs downward): the **front** panel is u 0.02 to 0.48 and u grows toward the player's left (so a picture reads the right way round from in front); the **back** panel is u 0.52 to 0.98 and u grows toward the player's right; v is 0 at the top edge of the piece (shoulders, waistband) and 1 at its hem. A face belongs to the front when its normal points forward. `floatsOf` in `tests/glb.js` also reads `VEC2`.

- [ ] **Step 1: Write the failing test** (`tests/models.test.js`)

```js
// One player's kit piece: positions, normals and texture coordinates of the primitive whose material is `name`.
function piece(person, name) {
  const p = primitivesUnder(players.json, rootName(person)).find(q => players.json.materials[q.material].name === name);
  const rows = (attribute, width) => { const flat = floatsOf(players, p.attributes[attribute]); return Array.from({ length: flat.length / width }, (_, i) => flat.slice(i * width, (i + 1) * width)); };
  return { at: rows('POSITION', 3), normal: rows('NORMAL', 3), uv: rows('TEXCOORD_0', 2) };
}
const mean = list => list.reduce((sum, v) => sum + v, 0) / list.length;

test('jersey and shorts are laid out as a front panel and a back panel, the right way round', () => {
  for (const person of people) for (const name of ['jersey', 'shorts']) {
    const { at, normal, uv } = piece(person, name);
    assert.ok(uv.every(([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1), `${rootName(person)} ${name}: outside the picture`);
    const front = uv.map(([u], i) => (u < 0.5 ? i : -1)).filter(i => i >= 0), back = uv.map(([u], i) => (u > 0.5 ? i : -1)).filter(i => i >= 0);
    assert.ok(mean(front.map(i => normal[i][2])) > 0.3 && mean(back.map(i => normal[i][2])) < -0.3, `${rootName(person)} ${name}: panels face the wrong way`);
    const lean = list => { const x = mean(list.map(i => at[i][0])), u = mean(list.map(i => uv[i][0])); return mean(list.map(i => (at[i][0] - x) * (uv[i][0] - u))); };
    assert.ok(lean(front) > 0 && lean(back) < 0, `${rootName(person)} ${name}: a panel is mirrored`);
    const top = Math.max(...at.map(p => p[1])), high = uv[at.findIndex(p => p[1] === top)][1];
    assert.ok(high < 0.1, `${rootName(person)} ${name}: the top edge is at v ${high}`);
  }
});
```

- [ ] **Step 2: Run it** — `node --test tests/models.test.js` — Expected: FAIL (`TEXCOORD_0` missing or not in panels).

- [ ] **Step 3: Add `panel_uvs(piece)` to `build_players.py`**, called for the jersey and the shorts after they are shaped and before they are joined to the body. It writes one UV layer per piece from each face corner's position: width is the piece's full width in x, height its full height in z. In Blender's own terms (humans face -Y, v runs upward): front faces (normal y < 0) get `u = 0.25 + 0.46 * x / width`, back faces `u = 0.75 - 0.46 * x / width`, and `v = (z - lowest) / (highest - lowest)`.

- [ ] **Step 4: Rebuild, test, commit** — rebuild as in Task 1; `npm test` all PASS.

```bash
git add tools/blender/build_players.py assets/players.glb tests/models.test.js tests/glb.js
git commit -m "feat: jersey and shorts laid out as front and back panels"
```

---

### Task 3: Ten models, six on the floor

**Files:**
- Modify: `src/render/people.js`, `src/render/motion.js`, `src/render/actors.js`, `src/main.js`, `tests/motion.test.js`

**Interfaces:**
- Consumes: `players.glb` roots from Task 1; `fade`, `checkGaits`, `legMotion`.
- Produces, in `motion.js`:
  - `personName(team, number) -> 'player-<team>-<number>'`
  - `courtPeople(state) -> string[6]`: the model name for each court player, by `state.players` order.
  - `keepTrack(name) -> boolean`: true for a track ending `.quaternion`, and for `mixamorigHips.position`. Everything else in a clip (the other bones' positions, every scale) is dropped at load: it never changes and would stamp player 0-4's bone lengths on the others.
  - `sized(gaits, scale) -> gaits`: each speed times `scale`.
  - `missingPeople(names) -> string[]`: every `personName` in `ROSTER.numbers` that is not in `names`.
- Produces, in `people.js`: `loadPeople() -> Promise<{ models, update(state, dt), setQuality(level) }>` (`setQuality` arrives in Task 5). `models` is six `THREE.Group`s, one per court slot, placed and turned from the match; each holds the model of whoever is in that slot. One model, mixer and weights per **person**, built once, never cloned. Per person, `scale = his hips' rest height / the motion skeleton's hips' rest height`; his copy of each clip has the hips position track multiplied by `scale`, and his gaits are `sized(facts.gaits, scale)`. Rejects, naming them, if `missingPeople` of the file's player names is not empty.
- `main.js`: on the start and final screens the players' motion advances by real frame time, so they stand breathing instead of frozen.

- [ ] **Step 1: Write the failing tests** (`tests/motion.test.js`)

```js
import { createMatch } from '../src/sim/state.js';
import { substitute } from '../src/sim/roster.js';

test('each court player is drawn with the model of the person in that slot, also after a substitution', () => {
  const s = createMatch(1);
  assert.deepEqual(courtPeople(s), ['player-0-4', 'player-0-7', 'player-0-11', 'player-1-5', 'player-1-8', 'player-1-10']);
  substitute(s, 1, 4);
  assert.equal(courtPeople(s)[1], 'player-0-23');
});

test('a motion keeps every turn and the position of the hips, and nothing else', () => {
  assert.deepEqual(['mixamorigHips.position', 'mixamorigLeftArm.quaternion', 'mixamorigLeftArm.position', 'mixamorigHips.scale'].map(keepTrack), [true, true, false, false]);
});

test('a taller player strides further: his gait speeds grow with him', () => {
  assert.deepEqual(sized({ walk: 2, run: 5, sprint: 7 }, 1.1), { walk: 2.2, run: 5.5, sprint: 7.7 });
});

test('a player file that lacks someone on a roster is noticed', () => {
  const all = [0, 1].flatMap(team => ROSTER.numbers[team].map(number => personName(team, number)));
  assert.deepEqual(missingPeople(all), []);
  assert.deepEqual(missingPeople(all.filter(name => name !== 'player-1-33')), ['player-1-33']);
});
```

(Round `sized` to three decimals so the comparison is exact.)

- [ ] **Step 2: Run them** — Expected: FAIL (`courtPeople` is not exported).

- [ ] **Step 3: Implement** the five functions in `motion.js`, then rework `people.js` as the Interfaces block says. Details that are decided:
  - A slot's group swaps its child when `courtPeople(state)[i]` changes; the person coming on starts with weights `{ idle: 1, others 0 }`.
  - Only meshes whose material name starts with `skin`, `jersey`, `shorts`, `hair` or `shoes` cast shadows.
  - Materials are not cloned here; kit materials are replaced in Task 4.
  - `CUTOUT` and the label height move into frozen objects (`PEOPLE` in `people.js`, `LABEL` in `actors.js`).

- [ ] **Step 4: Run the tests** — `npm test` — Expected: all PASS.

- [ ] **Step 5: Check it in the browser** (`http://127.0.0.1:5173/`, Browser pane showing)

| Check | Expected |
|---|---|
| Console | No errors |
| Start screen | Six different players stand breathing, not frozen |
| Play | The six on court are six different people; feet on the floor for the tallest and the shortest |
| Substitution queued on the pause screen | At the next whistle a different person stands in that place, number above his head changed |
| Stage 1's one-player `players.glb` put in its place (`git show 0896733:assets/players.glb`) | Capsules, one warning naming the missing players. Put the real file back. |

- [ ] **Step 6: Commit**

```bash
git add src/render/people.js src/render/motion.js src/render/actors.js src/main.js tests/motion.test.js
git commit -m "feat: each person has his own model; six are shown and swap on substitution"
```

---

### Task 4: Team kits with numbers, painted at load

**Files:**
- Create: `src/render/kit.js`, `tests/kit.test.js`
- Modify: `src/render/people.js`, `src/render/actors.js`

**Interfaces:**
- Consumes: the panels from Task 2 (front u 0.02 to 0.48, back u 0.52 to 0.98, v 0 at the top).
- Produces, in `kit.js` (no Three.js import):
  - `KIT = Object.freeze({ size: 512, team: ['#2f6fe0', '#d83a3a'], trim: '#ffffff', font: 'bold {px}px system-ui, sans-serif' })`
  - `TEAM_COLOURS = [0x2f6fe0, 0xd83a3a]` moves here; `people.js` and `actors.js` import it from `kit.js`.
  - `kitOps(part, number) -> op[]`, `part` being `'jersey'` or `'shorts'`. An op is `{ fill: 'team' | 'trim', rect: [x, y, w, h] }` or `{ text, at: [x, y], height, fill: 'trim' }`, all in 0 to 1 with the origin at the top left. In order: the whole picture in the team colour; white side bands `[0, 0, 0.03, 1]`, `[0.47, 0, 0.06, 1]`, `[0.97, 0, 0.03, 1]`; a white hem band `[0, 0.94, 1, 0.06]`; and for a jersey the number on the chest `at: [0.25, 0.42], height: 0.26` and on the back `at: [0.75, 0.40], height: 0.34`.
  - `paintKit(context, size, ops, team)`: draws the ops on a 2D canvas context of `size` pixels, text centred on `at`.
- `people.js`: each person's jersey gets its own material with a `CanvasTexture` (`flipY = false`, sRGB) painted by `paintKit`; shorts share one texture per team. The white kit materials from the file are no longer tinted.

- [ ] **Step 1: Write the failing tests** (`tests/kit.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitOps, paintKit, KIT } from '../src/render/kit.js';

const recorder = () => {
  const calls = [];
  return { calls, fillRect: (...a) => calls.push(['rect', calls.style, ...a]), fillText: (...a) => calls.push(['text', calls.style, ...a]),
    set fillStyle(v) { calls.style = v; }, set font(v) { calls.font = v; }, set textAlign(v) {}, set textBaseline(v) {} };
};

test('a jersey is the team colour with white trim and its number on the chest and the back', () => {
  const ops = kitOps('jersey', 23);
  assert.deepEqual(ops[0], { fill: 'team', rect: [0, 0, 1, 1] });
  assert.deepEqual(ops.filter(o => o.text).map(o => [o.text, o.at[0], o.fill]), [['23', 0.25, 'trim'], ['23', 0.75, 'trim']]);
  assert.ok(ops.filter(o => o.rect && o.fill === 'trim').length >= 4);
});

test('shorts carry the trim but no number', () => {
  assert.equal(kitOps('shorts', 23).some(o => o.text), false);
});

test('painting puts the colours and the number where the layout says, in pixels', () => {
  const c = recorder();
  paintKit(c, 512, kitOps('jersey', 7), 1);
  assert.deepEqual(c.calls[0], ['rect', KIT.team[1], 0, 0, 512, 512]);
  const texts = c.calls.filter(call => call[0] === 'text');
  assert.deepEqual(texts.map(t => [t[1], t[2], t[3]]), [[KIT.trim, '7', 128], [KIT.trim, '7', 384]]);
});
```

- [ ] **Step 2: Run them** — Expected: FAIL (module missing).
- [ ] **Step 3: Write `kit.js`, then use it in `people.js`.**
- [ ] **Step 4: Run the tests** — `npm test` — Expected: all PASS.
- [ ] **Step 5: Check it in the browser**

| Check | Expected |
|---|---|
| Team 0 | Blue jerseys and shorts with white side bands and hem; white numbers 4, 7, 11 on chest and back, upright and not mirrored |
| Team 1 | The same in red with 5, 8, 10 |
| After a substitution | The jersey number matches the number floating above the head |

- [ ] **Step 6: Commit**

```bash
git add src/render/kit.js tests/kit.test.js src/render/people.js src/render/actors.js
git commit -m "feat: team kits with numbers, painted when the game loads"
```

---

### Task 5: Two quality levels

**Files:**
- Create: `src/render/quality.js`, `tests/quality.test.js`
- Modify: `src/render/scene.js`, `src/render/people.js`, `src/render/hud.js`, `src/main.js`, `index.html`, `tests/hud.test.js`

**Interfaces:**
- Produces, in `quality.js` (no Three.js import):
  - `QUALITY = Object.freeze({ high: { label: 'High', pixelRatio: 2, shadow: 2048, textures: 1 }, low: { label: 'Low', pixelRatio: 0.75, shadow: 1024, textures: 0.5 }, autoAfter: 3, autoBelow: 40 })` (inner objects frozen too)
  - `createQuality() -> { level: 'high', seconds: 0, frames: 0, settled: false }`
  - `autoQuality(q, ms, playing) -> boolean`: one frame of `ms` real milliseconds; `playing` is true while a match is in play and not paused. Counts only playing frames, each as 100 ms at most (a stall is one long frame, not proof of a slow computer), until `autoAfter` seconds have passed, then settles: Low if `frames / seconds < autoBelow`. Returns true on the frame the level changes.
  - `toggleQuality(q)`: the G key. Flips the level and settles it.
- `scene.js`: the view gains `setQuality(level)`: pixel ratio `min(devicePixelRatio, 2)` at High and 0.75 at Low; the sun's shadow map resized and rebuilt.
- `people.js`: `setQuality(level)`: at Low every player picture and kit texture is swapped for a half-size copy made when the game loaded.
- `hud.js`: with `ui.quality` set the corner label is `${backend name} · ${QUALITY[ui.quality].label} · ${fps} fps`.
- `main.js`: `game.quality`; G toggles at any time; both paths call `view.setQuality` and `people?.setQuality`. `index.html`: the controls line ends `· G quality`.

- [ ] **Step 1: Write the failing tests** (`tests/quality.test.js`, plus one in `tests/hud.test.js`)

```js
const play = (q, ms, seconds, playing = true) => { let changed = 0; for (let t = 0; t < seconds * 1000; t += ms) changed += autoQuality(q, ms, playing); return changed; };

test('under 40 frames a second over the first three seconds of play switches to Low, once', () => {
  const q = createQuality();
  assert.equal(play(q, 33, 3.1), 1);
  assert.deepEqual([q.level, q.settled], ['low', true]);
  toggleQuality(q);
  assert.equal(play(q, 100, 10), 0);
  assert.equal(q.level, 'high');
});

test('40 or more keeps High for good', () => {
  const q = createQuality();
  assert.equal(play(q, 20, 3.1) + play(q, 100, 10), 0);
  assert.equal(q.level, 'high');
});

test('time on the start screen or paused does not count toward the three seconds', () => {
  const q = createQuality();
  play(q, 100, 60, false);
  assert.deepEqual([q.seconds, q.settled], [0, false]);
});

test('one long stall does not count as a slow computer', () => {
  const q = createQuality();
  autoQuality(q, 10000, true);
  assert.equal(play(q, 10, 3.1), 0);
  assert.equal(q.level, 'high');
});

test('once G has been pressed the automatic choice never overrides it', () => {
  const q = createQuality();
  toggleQuality(q); toggleQuality(q);
  assert.equal(play(q, 100, 10), 0);
  assert.equal(q.level, 'high');
});
```

```js
// tests/hud.test.js
hud.update(s, 'webgpu', { paused: false, pick: null, fps: 59.6, quality: 'high' });
assert.equal(doc.els.backend.textContent, 'WebGPU · High · 60 fps');
```

- [ ] **Step 2: Run them** — Expected: FAIL (module missing; label has no level).
- [ ] **Step 3: Implement** `quality.js`, then the callers.
- [ ] **Step 4: Run the tests** — `npm test` — Expected: all PASS.
- [ ] **Step 5: Check it in the browser**

| Check | Expected |
|---|---|
| Label | `WebGL 2 (WebGPU not available) · High · <n> fps` here |
| G | Label says Low; picture visibly coarser, shadows softer; G again restores it; no error, no flash of untextured players |
| G on the pause screen and the start screen | Works the same |

- [ ] **Step 6: Commit**

```bash
git add src/render/quality.js tests/quality.test.js src/render/scene.js src/render/people.js src/render/hud.js src/main.js index.html tests/hud.test.js
git commit -m "feat: high and low quality, chosen once automatically and switched with G"
```

---

### Task 6: Stage 2 in the single file, and the owner's numbers

**Files:**
- Modify: `tests/single-file.test.js`

- [ ] **Step 1: Write the test** that closes a gap the stage 1 review found:

```js
test('in the real game no import is left pointing at a file', () => {
  for (const [path, source] of Object.entries(modulesIn(pack('.')))) {
    assert.equal(/^(?:import|export)\b[^'"\n]*['"](?:\.{1,2}\/|three)/m.test(source), false, `${path} still imports by path`);
  }
});
```

(Adapt to what `modulesIn` returns in that file; the claim is fixed: every import or re-export statement that named a relative path or `three` has been rewritten. Only statements count: Three's own comments show imports as examples.)

- [ ] **Step 2: Run** `npm test` — Expected: all PASS, including the existing "single file stays under 25 MB". A failure there is fixed by smaller pictures in `build_players.py` (`TEXTURE`), never by raising the limit.
- [ ] **Step 3: Build and check** — `npm run single`; serve `dist/` with `Content-Security-Policy: sandbox allow-scripts` and open it: origin `null`, ten kits painted, G works, no console error, one network request.
- [ ] **Step 4: Commit** — `git commit -m "test: every import in the single file is rewritten"`
- [ ] **Step 5: The gate.** Send `dist/triple-threat.html` and two pictures (both teams; one close on a jersey number). Ask the owner for: the frame rate on the Chromebook at High, the frame rate after pressing G, and whether the ten players and the kits look right.

**Only if the Chromebook reports under 30 frames a second at Low** — Task 6b: `build_players.py` also writes `assets/players-low.glb`, the same ten at about 6,000 triangles each (`KEEP` scaled down, the face still protected); `ASSETS` gains it; `people.js` loads it and `setQuality('low')` shows those meshes. Test: every player in `players-low.glb` has between 3,000 and 7,000 triangles and the single file is still under 25 MB.

---

# Stage 3: basketball moves

> **Superseded on 2026-11-12.** Tasks 7 to 12 below are replaced by `docs/superpowers/plans/2026-11-12-realistic-players-stage-3.md`, written after the owner's reference video was studied and the stage 3 design was amended. They are kept here only as a record. Stage 4 (Tasks 13 to 16) still stands.

> 2026-11-13: by the owner's decision stage 4 (Tasks 13 to 16) was not built in milestone 3; walking to the inbound and free-throw spots moves to after the 5v5 option, and the camera close-ups move to the arena work. The order of the work that follows is in `docs/superpowers/specs/2026-11-13-net-names-menu-design.md`.

### Task 7: Four more clips from Mixamo

**Files:**
- Modify: `tools/blender/build_motion.py`, `tests/models.test.js`, `assets/CREDITS.md`, `assets/source/README.md`
- Rebuild: `assets/motion.glb`, `assets/motion.json`

**Interfaces:**
- Produces: four more looping motions on the spot, from these Mixamo clips (searched by address, downloaded with the settings in Global Constraints):

| Motion | Mixamo clip | Description on Mixamo | Saved as |
|---|---|---|---|
| `strafeLeft` | Left Strafe Walk | Walking Strafe To The Left | `strafeLeft.fbx` |
| `strafeRight` | Right Strafe Walk | Walking Strafe To The Right | `strafeRight.fbx` |
| `backpedal` | Walking Backwards | Walking Backwards | `backpedal.fbx` |
| `dribble` | Dribble | Dribbling Basketball With Right Arm | `dribble.fbx` |

- `motion.json`: `gaits` gains `strafeLeft`, `strafeRight` and `backpedal` (metres a second, measured before the travel is taken out, whatever its direction). `clips.dribble` gains `push` (the share of the cycle, 0 to 1, at which the right hand is lowest) and `bounces` (how many times the right hand reaches a low point in one cycle, at least 1).

- [ ] **Step 1: Write the failing tests** (`tests/models.test.js`)

```js
test('the defensive steps and the dribble are in the motion file with their facts', () => {
  const names = motion.json.animations.map(a => a.name);
  for (const name of ['strafeLeft', 'strafeRight', 'backpedal', 'dribble']) assert.ok(names.includes(name), `no ${name}`);
  for (const gait of ['strafeLeft', 'strafeRight', 'backpedal']) assert.ok(facts.gaits[gait] > 0.5 && facts.gaits[gait] < 4, `${gait}: ${facts.gaits[gait]}`);
  const { push, bounces, loop } = facts.clips.dribble;
  assert.ok(loop && push >= 0 && push < 1 && Number.isInteger(bounces) && bounces >= 1);
  for (const name of ['strafeLeft', 'strafeRight', 'backpedal']) assert.ok(hipsDrift(name) < 0.25);
});
```

Add the four names to `LOOPS` so the existing "ends in the pose it starts in" test covers them, and replace the fixed five-name lists in the older tests with "includes".

- [ ] **Step 2: Run them** — Expected: FAIL (`no strafeLeft`).
- [ ] **Step 3: Download the clips** in the built-in browser. If Mixamo is logged out, ask the owner only to sign in. If a clip turns out not to loop or not to face forward, take the next plain one from the same search and say so in the ledger.
- [ ] **Step 4: Extend `build_motion.py`**: the four names join `CLIPS`; the three steps join `GAITS`; after `dribble` is read, find the frames where the right hand's height has a local minimum and write `push` and `bounces`.
- [ ] **Step 5: Build, look, test** — film strips show clean side-steps to each side, a backward walk, and a right-hand dribble with the body upright. `npm test` all PASS.
- [ ] **Step 6: Commit** — credits and README updated. `git commit -m "feat: side-steps, back-steps and a dribble from Mixamo"`

---

### Task 8: The moves Mixamo does not have

**Files:**
- Create: `tools/blender/poses.py`
- Modify: `tools/blender/build_motion.py`, `tests/models.test.js`, `assets/source/README.md`
- Rebuild: `assets/motion.glb`, `assets/motion.json`

**Interfaces:**
- Produces ten hand-made motions in `motion.glb`, keyed on the player's skeleton at 30 frames a second, with facts in `motion.json`. `kind` is a new fact on every clip: `'loop'`, `'once'` (plays through once) or `'held'` (the game sets how far through it is, like the jump). The older `loop` fact stays, true exactly when `kind` is `'loop'`.

| Motion | Kind | Length | What it shows |
|---|---|---|---|
| `stance` | loop | 2 s | Whole body: feet apart, knees bent so the hips sit about 0.15 m lower, back leaning a little, arms out to the sides with hands at waist height; a slow sway |
| `hold` | loop | 2 s | Arms and torso: ball held in both hands in front of the chest |
| `shoot` | held | 0.5 s | Ball from the chest to above the forehead, shooting arm folding then extending |
| `follow` | once | 0.45 s | Shooting arm straight up, wrist bent forward, then relaxing |
| `freeThrow` | once | 0.9 s | A set shot from the chest and the same follow-through |
| `pass` | once | 0.35 s | Both arms push straight out from the chest and relax |
| `catch` | once | 0.3 s | Both hands come up in front of the chest and close |
| `reach` | once | 0.4 s | The right arm darts forward and down, then back |
| `contest` | held | 0.47 s | Both arms straight up |
| `tip` | held | 0.47 s | The right arm straight up, reaching |

- `poses.py`: `POSES = { name: { 'kind', 'seconds', 'keys': [(time 0..1, { bone: (axis, degrees), … })] } }`, with turns given about the world's side, forward and up axes from the rest pose (the helper that makes this independent of each bone's own axes is `turn` in the stage 1 stand-in script). Between keys the turns ease in and out. For `stance`, the hips are lowered after posing so that the lower toe stays at floor height.
- `build_motion.py` keys these after the Mixamo clips, and **checks its own work** before exporting: in `hold`, the hands are 0.2 to 0.3 m apart and 0.2 to 0.45 m in front of the spine; in `contest`, both hands are above the top of the head at the end; in `tip`, the right hand is at least 0.45 m above the head; in `stance`, the hips are 0.1 to 0.2 m below their rest height and neither toe is below the floor; in `shoot`, the hands end above the head and no further than 0.3 m apart.

- [ ] **Step 1: Write the failing test** (`tests/models.test.js`)

```js
const MADE = { stance: 'loop', hold: 'loop', shoot: 'held', follow: 'once', freeThrow: 'once', pass: 'once', catch: 'once', reach: 'once', contest: 'held', tip: 'held' };

test('the hand-made motions are in the file, each with its kind and a sensible length', () => {
  for (const [name, kind] of Object.entries(MADE)) {
    assert.ok(motion.json.animations.some(a => a.name === name), `no ${name}`);
    assert.equal(facts.clips[name].kind, kind);
    assert.ok(facts.clips[name].duration >= 0.25 && facts.clips[name].duration <= 2.5);
  }
  for (const name of ['idle', 'walk', 'run', 'sprint', 'dribble']) assert.equal(facts.clips[name].kind, 'loop');
  assert.equal(facts.clips.jump.kind, 'held');
});
```

- [ ] **Step 2: Run it** — Expected: FAIL (`no stance`).
- [ ] **Step 3: Write `poses.py` and the keying in `build_motion.py`**, one motion at a time: build with `--shots`, look at its film strip, adjust the turns until it matches the table and passes the script's checks.
  Expected for every strip: nothing passes through the body, shoulders are not shrugged to the ears, wrists are not twisted backwards.
- [ ] **Step 4: Run the tests** — `npm test` — Expected: all PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: hold, shoot, pass, catch, reach, contest, tip and a defensive stance, made by hand"`

---

### Task 9: Which motion, as plain logic

**Files:**
- Modify: `src/render/motion.js`, `tests/motion.test.js`

**Interfaces:**
- Consumes: `facts` from `motion.json` (`gaits`, `clips[name].duration`).
- Produces, all in `motion.js`:
  - `LEG_CLIPS = ['idle', 'stance', 'walk', 'run', 'sprint', 'strafeLeft', 'strafeRight', 'backpedal', 'jump']`, `ARM_CLIPS = ['dribble', 'hold', 'shoot', 'follow', 'freeThrow', 'pass', 'catch', 'reach', 'contest', 'tip']`.
  - `MOTION` gains `guardDist: 4` and `guardSpeed: 2.2` (above this speed a defender turns and runs like anyone else) and `sideways: 50` (degrees either side of straight ahead that still count as forward; the same either side of straight back count as backward).
  - `manOf(state, player)`: the opponent in the same `slot`.
  - `defending(state, player) -> boolean`: play is live or an inbound is on, and the other team has possession.
  - `guarding(state, player) -> boolean`: `defending`, on the floor, slower than `guardSpeed`, and within `guardDist` of his man.
  - `drawnFacing(state, player) -> radians`: toward his man when `guarding`, otherwise `player.facing`. Display only.
  - `legMotion(player, gaits, last, look = null)`: as now when `look` is null. With `look = { facing, defending, guarding }`: standing still while `defending` is `stance`. Moving while `guarding`, with his direction of travel more than `sideways` away from `facing`, is `strafeLeft` or `strafeRight` (toward his own left or right: facing +x, his left is -z), or `backpedal` when within `sideways` of straight back; the rate comes from that gait's speed, limited as before.
  - `checkGaits` also requires a speed for `strafeLeft`, `strafeRight` and `backpedal`.
  - `newMarks() -> marks` and `noteChanges(marks, state, dt)`: what changed since the last frame, per player id, as seconds since it happened (0 on the frame it is noticed, `Infinity` if never): `pass` (he held the ball, now nobody does and `ball.mode === 'pass'`), `release` (the same with `ball.mode === 'shot'` and `ball.shooter === id`), `catch` (he holds the ball and did not last frame), `reach` (his `stealCooldown` is higher than last frame).
  - `armMotion(player, state, marks, facts) -> { clip, at } | { clip, rate } | null`. `at` runs 0 to 1. First match wins:

| # | When | Result |
|---|---|---|
| 1 | `marks.pass[id]` younger than `pass`'s length | `pass`, `at` = age / length |
| 2 | `marks.release[id]` younger than the length of `freeThrow` (he is the free-throw shooter) or `follow` (otherwise) | that clip, `at` = age / length |
| 3 | `player.shooting` | `shoot`, `at` = jump progress (`jumpT / AIR_TIME`, at most 1) |
| 4 | `marks.catch[id]` younger than `catch`'s length | `catch`, `at` |
| 5 | He holds the ball and is the inbounder, or has picked up his dribble (`held`), or the phase is `freeThrow` | `hold`, `rate: 1` |
| 6 | He holds the ball | `dribble`, `rate: 1` |
| 7 | `marks.reach[id]` younger than `reach`'s length | `reach`, `at` |
| 8 | Phase `jumpBall`, he is a jumper (`slot === 1`) and in the air | `tip`, `at` = jump progress |
| 9 | In the air | `contest`, `at` = jump progress |
| 10 | Otherwise | `null`: the arms follow the legs' motion |

- [ ] **Step 1: Write the failing tests** (`tests/motion.test.js`): one test per row of both tables. The values that are fixed:

```js
const facts = { gaits: { walk: 1.8, run: 5.2, sprint: 7.3, strafeLeft: 1.5, strafeRight: 1.5, backpedal: 1.3 },
  clips: { pass: { duration: 0.35 }, follow: { duration: 0.45 }, freeThrow: { duration: 0.9 }, catch: { duration: 0.3 }, reach: { duration: 0.4 } } };

test('a defender within 4 m of his man is drawn facing him; further away, or at a run, he faces where he goes', () => {
  const s = live();                       // helpers.js: team 0 has the ball; player 3 guards player 0
  at(s, 0, 5, 0); at(s, 3, 3, 0); s.players[3].facing = 2;
  assert.ok(Math.abs(drawnFacing(s, s.players[3]) - 0) < 1e-9);         // his man is toward +x
  at(s, 3, 0.5, 0);
  assert.equal(drawnFacing(s, s.players[3]), 2);                        // 4.5 m away
  at(s, 3, 3, 0); s.players[3].vx = 3;
  assert.equal(drawnFacing(s, s.players[3]), 2);                        // running
  assert.equal(drawnFacing(s, s.players[0]), s.players[0].facing);      // his team has the ball
});

test('guarding, he stands in a stance, side-steps to his own left and right, and back-steps', () => {
  const look = { facing: 0, defending: true, guarding: true }, moving = (vx, vz, l = look) => legMotion({ ...still, vx, vz }, facts.gaits, null, l);
  assert.equal(legMotion(still, facts.gaits, null, look).clip, 'stance');
  assert.deepEqual(moving(0, -1.5), { clip: 'strafeLeft', rate: 1 });    // facing +x, his left is -z
  assert.equal(moving(0, 1.5).clip, 'strafeRight');
  assert.equal(moving(-1.3, 0).clip, 'backpedal');
  assert.equal(moving(1.5, 0).clip, 'walk');
  assert.equal(moving(0, 1.5, { facing: 0, defending: true, guarding: false }).clip, 'walk');   // not near his man: no side-steps
  assert.equal(legMotion(still, facts.gaits, null, { facing: 0, defending: true, guarding: false }).clip, 'stance');
  assert.equal(legMotion(still, facts.gaits, null, { facing: 0, defending: false, guarding: false }).clip, 'idle');
});

test('the arms show the newest thing: a pass, then the catch that follows at once', () => {
  const s = live(), marks = newMarks();
  noteChanges(marks, s, DT);
  passBall(s, s.players[0], emptyIntent()); noteChanges(marks, s, DT);
  assert.deepEqual(armMotion(s.players[0], s, marks, facts), { clip: 'pass', at: 0 });
  giveBall(s, s.players[1]); noteChanges(marks, s, DT);
  assert.equal(armMotion(s.players[1], s, marks, facts).clip, 'catch');
  for (let t = 0; t < 0.4; t += DT) noteChanges(marks, s, DT);
  assert.deepEqual(armMotion(s.players[1], s, marks, facts), { clip: 'dribble', rate: 1 });
  assert.equal(armMotion(s.players[0], s, marks, facts), null);
});

test('a shooter who lands still holding the ball stops shooting', () => {
  const s = live(), marks = newMarks(), p = s.players[0];
  Object.assign(p, { shooting: true, y: 0.4, vy: 1, jumpT: AIR_TIME / 2 });
  assert.deepEqual(armMotion(p, s, marks, facts), { clip: 'shoot', at: 0.5 });
  Object.assign(p, { shooting: false, y: 0, vy: 0 });
  assert.equal(armMotion(p, s, marks, facts).clip, 'dribble');
});
```

Also, one assertion each: an inbounder and a player with `held` show `hold`; a released shot shows `follow` and a released free throw `freeThrow`; a steal attempt shows `reach`, but `catch` if he won the ball; a jumper in the air during `jumpBall` shows `tip`; anyone else in the air shows `contest`; standing with nothing to do gives `null`.

- [ ] **Step 2: Run them** — Expected: FAIL (`drawnFacing` is not exported).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests** — `npm test` — Expected: all PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: choose leg and arm motions from the match"`

---

### Task 10: Playing two layers

**Files:**
- Create: `src/render/animator.js`, `tests/animator.test.js`
- Modify: `src/render/people.js`, `src/render/motion.js`, `tests/motion.test.js`

**Interfaces:**
- Consumes: `LEG_CLIPS`, `ARM_CLIPS`, `fade`, `keepTrack`, `legMotion`, `armMotion`, `drawnFacing`, `guarding`, `noteChanges`.
- Produces, in `motion.js`: `layerOf(trackName) -> 'arms' | 'legs'`: `arms` for the spine bones, neck, head, shoulders, arms, hands and fingers; `legs` for the hips, legs, feet and toes. `checkMotions(names) `: throws naming the first of `LEG_CLIPS` and `ARM_CLIPS` that is missing from `names`.
- Produces, in `animator.js`: `createAnimator(model, clips, facts, scale) -> { update(legs, arms, dt), weights }`. It takes over from `people.js` the dropping of tracks (`keepTrack`) and the scaling of the hips' position by `scale`.
  - Every leg clip is split in two: its `legs` tracks play on the legs layer, its `arms` tracks on the arms layer. Every arm clip plays its `arms` tracks only.
  - Each layer has its own weights, moved by `fade`, so each layer always adds up to one whole pose.
  - `arms === null` means the arms layer shows the arms half of the current leg clip, at the same time as the legs.
  - `{ at }` holds a clip at that share of its length; `{ rate }` plays it at that rate.
  - When one gait fades into another gait, the incoming clip starts at the same share of its cycle as the outgoing one, so the legs never stall.
  - `weights` is `{ legs: {…}, arms: {…} }`, for tests.
- `people.js`: one animator per person; `loadPeople` calls `checkMotions`; `update` turns each slot to `drawnFacing`, and passes `look = { facing, defending, guarding }` to `legMotion`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/animator.test.js — the real mixer, in Node, on the real motion file
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAnimator } from '../src/render/animator.js';

const data = readFileSync('assets/motion.glb'), facts = JSON.parse(readFileSync('assets/motion.json', 'utf8'));
const gltf = await new Promise((ok, bad) => new GLTFLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', ok, bad));
const fresh = () => createAnimator(gltf.scene, Object.fromEntries(gltf.animations.map(c => [c.name, c])), facts, 1);
const whole = layer => Math.abs(Object.values(layer).reduce((sum, w) => sum + w, 0) - 1) < 1e-9;

test('both layers stay one whole pose through a start, a pass, a catch, a jump and a stop', () => {
  const a = fresh();
  const script = [[{ clip: 'walk', rate: 1 }, null], [{ clip: 'run', rate: 1 }, { clip: 'dribble', rate: 1 }], [{ clip: 'run', rate: 1 }, { clip: 'pass', at: 0.2 }],
    [{ clip: 'run', rate: 1 }, { clip: 'catch', at: 0.5 }], [{ clip: 'jump', at: 0.3 }, { clip: 'shoot', at: 0.3 }], [{ clip: 'idle', rate: 1 }, null]];
  for (const [legs, arms] of script) for (let i = 0; i < 3; i++) {       // three frames each: every fade is cut short
    a.update(legs, arms, 1 / 60);
    assert.ok(whole(a.weights.legs) && whole(a.weights.arms), JSON.stringify(a.weights));
  }
});

test('with nothing for the arms to do they follow the legs', () => {
  const a = fresh();
  for (let i = 0; i < 30; i++) a.update({ clip: 'run', rate: 1 }, null, 1 / 60);
  assert.equal(a.weights.arms.run, 1);
});

test('a person who has just come on starts from a whole idle pose', () => {
  assert.deepEqual([fresh().weights.legs.idle, fresh().weights.arms.idle], [1, 1]);
});
```

```js
// tests/motion.test.js
test('the spine, arms and head are the arms layer; the hips and legs are the legs layer', () => {
  assert.deepEqual(['mixamorigHips.position', 'mixamorigLeftUpLeg.quaternion', 'mixamorigSpine.quaternion', 'mixamorigRightHandIndex1.quaternion', 'mixamorigHead.quaternion'].map(layerOf),
    ['legs', 'legs', 'arms', 'arms', 'arms']);
});

test('a motion file that lacks a motion the tables name is refused', () => {
  assert.doesNotThrow(() => checkMotions([...LEG_CLIPS, ...ARM_CLIPS]));
  assert.throws(() => checkMotions(LEG_CLIPS), /dribble/);
});
```

```js
// tests/models.test.js
test('the motion file holds every motion the two tables name', () => {
  const names = motion.json.animations.map(a => a.name);
  assert.deepEqual([...LEG_CLIPS, ...ARM_CLIPS].filter(name => !names.includes(name)), []);
});
```

- [ ] **Step 2: Run them** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `layerOf`, `checkMotions`, `animator.js`, then use the animator in `people.js` in place of the weight code there.
- [ ] **Step 4: Run the tests** — `npm test` — Expected: all PASS.
- [ ] **Step 5: Check it in the browser**

| Check | Expected |
|---|---|
| Running with the ball | Legs run, right arm dribbles |
| F (hold), E (pass), receiving a pass | Hold pose; a chest-pass push; hands come up to catch |
| Space with the ball; Space without | Arms raise the ball then follow through; arms go up to contest |
| Q next to the ball handler | A reach |
| Defenders near their man | Face him, in a stance when still, side-step and back-step when shuffling; turn and run when left behind |
| Shift pressed and released repeatedly | The legs never stall between run and sprint |
| Opening tip | The two jumpers reach up |
| `motion.glb` from stage 1 put in its place | Capsules, one warning naming the missing motion |

- [ ] **Step 6: Commit** — `git commit -m "feat: legs and arms play on two layers"`

---

### Task 11: The ball in the hand

**Files:**
- Modify: `src/render/motion.js`, `src/render/people.js`, `src/render/actors.js`, `tests/motion.test.js`

**Interfaces:**
- Consumes: `facts.clips.dribble.push` and `.bounces`; the animator's dribble clip time.
- Produces, in `motion.js`:
  - `BALL_IN_HAND = Object.freeze({ blend: 0.1, palm: 0.1 })` (`palm`: metres from the wrist bone to where the ball sits).
  - `dribbleHeight(phase, dribble, handY, radius) -> metres`: `radius + (handY - radius) * |cos(π * bounces * (phase - push))|`. At `phase === push` the ball is in the hand; halfway to the next push it is on the floor.
  - `ballSpot(held, ruled, sinceRelease) -> { x, y, z }`: `held` while a player has the ball; after release a straight blend from the last held spot to `ruled` over `blend` seconds; `ruled` after that or when nobody has held it.
- Produces, in `people.js`: `hands(i) -> { left, right }`, world positions of slot `i`'s wrists moved `palm` along the hand; `dribblePhase(i) -> 0..1`.
- `actors.js` draws the ball at: both hands' midpoint for `hold`, `shoot`, `catch` and an inbounder; the right hand's x and z with `dribbleHeight` for `dribble`; otherwise where the rules say, through `ballSpot`. With capsules the ball is drawn as today.

- [ ] **Step 1: Write the failing tests** (`tests/motion.test.js`)

```js
test('a dribbled ball is in the hand at the push and on the floor halfway to the next', () => {
  const d = { push: 0.25, bounces: 1 };
  assert.ok(Math.abs(dribbleHeight(0.25, d, 1, 0.12) - 1) < 1e-9);
  assert.ok(Math.abs(dribbleHeight(0.75, d, 1, 0.12) - 0.12) < 1e-9);
  assert.ok(Math.abs(dribbleHeight(0.5, { push: 0, bounces: 2 }, 1, 0.12) - 1) < 1e-9);
});

test('a released ball leaves the hand over a tenth of a second and never jumps', () => {
  const held = { x: 1, y: 2, z: 0 }, ruled = { x: 2, y: 3, z: 0 };
  assert.deepEqual(ballSpot(held, ruled, null), held);
  assert.deepEqual(ballSpot(held, ruled, 0), held);
  assert.deepEqual(ballSpot(held, ruled, 0.05), { x: 1.5, y: 2.5, z: 0 });
  assert.deepEqual(ballSpot(held, ruled, 0.1), ruled);
  assert.deepEqual(ballSpot(null, ruled, 5), ruled);
});
```

- [ ] **Step 2: Run them** — Expected: FAIL. — [ ] **Step 3: Implement.** — [ ] **Step 4:** `npm test` all PASS.
- [ ] **Step 5: Check it in the browser**

| Check | Expected |
|---|---|
| Dribbling, standing and running | The ball meets the right hand at the top of each bounce and the floor at the bottom |
| Holding, inbounding, at the free-throw line | The ball sits between the hands |
| A shot and a pass | The ball leaves from the hands with no visible jump |
| A steal, a rebound, a pick-up | The ball goes to the new holder's hands within a tenth of a second |

- [ ] **Step 6: Commit** — `git commit -m "feat: the ball is drawn in the hand and bounces with the dribble"`

---

### Task 12: Stage 3 in the single file, and the owner's play-test

- [ ] **Step 1:** `npm test` all PASS; `npm run single`; the size line reads under 25 MB.
- [ ] **Step 2:** Open it under the null-origin server: every check of Tasks 10 and 11 still holds, G still works.
- [ ] **Step 3: The gate.** Send `dist/triple-threat.html`. Ask the owner how the moves look in play, naming the hand-made ones as the place to be critical (shooting, passing, the defensive stance), and for the Chromebook's frame rate again.

---

# Stage 4: close-ups and walking

### Task 13: The camera moves in

**Files:**
- Create: `src/render/camera.js`, `tests/camera.test.js`
- Modify: `src/render/scene.js`, `src/main.js`

**Interfaces:**
- Produces, in `camera.js` (no Three.js import; a pose is `{ position: [x, y, z], target: [x, y, z] }`):
  - `SHOTS = Object.freeze({ move: 0.6, broadcast: { height: 11, back: 18, lookZ: 1 }, freeThrow: { ahead: 3, side: 3.5, height: 2.2, lookHeight: 1.4 }, tip: { back: 7.5, height: 2.6, lookHeight: 1.5 } })`
  - `shotName(state) -> 'freeThrow' | 'tip' | 'broadcast'`: `freeThrow` while the phase is `freeThrow`, until the last attempt has left the shooter's hand (`freeThrow.left <= 1` and `freeThrow.stage !== 'aim'`); `tip` while the phase is `jumpBall`; otherwise `broadcast`.
  - `cameraGoal(state, followX) -> pose`. Free throw: the camera stands `ahead` metres from the shooter toward the hoop he shoots at and `side` metres toward the near sideline (+z), `height` up, looking at him at `lookHeight`. Tip: at `(0, height, back)` looking at `(0, lookHeight, 0)`. Broadcast: `(followX, height, back)` looking at `(followX, 0, lookZ)`, as today.
  - `easeCamera(pose, goal, dt) -> pose`: every number moves toward its goal by the share `1 - exp(-5 * dt / SHOTS.move)`.
- `scene.js`: the view's `follow(x)` becomes `film(state, dt)`: it keeps easing `followX` as now, then sets the camera from `easeCamera(pose, cameraGoal(state, followX), dt)`. `main.js` passes real frame time, so the camera also moves while the match clock is stopped.

- [ ] **Step 1: Write the failing tests** (`tests/camera.test.js`)

```js
const gap = (a, b) => Math.hypot(...a.position.map((v, i) => v - b.position[i]));

test('free throws are filmed close, from in front of the shooter and to the side', () => {
  const s = shooting(1, 2);                       // built as in freethrow.test.js: live(seed), newFreeThrow(0, shots), setupFreeThrow: player 0 on the line at x 8.2
  assert.equal(shotName(s), 'freeThrow');
  const { position, target } = cameraGoal(s, 0), p = s.players[0];
  assert.ok(position[0] > p.x && position[2] > p.z && Math.hypot(position[0] - p.x, position[2] - p.z) < 6);
  assert.deepEqual(target, [p.x, 1.4, p.z]);
});

test('the camera goes back to the broadcast view when the last free throw is released', () => {
  const s = shooting(1, 1);
  Object.assign(s.freeThrow, { stage: 'flight', live: true });
  assert.equal(shotName(s), 'broadcast');
});

test('the opening tip starts close on the two jumpers and pulls back once the ball is in play', () => {
  const s = createMatch(1); startMatch(s);
  assert.equal(shotName(s), 'tip');
  assert.deepEqual(cameraGoal(s, 0).target, [0, 1.5, 0]);
  s.phase = 'live';
  assert.deepEqual(cameraGoal(s, 3).position, [3, 11, 18]);
});

test('a move between views takes about 0.6 seconds and never cuts', () => {
  const from = { position: [0, 11, 18], target: [0, 0, 1] }, to = { position: [11, 2.2, 3.5], target: [8.2, 1.4, 0] };
  let pose = from, biggest = 0;
  for (let t = 0; t < 0.6; t += 1 / 60) { const next = easeCamera(pose, to, 1 / 60); biggest = Math.max(biggest, gap(next, pose)); pose = next; }
  assert.ok(gap(pose, to) < 0.02 * gap(from, to), 'not there after 0.6 s');
  assert.ok(biggest < 0.15 * gap(from, to), 'one frame moved more than a seventh of the way');
});
```

- [ ] **Step 2: Run them** — Expected: FAIL. — [ ] **Step 3: Implement.** — [ ] **Step 4:** `npm test` all PASS.
- [ ] **Step 5: Check it in the browser**

| Check | Expected |
|---|---|
| Opening tip | Starts close on the jumpers, pulls back as the ball is tapped |
| A foul with free throws | The camera glides in on the shooter; the meter and scoreboard stay on screen; it glides back as the last attempt leaves his hand |
| A missed last free throw | The rebound is seen from the broadcast view |
| Pause during a close-up | The view holds |

- [ ] **Step 6: Commit** — `git commit -m "feat: the camera moves in for free throws and the opening tip"`

---

### Task 14: Walking to the inbound spot

**Files:**
- Modify: `src/sim/tuning.js`, `src/sim/state.js`, `src/sim/rules.js`, `src/sim/step.js`, `src/sim/players.js`, `tests/rules.test.js`
- Create: `tests/walk.test.js`

**Interfaces:**
- Produces:
  - `tuning.js`: `WALK = f({ limit: 6, arrive: 0.1, slowWithin: 0.5 })`.
  - `state.js`: `createMatch` gains `walk: null`. While players are walking it is `{ spots: { [playerId]: { x, z } }, t }`.
  - `rules.js`: `stopPlay`, when it sets the phase to `dead` and there are no free throws to shoot, picks the inbounder now (the nearest of the team with the ball to `state.inboundSpot`) and sets `state.walk = { spots: { [his id]: spot }, t: 0 }`. In the `dead` phase `state.walk.t` counts up; the stoppage ends when `phaseT <= 0` **and** (every walker is within `WALK.arrive` of his spot **or** `walk.t >= WALK.limit`). `setupInbound` uses the walker as the inbounder when there is one, places him exactly as today (which is what happens to a blocked player at 6 s), and clears `state.walk`. `beginPeriod` still calls `setupInbound` with no walk: a cut.
  - `players.js`: `walkIntent(player, spot) -> Intent`: no keys, `moveX`/`moveZ` toward the spot, scaled down inside `WALK.slowWithin` so he stops on it, zero within `WALK.arrive`. A walker, like an inbounder, is not held inside the court's run-off by `clampToCourt`.
  - `step.js`: while `state.walk` is set, the intent of every player with a spot is replaced by `walkIntent` before `movePlayers`. Running speed, never a sprint. His real keys still update `prev`, as for any stopped phase.

- [ ] **Step 1: Write the failing tests** (`tests/walk.test.js`), using `tests/helpers.js`

```js
// The ball goes out off team 0 on the far sideline at x = 3: team 1 will inbound from (3, 8).
function whistle(seed = 1) {
  const s = live(seed);
  freeBall(s, { x: 3, y: 1, z: 7.6 }); s.lastTouch = 0;      // it drops outside the line
  run(s, 1, idle(), st => st.phase === 'dead');
  return s;
}
const walker = s => s.players[Number(Object.keys(s.walk.spots)[0])];

test('the inbounder is chosen when the whistle blows: the nearest of his team to the spot', () => {
  const s = whistle();
  assert.equal(s.phase, 'dead');
  assert.deepEqual([walker(s).team, walker(s).id], [1, 5]);   // z = 3 is the nearest row to the far sideline
});

test('he walks there, at a run and never a sprint, and the inbound starts when he arrives', () => {
  const s = whistle(), p = walker(s), from = { x: p.x, z: p.z };
  let fastest = 0;
  run(s, 8, idle(), st => { fastest = Math.max(fastest, Math.hypot(p.vx, p.vz)); return st.phase === 'inbound'; });
  assert.equal(s.phase, 'inbound');
  assert.ok(fastest > 3 && fastest <= 5.001, `fastest ${fastest}`);
  assert.deepEqual([p.x, p.z, p.inbounder, s.walk], [3, 8, true, null]);
  assert.ok(Math.hypot(from.x - 3, from.z - 8) > 4);          // he really had ground to cover
});

test('the stoppage is never shorter than the usual pause, however near he is', () => {
  const s = whistle(); at(s, walker(s).id, 3, 7.4);
  assert.equal(run(s, 1.4, idle(), st => st.phase === 'inbound'), false);
  assert.equal(run(s, 0.3, idle(), st => st.phase === 'inbound'), true);
});

test('a walker who cannot get there is placed after six seconds', () => {
  const s = whistle(), p = walker(s);
  const pinned = st => { at(st, p.id, -10, -5); return idle(); };          // dragged back every step
  assert.equal(run(s, 5.9, pinned, st => st.phase === 'inbound'), false);
  assert.equal(run(s, 0.3, pinned, st => st.phase === 'inbound'), true);
  assert.deepEqual([p.x, p.z], [3, 8]);
});

test('keys do nothing for a player who is being walked', () => {
  const s = live();
  freeBall(s, { x: 3, y: 1, z: 7.6 }); s.lastTouch = 1;                    // team 0 inbounds: the walker is one of yours
  run(s, 1, idle(), st => st.phase === 'dead');
  const p = walker(s); s.controlled = p.id;
  const away = only(p.id, { moveX: -1, moveZ: -1, sprint: true, shoot: true });
  run(s, 8, away, st => st.phase === 'inbound');
  assert.deepEqual([s.phase, p.x, p.z, p.y], ['inbound', 3, 8, 0]);
});

test('the clocks stay stopped while he walks', () => {
  const s = whistle(), clocks = [s.gameClock, s.shotClock];
  run(s, 8, idle(), st => st.phase === 'inbound');
  assert.deepEqual([s.gameClock, s.shotClock], [clocks[0], 24]);            // 24: the ball changed hands
});

test('the start of a period is still a cut: nobody walks', () => {
  const s = createMatch(1); startMatch(s); s.phase = 'quarterEnd'; s.phaseT = 0;      // the first quarter is over
  run(s, 0.05);
  assert.deepEqual([s.phase, s.walk], ['inbound', null]);
});
```

- [ ] **Step 2: Run them** — Expected: FAIL (`s.walk` is undefined).
- [ ] **Step 3: Implement.** Remove the `shortcut:` comment above `setupInbound`.
- [ ] **Step 4: Run all tests** — `npm test`. Older tests that wait a fixed time for an inbound to begin after a whistle (in `tests/rules.test.js`, `tests/whistle.test.js`, `tests/violations.test.js`) are changed to wait with `run(..., st => st.phase === 'inbound')`, up to 8 s; their assertions stay as they are. The whole-match tests in `tests/match.test.js` must pass unchanged.
- [ ] **Step 5: Commit** — `git commit -m "feat: the inbounder is picked at the whistle and walks to the spot"`

---

### Task 15: Walking to the free-throw spots

**Files:**
- Modify: `src/sim/freethrow.js`, `src/sim/rules.js`, `tests/freethrow.test.js`, `tests/walk.test.js`

**Interfaces:**
- Produces: `freeThrowSpots(state) -> { [playerId]: { x, z } }` in `freethrow.js`: the six places `setupFreeThrow` uses today (shooter on the line, two team-mates on `FT.offence`, three opponents on `FT.defence`, mirrored by hoop). `stopPlay` sets `state.walk = { spots: freeThrowSpots(state), t: 0 }` when free throws are to be shot. `setupFreeThrow` places all six from `freeThrowSpots`, as today, and clears `state.walk`. A substitution during the stoppage changes who stands in a slot, not where the slot walks.

- [ ] **Step 1: Write the failing tests** (`tests/walk.test.js`)

```js
// A shooting foul on player 0 by player 3, two shots, with everyone scattered.
function fouled(seed = 1) {
  const s = live(seed);
  s.players.forEach((p, i) => at(s, i, -6 + 2 * i, (i % 3 - 1) * 5));
  s.freeThrow = newFreeThrow(0, 2);
  s.call = { kind: 'shooting', team: 1, ball: 0, number: 5, shots: 2 };
  s.phase = 'dead'; s.phaseT = 1.5; s.walk = { spots: freeThrowSpots(s), t: 0 };
  return s;
}

test('before free throws all six walk to their places, and the first attempt waits for them', () => {
  const s = fouled(), spots = freeThrowSpots(s);
  assert.equal(Object.keys(spots).length, 6);
  assert.deepEqual(spots[0], { x: 8.2, z: 0 });
  assert.equal(run(s, 1.6, idle(), st => st.phase === 'freeThrow'), false);     // still walking after the usual pause
  assert.equal(run(s, 6, idle(), st => st.phase === 'freeThrow'), true);
  for (const p of s.players) assert.deepEqual([p.x, p.z], [spots[p.id].x, spots[p.id].z]);
  assert.deepEqual([s.walk, s.ball.holder, s.gameClock], [null, 0, 180]);
});

test('a foul call sets all six walking', () => {
  const s = firstSeed(seed => { const st = live(seed); run(st, 60, ai, x => x.phase === 'dead' && x.freeThrow); return st; }, st => st.freeThrow && st.phase === 'dead');
  assert.equal(Object.keys(s.walk.spots).length, 6);
});
```

- [ ] **Step 2: Run them** — Expected: FAIL (`freeThrowSpots` is not exported).
- [ ] **Step 3: Implement.** Remove the `shortcut:` comment above `setupFreeThrow`.
- [ ] **Step 4: Run all tests** — `npm test` — Expected: all PASS, with fixed waits in `tests/freethrow.test.js` changed as in Task 14.
- [ ] **Step 5: Measure** — 40 computer matches before and after this stage's two tasks: fouls, free-throw trips and substitutions per match stay within a tenth of their old averages (12, 10 and 57), and every match finishes. Record the numbers in the ledger.
- [ ] **Step 6: Commit** — `git commit -m "feat: players walk to their free-throw spots"`

---

### Task 16: The whole milestone in the single file

- [ ] **Step 1:** `npm test` all PASS; `npm run single` under 25 MB; null-origin check as in Task 6.
- [ ] **Step 2: Check it in the browser**, once through a quarter:

| Check | Expected |
|---|---|
| A ball out of bounds | The inbounder walks to the line holding nothing, then has the ball in his hands; no player appears from nowhere |
| A foul with free throws | Six players walk to the lane, the camera moves in, the shooter holds the ball, shoots a set shot |
| Your own player being walked | Your keys do nothing until play resumes |
| Start of quarter 2 | Players are lined up at once, as before |

- [ ] **Step 3: The gate.** Send `dist/triple-threat.html`. The owner plays a full match on both devices and says "merge" or lists what feels wrong.

---

## What the owner does

- Signs in to Mixamo in the app's browser if it has been logged out (Task 7).
- After each stage, plays the single file on the Chromebook and reports: the frame rate at High and at Low (G), and what looks or feels wrong.
- Says "merge" when the milestone is right.

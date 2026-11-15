# Player Models Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, in one session (the owner's rule: one developer, no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 16 players with real kit, better bodies and faces with expressions, modelled hair and gear, physically based skin that sweats, and two levels of detail, in five stages each shown before the next.

**Architecture:** The Blender build (`tools/blender/build_players.py`, split into `kit.py`, `hair.py`, `gear.py`, `maps.py`) makes `assets/players.glb`: per player a near and a far level of detail on one skeleton (52 Mixamo bones plus spring bones), with separate meshes per material (skin with morph targets, kit, hair and gear, eyes and mouth). At run time `src/render/people.js` stops joining everything into one mesh; new modules drive the spring bones (`springs.js`), the face (`face.js`), sweat (`sweat.js`) and the choice of level of detail (`lod.js`); `src/render/materials.js` builds the node materials per quality level.

**Tech Stack:** Blender 4.5 with MPFB 2.0.18 and the MakeHuman CC0 pack; Python with NumPy (Blender's) for generated maps; Three.js 0.187 `three/webgpu` node materials (TSL), WebGL 2 fallback; `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-player-models-design.md`

## Global Constraints

- Nothing under `src/sim/` changes. `npm test` stays green after every task.
- The 52 Mixamo bone names stay; new bones are named `kitJerseyFront`, `kitJerseyBack`, `kitShortsLeftFront`, `kitShortsLeftBack`, `kitShortsRightFront`, `kitShortsRightBack`, `hairLocsLeft`, `hairLocsRight`.
- Morph target names: `blink`, `effort`, `shout`, `dejected`.
- Material name prefixes the game reads: `skin`, `jersey`, `shorts`, `hair`, `gear`, `shoes`, `eyes`, `cornea`, `mouth`, `brows`, `lashes`. A far level of detail's nodes end in `-far`.
- CC0 only; nothing is downloaded. Every generated picture is made by `tools/blender/maps.py`.
- No skin under the kit, sleeves or shoes is shipped.
- Budgets (spec section 9): near ≤ 45,000 triangles, far ≤ 18,000 per player; ≤ 5 draw calls per player shown; `assets/players.glb` ≤ 35 MB; Low frame time ≤ 110% of the baseline, High ≤ 130%.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage explicit paths. Never push. Merge only on the owner's word.
- After each stage: `npm run single`, send `dist/triple-threat.html` (desktop app only: over 30 MiB).
- Looking in the browser: the hidden-pane technique in memory (`scratchpad/mkhidden.py`), files refreshed with `cache: 'reload'`. Server: `python3 -m http.server 5173 --bind 127.0.0.1`.
- `src/render/people.js` is not covered by `node --test`: `node --check` it after every edit.
- A full player build takes minutes: run it in the background and read its `BUILD` lines.

## Review Focus

1. **Extreme poses.** The windmill at 0.4, a layup's release, a sprint's stride, the defensive stance: cloth through a thigh or an arm. Expected: none visible on the film strips with the new kit; spring bones within 25 degrees. Checked in Tasks 6 and 13.
2. **A substitute coming on, a replay, a new match.** Expected: springs, sweat and expressions start from rest/dry/neutral; nothing carries over (`actors.cut`, `people.update` standing). Tests in Tasks 5, 9, 15.
3. **Quality changed mid-match (G).** Expected: materials and level of detail switch at once, no texture leak, no frame with no player drawn. Test in Task 18.
4. **Morph targets with the far level of detail.** Expected: the far mesh has none; expressions only touch the near head; switching level mid-expression shows no pop worse than the level change itself. Tests in Tasks 9 and 17.
5. **Old saves and the capsule fallback.** A file without the new bones or morph targets (an old `players.glb`) still loads, with springs and expressions simply off. Test in Tasks 5 and 9.

---

## Stage 0

### Task 1: The baseline and the evaluation tools

**Files:**
- Create: `tools/blender/sheets.py` (contact sheets of named players from `players.blend`), `scratchpad/frametime.mjs` (not committed)
- Modify: `tests/models.test.js` (budgets become the spec's)

- [ ] **Step 1:** `sheets.py`: `blender-4.5 --background assets/source/players.blend --python tools/blender/sheets.py -- --out DIR --players player-0-4,player-1-10,player-0-23` writes for each: whole body (front, three-quarter, back), head (front, three-quarter, side) and legs, with the EEVEE engine and a three-point light (not Workbench), so materials show. Run it on today's file into `docs/superpowers/stills/2026-11-15-models/before/` (committed: they are renders of our own models).
- [ ] **Step 2:** The frame-time measurement (`scratchpad/frametime.mjs`, pasted into the hidden test page): a five-a-side match in play, the game's own camera, the page at 1366x768, `#webgl` (WebGL 2: its context is the canvas's `getContext('webgl2')`). For each quality level: 60 frames to warm up, then 300 frames, each `__frame` followed by a one-pixel `readPixels`, which makes the GPU finish; the median frame time of three runs. Record the four numbers in the ledger as the baseline.
- [ ] **Step 3:** In `tests/models.test.js`: the 20,000-triangle and 15 MB limits become the spec's (near 45,000, far 18,000, 35 MB) — only once Task 13 makes the far level; until then the old limits stay. Ruling to record.
- [ ] **Step 4:** Commit `tools/blender/sheets.py` and the before sheets: `chore: contact sheets that show the players' materials, and today's as the baseline`.

---

## Stage 1: the kit

### Task 2: Generated fabric pictures

**Files:** Create `tools/blender/maps.py`, `assets/maps/` (generated tiles, committed), `tests/maps.test.js`

**Interfaces — produces** (each a PNG, written by `python3 tools/blender/maps.py` using NumPy, no Blender needed):
- `assets/maps/knit-normal.png`, `knit-rough.png` (512², tiling): round holes on a 2 mm grid at 1 tile = 4 cm.
- `assets/maps/twill-normal.png`, `twill-rough.png` (512², tiling): diagonal twill.
- Functions `tile_normal(height) -> rgb` (from a height field, wrapping at the edges), `knit(size)`, `twill(size)`.

- [ ] **Step 1: Tests** (`tests/maps.test.js`, reading the PNGs with a small PNG reader added to `tests/glb.js` or Node's zlib): each map is 512², its left and right edges match (|difference| ≤ 2 levels) and so do top and bottom; normals are unit length (decoded, within 0.05); the knit's roughness mean is within 0.7–0.85.
- [ ] **Step 2:** Run: FAIL (no files). **Step 3:** Write `maps.py`; run it. **Step 4:** PASS. **Step 5:** Commit.

### Task 3: The garments: thickness, bindings, panels, drape

**Files:** Create `tools/blender/kit.py`; modify `tools/blender/build_players.py`; test `tests/models.test.js`

**Interfaces — produces:** `make_kit(body, rig, mark) -> (jersey, shorts)`, each one object with sub-meshes by material: `jersey` (shell), `jersey-trim` (collar, arm-hole bindings, hem fold), `jersey-panel` (sides); `shorts`, `shorts-trim` (waistband, hem), `shorts-panel` (stripes). UVs: each material its own layout in the kit picture (`KIT_LAYOUT` in `kit.py`, mirrored as `KIT.layout` in `src/render/kit.js`).

- [ ] **Step 1: Tests** on the built file, for every player: the jersey and shorts have trim and panel primitives; the jersey's thickness (distance between its outer and inner surface, sampled at 20 points of the chest) is 3–5 mm; the jersey at the hem is 6–10 cm wider than the body's skin at that height all round (the far side of the skin bounds, by horizontal radius); no skin vertex is inside the jersey's or the shorts' covered height band, as now.
- [ ] **Step 2:** FAIL. **Step 3:** In `kit.py`: cut as today (move `make_jersey`, `make_shorts`, `tidy_border`, `panel_uvs` from `build_players.py`), loosen to the spec's fit, add the bindings (a ring of quads along each boundary loop, 1.5 cm, offset 3 mm), the side panels (faces within 3.5 cm of the side line), the hem fold, then Solidify 4 mm (applied). Drape: cloth modifier (`quality 6`, `mass 0.15`, pinned at the shoulders and waistband), body as collision, 40 frames, apply at frame 40; if the drape moves any vertex more than 6 cm, or intersects the body (a ray from each vertex inward hits the skin within 2 mm), the drape is dropped for that player and the build prints `KIT drape skipped`. Weights: Data Transfer from the skin, nearest face, after the drape.
- [ ] **Step 4:** Build (background). PASS. Contact sheets into `.../stage1/`.
- [ ] **Step 5:** Commit `feat: the kit as garments: 4 mm thick, with bindings, side panels and a cloth drape`.

### Task 4: Kit materials and painting

**Files:** Create `src/render/materials.js`; modify `src/render/kit.js`, `src/render/people.js`; test `tests/kit.test.js`, `tests/materials.test.js`

**Interfaces — produces:**
- `kit.js`: `KIT.layout` (regions of the kit picture by part), `kitOps(part, number)` extended with `trim` and `panel` regions; `heightOps(part, number)` (what is raised: the numbers and their outline); `normalFromHeight(pixels, size) -> pixels` (Sobel, wrapping off).
- `materials.js`: `kitMaterial(level, { map, normal, fabric }) -> Material` — `MeshPhysicalNodeMaterial` on High/Ultra (roughness 0.75 jersey / 0.85 shorts, sheen 0.3, `normalNode` = blend of fabric tile at 25 repeats with the per-player normal), `MeshStandardMaterial` on Low/Medium (map and roughness only).
- `people.js`: a player is now several meshes on one skeleton; the kit, skin, hair/gear, eyes/mouth each keep their own material. The one-atlas join is removed.

- [ ] **Step 1: Tests:** `kitOps` paints the trim regions in trim colour and the panels in team colour; `heightOps` covers the numbers' pixels and nothing in the panels; `normalFromHeight` of a flat field is all (0.5, 0.5, 1); of a raised square has normals pointing out at its edges; `kitMaterial('low', …)` is a `MeshStandardMaterial` with no normal, `kitMaterial('high', …)` a physical node material with sheen.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Draw calls per player now: skin, kit, hair/shoes (one material while Stage 3 is not done), plus hidden eyes.
- [ ] **Step 4:** `npm test` PASS; `node --check src/render/people.js`; stills in the game at Low and High; frame times at all levels into the ledger.
- [ ] **Step 5:** Commit `feat: the kit is drawn as cloth: mesh knit and twill, seams, raised numbers`.

### Task 5: Spring bones for the kit

**Files:** Create `src/render/springs.js`; modify `tools/blender/kit.py`, `src/render/animator.js`, `src/render/people.js`; test `tests/springs.test.js`

**Interfaces — produces:**
- Build: the six `kit*` bones (spec 5.4) added to each rig, at the hem's middle front/back and each shorts leg front/back, parent as specified, pointing down; weights blended toward them by height (0 at the waist / hip, 1 at the hem).
- `springs.js`: `SPRING = { stiffness: 60, damping: 9, limit: 25 degrees, gravity: 9.81 }`; `createSprings(model, names) -> { update(dt), reset() }` — for each found bone: a damped angular spring of its world direction toward its rest direction under its parent, driven by the parent's world acceleration (from the last two frames); clamped to `limit`; `dt` 0 does nothing; missing bones are skipped (an old file).
- `animator.update(...)` calls it after the motions and before `feet.plant`; `reset()` with the animator's.

- [ ] **Step 1: Tests** (a small skeleton built in the test: a root, a parent bone and a spring bone): at rest it stays at rest; when the root accelerates forward 4 m/s² for 0.2 s the spring bone swings back, never past 25 degrees, and settles within 0.05 rad of rest within 1.5 s after the root stops; `update(0)` changes nothing; `reset()` returns it to rest at once; a model without the bones gives no error and does nothing. With the real file: a run of 2 s at the run's speed then a stop leaves each kit bone within the limit throughout.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; rebuild the players. **Step 4:** PASS; stills of a sprint and a stop.
- [ ] **Step 5:** Commit `feat: the jersey hem and the shorts legs swing as he moves`.

### Task 6: Stage 1 review

- [ ] Film strips of the run, sprint, stance, jump, dunk, windmill and layup with the new kit (`build_motion.py --shots` uses `players.blend`'s first player: make it take the kit); fix any pass-through by the springs' limits or the weights (record a ruling). Contact sheets before/after side by side. Frame times at all levels against the baseline: within the budgets or cut back (lower drape resolution, simpler bindings). `npm run single`; send the file. Ledger: `Stage 1: complete`.

---

## Stage 2: body and face

### Task 7: More triangles where they show, and a muscle normal map

**Files:** Modify `tools/blender/build_players.py`; test `tests/models.test.js`

- [ ] **Step 1: Tests:** each player's skin has 70–80% of the generated body's triangles (the build writes the generated counts to `assets/source/counts.json`, which the test reads); the skin has a normal map (a `normalTexture` on its material, 1024²).
- [ ] **Step 2:** FAIL. **Step 3:** `KEEP['body'] = 0.75`; the protected group gains ears, hands (Hand bones), shoulders (Arm bones within 8 cm of the shoulder joint) and knees (within 8 cm of the knee). Bake: duplicate the body before simplifying, Subdivision level 1, bake tangent-space normals (Cycles, 64 samples is not needed: `bake_type='NORMAL'`, `use_selected_to_active`, extrusion 1 cm) onto the simplified skin, 1024². Keep normal maps on skin (today they are stripped).
- [ ] **Step 4:** Build; PASS; head and torso sheets. **Step 5:** Commit.

### Task 8: Eyes, cornea, brows, lashes, teeth and tongue

**Files:** Modify `tools/blender/build_players.py`, `src/render/people.js`, `src/render/materials.js`; tests `tests/models.test.js`, `tests/materials.test.js`

- [ ] **Step 1: Tests:** each player has `eyes` (the pack's high-poly), `cornea` (a sphere cap 1 mm proud of each eye), `brows`, `lashes`, `mouth` (teeth and tongue) primitives; `eyeMaterial`, `corneaMaterial` (transparent, roughness 0.05, depthWrite false), `cutoutMaterial` (brows and lashes, alpha test 0.4) exist for each level.
- [ ] **Step 2:** FAIL. **Step 3:** Build: eyes `high-poly`, teeth `teeth_base`, tongue `tongue01` via `add_mhclo_asset`; the cornea made in the build from the eye's front. Game: show them (not hidden), on the near level only from Task 13.
- [ ] **Step 4:** PASS; head sheets; a still in the game from 1.5 m. **Step 5:** Commit.

### Task 9: Expressions

**Files:** Create `src/render/face.js`; modify `tools/blender/build_players.py`, `src/render/people.js`; tests `tests/face.test.js`, `tests/models.test.js`

**Interfaces — produces:**
- Build: shape keys on the skin from MPFB's `data/targets/expression/units/<race>/` (the player's race), each expression the sum of its units at weight 1 (spec section 6 lists them), applied on the head region only; exported with `export_morph=True`, `export_morph_normal=False`. Teeth and tongue get no shape keys.
- `face.js`: `FACE = { blinkEvery: [2, 6], blinkFor: 0.12, ease: 0.15 }`; `createFace(mesh, seed) -> { update(dt, wants), reset() }` where `wants` is `{ effort, shout, dejected }` (booleans); `faceWants(player, marks, state) -> wants` (effort: in a finish, a fade or a step-back, or reaching; shout: `marks.show.celebrate === id`; dejected: `marks.show.dejected === id`).
- `people.js`: each person's `face` updated each frame; reset with the animator.

- [ ] **Step 1: Tests:** the file's skin has the four morph targets by name, and they move only vertices above the neck (all moved positions above the Neck bone's height); `createFace` blinks within 6 s, each blink lasting 0.12 s ± one frame, two faces with different seeds blink at different times; `effort` reaches full within 0.15 s of being wanted and returns to 0 within 0.15 s after; `reset()` is neutral; a mesh without morph targets gives no error (Review Focus 5); `faceWants` for a player in a finish is effort, for the celebrating one shout.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; stills of a dunk's effort and a celebration's shout from close. **Step 5:** Commit.

### Task 10: Stage 2 review

- [ ] As Task 6: sheets, stills, frame times, file sent. Ledger: `Stage 2: complete`.

---

## Stage 3: hair and gear

### Task 11: Modelled hair

**Files:** Create `tools/blender/hair.py`; modify `tools/blender/maps.py`, `build_players.py`, `assets/source/people.json`, `src/render/materials.js`; tests `tests/models.test.js`, `tests/maps.test.js`

**Interfaces — produces:** `make_hair(body, rig, style, colour, seed) -> object or None` for each style of spec 7.1; `maps.py` adds `strands-normal.png` (512², tiling) and `fade-mask.png`; `people.json` gains `hairStyle` (replacing `hair`; `short` keeps `hair` naming the pack's style) and the assignment of spec 7.3; `hairMaterial(level, colour)`; locs get the `hairLocsLeft`/`hairLocsRight` spring bones (springs from Task 5 pick them up by name).

- [ ] **Step 1: Tests:** every style in `people.json` is one of spec 7.1 and each is used at least once; each player with hair has a `hair` primitive whose lowest point is above his ear height except for locs; a `twists` player's hair has 60–90 separate pieces (connected components, counted from the index buffer); a `locs` player has the two spring bones; triangle counts of hair ≤ 9,000 (near).
- [ ] **Step 2:** FAIL. **Step 3:** Implement each style on the scalp found from the `scalp` vertex group: shells by offsetting along normals with a height function per style, clumps by 3D value noise, tubes by curves with bevel (8 sides) converted to mesh, braid lobes by UV spheres along curves on the scalp; all weighted to the Head bone (locs' lower parts to their spring bones). **Step 4:** Build; PASS; head sheets of every style. **Step 5:** Commit.

### Task 12: Gear and high-top shoes

**Files:** Create `tools/blender/gear.py`; modify `build_players.py`, `people.json`, `src/render/kit.js` (gear colours), `src/render/people.js`; tests `tests/models.test.js`, `tests/kit.test.js`

- [ ] **Step 1: Tests:** each item of a player's `gear` is a `gear` primitive in the file; the skin under a sleeve is gone (no skin vertex inside the sleeve's band); shoes' tops are 6 cm or more above the ankle bone; gear colours paint as `people.json` says (white, black, team).
- [ ] **Step 2:** FAIL. **Step 3:** Implement: bands and sleeves from the skin surface in their bands (as the kit), offset 2.5 mm, Solidify 2 mm; shoes from `shoes05` with the collar loop raised along the leg, the sole thickened and given a rim, colour regions in UVs. **Step 4:** Build; PASS; sheets. **Step 5:** Commit.

### Task 13: Stage 3 review

- [ ] As Task 6 (with the locs swinging in a sprint still). Ledger: `Stage 3: complete`.

---

## Stage 4: skin and sweat

### Task 14: Skin material, pores, scattering look, shadows

**Files:** Modify `tools/blender/maps.py` (pores 256², roughness and sweat masks per skin), `build_players.py` (masks baked per player into the skin's second texture: R roughness, G sweat mask), `src/render/materials.js`, `src/render/light.js`; test `tests/materials.test.js`

- [ ] **Step 1: Tests:** `skinMaterial('high', …)` has roughness never under 0.4 for any mask value with no sweat; a sheen colour; a pore normal at 40 repeats; `skinMaterial('low', …)` has none of these; the key light's `normalBias` is 0.02.
- [ ] **Step 2:** FAIL. **Step 3:** Implement with TSL (`roughnessNode = clamp(maskR, 0.4, 1)` etc.); the pore normal's strength fades from 1 at 2 m to 0 at 8 m from the camera (`positionView` length). **Step 4:** PASS; close stills at High. **Step 5:** Commit.

### Task 15: Sweat

**Files:** Create `src/render/sweat.js`; modify `src/render/materials.js`, `src/render/people.js`; test `tests/sweat.test.js`

**Interfaces — produces:** `SWEAT = { perEnergy: 3, perSecond: 1 / 600, dry: 1 / 300 }`; `createSweat() -> { update(state, dt), of(person) , reset() }` keyed by roster person; materials read a per-player uniform `sweat` (0–1): skin roughness × (1 − 0.55·sweat·mask), colour × (1 − 0.08·sweat·mask), droplets on Ultra; jersey colour × (1 − 0.12·sweat·jerseyMask).

- [ ] **Step 1: Tests:** a player on court for 10 minutes of hard play reaches 1 and never passes it; one sitting on the bench dries from 1 to 0 in 5 minutes ± 10 s; a new match starts every player at 0 (Review Focus 2); `dt` 0 changes nothing; with sweat 1 and mask 1 the skin's roughness is 0.45× its dry value but not under 0.2.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; stills at sweat 0 and 1 side by side. **Step 5:** Commit.

### Task 16: Stage 4 review

- [ ] As Task 6. Ledger: `Stage 4: complete`.

---

## Stage 5: levels of detail and speed

### Task 17: The far level of detail

**Files:** Modify `build_players.py` (a `-far` copy of each player's meshes: skin and kit simplified to the far budget, hair and gear simplified, no eyes, cornea, mouth, brows or lashes; bound to the same rig), export with WebP pictures (`export_image_format='WEBP'`); tests `tests/models.test.js`

- [ ] **Step 1: Tests:** each player has near and far meshes on one skin (same joints); near ≤ 45,000 and far ≤ 18,000 triangles; the far has no morph targets and no eyes or mouth; pictures are WebP; the file ≤ 35 MB; the single file ≤ 80 MB (the existing limit).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit.

### Task 18: Choosing the level and the material by quality

**Files:** Create `src/render/lod.js`; modify `src/render/people.js`, `src/render/materials.js`, `src/render/quality.js` (a `models` field per level: `near` distance, `physical` true/false); tests `tests/lod.test.js`, `tests/quality.test.js`

**Interfaces — produces:** `QUALITY[level].models = { near: 9 | 0, physical: bool }` (Ultra, High: 9 and true; Medium, Low: 0 and false); `levelOf(level, distance) -> 'near' | 'far'`; `people.setQuality(level)` swaps materials and the near distance at once (Review Focus 3).

- [ ] **Step 1: Tests:** High within 9 m is near and beyond is far; Low is always far; changing the level swaps every player's materials in one call and leaves exactly one level visible per player; at most five draw calls per player shown (meshes visible, counted).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit.

### Task 19: Measure, cut back, and say what was built

- [ ] **Step 1:** Frame times at every level against the baseline; if over budget: lower near distance, picture sizes, hair triangles, in that order, and record each change.
- [ ] **Step 2:** Final contact sheets before/after into `docs/superpowers/stills/2026-11-15-models/after/`; stills in the game at Low and Ultra.
- [ ] **Step 3:** The spec's "As built": each difference, the budgets met, what was not checked (the Chromebook).
- [ ] **Step 4:** Self-review against the Review Focus (one developer: say so); fix Critical/Important with a test each; `npm test`; `npm run single`; send the file. Nothing is merged without the owner's word.

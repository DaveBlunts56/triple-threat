# A Smarter Computer, Arcade and Simulation, Watch, and a Fast Simulation: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, as the session model. The owner asked for no subagents on other models, and the final review is the author's own. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- The computer decides like a basketball player and its coach coaches.
- Two modes you can choose, Arcade and Simulation, are completely independent of each other. Each can be played (Play) and watched (Watch).
- A fast possession engine (Simulate) produces believable full games around the 2025–26 averages. It is built from the same basketball logic as the 3D game.

**Architecture:**
- **Styles.** Every number a mode may change is read through `styled(state, key)` from a per-style table (`src/sim/styles.js`). Arcade's table is today's numbers, pinned by a fixture.
- **Shared logic.** The basketball logic is plain functions in `src/sim/`, called by both the 3D engine and the fast engine on the same match state:
  - the shot model (`shooting.js`);
  - tendencies (`tendencies.js`);
  - the decision maker (`choose.js`);
  - the coach (`coach.js`);
  - team data (`teams.js`);
  - possessions and advanced stats (`possessions.js`, `advanced.js`).
- **The fast engine** lives in `src/sim/quick/`.
- **The page** gains Watch, Simulate, a Game styles panel and slider panels.

**Tech stack:** JavaScript modules, Node's test runner, Three.js 0.187, `npm run single`.

**Spec:** `docs/superpowers/specs/2026-11-15-coach-and-sim-design.md`.

**Ledger:** `.superpowers/sdd/2026-11-15-coach-and-sim/progress.md`. This folder is git-ignored, as every earlier ledger was.

## The owner's priorities for this plan

1. **Arcade keeps today's gameplay and balance.** Its numbers do not move, and its pace, scoring and points per possession stay within 10% of the baseline recorded before any change (Stage 0).
2. **Simulation movement looks natural, with no gliding.** A glide meter measures how far the feet's ground speed differs from the body's. Simulation must slip less than Arcade does today (Task 4.3).
3. **Realistic behaviour on the court is tested alongside the statistics.** There are behaviour tests for every action, measured mixes (shot zones, play types, possession lengths, minutes), stills from the browser, and statistical bands.
4. **The two modes are completely independent** in settings and tuning (Task 1.1, Task 1.4, Task 6.3).
5. **USG% and play share are told apart in the tests.** The spec was amended for this.

## Global constraints

- **Branch and commits:**
  - Work on `feat/coach-and-sim`, cut from `main` at `8859bf0` with the spec's commit on top. Never push. Merge only when the owner says "merge".
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage files by path, never `git add -A`.
  - One developer, the session model, does everything. No subagents. The final review is a self-review, and the closing message says so.
- **Sim purity:** `src/sim/` imports nothing from `src/render/`, `src/broadcast/`, `src/audio/`, `src/replay.js`, `src/keys.js` or `src/prefs.js`. Tools in `tools/` may import from `src/render/motion.js`, which has no Three.js, to measure gliding.
- **The sim never calls `Math.random` or `Date.now`.** All chance goes through `rand(state)`. A grep test enforces this (Task 1.4).
- **No new asset, motion clip or sound.** A double team, a drop, a substitution and the walk-up use the clips that exist.
- **Invented names only, and nothing personal** in any file, commit or fixture.
- **Test first** wherever Node can reach. After every task, `npm test` passes.
- **After every stage, the stage gate runs.** Its numbers go in the ledger, and the stage is not finished until the gate passes.
- **Three a side works in every mode.** Only five a side at 12-minute quarters is calibrated.
- **Arcade's exact numbers** are `tests/fixtures/arcade-tuning.json`, recorded in Stage 0 from `main`'s `tuning.js`. A test compares Arcade's resolved style table with it for the whole build (Task 1.4). Arcade's table never changes. If a stage seems to need it to, that is a design question for the owner, not a tuning step.

## Independence of the two modes (applies to every task)

- **Two separate tables.** `STYLES.arcade` and `STYLES.sim` are two frozen objects. Each lists **every** styled key with its own value, and neither refers to the other. A test checks that both have the same keys, and that no value of one is the same object as the other's (Task 1.1).
- **Sliders belong to a style.** A match holds its own style and its own slider values. Arcade's sliders never change a Simulation match, and the reverse holds too (Task 1.4 tests both ways).
- **Shared logic is code, not numbers.** The coach, the decision maker and the shot model are shared; every number they read comes through `styled`. A behaviour that exists in only one mode is switched by a styled key, never by checking the style's name inside the logic. For example, `rules.lastTwo: false` in Arcade and `true` in Simulation.
- **Settings are saved per style and per mode** (Task 6.3): Play's style and quarters, Watch's style and quarters, Simulate's quarters, Arcade's sliders and Simulation's sliders.

## Performance budgets

Each is measured by `tools/sim/measure.mjs` (Node) or in the hidden browser pane, as the testing note describes. Stage 0 records the baselines.

| Measure | Baseline | Budget |
|---|---|---|
| Node: microseconds per 3D step, 5 a side, Arcade, computer match | Stage 0 (about 8 µs) | At most 1.5× the baseline |
| Node: microseconds per 3D step, 5 a side, Simulation | — | At most 2× the Arcade baseline |
| Fast engine: one 5-a-side game of 12-minute quarters | — | Median at most 5 ms (target). The test's guard is 10 ms, so a slow machine does not fail it. |
| `npm test` wall time | 11.5 s | At most 45 s |
| Browser frame time, 5 a side, High and Low, hidden pane, seeded | Stage 0 | Arcade within 5% of baseline; Simulation within 10% |
| `dist/triple-threat.html` size | Stage 0 (about 65 MB) | No more than 0.5 MB larger |

## The glide meter

Defined once, used in Stage 0, Task 4.3 and the gates.

- **What counts:** over a computer match in Node, every step of live play, every player on the floor moving at 0.3 m/s or more. The leg motion is taken from `legMotion(player, gaits, last)` in `src/render/motion.js`, with the gaits from `assets/motion.json`.
- **Slip:** `|rate × gait speed − ground speed| / ground speed`.
- **The meter reads two shares:** the share of moving player-steps whose slip is above 20%, and above 35%.
- **Measured on today's game** (seed 5, 3-minute quarters): above 20% on 11.1% of moving steps in both three and five a side; above 35% on 6.1% and 6.0%. The slips come from a creep under 1 m/s, held at the walk's slowest rate, and a jog of 2.2–3.1 m/s, held at the run's slowest rate (0.6 × 5.2 m/s).
- **Budgets:**
  - Arcade stays within 1.5 points of its baseline on both shares, since its render and movement are not touched.
  - Simulation must be at most 5.5% above 20% and at most 3% above 35%, and below Arcade's baseline on both.

## Review focus

1. **Arcade is today's game with a smarter computer.** Its table equals the fixture. Its match trace is identical through Stages 1–2. From Stage 3 its pace, points, points per possession and glide stay in their bands. Tests: Task 1.4 and the gates.
2. **Independence.** Nothing about Simulation (table, sliders, saved settings) changes an Arcade match, and the reverse holds. Tests: Tasks 1.4 and 6.3.
3. **The player you control.** Nothing in the coach or the decision maker moves him, calls for the ball for him or calls your timeouts. "Auto subs" off leaves your team to you. Tests: Tasks 3.2, 3.4 and 6.1.
4. **Counting possessions** in the awkward cases:
   - an and-one;
   - a trip of two or three free throws, missed and rebounded either way;
   - the end of a period with the ball held or in the air;
   - the opening tip;
   - a shot-clock violation;
   - a turnover on an inbound;
   - an offensive rebound off a missed last free throw.

   Test: Task 2.3.
5. **USG% and play share.** Separate functions, separate tests, separate bands. Tests: Tasks 2.4 and 5.5.
6. **Sliders at 0 and 100:** no chance outside 0 to 1, no negative time or speed, and every match still ends. Tests: Tasks 1.1 and 5.6.
7. **Gliding in Simulation.** Tests: Task 4.3 and the gates.
8. **Watch has no human in it:** no key reaches the match, both coaches act, and the difficulty level is the same for both sides. Test: Task 6.1.
9. **Determinism:** a seed gives the same 3D match and the same fast game. Tests: Tasks 1.4 and 5.6.

---

## Stage 0: The baseline, before anything changes

**Acceptance:**
- The measuring tool exists.
- Every fixture is recorded from code that matches `main` (the branch has only the spec on top).
- The baseline table is in the ledger.
- `npm test` passes (977 plus the new fixture tests).

### Task 0.1: The measuring tool

**Files:**
- Create `tools/sim/measure.mjs` and `tools/sim/README.md`.

**Interfaces (Produces, in `tools/sim/measure.mjs`):**
- `playHeadless({ seed, size, minutes, setup }) -> record`.
  - It plays one computer match with no renderer. `setup(state)` runs before `startMatch`; Stage 0 passes none.
  - **The record** holds:
    - both team lines (`teamLine`) and the final score;
    - the possessions this tool counts, by the spec's §8 rules, from watching `state` step by step (made baskets, the last free throw, defensive rebounds, turnovers, period ends). Before Task 2.3 this is the only count; afterwards it checks the game's own;
    - the box-score estimate `FGA − OREB + TOV + 0.44 × FTA` (on `main`, OREB comes from watching who takes each rebound);
    - possession lengths, in seconds of game clock;
    - shots by zone, by `ball.info` at release: at the rim (a finish, or within 1.5 m), close (1.5–3 m), mid-range, corner three (|z| > `THREE_PT.cornerZ`), and three above the break;
    - plays called, by key;
    - fouls by kind;
    - substitutions;
    - each roster person's seconds on court;
    - the glide meter's two shares;
    - microseconds per step.
- `summarise(records) -> table`: the mean and standard deviation of each per-team stat.
- The command line: `node tools/sim/measure.mjs --size 5 --minutes 3 --seeds 1-20 [--out file.json]` prints the table and, with `--out`, writes it.

**Steps:**
- [ ] **Step 1:** Write the tool. It is a measuring tool, not shipped code, so there is no test file. Check it by hand: one match's counted possessions match its possession changes, as worked out in the spec's §1 (about 112 a team in a 48-minute match).
- [ ] **Step 2:** `node --check tools/sim/measure.mjs`; run it once for each mode of match.
- [ ] **Step 3:** Commit `tools: a headless measuring tool for computer matches`.

### Task 0.2: Record Arcade's baseline

**Files:**
- Create:
  - `tests/fixtures/arcade-baseline.json`
  - `tests/fixtures/arcade-tuning.json`
  - `tests/fixtures/arcade-trace.json`
  - `tests/fixtures/shot-model.json`
  - `tests/arcade.test.js`

**Steps:**
- [ ] **Step 1: The baseline.** Run `measure.mjs` on three sets of matches and write the means and standard deviations to `arcade-baseline.json`:
  - three a side, 3-minute quarters, seeds 1–20;
  - five a side, 3-minute quarters, seeds 1–20;
  - five a side, 12-minute quarters, seeds 1–6.

  Also record each difficulty level's team-1 points per possession, five a side, 3-minute quarters, seeds 1–10, as the balance guard. Copy the table into the ledger.
- [ ] **Step 2: The numbers.** `arcade-tuning.json` is a JSON dump of every frozen export of `src/sim/tuning.js` (`COURT`, `RIM`, … `HEAT`).
- [ ] **Step 3: The trace.** `arcade-trace.json` holds, for seeds 1–3 (three a side, 3-minute quarters), the ball's and every player's position rounded to 1 mm every 60 steps, the score each quarter, and the final box score.
- [ ] **Step 4: The shot model.** `shot-model.json` holds `makeChance`, `shotWindow` and `contest` for 500 situations built from a fixed seed. Each situation sets:
  - the shooter's place;
  - the nearest defender's place and height;
  - the shooter's ratings and streak;
  - his energy;
  - `shotT`, fading or not;
  - the difficulty level.
- [ ] **Step 5: The tests.** In `tests/arcade.test.js`:
  - `'Arcade's numbers are today's'`: `tuning.js`'s exports deep-equal `arcade-tuning.json`. From Task 1.1 this becomes the style table check.
  - `'an Arcade match plays exactly as it did'`: replay the trace seeds and compare. This test stays until Task 3.5, where the decisions change on purpose. It is then replaced by the band test in Task 3.8, which the ledger records.
  - `'the shot model gives the numbers it gave'`: the 500 situations, compared exactly.
- [ ] **Step 6: The browser.** In the hidden pane, measure the frame time of a seeded five-a-side match in play: High and Low, 240 warm-up frames, then 300 frames, the median of 3 runs. Write the numbers and the single file's size in the ledger.
- [ ] **Step 7:** `npm test` passes. Commit `test: Arcade's baseline: its numbers, a match trace, the shot model and the measured averages`.

**Stage 0 gate:** the ledger holds:
- the baseline table, with points, points per possession, seconds per possession, FGA, 3PA, FTA, TOV, OREB, fouls, the shot mix and the play mix for each set of matches;
- the difficulty guard;
- the glide shares;
- µs per step;
- the browser frame times;
- the file size.

---

## Stage 1: Styles, sliders and the shared shot model. Arcade unchanged.

**Acceptance:**
- Every styled number is read through `styled`.
- Arcade's table equals the fixture.
- The Arcade trace is unchanged.
- The two modes are proven independent.
- µs per step stays within 5% of the baseline.

### Task 1.1: `styles.js`

**Files:**
- Create `src/sim/styles.js` and `tests/styles.test.js`.
- Modify `src/sim/state.js` (`createMatch`: `style: 'arcade'`, `sliders`, `styleTable`).

**Interfaces (Produces):**
- `STYLES = { arcade, sim }`: two frozen flat tables of dotted keys.
  - Arcade's values are taken from today's constants at module load (for example `'player.accel': PLAYER.accel`). Its comparison with `arcade-tuning.json` happens in a test, not by copying the numbers.
  - Simulation's table starts as an explicit literal copy of Arcade's values. Stage 4 changes it.
  - **The keys**, in groups. Stage 3 to Stage 5 add more, always to both tables at once:
    - `ai.*`: `patience`, `interval`, `jitter`, `releaseJitter`, `stealRate`, `farAway`, `contestDelay`, `startAt`
    - `player.accel`
    - `shot.curve` (`'line'` or a zone table), `shot.green` (`'sure'` or `'boost'`), `shot.boost`
    - `ft.model` (`'flat'` or `'touch'`)
    - `foul.*`: `reachFront`, `reachBack`, `shooting`, `charge`, `block`, `looseBall`, `illegalScreen`
    - `stamina.*`: `sprint`, `run`, `jump`, `rest`, `bench`, `subOut`, `subIn`
    - `rules.*`: `overtime`, `orebClock`, `lastTwo`
    - `timeout.*`: `each`, `rest`
    - `coach.*`: `rotation`, `adapt`
    - `react.*`: `contest`
    - `decide.*`: `temperature`, `spread`
    - `move.*`: `pacing` (`'free'` or `'gaits'`)
    - `form.sd`
    - `board.*`: `crash`
- `SLIDERS`: nine entries `{ key, label, scales: { 'styled.key': +1 | -1 } }`, in the spec's §7 order. A slider at `s` gives the factor `f = 0.5 + s / 100`. A `+1` key is multiplied by `f`; a `−1` key is divided by it. A key whose value is a range `[a, b]` has both ends scaled. A non-number key is never scaled.
- `setStyle(state, style, sliders = defaultSliders())`: sets `state.style` and `state.sliders`, and builds `state.styleTable`, the resolved values, once.
- `styled(state, key)`: reads `state.styleTable[key]`. It throws on an unknown key, so a misspelt key cannot silently read `undefined`.
- `defaultSliders()`: all nine at 50.

**Steps:**
- [ ] **Step 1: Failing tests:**
  - `'both styles list the same keys, and no value of one is the other's object'`.
  - `'a new match is Arcade with every slider at 50, and its table is Arcade's own'`.
  - `'each slider scales only its own keys, by 0.5 at 0 and 1.5 at 100, inverted where it says'`.
  - `'an unknown key throws'`.
  - `'at 0 and at 100 every chance stays within 0 to 1 and every time and speed is positive'`: every slider at each end, every styled number checked by its kind. Each key is tagged in `SLIDERS` as a chance or a positive quantity.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: styles and sliders: every number a mode may change is read through one table`.

### Task 1.2: Every styled number is read through the table

**Files:**
- Modify:
  - `src/sim/ai.js`, `players.js`, `fouls.js`, `stamina.js`, `rules.js`, `freethrow.js`, `roster.js`, `plays.js`, `late.js`, `offball.js`: each read of a styled number becomes `styled(state, key)`.
  - `tests/styles.test.js`.

**Steps:**
- [ ] **Step 1:** Write the failing test `'no styled number is read straight from tuning.js'`. It greps `src/sim/` for each styled constant's direct use (for example `AI.patience`, `PLAYER.accel`, `FOUL.shooting`, `STAMINA.run`) and allows it only in `styles.js`.
- [ ] **Step 2:** Implement, one file at a time, running `npm test` and the trace test after each.
- [ ] **Step 3:** Commit `refactor: the simulation reads its styled numbers through the style table`.

### Task 1.3: `shooting.js`, the shared shot model

**Files:**
- Create `src/sim/shooting.js` and `tests/shooting.test.js`.
- Modify `src/sim/players.js`: `contest`, `makeChance`, `shotWindow` and `shotTiming` become thin wrappers with the same names and exports, so every importer is unchanged. Also `src/sim/freethrow.js`: the computer's free-throw chance comes from `freeThrowChance`.

**Interfaces (Produces, all pure):**
- `contestShare({ gap, defence, airborne, fading })`: today's `contest` maths, from the defender's gap, defence rating, whether he is in the air close by, and a fade.
- `distanceChance(curve, { far, corner, three })`: `'line'` is today's straight line; a zone table gives each zone's chance.
- `timingShare(t, worst, best, lands)`: today's `shotTiming`.
- `shotChance({ curve, far, corner, three, timing, contest, energy, skill, heat, levelMake, fading, form = 1 })`.
- `windowHalf({ far, contest, energy, skill, heat, levelGreen })`.
- `greenChance(greenRule, chance, boost)`: `'sure'` gives 1; `'boost'` gives `1 − (1 − chance) × boost`.
- `releaseOffset(rand, jitter)`.
- `freeThrowChance(state, person)`: `'flat'` gives `FT.aiChance` (today); `'touch'` uses Stage 4's model.
- `expectedShot({ value, ... })`: the expected points of a shot, with the chance of a green release folded in. This is what the decision maker and the fast engine use.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'the shot model gives the numbers it gave'`, moved from `arcade.test.js`, which keeps the reference to it.
  - `'expectedShot of a green-sure style counts green releases as makes'`, `'... a boost style halves the miss'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes, the trace test included.
- [ ] **Step 5:** Commit `refactor: the shot model is plain functions both engines can call`.

### Task 1.4: Proof that the modes are independent

**Files:**
- Modify `tests/arcade.test.js`.
- Create `tests/independence.test.js`.

**Steps:**
- [ ] **Step 1:** Write the tests:
  - `'Arcade's resolved table equals today's numbers'`: every Arcade key against `arcade-tuning.json`, by the path it was taken from.
  - `'an Arcade match does not read the Simulation table'`: `STYLES.sim` is wrapped in a Proxy that throws on any read, for one whole Arcade match.
  - `'a Simulation match does not read the Arcade table'`: the same Proxy test, the other way round. Together with the test above, this proves neither style's numbers reach the other's matches.
  - `'a match's sliders are its own style's'`: `setStyle(state, 'arcade', sliders)` resolves only Arcade keys from Arcade's base. Two Arcade matches with the same seed, where the only difference is Simulation's sliders as the page holds them (0 and 100), play position for position alike. Task 6.3 tests that the page hands each match its own style's sliders.
  - `'the simulation never calls Math.random or Date.now'`: a grep over `src/sim/`.
  - `'a seed gives the same match twice'`: one Arcade and one Simulation match, five a side.
- [ ] **Step 2:** All pass. If one fails, fix the code, not the test.
- [ ] **Step 3:** Commit `test: Arcade and Simulation are independent of each other, and a seed replays exactly`.

**Stage 1 gate:**
- `npm test` passes, with the Arcade trace identical.
- µs per step is within 5% of the baseline.
- The ledger has its entry.

---

## Stage 2: Teams as data, tendencies, the box score and possessions. Arcade's play unchanged.

**Acceptance:**
- Teams, roles, playbooks, defences and coaches are data.
- Each person has tendencies and an IQ.
- Possessions are counted exactly.
- The box score has MIN, OREB and +/-.
- Advanced stats exist, with USG% and play share apart.
- The Arcade trace is still identical, apart from the new box-score fields.

### Task 2.1: `teams.js`

**Files:**
- Create `src/sim/teams.js` and `tests/teams.test.js`.
- Modify:
  - `src/sim/tuning.js`: `ROSTER` is built from `TEAMS[0]` and `TEAMS[1]`, with the same values.
  - `src/sim/state.js`: `createMatch(seed, size, teams = [0, 1])` keeps `state.teams` and fills `rosters` from `TEAMS`.
  - `tests/fixtures/arcade-tuning.json`: only the test that reads it, so that `ROSTER`'s new origin is accepted as long as its values are equal.

**Interfaces (Produces):**
- `TEAMS`: `[{ name, abbr, playbook, defence, coach, players: [{ name, number, position, role, ratings: { …eight }, tendencies?: {}, iq? }] }]`.
- `ROLES`: one entry for each of the twelve roles in use, giving its tendency priors (Task 2.2) and IQ base.
- `PLAYBOOKS`:
  - `paceSpace` (the Waves);
  - `insideOut` (the Scorpions);
  - `balanced`.

  Each holds `{ plays: { key: weight }, pace, threes, run }`.
- `DEFENCES`:
  - `switchAll` (the Waves);
  - `dropBig` (the Scorpions);
  - `standard` (`'over'`, today's).

  Each holds `{ screen: 'switch' | 'drop' | 'over', help, postDouble, crash, pressure }`.
- `COACHES`:
  - `steady`;
  - `aggressive`.

  Each holds `{ adapt, timeouts, depth }`.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'the two teams are today's: names, numbers, positions, roles and ratings unchanged'`, against the ROSTER fixture values.
  - `'every role in use has an entry, and every team names a playbook, a defence and a coach that exist'`.
  - `'a third team defined in a test plays a whole match'`: a test-only team appended for the test with the playbook `balanced`. Its fast-engine half arrives in Task 5.6.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes, with the trace identical.
- [ ] **Step 5:** Commit `feat: teams, roles, playbooks, defences and coaches are data`.

### Task 2.2: `tendencies.js`

**Files:**
- Create `src/sim/tendencies.js` and `tests/tendencies.test.js`.
- Modify `src/sim/state.js`: each roster person gains `tend` and `iq` at `createMatch`.

**Interfaces (Produces):**
- `tendenciesOf(player)`: `{ usage, diet: { rim, mid, three }, passFirst, drive, post, iso, crash, gamble, help, foul }`, each 0–1.
  - It starts from the role's priors.
  - The shot diet is weighted by the zone ratings: (rating / 70)³, normalised.
  - It is moved by the ratings: drive by speed and handle, post by inside, crash by rebound, gamble by defence.
  - The player's own `tendencies` override any of it.
- `iqOf(player)`: the role's base + (overall − 80) / 60, kept within 0.35–0.98. The player's own `iq` overrides it.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'each role's players look like their role'`:
    - Okoro's and Hale's three diet is their highest;
    - Lund's post is the highest on either team;
    - Cross's pass-first is above every Scorpion's;
    - Marsh and Whitaker drive most;
    - Stone and Ilic help most.
  - `'an override wins'`, `'IQ stays within its range'`, `'overall is unchanged'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: every player has tendencies and an IQ from his role and ratings`.

### Task 2.3: Counting possessions

**Files:**
- Create `src/sim/possessions.js` and `tests/possessions.test.js`.
- Modify `src/sim/rules.js`, `src/sim/freethrow.js` and `src/sim/players.js` (`giveBall`) to call `endPossession` where a possession ends.
- Modify `src/sim/state.js`: `possessions: [0, 0]`, `possessionStart`, and `state.boardTeam` (the team whose shot is loose).

**Interfaces (Produces):**
- `endPossession(state, team, why)`, where `why` is one of `'made' | 'ft' | 'dreb' | 'tov' | 'period'`.
  - It counts one for `team` and notes the possession's length in `state.lengths[team]`, a running sum and count.
  - A possession ends once only: a second end before a new one has begun is ignored.

**Steps:**
- [ ] **Step 1:** Failing tests, each a small situation, one per case in Review Focus 4:
  - a made two ends it; an and-one ends it after the free throw;
  - two free throws: made, or missed then rebounded by the defence, end it;
  - missed then rebounded by the offence does **not** end it;
  - a steal, a travel, a shot-clock violation and an inbound thrown away end it;
  - the end of a period with the ball held ends it, and with a shot in the air that then goes in ends it once;
  - the tip does not count, and begins team A's first.

  Plus `'over 10 whole matches the two teams' counts differ by at most one in every period, and the box-score estimate is within 4% of the count'`. On today's play the estimate is expected to be close; the test records what it finds, and the ledger notes the difference.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes, with the trace identical (counting changes nothing).
- [ ] **Step 5:** Commit `feat: possessions are counted where they end, the same way in every engine`.

### Task 2.4: The box score's new columns, and advanced stats

**Files:**
- Create `src/sim/advanced.js` and `tests/advanced.test.js`.
- Modify:
  - `src/sim/stats.js`: `STAT_KEYS` gains `orb`, `min` (seconds) and `pm`.
  - `src/sim/players.js` (`giveBall`): offensive rebounds by `state.boardTeam`.
  - `src/sim/rules.js`: minutes accrue for the ten on court as the game clock runs.
  - `src/sim/state.js` (`addPoints`): +/- for the ten on court.
  - `src/render/hud.js` and `index.html`: the in-game box score adds MIN and +/-.
  - `tests/stats.test.js` and `tests/hud.test.js`.

**Interfaces (Produces, in `advanced.js`, from lines alone):**
- `possessionEstimate(line)`, `pace(possessions, minutes)`, `rating(points, possessions)`, `efg(line)`, `ts(line)`.
- `usg(line, team, teamMinutes)`: the standard USG%, by the spec's formula.
- `playShare(line, team)`: his plays over the team's, with the team's own turnovers counted in the total.
- `astPct`, `tovPct`, `orbPct(line, team, opp)`, `drbPct`, `ftRate`, `threeRate`.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'MIN adds up to five times the game played for each team'`, `'+/- adds up to five times the margin'`, `'OREB is a rebound of your own team's miss and DREB is the rest'`.
  - USG%:
    - `'USG% is the standard rate: a worked line gives the known answer'`: a hand-made line from a published worked example, computed by hand in the test;
    - `'the minutes-weighted mean USG% of a team is 20%'`, within 0.5, with team turnovers accounted for.
  - Play share: `'play shares add up to 100% for a team'`; `'a player's USG% and play share differ unless he played every minute'`.
  - Everything else: each formula on a hand-made line; and that the in-game box score shows MIN and +/-.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes, with the trace identical apart from the new keys. The trace fixture's box-score comparison ignores keys it did not record.
- [ ] **Step 5:** Commit `feat: minutes, offensive rebounds and +/- in the box score, and the advanced stats`.

**Stage 2 gate:**
- `npm test` passes.
- The Arcade trace is identical.
- µs per step is within 5%.
- The ledger has the counted-against-estimated possessions for the Stage 0 matches. This is the possession audit: it confirms or corrects the spec's §1 finding.

---

## Stage 3: The coach and the decision maker, in both modes

**Acceptance:**
- **The coach:** both coaches call plays from their playbook and adjust during the game; matchups follow threats; rotation and timeouts run.
- **Players:** handlers choose by expected points; defenders scout, help, rotate and close out by IQ; reaction times and mistakes differ by player.
- **Schemes:** switch, drop and over work.
- **Teams differ** in measured ways.
- **Arcade:** within its bands of the baseline (gate).

### Task 3.1: `choose.js`

**Files:**
- Create `src/sim/choose.js` and `tests/choose.test.js`.

**Interfaces (Produces):**
- `choose(state, options, iq, side)`. `options` is a list of `{ key, value, ... }` in expected points, with `−Infinity` for an option not allowed; `side` is `'offence'` or `'defence'`.
- It picks at random, weighted by `exp(value / T)`, where `T = styled('decide.temperature') × (1.25 − iq) × the side's IQ-slider factor (inverted)`.
- It returns the option, and `null` if every option is `−Infinity`.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'a sharp player nearly always takes the best'`: iq 0.98, best by 0.3 points, ≥ 95% over 2,000 draws.
  - `'a poor one sometimes does not'`: iq 0.4, 15–45%.
  - `'an option not allowed is never taken'`, `'the same seed draws the same'`.
  - `'the IQ slider sharpens and blurs'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: a decision maker that weighs options by expected points and errs as a player's IQ allows`.

### Task 3.2: The coach's offence: phases, play calls, timeouts

**Files:**
- Create `src/sim/coach.js` and `tests/coach.test.js`.
- Modify:
  - `src/sim/plays.js`: `stepPlays` asks `pickPlay` for the coach's choice, and `suits` stays.
  - `src/sim/late.js`: `wantsTimeout` moves to `coach.js` and is re-exported.
  - `src/sim/step.js`: both coaches call timeouts, except the coach of a team with a human. Today that is team 0 in Play: your timeouts stay yours.
  - `src/sim/state.js`: `coach: [..]`, and `humans: [0]`.

**Interfaces (Produces):**
- `phaseOf(state, team)`: one of `'bring' | 'early' | 'set' | 'action' | 'late' | 'ato' | 'last'`.
- `pickPlay(state, team)`. Its weight is the playbook's weight × `suits` × the mismatch it hunts × `memoryWeight` × a small random factor.
- `memoryWeight(state, team, kind)`: `exp(k × (PPP_kind − PPP_all))`, with each kind's PPP shrunk toward the team's own by 6 possessions of prior.
- `remember(state, team, kind, points)`, called when a possession ends (Task 2.3).
- `wantsTimeout(state, team)`: today's two reasons (a run, tired legs), plus a play after the timeout and, in Simulation, late-game clock stops by `situation()`.
- `lastShot(state, team)`: hold for the last shot, or go for a 2-for-1, by game clock against shot clock.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'the Waves call more pick-and-rolls and the Scorpions more post-ups and clear-outs'`: 400 calls each, from a set situation.
  - `'a play that has scored is called more, but one basket does not swing it'`.
  - `'a big switched onto the handler draws a clear-out'`: the mismatch hunt.
  - `'after a timeout the coach calls what has worked best'`.
  - `'with 30 s on the game clock and 24 on the shot clock a team goes for two-for-one; with 20 it holds for the last shot'`.
  - `'both coaches call timeouts in a match with no human, and team 0's coach never does in Play'` (Review Focus 3).
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes. Tests in `tests/plays.test.js` that relied on the old random pick are rewritten to pin the behaviour (the play is one the playbook allows), and the ledger lists each.
- [ ] **Step 5:** Commit `feat: a coach that calls plays from his playbook, hunts mismatches and learns what works`.

### Task 3.3: The coach's defence: scheme, matchups, adjustments

**Files:**
- Modify:
  - `src/sim/coach.js`;
  - `src/sim/matchups.js`: `ownMen` uses the coach's assignment; `screenSwitches` follows the scheme;
  - `src/sim/ai.js`: `adapted()` is replaced by the coach's adjustments, for both teams. In Play your team's coach does not adapt (as today), and the computer's adapts as the level says.
  - `tests/coach.test.js`, `tests/matchups.test.js`.

**Interfaces (Produces):**
- `schemeOf(state, team)`: `{ screen, help, postDouble, crash, pressure, tight }`.
- `assignMatchups(state, team)`: every order of the five is tried (120 orders). The best defender gets the threat with the highest (usage × overall). The rest are matched to keep speed and size close.
- `adjust(state, team)`, at stoppages:
  - if the other team's pick-and-roll is scoring, change the scheme;
  - put the best defender on a hot scorer;
  - play tighter on a team whose threes are falling;
  - gamble less in foul trouble.

  How far it goes is set by `COACHES[...].adapt × styled('coach.adapt')`.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'the best defender guards the other team's main threat'`: the Scorpions' Ortiz (lockdown guard) or Reyes guards Cross; the Waves' Vance guards Mercer when he is on.
  - `'a switching team swaps men when a screen is set, even if nobody is lost'`; `'a team that goes over swaps only when lost, as today'`.
  - `'a team being beaten by the pick-and-roll changes its scheme at the next stoppage'`.
  - `'tighter on shooters once threes are falling, for whichever team is shooting them'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: the coach's defence: matchups by threat, a scheme for screens, and adjustments`.

### Task 3.4: Rotation and substitutions

**Files:**
- Modify `src/sim/roster.js` (`applySubs`, by `styled('coach.rotation')`) and `src/sim/coach.js` (`rotationPlan`, `wantsRest`).
- Create `tests/rotation.test.js`.

**Interfaces (Produces):**
- `rotationPlan(state, team)`: target minutes by overall and role, scaled to the game's length.
- `'energy'` is today's behaviour, exactly. `'plan'` (Simulation) adds:
  - stint ends;
  - foul trouble by quarter (2/3/4/5, scaled to the foul limit);
  - starters beginning each half;
  - starters closing a close game;
  - garbage time (20 or more points in the last 5 minutes).

**Steps:**
- [ ] **Step 1:** Failing tests, in a Simulation match at 12-minute quarters:
  - `'starters play about 32–36 minutes and the eighth man 10–14'`, over 6 matches;
  - `'two fouls in the first quarter sits a starter until the second'`;
  - `'the starters start the second half'`;
  - `'a 25-point lead with 4 minutes left empties both benches'`;
  - `'with Auto subs off your team is left to you, and your own picks stand'` (Review Focus 3).
  - In Arcade: `'substitutions are as they were'`, compared with today's rule on a set situation.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: in Simulation the coach plays a rotation; in Arcade substitutions are as they were`.

### Task 3.5: The handler decides by expected points

**Files:**
- Modify `src/sim/ai.js` (`planWithBall`) and `tests/ai.test.js`.
- Create `tests/decisions.test.js`.

**What changes:**
- **The hard rules come first, in today's order:**
  - the inbound;
  - a shot already begun;
  - a move under way;
  - behind the board;
  - the shot clock or the period running out;
  - "settled";
  - a step-back just made;
  - legal passes;
  - not passing straight back to the passer;
  - the back-court count.
- **Then the soft choices** become options for `choose`:
  - **Shoot:** `expectedShot` with his real gap, plus foul-drawing.
  - **Drive:** when the lane is clear, or a finish is near.
  - **Pass to each legal team-mate:** that man's `expectedShot` on the catch, × the chance the pass gets through, less a delay cost.
  - **Each move that is right:** as today's conditions say.
  - **Post up:** for a post scorer.
  - **Hold:** the play forming, or using the clock, worth the possession's average.
- **Biases and pressure:**
  - The player's tendencies bias each option: usage and diet toward his own shot, pass-first toward passes.
  - Clock and score pressure:
    - early in the clock, by the style's patience: shoot and drive are worth less unless the look is excellent;
    - late: hold is worth less;
    - `situation()`: hurry, milk, clutch.
- **Mistakes:**
  - **A misread:** with chance `(1 − iq) × k`, a pass option is valued as if the lane were clear when it is not.
  - **Forcing it:** for a usage of 0.6 or more, his own shot is valued above its worth.

**Steps:**
- [ ] **Step 1:** Failing tests, in `decisions.test.js`, each from a set situation:
  - `'a wide-open shooter takes the catch-and-shoot three'`; `'a poor shooter with room passes to a good one'`.
  - `'a handler with a clear lane early in the clock still drives if every defender is behind him'`.
  - `'late in the clock he shoots what he has'`; `'ahead late he uses the clock'`.
  - `'a low-IQ passer sometimes throws into a defender's lane and it is picked off'`.
  - `'a high-usage scorer sometimes shoots over a contest with a man open'`.
  - `'the sharpshooter waits for his look, the slasher attacks, the shot creator takes tough shots, the playmaker passes'`: measured over 20 Watch matches as shares of each role's possessions ended by a shot, a drive or an assist.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
  - The trace test `'an Arcade match plays exactly as it did'` is retired here, as planned. The ledger says so.
  - Each test in `tests/ai.test.js` that pinned an exact choice is either still right (kept), or rewritten to pin the behaviour. The ledger lists each one and why.
- [ ] **Step 5:** Commit `feat: the ball handler weighs his options by expected points, with his tendencies and his mistakes`.

### Task 3.6: Defence: scouting, help, rotations, closeouts, schemes, reaction times

**Files:**
- Modify `src/sim/ai.js` (`planDefence`, `helps`, `aiIntents`) and `src/sim/matchups.js`.
- Create `tests/schemes.test.js`.
- Modify `tests/ai.test.js`.

**What changes:**
- **On-ball gap:** today's rule, with a scouting factor from his man's diet (tight on shooters, off non-shooters) and the scheme's `pressure`.
- **Help:** helping is chosen against staying: the threat at the rim against his own man's threat. The rotation behind it is "help the helper", extended so the nearest man takes the open one.
- **Drop:** the screener's defender stands 3.5 m in front of the rim on the handler's line until the handler is past the screen. The ball's defender goes over.
- **Post double:** a post scorer with inside ≥ 85 who catches within 4 m draws the defender of the nearest perimeter man who is not a shooter. Everyone else rotates.
- **Closeouts:** under control or flying, by IQ. A flying closeout's target is 0.4 m past the shooter, and it is slow to stop with Simulation's acceleration, so the drive is open.
- **Ball-watching:** an off-ball defender with low IQ drifts toward the ball. His reaction to his man's cut comes after his reaction time plus a ball-watching delay.
- **Reaction times:**
  - Each player's decision interval is `styled('ai.interval') × (1 + styled('decide.spread') × (0.7 − iq))`. Arcade's average stays today's.
  - The contest delay is drawn from `styled('react.contest')`, scaled by IQ.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'in a drop the big sits between the ball and the rim until the handler is past the screen'`.
  - `'a switching defence swaps on the screen'`, `'going over keeps men unless one is lost'`.
  - `'a post scorer catching deep draws a double, and the open man is taken by the nearest rotation'`.
  - `'a ball-watching defender gives up a backdoor cut that a sharp one stops'`.
  - `'a flying closeout gives the shooter a drive; a controlled one does not'`.
  - `'a sharp defender reacts sooner than a slow one'`.
  - `'Arcade's average decision interval is today's 0.3 s'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: defenders scout, help and rotate, close out by IQ, and play their coach's scheme`.

### Task 3.7: Off the ball: cuts as choices, crash or get back

**Files:**
- Modify `src/sim/offball.js` and `src/sim/ai.js` (`planFreeBall`).
- Modify `tests/offball.test.js`.

**What changes:**
- **Cuts:** a cut is chosen when its expected value beats staying: the cutter's chance of a layup against his defender's attention and help.
- **Rebounds:** who crashes and who gets back follows the playbook's and the defence's `crash` and each player's `crash` tendency, instead of today's fixed two.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'a cutter whose man is watching the ball cuts; one who is guarded stays'`.
  - `'the Scorpions send more to the offensive glass than the Waves, who get back'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: cuts are chosen, and teams crash the glass or get back as their style says`.

### Task 3.8: The Arcade band test and team identities

**Files:**
- Modify `tests/arcade.test.js`.
- Create `tests/identity.test.js`.

**Steps:**
- [ ] **Step 1:** Write the tests:
  - `'Arcade stays Arcade'`, in computer matches at 3-minute quarters (6 of three a side and 6 of five a side; deterministic seeds):
    - points, points per possession and seconds per possession each within 10% of `arcade-baseline.json`;
    - the glide shares within 1.5 points.
  - `'the two teams play differently'`, over 10 Watch matches in Simulation. Simulation's table is still Arcade's until Stage 4, so these are measured in both:
    - the Waves' three-point rate is above the Scorpions';
    - the Scorpions post up more and grab more offensive rebounds;
    - the Waves switch more.
- [ ] **Step 2:** Both pass. If Arcade is out of a band, tune the decision numbers. Arcade's own numbers are not touched. Those decision numbers are its `decide.*` entries, which are new and so not in the fixture.
- [ ] **Step 3:** Commit `test: Arcade stays within its baseline, and the two teams have identities`.

**Stage 3 gate:**
- `npm test` passes.
- **Measured against the baseline** with `measure.mjs`, all three sets of matches:
  - Arcade's points, points per possession and seconds per possession are within 10%;
  - each difficulty level's points per possession is within 10%;
  - the glide shares are within 1.5 points;
  - µs per step is at most 1.5× the baseline.
- **The ledger records** the play mix, the shot mix and the decisions by role, as numbers.
- **In the browser** (hidden pane), stills of an Arcade match:
  - a pick-and-roll against the Scorpions' drop;
  - a switch by the Waves;
  - a double on Lund;
  - a closeout.

---

## Stage 4: Simulation in the 3D game

Stage 4 changes `STYLES.sim` only. **Acceptance:**
- A 48-minute five-a-side Watch match in Simulation is within the spec's targets widened by 15%.
- The glide meter is within its budget.
- Behaviour tests pass.
- Arcade is unchanged: its table equals the fixture, and its band test passes.

### Task 4.1: Simulation's rules

**Files:**
- Modify `src/sim/styles.js` (Simulation's values), `rules.js`, `fouls.js` and `coach.js`.
- Create `tests/simrules.test.js`.

**The values:**

| Key | Simulation |
|---|---|
| `rules.overtime` | `quarterLength × 5 / 12` |
| `rules.orebClock` | 14 (Arcade: 24, today) |
| `rules.lastTwo` | `true` |
| `timeout.each` | 7 |
| `timeout.rest` | 0.12 |

`CLOCK.timeout` stays 3 s of game time in both. A Simulation timeout is a pause in play, not 75 real seconds.

**Steps:**
- [ ] **Step 1:** Failing tests, each in both styles:
  - `'overtime is 5 minutes after 12-minute quarters in Simulation and 60 s in Arcade'`;
  - `'an offensive rebound resets the shot clock to 14 in Simulation and to 24 in Arcade'`;
  - `'in the last two minutes of a period a team's second foul is shot in Simulation; in Arcade only the bonus counts'`;
  - `'7 timeouts in Simulation and 3 in Arcade'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: Simulation's rules: overtime, the 14-second reset, the last-two-minutes bonus, seven timeouts`.

### Task 4.2: Simulation's shooting and free throws, and form on the night

**Files:**
- Modify `src/sim/styles.js`, `shooting.js`, `players.js` (`releaseShot`: the green rule; a person's `form`), `freethrow.js` (the meter's centre gives the shooter's own chance) and `state.js` (`form`, drawn per person at `startMatch` with `styled('form.sd')`; Arcade's is 0).
- Create `tests/simshot.test.js`.

**The values:**
- **`shot.curve`, a zone table.** These are the open-shot chances before the defender, rating, fatigue and timing apply; the calibration in Task 4.7 sets the final numbers.

  | Zone | Starting chance |
  |---|---|
  | At the rim | 0.70 |
  | Close | 0.52 |
  | Mid-range | 0.46 |
  | Corner three | 0.42 |
  | Three above the break | 0.39 |

- **Green:** `shot.green: 'boost'`, `shot.boost: 0.5`.
- **Free throws:** `ft.model: 'touch'`. The chance is `0.78 + ((mid + three) / 2 − 75) × 0.006`, kept within 0.55–0.93.
- **Form:** `form.sd: 0.05`.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'in Simulation a green release halves the miss; in Arcade it always goes in'`.
  - `'a Simulation shot's open chance is its zone's'`: one shooter rated 70, one shot per zone, `shotChance` against the table.
  - `'a good shooter's free throws go in about as his touch says, for you and for the computer; Arcade's are as they were'`.
  - `'form is drawn once a match, differs between players, and is 1 in Arcade'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: Simulation's shooting by zone, a green release that helps, free throws by touch, and form on the night`.

### Task 4.3: Simulation's movement and pace, and no gliding

**Files:**
- Modify `src/sim/styles.js`, `src/sim/ai.js` (`goTo`, `act`: pacing) and `src/sim/plays.js` (`PLAY.startAt` read through `styled`).
- Create `tests/glide.test.js`. It reads `assets/motion.json` and `src/render/motion.js`; it is a test, not the sim.
- Modify `src/render/motion.js` only under Step 5's rule.

**The values and the pacing:**
- **Acceleration:** `player.accel` 14.
- **Pacing, `move.pacing: 'gaits'`.** A player's asked speed is snapped to a natural gait band for the clips:
  - standing;
  - a walk of 1.1–2.1 m/s (the walk clip at 0.6–1.15 of its rate);
  - a run of 3.2 m/s or more (the run clip at 0.6 or more);
  - a sprint.

  The slip band of 2.2–3.1 m/s is never asked for. Arriving at a spot, he walks to it and stops instead of creeping in. He sprints only to cut, close out, run the floor, get back or chase a loose ball.
- **Possession pace:**
  - `ai.patience` [9, 15]: seconds into the shot clock before an outside shot is welcome without an excellent look;
  - `ai.startAt` 5;
  - the walk-up at walking pace when nobody presses;
  - the transition choice from the coach's Bring phase.

**Steps:**
- [ ] **Step 1:** Failing tests in `glide.test.js`, each over one 5-a-side match at 3-minute quarters, seed 5:
  - `'Arcade glides no more than it did'`: both shares within 1.5 points of `arcade-baseline.json`.
  - `'Simulation's feet keep to the floor'`: no more than 5.5% of moving steps above 20% slip and 3% above 35%, and below Arcade's baseline on both.
  - `'in Simulation nobody is asked to move between a walk and a run'`: the share of moving steps between 2.3 and 3.0 m/s, outside the first 0.4 s of a speed change, is under 3%.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement the pacing.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Only if Step 4 cannot meet the budget by pacing, a Simulation-only gait edge in `src/render/motion.js`: `walkBelow` 2.8 when `state.style === 'sim'`, read from the state that is already passed in. A test then checks that Arcade's leg motions are unchanged. The ledger records which way it was met.
- [ ] **Step 6: The browser.** Stills and a short run of frames in Simulation: the walk-up, a jog to a spot, a cut, a closeout, a back-pedal. The feet are checked for sliding by eye, and the ledger records a still of each.
- [ ] **Step 7:** Commit `feat: Simulation moves with weight, walks the ball up and keeps its feet on the floor`.

### Task 4.4: Simulation's fouls and turnovers

**Files:**
- Modify `src/sim/styles.js`, `src/sim/fouls.js` (loose-ball and illegal-screen fouls) and `src/sim/players.js` (a contested catch can be fumbled, in Simulation only).
- Modify `tests/fouls.test.js`.
- Create `tests/simfouls.test.js`.

**What changes:**
- **Loose-ball foul:** two players of opposite teams in contact during a rebound, after a box-out, with chance `foul.looseBall` (0 in Arcade).
- **Illegal screen:** a screener moving faster than `FOUL.setSpeed` at contact with a defender, while his team has the ball, with chance `foul.illegalScreen` (0 in Arcade). It is an offensive foul: a turnover, and the ball changes hands.
- **Fumbled catch:** in Simulation, a catch with a defender within 1 m. The chance is `0.02 × drop(handle, 0.1) × the Ball security factor`; the ball goes loose.
- **Shooting fouls on drives:** a finish with a defender within 1.2 m draws contact at the styled chance. And-ones follow from the existing rule.

**Steps:**
- [ ] **Step 1:** Failing tests: each new foul, and the fumble, in Simulation; and each is impossible in Arcade.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: Simulation's loose-ball and illegal-screen fouls, contact on drives, and fumbled catches`.

### Task 4.5: Simulation's fatigue

**Files:**
- Modify `src/sim/styles.js` (`stamina.*` for 48 minutes: the drains about a quarter of Arcade's, recovery set so that a stint of 8–10 minutes ends near `subOut`).
- Create `tests/simfatigue.test.js`.

**Steps:**
- [ ] **Step 1:** Failing tests, in Simulation at 12-minute quarters:
  - `'a starter who never rests reaches the sub-out level after 8–12 minutes of play'`;
  - `'a bench player is ready again after about 4–6 minutes'`;
  - in Arcade, `'fatigue is as it was'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: Simulation's fatigue is sized for 48 minutes`.

### Task 4.6: Simulation's reaction times and defensive habits

**Files:**
- Modify `src/sim/styles.js`:
  - `react.contest` [0.12, 0.35];
  - `ai.stealRate` a third of Arcade's;
  - `decide.temperature` and `decide.spread`.
- Modify `tests/schemes.test.js`.

**Steps:**
- [ ] **Step 1:** Failing tests: `'in Simulation defenders reach less and react later the lower their IQ'`; Arcade's are unchanged.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: Simulation's defenders react like people and gamble less`.

### Task 4.7: Tuning the 3D game in Simulation

**Files:**
- Modify only `src/sim/styles.js`'s Simulation table and the new decision numbers.
- Create `tests/simplay.test.js`.

**Steps:**
- [ ] **Step 1:** Write `simplay.test.js`, over 4 Watch matches, five a side, Simulation, 12-minute quarters, seeds 1–4. These are the spec's targets widened by 15%:

  | Measure | Band |
  |---|---|
  | Pace | 84–114 |
  | Points | 99–133 |
  | FGA | 76–102 |
  | 3PA | 31–43 |
  | FTA | 20–28 |
  | TOV | 12–17 |
  | Mean possession length | 12.3–16.7 s |
  | Starters' minutes | 26–40 |

  Each band is the spec's target × 0.85 to × 1.15, except starters' minutes, which are the spec's 28–38 widened by 2.
- [ ] **Step 2:** Tuning rounds. Each round:
  - runs `measure.mjs` over 50 such matches;
  - records the table in the ledger: every stat against its target, with the shot mix, play mix, possession-length spread, foul kinds, minutes and glide;
  - changes Simulation numbers only.

  The order of attack follows the cause found in the spec's §1:
  1. shot selection and shot chances, to raise FG% and so cut offensive rebounds;
  2. patience and walk-up, for possession length;
  3. fouls and turnovers;
  4. box-outs.
- [ ] **Step 3:** After 8 rounds without meeting a band, stop and report to the owner which band, by how much, and what was tried. No number is forced.
- [ ] **Step 4:** `npm test` passes, `simplay.test.js` included.
- [ ] **Step 5:** Commit `tune: the 3D game in Simulation, to the 2025–26 averages`.

**Stage 4 gate:**
- `npm test` passes.
- The Arcade band test passes, and `arcade-tuning.json` still equals Arcade's table.
- The glide budget is met.
- Simulation's µs per step is at most 2× the Arcade baseline.
- **The ledger** has the final 50-match table and the on-court mixes:
  - share of shots at the rim, mid-range and three;
  - plays called by kind;
  - the assisted share;
  - the possession-length spread, with transition (under 8 s) as a share;
  - foul kinds;
  - minutes.
- **In the browser:** stills of Simulation (walk-up, pick-and-roll against drop, double team, substitution at a dead ball, box-out), and the frame time against the baseline.

---

## Stage 5: The fast engine

**Acceptance:**
- Simulate plays whole games on a match state in at most 5 ms each.
- 1,000 games are within every band in the spec's §11, with USG% and play share tested apart.
- The two engines agree within the spec's bands.
- Sliders move results the right way.
- Ratings matter.
- A third team plays.
- Three a side works.

### Task 5.1: The engine's frame: periods, clocks, possessions, dead balls

**Files:**
- Create `src/sim/quick/engine.js` and `tests/quick.test.js`.

**Interfaces (Produces):**
- `quickMatch({ seed, size = 5, minutes = 12, sliders, teams = [0, 1] }) -> state`. The state is a finished `createMatch` match in the `'final'` phase, with its box score, possessions, quarters and coach memory.
- `simulate(state)`: plays a started match (style already set) to the end.

**How it works:**
- Its loop holds the period, the game clock, the shot clock, team fouls, the bonus, overtime and timeouts, using the same state fields, rule numbers and `endPossession`.
- Fatigue runs per second at the style's rates; the effort of each beat sets running or sprinting.
- Substitutions and timeouts at dead balls come from the coach.
- Late-game decisions come from `situation()`.

**Steps:**
- [ ] **Step 1:** Failing tests, with stub possessions (each one a timed shot):
  - `'a game ends with a winner, in overtime if it must'`;
  - `'clocks, team fouls and the bonus follow the rules'`;
  - `'nobody plays after fouling out'`;
  - `'minutes add up'`;
  - `'the same seed gives the same game'`;
  - `'a game takes at most 10 ms'` (the guard; the 5 ms target goes in the ledger).
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: the fast engine plays a whole game on a match state`.

### Task 5.2: Possessions from plays: shapes, beats and choices

**Files:**
- Create `src/sim/quick/shapes.js` and `src/sim/quick/possession.js`.
- Modify `tests/quick.test.js`.

**Interfaces (Produces):**
- `SHAPES`: for each play key, plus `transition`, `early`, `lateIso` and `putback`, a list of beats. Each beat is `{ who, time: [lo, hi], options(ctx) }`, giving options of the kinds `shot`, `drive`, `pass`, `move`, `post` or `reset`.
- **Each option's shot context** is drawn from:
  - the scheme (for example, drop gives the pull-up a gap of 1.6–2.4 m and the roll 0.6–1.2 m);
  - the matchup (the defender's ratings and his speed against the attacker's);
  - the defensive IQ;
  - help.
- `playPossession(state, team, start)`:
  1. the coach's phase;
  2. a play;
  3. beats, decided by `choose` with the same `expectedShot` and tendency biases as Task 3.5;
  4. outcomes from the shared models.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'against a drop the handler's pull-up is more open than against a switch'`;
  - `'a switch onto a slow big gives the handler a mismatch the coach then hunts'`;
  - `'a low-IQ handler takes worse options more often'`;
  - `'late in the clock the best creator takes it'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: the fast engine runs each play as beats decided by the shared decision maker`.

### Task 5.3: Outcomes: shots, blocks, fouls, turnovers, rebounds, free throws

**Files:**
- Create `src/sim/quick/outcomes.js`.
- Modify `tests/quick.test.js`.

**What happens:**
- **Shots:** `shotChance` and green from `shooting.js`, with a release drawn as the 3D computer draws it (`releaseOffset`, `windowHalf`).
- **Blocks:** chance from the defender's defence and rebound, the shot zone and `BLOCK.chance`.
- **Shooting fouls:** from `styled('foul.shooting')` and the contest.
- **Bonus fouls:** from reach and gamble.
- **Turnovers:**
  - interceptions, by lane danger, passer IQ and the defender's gamble;
  - steals on drives, by `trySteal`'s rating maths;
  - fumbles;
  - charges and illegal screens;
  - violations.
- **Rebounds:** the offence's chance is the sum over those crashing, weighted by `lift(rebound, RATE.rebound)` and their number, against the box-outs; long misses carry further. The rebounder is chosen among those crashing or boxing out by the same weights.
- **Free throws:** `freeThrowChance`.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'each outcome's chance follows its ratings'`, one test per kind;
  - `'a box score adds up: points = 2 × FGM + 3PM + FTM'`;
  - `'an offensive rebound keeps the possession and resets the clock as the style says'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: the fast engine's outcomes come from the shared models`.

### Task 5.4: The engines agree

**Files:**
- Create `tests/agree.test.js`.
- Modify `tools/sim/measure.mjs` (`--quick`, `--compare`, and `--shapes`, which writes the measured gap and distance spreads per play and zone from 3D matches to `src/sim/quick/measured.js` if hand shapes disagree).

**Steps:**
- [ ] **Step 1:** Write `agree.test.js`: 400 fast games against 8 Watch matches, both in Simulation, five a side, 12-minute quarters, seeds fixed.

  | Measure | Agreement |
  |---|---|
  | Pace, points, FGA, 3PA | Within 10% |
  | FTA, TOV, OREB | Within 15% |
  | Shot-zone shares | Within 5 points |
  | Mean possession length | Within 1.5 s |

- [ ] **Step 2:** If it fails, measure the shapes from the 3D game (`--shapes`) and use them. The ledger records which shapes were measured and which were written by hand.
- [ ] **Step 3:** `npm test` passes.
- [ ] **Step 4:** Commit `test: the fast engine and the 3D game agree on the same style`.

### Task 5.5: Calibration to 2025–26

**Files:**
- Create `tests/calibration.test.js`.
- Modify Simulation's table and the fast engine's shapes only.

**Steps:**
- [ ] **Step 1:** Write `calibration.test.js`: 1,000 fast games, five a side, 12-minute quarters, Simulation, sliders at 50, fixed seeds. Every band is checked and every miss reported together.
  - **Every target in the spec's §11 table**, per team per game.
  - **Variety:**
    - team points standard deviation 11–15;
    - teams at 130 or more: 6–20% of team games;
    - teams at 100 or fewer: 6–18%;
    - margin standard deviation 12–17;
    - total standard deviation 16–25;
    - overtime 3–9%;
    - the most and least points in the 1,000 include at least one game at 140 or more and one at 90 or fewer.
  - **Upsets:** a team of today's players each made 5 points worse in every rating wins 20–40% of 300 games against today's.
  - **Stars:** Cross or Mercer score 40 or more in 2–10% of games, and some game somewhere has a player with 45 or more.
  - **USG%, standard:**
    - each team's top rotation player (20 or more minutes) averages 26–36%;
    - every team's minutes-weighted mean is 20 ± 0.5.
  - **Play share, separately:**
    - shares add up to 100% for every team in every game;
    - each team's star averages 18–30%.
  - **Minutes:** starters average 28–38; every team's minutes add up to 5 × the game's length.
  - **Mix:**
    - three-point rate .38–.45;
    - free-throw rate .23–.30;
    - shots at the rim 25–38%;
    - assisted share 55–70%;
    - mean possession length 13.5–15.5 s.
- [ ] **Step 2:** Tune in rounds, as in Task 4.7. Simulation's table is shared with the 3D game, so after each round `simplay.test.js` and `agree.test.js` must still pass. A change that helps one engine and hurts the other is wrong: the fix goes in the fast engine's shapes, or it is reported. After 8 rounds without a band, report to the owner.
- [ ] **Step 3:** `npm test` passes, within the 45 s budget.
- [ ] **Step 4:** Commit `tune: the fast engine to the 2025–26 averages, with the 3D game still in its bands`.

### Task 5.6: Sliders, ratings, a third team, three a side

**Files:**
- Create `tests/sliders.test.js`.
- Modify `tests/quick.test.js` and `tests/teams.test.js`.

**Steps:**
- [ ] **Step 1:** Write the tests:
  - **Sliders**, each over 200 fast games at 20 and at 80, from a fixed seed, checking direction only:
    - Pace up: more possessions;
    - Shot selection up: higher three-point rate and rim share;
    - Shooting up: higher eFG%;
    - Offensive IQ up: fewer turnovers and higher expected points per shot;
    - Defensive IQ up: the opponent's eFG% down;
    - Ball security up: fewer turnovers;
    - Fouls up: more free-throw attempts;
    - Rebounding up: more offensive rebounds;
    - Fatigue up: more substitutions and lower fourth-quarter eFG%.
  - `'every slider at 0 and at 100: games end, and every box score adds up'` (Review Focus 6).
  - **Ratings:**
    - three-point ratings 10 higher across a team raise its 3P%;
    - defence 10 higher lowers the opponent's eFG%;
    - the five who start beat the three bench players plus two starters more often than not.
  - **A third team** (from `tests/teams.test.js`) plays a fast game and a 3D match against each of the two.
  - **Three a side:** fast games end, the box scores add up, and pace and points are believable for a half court of six. Pace is 60–110 per 48 minutes: not calibrated, only sane.
- [ ] **Step 2:** All pass.
- [ ] **Step 3:** Commit `test: sliders move results the right way, ratings matter, and any team plays`.

**Stage 5 gate:**
- `npm test` passes, within the 45 s budget.
- The ledger records:
  - the fast engine's median and 95th-percentile ms per game;
  - the 1,000-game table against every target;
  - the variety numbers;
  - USG% and play share;
  - the agree table.
- The Arcade band test still passes.

---

## Stage 6: Watch, Simulate and Game styles in the page

**Acceptance:**
- **Watch:** a computer match of either style, with no human in it.
- **Simulate:** a whole game's result screen, in under 50 ms from the key.
- **Game styles:** the panel and the slider panels work by keyboard and mouse, and are saved per mode and per style.
- **Nothing else changes:** every other feature works as before.
- **In the browser:** checked, with frame times within budget.

### Task 6.1: A match with no human in it

**Files:**
- Modify `src/sim/state.js` (`humans`), `ai.js`, `players.js`, `freethrow.js`, `rules.js`, `offball.js` and `step.js`. These are the team-0 and team-1 places listed in the notes: each now asks `state.humans`.
- Create `tests/watch.test.js`.

**What changes:** with no human:
- both teams use the difficulty numbers of All-Star;
- nobody's place is reserved for a controlled player;
- both coaches call timeouts;
- the free-throw meter is the computer's for both teams;
- `state.controlled` is still set, so the renderer's existing reads are safe, but nothing acts on it.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'in Watch no intent from outside is read'`: a match stepped with `aiIntents` alone ends;
  - `'both sides decide with the same numbers'`;
  - `'both coaches call timeouts and substitute'`;
  - `'in Play team 0 is yours as before'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: a match can have no human in it`.

### Task 6.2: Watch and Simulate on the menu

**Files:**
- Modify:
  - `src/menu.js`: main rows become `play`, `watch`, `simulate`, `mode`, `teams`, `controls`, `settings`;
  - `src/main.js`: Watch starts a match with no human and the Broadcast camera unless you change it; in Watch the play list and timeout keys do nothing, and the controlled player's name and the shot meter are hidden;
  - `src/pause.js`: Watch's pause list is Resume, Box score, Settings, Quit;
  - `index.html`: menu rows;
  - `src/render/hud.js`: no controlled name or meter with no human;
  - `tests/menu.test.js`, `tests/pause.test.js`, `tests/hud.test.js`.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'the main menu lists Play, Watch, Simulate, Mode, Teams, Controls, Settings'`;
  - `'Watch starts a match with no human, at Watch's style and quarters'`;
  - `'in Watch the pause menu has no substitutions'`;
  - `'with no human there is no name under a player and no meter'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: Watch a computer match from the menu`.

### Task 6.3: Game styles, sliders, and saved settings per mode and style

**Files:**
- Modify:
  - `src/prefs.js`: `play: { style, minutes }`, `watch: { style, minutes }`, `simulate: { minutes }`, `sliders: { arcade, sim }`. An old `minutes` becomes `play.minutes`; each value is checked on its own;
  - `src/menu.js`: the `styles` panel and the `arcadeSliders` and `simSliders` panels; ← and → step a choice and move a slider by 5; Reset;
  - `src/main.js`: Play and Watch start at their own style and quarters, with that style's sliders;
  - `index.html`;
  - `src/render/hud.js`: the rows' words and the slider bars;
  - `tests/menu.test.js`, `tests/prefs.test.js` (or the file that tests `prefs.js` today), `tests/hud.test.js`.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'Settings has Game styles in place of Quarter'`.
  - `'Play's style and quarters, Watch's style and quarters, and Simulate's quarters are chosen and saved apart'`.
  - `'each style's sliders are saved apart: moving Simulation's leaves Arcade's as they were'` (Review Focus 2).
  - `'Reset puts one style back to 50 and leaves the other'`.
  - `'an old saved quarter length becomes Play's'`; `'a bad saved value is dropped on its own'`.
  - `'← and → move a slider by 5, kept within 0 to 100'`.
  - `'the pause menu does not offer the style'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: Game styles: Arcade and Simulation for Play and Watch, each with its own sliders and quarters`.

### Task 6.4: The Simulate result screen

**Files:**
- Modify:
  - `index.html`: a `#simResult` panel in the box score's look;
  - `src/render/hud.js`: the score by quarter, both box scores with MIN PTS FG 3P FT OREB DREB REB AST STL BLK TOV PF +/-, the team advanced stats, and the style and quarter length;
  - `src/main.js`: Simulate runs `quickMatch` with a seed from the clock; Enter runs another, Esc goes back;
  - `tests/hud.test.js`, `tests/menu.test.js`.

**Steps:**
- [ ] **Step 1:** Failing tests:
  - `'the result screen shows the final score, the quarters, both box scores and the advanced stats'`, on a given finished state;
  - `'Enter simulates another game and Esc goes back to the menu'`;
  - `'Simulate's quarters default to 12'`.
- [ ] **Step 2:** Run them: they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` passes.
- [ ] **Step 5:** Commit `feat: Simulate a whole game and read its box score`.

### Task 6.5: The browser check

**Steps:**
- [ ] **Step 1:** The hidden pane (`dist/hidden.html`, frames driven by hand, `Math.random` and `Date.now` fixed).
  - **The menus:** the menu, Game styles, a slider panel.
  - **Watch in Arcade and in Simulation**, a few minutes of each, with stills: the walk-up, a pick-and-roll against drop, a double team, a substitution, a box-out, a timeout.
  - **The result screen** from Simulate.
  - **Play in Arcade:** still plays as before, with your name and meter shown.
  - **Play in Simulation:** your green release and free throws behave as in Simulation.
- [ ] **Step 2:** Frame times, five a side, High and Low, against Stage 0: Arcade within 5%, Simulation within 10%. Record them in the ledger.
- [ ] **Step 3:** Fix what is found, test first where Node can reach, and repeat.
- [ ] **Step 4:** Delete `dist/hidden.html`. Commit any fixes.

**Stage 6 gate:**
- `npm test` passes.
- The ledger has the stills, the frame times, and the console free of errors.

---

## Stage 7: Finish

### Task 7.1: The whole check

- [ ] **Step 1:** `npm test` passes, with its wall time in the ledger.
- [ ] **Step 2:** `measure.mjs`, the final tables in the ledger:
  - Arcade against the baseline, with the difficulty guard;
  - Simulation's 3D game against the targets;
  - the fast engine against the targets;
  - the agree table;
  - glide;
  - every performance budget.
- [ ] **Step 3:** `npm run single`. Check the file's size against its budget, then smoke-test the single file in the hidden pane: the menu, Watch for a minute, Simulate once.
- [ ] **Step 4:** Amend the spec where the build differs from it, with a dated "As built" note, and commit `docs: the coach and the simulation as built`.

### Task 7.2: Review and hand-over

- [ ] **Step 1:** Self-review the whole branch against the spec, this plan's priorities and the Review Focus list. One developer: the closing message says the review was the author's own. Write `Final review: self-review` in the ledger.
- [ ] **Step 2:** Send `dist/triple-threat.html` with SendUserFile, saying it shows only in the desktop app, since it is over 30 MB.
- [ ] **Step 3:** Report to the owner:
  - what was built;
  - every band met and missed, with the numbers;
  - what was not checked: no hand play, and the Chromebook not tried;
  - what was skipped.

  Do not merge until the owner says "merge".

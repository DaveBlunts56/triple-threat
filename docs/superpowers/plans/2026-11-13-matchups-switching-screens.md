# Matchups, Switching and Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, as the session model: the owner asked for no subagents on other models (2026-11-13). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Who guards whom is part of the match and can change during play; defenders switch on a screen and when getting back; an arrow and a ring on the floor show the player you control who his man is.

**Architecture:** Every court player carries the id of his man. A new sim file, `src/sim/matchups.js`, is the only place that reads or changes it: it answers "who is his man" and "who guards him", puts everyone back on his own man, and makes the two kinds of switch. The computer's defence and the renderer's stance and head-turn read the matchup through it instead of working it out from the place in the order. The arrow and the ring are worked out by a pure function in `src/render/mark.js` and drawn in `src/render/actors.js` beside the ring under your player.

**Tech Stack:** JavaScript modules, Node's test runner, Three.js 0.187, `npm run single`.

**Spec:** `docs/superpowers/specs/2026-11-13-matchups-switching-screens-design.md`

## Global Constraints

- Branch `feat/matchups-switching-screens`, cut from `main`. Never push. Merge only on the owner's word.
- Every commit ends with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Stage by path.
- Both modes get this piece. The rules, the keys and the offence's movement do not change.
- Every attacker is the man of exactly one defender, always.
- The sim never imports from `src/render/`; the renderer never changes the match.
- The spec's numbers, as starting values in `src/sim/tuning.js`: `MATCHUP = { lost: 2, save: 6, wait: 2 }` (metres, metres, seconds). "Set" is `FOUL.setTime` (0.4 s), already in the game. The arrow is left out within 1.5 m of the man. The arrow and its ring are a warm red, `0xff5a3c`.
- No new asset. One self-contained HTML file; report its size in the last task.
- Test first wherever Node can reach. After every task: `npm test`.
- Computer-only matches are measured with the scripts in the session's scratchpad (`balance/spacing.mjs`, `balance/shots5.mjs`); nothing from them is committed. Today's numbers over 20 matches: three a side 89.2 points; five a side 80.5 points, 10.9 out-of-bounds calls.

## Review Focus

1. **A whistle on the same step as a switch:** after any stoppage everyone is on his own man, whatever was swapped a moment before. Test in Task 2.
2. **A contact outside live play** (an inbound, a dead ball, a free throw, the tip): nobody switches. Test in Task 2.
3. **A new match of the other size after quitting to the menu:** every man's id is a player of the new match; the arrow and ring are hidden on the menu. Tests in Task 1 (the match) and Task 3 (the mark).
4. **The player you control changes while the mark shows** (E, a pass caught, a substitution): the mark is worked out from the match alone each frame, so it follows at once. Test in Task 3.
5. **A tie when getting back:** equal totals, or a saving just under `MATCHUP.save`, change nothing. Test in Task 2.

---

### Task 1: The matchup is part of the match

No change in how the game plays: this task only moves "who is his man" into the match.

**Files:**
- Create: `src/sim/matchups.js`, `tests/matchups.test.js`
- Modify: `src/sim/state.js` (`createPlayer`), `src/sim/rules.js` (`deadBall`), `src/sim/ai.js` (drop its own `manOf`), `src/render/motion.js` (drop its own `manOf`, re-export the sim's)

**Interfaces:**
- Produces, in `src/sim/matchups.js`:
  - `manOf(state, player) -> player`: the opponent he guards, `state.players[player.man]`.
  - `guardOf(state, player) -> player`: the opponent whose man he is.
  - `ownMen(state)`: sets every player's `man` to the opponent in his place of the order (`slot`) and his `switchWait` to 0.
- Produces, on every court player: `man` (an id) and `switchWait` (seconds, 0 when he may be switched).
- `src/render/motion.js` keeps exporting `manOf`, now the sim's, so `bearing.js` and the tests need no change.

- [ ] **Step 1: Write the failing tests** in `tests/matchups.test.js`:
  - `'at the start each player's man is the opponent in his place of the order, three a side and five'`: for `createMatch(1, 3)` and `createMatch(1, 5)`, every `p`: `manOf(s, p).team !== p.team`, `manOf(s, p).slot === p.slot`, `guardOf(s, manOf(s, p)) === p`, and `p.man < s.players.length`.
  - `'a substitute has the man of the player he replaced and is guarded by the same defender'`: five a side, `substitute(s, 1, 6)`; `manOf(s, s.players[1])` and `guardOf(s, s.players[1])` are who they were.
  - `'every stoppage puts everyone back on his own man'`: five a side in live play; set `s.players[0].man = 6; s.players[1].man = 5`; drive a stoppage through the rules (put the ball out of bounds and `step` until `s.phase === 'dead'`); then every player's man is his own. The same after a period ends (`s.gameClock = 0`, step until `quarterEnd`).
  - `'the defence guards by the matchup'`: five a side, live, team 1 holding the ball; swap the men of two team-0 defenders by hand; after `aiIntents`, each of the two has his target nearer his new man than his old.
- [ ] **Step 2: Run** `node --test tests/matchups.test.js` — expected: FAIL, `src/sim/matchups.js` not found.
- [ ] **Step 3: Implement.** `createPlayer(id, size)` gains `man: (id + size) % (2 * size)` and `switchWait: 0`. `deadBall(state)` in `rules.js` calls `ownMen(state)` (it runs at every stoppage and at the end of a period). `ai.js` and `render/motion.js` import `manOf` from `matchups.js` in place of their own.
- [ ] **Step 4: Run** `npm test` — expected: all pass (527 and the new ones).
- [ ] **Step 5: Prove nothing changed.** Run `balance/spacing.mjs . 20` — expected: three a side 89.2 points and five a side 80.5 points, the same to the decimal as today.
- [ ] **Step 6: Commit** `refactor: who guards whom is part of the match`.

---

### Task 2: Switching

**Files:**
- Modify: `src/sim/matchups.js`, `src/sim/tuning.js` (`MATCHUP`), `src/sim/state.js` (`createMatch`: `switches: 0`), `src/sim/step.js`, `src/sim/players.js` (`giveBall`), `tests/matchups.test.js`, `tests/five.test.js` and `tests/ai.test.js` only if a whole-match test's bounds need the new count

**Interfaces:**
- Consumes: `manOf`, `guardOf`, `ownMen` (Task 1); `events.contacts` from `movePlayers` (pairs of ids); `p.setT` and `FOUL.setTime`.
- Produces, in `src/sim/matchups.js`:
  - `screenSwitches(state, contacts, dt)`: counts every player's `switchWait` down by `dt`, then makes the screen switches this step's contacts call for. Called from `step.js` right after `movePlayers`, only when `state.phase === 'live'`.
  - `rematch(state, team)`: `team` is the team now defending. Finds the one-to-one matching of its players to the attackers with the shortest total distance (every ordering is tried: 6 for three, 120 for five); adopts it only if it is at least `MATCHUP.save` shorter than the present one. Called from `giveBall` when the ball changes teams and `state.phase === 'live'`.
  - `state.switches`: counts every change of men made by either rule (a swap counts one, a re-match counts one).

**The screen rule, exactly.** For a contact between attacker `S` and defender `D` (`S.team === state.possession`, `D` the other team), `D` swaps men with `other = guardOf(state, S)` when all of these hold: `S` does not hold the ball, is not an inbounder, is on the floor, and `S.setT >= FOUL.setTime`; `S` is not `D`'s man; `D`'s man is more than `MATCHUP.lost` from `D`; `D.switchWait <= 0` and `other.switchWait <= 0`; and `other` is nearer to `D`'s man than `D` is. A swap exchanges the two `man` ids and sets both players' `switchWait` to `MATCHUP.wait`. The wait is kept per player, which is a little stricter than the spec's "a pair may not swap back": a defender who has just swapped swaps with nobody until it runs out.

- [ ] **Step 1: Write the failing tests** in `tests/matchups.test.js`, each from a five-a-side match in live play with team 1 holding the ball, players placed by hand:
  - `'a screened defender swaps with the screener's defender when that defender is nearer the man being lost'`: defender 0 touching set attacker 6 (`setT = 1`), his own man 5 four metres off, defender 1 one metre from attacker 5. After `screenSwitches(s, [[0, 6]], DT)`: `s.players[0].man === 6`, `s.players[1].man === 5`, `s.switches === 1`, and every attacker still has exactly one defender.
  - `'no switch when the screener's defender is farther from the man, when the attacker run into is moving, is the defender's own man, holds the ball or is the inbounder, or when the man is still close'`: one case each, the men unchanged.
  - `'a pair that has just swapped does not swap back within the wait, and may after it'`: swap, then the mirrored contact at once changes nothing; after `MATCHUP.wait` seconds of `screenSwitches(s, [], DT)` it does.
  - `'no switch outside live play'`: with the same placing, run `step` in phases `inbound`, `dead` and `freeThrow`: the men are unchanged. (Review Focus 2.)
  - `'a stoppage on the step of a switch leaves everyone on his own man'`: make the swap, then cause a stoppage on the next `step`; own men. (Review Focus 1.)
  - `'getting back: a team caught far from its own men takes the nearest; a team near its own men changes nothing'`: team 0's five placed so each stands on the man of the next defender and far from his own: `giveBall(s, s.players[5])` in live play re-matches them, total distance the least of all orderings, `s.switches === 1`. With each defender within 2 m of his own man: nothing changes. With a saving of just under `MATCHUP.save`: nothing changes. With equal totals: nothing changes. (Review Focus 5.)
  - `'getting back is not made at an inbound or the tip'`: `giveBall` in phase `inbound` changes no men.
  - `'whole matches with switching, three a side and five: they end, both score, every attacker always has one defender, switches happen but no more than two a possession'`: seeds 1 to 3 of each size, computer against itself; checks the one-to-one rule every 30 steps; `s.switches > 0` over the seeds of each size; `s.switches` divided by the changes of possession is at most 2.
- [ ] **Step 2: Run** `node --test tests/matchups.test.js` — expected: FAIL, `screenSwitches` is not exported.
- [ ] **Step 3: Implement** `MATCHUP`, `screenSwitches`, `rematch`, `state.switches`, and the two calls.
- [ ] **Step 4: Run** `npm test` — expected: all pass. A whole-match test elsewhere whose bound the switching moves is looked at before it is touched: the bound changes only if the new number is still a sane game, and the ledger says so.
- [ ] **Step 5: Measure.** `balance/spacing.mjs . 20` and `balance/shots5.mjs . 20`. Expected: three a side between 82 and 96 points, five a side between 74 and 87, no kind of call more than half again as frequent as today. If scoring falls outside, change only `MATCHUP.lost`, `MATCHUP.save` and `MATCHUP.wait`, measure again, and record the numbers tried in the ledger. If no setting holds scoring in range, stop and tell the owner what switching costs the offence.
- [ ] **Step 6: Commit** `feat: defenders switch on a screen and when getting back`.

---

### Task 3: The arrow and the ring

**Files:**
- Create: `src/render/mark.js`, `tests/mark.test.js`
- Modify: `src/render/actors.js` (`createActors`, `sync`)

**Interfaces:**
- Consumes: `manOf`, `guardOf` (Task 1).
- Produces, in `src/render/mark.js` (no Three.js import, so Node can test it):
  - `MARK = { colour: 0xff5a3c, near: 1.5, start: 0.6, stop: 0.7, wide: 0.16, head: 0.45 }`: metres, except the colour. `near`: the arrow is left out when the man is this close. `start`, `stop`: how far from your player the arrow begins and how far short of the man it ends.
  - `matchupMark(state) -> null | { ring: { x, z }, arrow: null | { x, z, angle, length } }`: null unless `state.phase` is `'live'` or `'inbound'`. With `me = state.players[state.controlled]`: when `state.possession !== me.team` the ring is at `manOf(state, me)` and the arrow runs from `start` beyond `me` to `stop` short of the man (`x`, `z` its tail; `angle` measured as `facing` is; `length` tail to tip), or is null within `near`; when `state.possession === me.team` the ring is at `guardOf(state, me)` and the arrow is null.

- [ ] **Step 1: Write the failing tests** in `tests/mark.test.js`:
  - `'defending: the ring is under your man and the arrow runs from you toward him, stopping short'`: live, team 1 has the ball, you at (0, 0), your man at (4, 3): ring `{ x: 4, z: 3 }`; arrow length `5 - MARK.start - MARK.stop`, angle `Math.atan2(3, 4)`, tail `MARK.start` along that line from you.
  - `'defending within a metre and a half: the ring only'`.
  - `'attacking: the ring is under the defender guarding you, and there is no arrow'`.
  - `'it follows the player you control, and a switch'`: change `s.controlled`, and swap your man by hand: the ring moves to the new man each time. (Review Focus 4.)
  - `'shown in live play and at inbounds only'`: null in `start`, `jumpBall`, `dead`, `freeThrow`, `quarterEnd` and `final`. (Review Focus 3.)
- [ ] **Step 2: Run** `node --test tests/mark.test.js` — expected: FAIL, `src/render/mark.js` not found.
- [ ] **Step 3: Implement** `mark.js`. In `actors.js`: a second ring like the one under your player and a flat arrow (a shaft stretched to the length, and a head at its tip), both `MeshBasicMaterial` in `MARK.colour`, a little see-through, lying just above the floor; `sync` places or hides them from `matchupMark(state)`. They are drawn with the capsule fallback too.
- [ ] **Step 4: Run** `npm test` — expected: all pass.
- [ ] **Step 5: By eye**, three a side and five, at both ends: the arrow and ring on defence; the ring alone when close; the ring on your defender on offence; they follow E, a caught pass and a switch; hidden at the tip, at free throws and on the menus; frozen on the pause screen; right at Low and at Ultra (the floor's mirror shows nothing odd).
- [ ] **Step 6: Commit** `feat: an arrow and a ring show the man of the player you control`.

---

### Task 4: The check, and the owner's play-test

- [ ] **Step 1:** `npm test`; `npm run single` and report its size; the single file opened as the Chromebook opens it: it loads, both modes start, no console error.
- [ ] **Step 2:** Send the build with a picture of the arrow on defence, and ask the owner:
  1. Is the arrow clear without being in the way?
  2. When your own man changes on a switch, does the arrow make that easy to follow, or does it feel like the game took over?
  3. Does the computer's defence feel better for switching, in three a side and in five?
  4. Anything else changed that should not have?

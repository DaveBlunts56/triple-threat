# Players Who Differ, and Off-Ball Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, as the session model: the owner asked for no subagents on other models (2026-11-13). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each of the sixteen players has ratings and a role that change how he plays; the computer plays to them; and the nine players you are not controlling have things of their own to do.

**Architecture:** The ratings are data on each roster entry, read through one small sim file (`src/sim/ratings.js`) that turns a rating into a multiplier; the places that decide a shot, a steal, a speed, a rebound and tiredness multiply by it. Off-ball behaviour gets its own sim file (`src/sim/offball.js`) that answers "where should this player be now, and why", which the computer's planner asks before it falls back on anything else; the defence's new habits stay in `src/sim/ai.js` beside the old ones. The renderer learns two flags (`calling`, `closing`) and shows the hand-up motion it already has.

**Tech Stack:** JavaScript modules, Node's test runner, Three.js 0.187, `npm run single`.

**Spec:** `docs/superpowers/specs/2026-11-14-players-who-differ-design.md`

## Global Constraints

- Branch `feat/players-who-differ`, cut from `feat/night-2026-11-14` (not yet merged). Never push. Merge only on the owner's word.
- Every commit ends with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Stage by path.
- **A player rated 70 in everything plays exactly as every player does today.** Every multiplier is 1 at 70.
- No asset and no new motion. Calling for the ball and closing out use the `handUp` clip; a box-out is the `stance` clip.
- The sim never imports from `src/render/`; the renderer never changes the match.
- The rules, the keys, the cameras, the plays' own places, the difficulty levels and the scorebug do not change.
- Starting sizes from the spec, in `src/sim/tuning.js` as `RATE`: per 10 points of rating, `shot: 0.07`, `window: 0.10`, `speed: 0.02`, `steal: 0.10`, `contest: 0.08`, `tire: 0.08`, `rebound: 0.10`. Hot and cold as `HEAT = { after: 3, hot: 1.1, hotWindow: 1.2, cold: 0.92 }`.
- Test first wherever Node can reach. After every task: `npm test`.
- Computer-only matches are measured with the scripts in the session's scratchpad (`balance/pace.mjs`); nothing from them is committed. Today's numbers over 10 matches of three-minute quarters: three a side 55.9 points and 11.2 s a possession; five a side 49.1 points and 12.8 s. After each of Tasks 2, 5, 6 and 7 both stay within a tenth of these; if not, only the numbers in `RATE`, `HEAT` and the new `AI` entries are changed, and what was tried goes in the ledger.

## The sixteen players' ratings

In `ROSTER.ratings`, by team and roster row, in the order **inside, mid, three, handle, speed, defence, rebound, stamina**. Overall is the mean of the best five.

| Row | Waves | Role | Ratings | Ovr | Scorpions | Role | Ratings | Ovr |
|---|---|---|---|---|---|---|---|---|
| 1 | Jalen Cross | Playmaker | 78 88 84 94 90 72 48 84 | 88 | Kai Mercer | Shot creator | 83 94 90 92 86 58 62 78 | 89 |
| 2 | Theo Marsh | Slasher | 90 70 58 80 88 74 64 78 | 82 | Luca Reyes | Two-way wing | 78 72 84 60 80 88 66 80 | 82 |
| 3 | Darius Stone | Rim protector | 86 74 42 50 62 92 90 78 | 84 | Viktor Lund | Post scorer | 94 80 45 55 52 78 88 75 | 83 |
| 4 | Sam Okoro | Sharpshooter | 60 88 94 78 75 58 62 80 | 83 | Devon Hale | Sharpshooter | 62 84 92 73 76 62 44 90 | 83 |
| 5 | Andre Volkov | Stretch big | 80 78 84 58 56 74 84 70 | 80 | Emeka Bright | Glass cleaner | 80 60 44 52 70 84 92 74 | 80 |
| 6 | Marcus Bell | Shot creator | 68 86 76 84 76 52 58 66 | 78 | Rafael Ortiz | Lockdown guard | 62 64 52 76 86 90 58 74 | 78 |
| 7 | Noah Vance | Lockdown wing | 63 55 70 60 76 90 60 86 | 77 | Jamal Whitaker | Slasher | 86 62 50 74 84 69 62 72 | 77 |
| 8 | Idris Kane | Rebounder | 82 62 40 54 50 76 92 68 | 76 | Bogdan Ilic | Rim protector | 76 62 50 44 48 88 86 68 | 76 |

## Review Focus

1. **A substitute.** He comes on with his own ratings and no streak; the player who went off loses his; the next play is cast for who is now on the floor. Tests in Tasks 3 and 5.
2. **The ends of the scale.** At 40 and at 99, with hot or cold on top, no chance leaves 0 to 1, no speed or window is negative, and a green shot still always goes in. Test in Task 2.
3. **Three a side.** Three players have a place each, a play is cast, and the two best rebounders of three go to the boards. Tests in Tasks 5 and 6.
4. **The player you control.** Nothing in Tasks 6 and 7 moves him, calls for the ball for him, or boxes out for him; his team-mates do clear his drive. Test in Task 6.
5. **A play on.** With a play running nobody has two places: a part in the play wins, and a player without a part keeps his role's place away from the play's. Test in Task 6.

---

## Stage 1: ratings, roles, hot and cold, and the computer's use of them

### Task 1: The ratings are in the match

**Files:**
- Create: `src/sim/ratings.js`, `tests/ratings.test.js`
- Modify: `src/sim/tuning.js` (`ROSTER.ratings`, `ROSTER.roles`, `RATE`, `HEAT`), `src/sim/state.js` (`createMatch`: each roster entry gains `ratings`, `role`, `streak: 0`), `tests/state.test.js` only where it lists a roster entry's fields

**Interfaces — Produces, in `src/sim/ratings.js`:**
- `KEYS = ['inside', 'mid', 'three', 'handle', 'speed', 'defence', 'rebound', 'stamina']`
- `lift(rating, per10) -> number`: `1 + (rating - 70) / 10 * per10`. `drop(rating, per10)`: `1 - (rating - 70) / 10 * per10`.
- `rated(state, player, key) -> number`: the rating of the person now in that court place.
- `overall(person) -> number`: the mean of his best five, rounded.
- `starOf(state, team) -> row`: the roster row with the highest overall.
- `zoneOf(player) -> 'inside' | 'mid' | 'three'`: where he stands for a shot at the hoop he attacks (inside: within 3 m; three: `isThree`).
- `heatOf(person) -> 'hot' | 'cold' | null`: from `person.streak` and `HEAT.after`.

- [ ] **Step 1: Write the failing tests** in `tests/ratings.test.js`:
  - `'every player has eight ratings from 40 to 99, a role, and the overall the design gives him'`: the table above, row by row, both teams; `overall` gives 88, 82, 84, 83, 80, 78, 77, 76 and 89, 82, 83, 83, 80, 78, 77, 76.
  - `'the two teams are level: the starting three, the starting five and the bench total the same'`: 254, 417, 231 for both.
  - `'each team's star is its best player'`: rows 0 and 0.
  - `'a rating of 70 changes nothing, and each 10 points changes a thing by its share'`: `lift(70, x) === 1`, `lift(80, 0.07) === 1.07`, `drop(80, 0.08) === 0.92`.
  - `'a shot is inside within three metres, a three behind the line, and mid-range between'`.
- [ ] **Step 2: Run** `node --test tests/ratings.test.js` — expected: FAIL, module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — expected: all pass.
- [ ] **Step 5: Commit** `feat: every player has ratings and a role`.

### Task 2: The ratings change how he plays

**Files:**
- Modify: `src/sim/players.js` (`moveOne` and `movePlayers`, `contest`, `makeChance`, `shotWindow`, `trySteal`, `tryPickup`), `src/sim/stamina.js` (`tire`), `tests/ratings.test.js`

**Interfaces — Consumes:** `lift`, `drop`, `rated`, `zoneOf` (Task 1), `RATE`.

**Where each rating acts** (each a multiplier, 1 at 70):
- `makeChance`: × `lift(zone rating, RATE.shot)`, the result never above 1.
- `shotWindow().half`: × `lift(zone rating, RATE.window)`, never below 0.
- `moveOne`'s top speed: × `lift(speed, RATE.speed)`, and with the ball also × `lift(handle, RATE.speed)`.
- `trySteal`'s chance: × `lift(the reacher's defence, RATE.steal)` × `drop(the holder's handle, RATE.steal)`, kept in 0 to 1.
- `contest`: what the nearest defender takes off (1 minus the factor) × `lift(his defence, RATE.contest)`; the factor stays in 0 to 1.
- `tire`: the two draining rates × `drop(stamina, RATE.tire)`; resting is unchanged.
- `tryPickup`, for a ball that is not a pass: of those who can reach it, the one with the least `distance / lift(rebound, RATE.rebound)` takes it.

- [ ] **Step 1: Write the failing tests** in `tests/ratings.test.js`, each with a match whose two players under test have their ratings set by hand:
  - `'at 70 throughout, every number is the one the game had'`: for a handful of positions, `makeChance`, `shotWindow().half`, `contest`, a second of sprinting, a second of tiring, are equal with ratings all 70 and with the `ratings` field ignored (compare against the values computed from `SHOT`, `PLAYER` and `STAMINA` alone).
  - `'a better shooter makes more and has a wider green window, in the zone the rating is for and no other'`: three 90 against three 50 from behind the line: chance ratio `lift(90, .07) / lift(50, .07)`, window ratio by `RATE.window`; from 2 m the two are equal.
  - `'a quicker player covers more ground; with the ball his handle counts too'`.
  - `'a better defender takes more off a shot and wins more of his reaches; a better handler loses fewer'`: 2,000 reaches each way, the shares in the stated ratio within a tolerance.
  - `'of two players who can both reach a rebound the better rebounder gets it, though the other is a little nearer'`, and `'a pass is still caught by whoever it reaches first'`.
  - `'a player with more stamina tires more slowly and rests no faster'`.
  - `'at the ends of the scale nothing breaks'` (Review Focus 2): ratings 40 and 99, `streak` at plus and minus 5: every chance in 0 to 1, every window and speed at least 0, and a green release still goes in.
- [ ] **Step 2: Run** — expected: FAIL (the numbers do not move with the ratings).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — expected: all pass. An existing test that pinned a number for a particular player is looked at before it is touched: it changes only if the new number follows from his rating, and the ledger says so.
- [ ] **Step 5: Measure** with `balance/pace.mjs . 10` — expected: within a tenth of today's (see Global Constraints).
- [ ] **Step 6: Commit** `feat: a player's ratings change his shooting, speed, defence, rebounding and stamina`.

### Task 3: Hot and cold

**Files:**
- Modify: `src/sim/players.js` (`releaseShot`: the streak; `makeChance`, `shotWindow`: its effect), `src/sim/roster.js` (`substitute`: the player going off loses his streak), `src/render/hud.js` (the name tag), `tests/ratings.test.js`, `tests/hud.test.js`

**Interfaces — Consumes:** `heatOf`, `HEAT`. **Produces:** `person.streak`: the makes in a row from the floor (positive) or the misses in a row (negative).

- [ ] **Step 1: Write the failing tests:**
  - `'three makes in a row and he is hot, until his next miss; three misses and he is cold, until his next make'`: drive `releaseShot` with the outcome forced (a green release for a make; a release at the press, far out, for a miss, over seeds that miss), reading `heatOf` after each.
  - `'hot, his shots go in more often and his window is wider; cold, they go in less often'`: by `HEAT.hot`, `HEAT.hotWindow`, `HEAT.cold`.
  - `'free throws count for neither, and a player taken off loses his streak'` (Review Focus 1).
  - In `tests/hud.test.js`: `'the name under your player says HOT or COLD beside it'`: `'Cross · HOT'`, `'Cross · COLD'`, `'Cross'`.
- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — expected: all pass.
- [ ] **Step 5: Commit** `feat: hot and cold streaks`.

### Task 4: What you see

**Files:**
- Modify: `src/render/hud.js` (`TEAM_LINES` becomes a function of the rosters; `rosterLine`), `index.html` only if a line no longer fits, `tests/hud.test.js`

**The wording:** Teams panel: `PG · 4 · Jalen Cross ★ · Playmaker · 88` (the star marked, nobody else). Pause list: `1 · PG · Jalen Cross · No. 4 · Playmaker 88 · on court · 0 fouls`.

- [ ] **Step 1: Write the failing tests** in `tests/hud.test.js`: the two lines above, a line for a player who is not the star, and that each team has exactly one star.
- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. **By eye:** the Teams panel still fits the disc at 1366 by 768, and the pause list its panel; if not, the lettering of those two lists is made smaller.
- [ ] **Step 5: Commit** `feat: the menus show each player's role and overall`.

### Task 5: The computer plays to its players

**Files:**
- Modify: `src/sim/plays.js` (`cast`, the coach's pick in `stepPlays`), `src/sim/ai.js` (`planWithBall`: shot choice and who is passed to; `planDefence`: how far off each man), `src/sim/late.js` (`situation`: `clutch`), `src/sim/tuning.js` (`AI`: `shootAt: 60`, `earlyThree: 88`, `lean: 1.5`, `shy: 0.6`; `LATE.clutch: 12`, `LATE.clutchLead: 3`), `tests/plays.test.js`, `tests/ratings.test.js`

**Interfaces — Produces:**
- `cast(state, holder)`: of the rest of his team, `big` is the highest inside plus rebound, `big2` the next, `shooter` the highest three of those left, `wing` the other. Three a side: `big`, and `wing`.
- `suits(state, team, key) -> weight` in `plays.js`: how well a play suits who is on the floor (the coach picks by these weights with `rand`): Post Up 3 when the big's inside is 80 or more, else 0.5; Floppy 3 when the shooter's three is 85 or more, else 0.5; Clear Out 3 when the holder is the star or hot, else 1; the pick and rolls and Horns 2 when the holder's handle is 80 or more, else 1; Pick & Pop further × 2 when the big's three is 75 or more and × 0.3 when not; the rest 1.
- `situation().clutch`: the last period, `LATE.clutch` seconds or fewer left, the lead within `LATE.clutchLead` either way.

**The rules:**
- **Shot choice.** He takes an open shot only if his rating for that zone is at least `AI.shootAt`, or the shot clock is under the panic mark. Early in the shot clock a three is taken only by a shooter rated `AI.earlyThree` or more with nobody within 3 m.
- **Who is passed to.** Of the open men, the pass goes to the one with the least `distance to the hoop / weight`, where the weight is × `AI.lean` for the star and for a hot player and × `AI.shy` for a cold one. (The one pass in three or so that goes elsewhere stays as it is.)
- **The last shot.** When `clutch`, a handler who is not the star passes to the star if the pass can reach him.
- **How each is guarded.** On the ball: `AI.onBallGap` × `drop(his man's three, 0.06)` × `lift(his man's speed, 0.04)`, kept between 0.9 and 1.9 m. Off the ball: `AI.offBallGap` × `drop(his man's three, 0.08)`.

- [ ] **Step 1: Write the failing tests:**
  - `tests/plays.test.js`: `'the parts go to the players the ratings pick'`: with the ratings set by hand so that the best inside man is not the centre, he is the big; the best three-point shooter is the shooter; in three a side the big is the better inside man of the two. The existing parts test keeps its expected ids (the starting fives cast as before) and is checked to pass unchanged. After a substitution the next play is cast for the new man (Review Focus 1).
  - `'the coach calls what suits the floor'`: over 400 picks from one state, Post Up is called at least three times as often with a 94 inside big as with a 60; likewise Floppy and the shooter, Clear Out and the star.
  - `tests/ratings.test.js`: `'a poor three-point shooter passes up an open three that a sharpshooter takes; with the shot clock short he takes it'`; `'early in the shot clock only a great shooter with room takes the three'`; `'the pass leans to the star and to a hot player, and away from a cold one'`; `'with the game on the line the ball goes to the star'`; `'a sharpshooter is guarded closer than a poor shooter, on the ball and off it'`.
- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — expected: all pass.
- [ ] **Step 5: Measure** with `balance/pace.mjs . 10`, and with a script that counts by player: expected: within a tenth of today's; each star takes between a quarter and a third of his team's shots in five a side; the best three-point shooter on each team makes at least 8 points of percentage more of his threes than the worst who takes any.
- [ ] **Step 6: Commit** `feat: the computer plays to its players: plays, shots and passes follow the ratings`.
- [ ] **Step 7: Stage 1 to the owner.** `npm run single`, send the build, and ask: do the players feel different in the hand; are the stars too strong; is HOT and COLD clear?

---

## Stage 2: off-ball life

### Task 6: Off the ball, the offence

**Files:**
- Create: `src/sim/offball.js`, `tests/offball.test.js`
- Modify: `src/sim/ai.js` (`planOffBall`, `planFreeBall`), `src/sim/state.js` (`createPlayer`: `calling: false`, `closing: false`; `createMatch`: `cut: [null, null]`), `src/sim/tuning.js` (`OFF`), `src/render/motion.js` (`armMotion`: the hand-up), `tests/moves.test.js`

**Interfaces — Produces, in `src/sim/offball.js`:**
- `OFF` (in `tuning.js`): `shooterAt: 80` (a three rating from which he is a shooter), `every: [2.5, 5]` (seconds between a player's own moves), `cutFor: 1.6`, `cutGap: 2.4` (his defender this far off, or nearer the centre line than he is, is beaten), `clear: 2.2` (metres from a drive's line he gets out of), `breakWide: 6`.
- `kindOf(state, player) -> 'big' | 'shooter' | 'slasher'`: big: one of his team's two highest inside plus rebound on the floor (one of three a side); shooter: three at least `OFF.shooterAt`; else slasher.
- `places(state, team) -> Map(player id -> { x, z })`: a place for every player of the team but the ball handler, no two the same, by kind: shooters on the three-point line (the ball-side corner first, then the weak-side wing, then the weak-side corner), slashers on the wings and at the top, the first big low on the weak side and the second at the high post. The ball's side changes only when the ball is 1.5 m past the middle.
- `offBallSpot(state, player) -> { x, z, sprint, why } | null`: where he should be now, in this order: a cut he is making; out of the way of a drive; on a fast break, his lane; his place, taken up only at his own moments. `why` is `'cut' | 'clear' | 'break' | 'place'`. Null for the player you control.
- `player.calling`: set by `planOffBall`: he is open, within `AI.shootRange`, his rating for that zone is 70 or more, and a team-mate has the ball. The renderer's `armMotion` gives a calling player the `handUp` clip.

**The rules:**
- **His own moments.** Each player re-reads his place only when his own timer runs out, between `OFF.every[0]` and `[1]` seconds, drawn with `rand`; the timers start apart, so no two of a team move in the same instant.
- **Cuts.** One cutter a team at a time (`state.cut[team] = { id, until }`). A slasher cuts when his defender is beaten (see `OFF.cutGap`) and his lane to the hoop is clear. Whoever has just passed may cut for the ball back. A big flashes to the high post when the ball is on a wing. A cut is a sprint to the front of the rim for `OFF.cutFor` seconds, then back to his place.
- **Clearing a drive.** When the handler is moving at the hoop inside 9 m, any team-mate within `OFF.clear` of the line from the ball to the hoop moves off it, to the nearest open place.
- **The boards.** On a shot, the team's two best rebounders on the floor chase it; the rest get back, side by side as now. (A loose ball that is not a shot is still chased by the two nearest.)
- **The break.** On a fast break the two quickest team-mates run `OFF.breakWide` metres either side of the ball and ahead of it; the bigs trail.
- **A play on.** `planOffBall` asks the play first; a player without a part asks `offBallSpot`, and a place within 2 m of a play's spot is not given to him.

- [ ] **Step 1: Write the failing tests** in `tests/offball.test.js`:
  - `'every role has a place, no two team-mates the same, in three a side and five'`; `'shooters stand behind the line, a big is low on the weak side, and the ball's side changes only when the ball is well past the middle'`.
  - `'nobody moves in the same instant as a team-mate'`: over 20 seconds of planning, no step on which two of a team change their target.
  - `'a slasher cuts when his defender is beaten and his lane is clear; not when he is covered; and only one of a team cuts at a time'`; `'a cut lasts a moment and then he goes back'`; `'whoever passes may cut for the ball back'`.
  - `'a big flashes to the high post when the ball is on a wing'`; `'on a fast break the two quickest run wide of the ball and ahead of it, and the bigs trail'`.
  - `'the others get out of the way of a drive'`: a team-mate standing on the handler's line to the hoop is sent off it; one standing clear is left.
  - `'an open player in a place he can score from calls for the ball; a covered one, a poor shooter out there, and the player you control do not'`.
  - `'on a shot the two best rebounders go to the boards and the rest get back'`, in five a side and three (Review Focus 3).
  - `'the player you control is never moved, and his team-mates clear his drive'` (Review Focus 4).
  - `'with a play on nobody has two places'` (Review Focus 5): through every play, the spots of the parts and the places of the rest are at least 2 m apart.
  - In `tests/moves.test.js`: `'a player calling for the ball has his hand up'`.
- [ ] **Step 2: Run** — expected: FAIL, module not found.
- [ ] **Step 3: Implement.** The ring of spots (`spotOf`) is no longer used when no play is on; it and its tests go, with `AI.swapEvery`, `AI.swapEvery5` and `AI.spots5`, unless a test of five-a-side spacing still needs the spots, in which case that test is rewritten against `places`.
- [ ] **Step 4: Run** `npm test` — expected: all pass.
- [ ] **Step 5: Measure** `balance/pace.mjs . 10` and `balance/spacing.mjs . 10` — expected: within a tenth of today's scoring and pace; two team-mates within 2 m of each other no more than a fifth of the time in five a side (it is 19% today).
- [ ] **Step 6: By eye:** stills of the offence spread by role, a cut, and a player calling for the ball.
- [ ] **Step 7: Commit** `feat: off the ball each player has a place for his role and moves on his own: cuts, clearing a drive, calling for the ball, the boards`.

### Task 7: Off the ball, the defence

**Files:**
- Modify: `src/sim/ai.js` (`planDefence`, `planFreeBall`), `src/sim/tuning.js` (`AI`: `onePass: 6.5`, `sag: 0.4`, `closeFor: 0.7`, `boxFor: 0.9`, `boxGap: 0.7`), `src/render/motion.js` (`armMotion`: the hand-up for `closing`), `tests/offball.test.js`

**The rules:**
- **By how far he is from the ball.** His man within `AI.onePass` of the ball: the off-ball gap as in Task 5. Further: he stands `AI.sag` of the way from that spot toward the middle of the lane.
- **Closing out.** For `AI.closeFor` seconds after his man catches the ball he sprints to his on-ball spot with `closing` set; the renderer gives him the `handUp` clip.
- **Boxing out.** While a shot is in the air, each player of the defending team goes to the spot `AI.boxGap` from his man on the line to the hoop and stands there, for `AI.boxFor` seconds or until the ball has touched the rim; then the two best placed go for it. The shooter's defender boxes out only once the ball has left the shooter's hand.
- **Help and recover.** While a helper is in front of the rim (the rule already in the game), the defender two passes from the ball who is nearest the helper's man stands half way between his own man and that man. He goes back when the helper does.
- **Getting back.** While the other team has the ball in its own half: the defender nearest his own hoop goes to the front of the rim; the next nearest the ball picks up the ball handler; the rest go to their own men.

- [ ] **Step 1: Write the failing tests** in `tests/offball.test.js`:
  - `'a defender one pass from the ball stays close; two passes away he sags toward the lane'`.
  - `'he closes out at a sprint with a hand up when his man catches the ball, harder on the better shooter'`.
  - `'on a shot every defender puts himself between his man and the hoop, and the shooter's defender only once the ball is gone'`; `'when the ball has touched the rim they go for it'`.
  - `'the man a helper leaves is covered, and the cover goes back when the helper does'`.
  - `'getting back: the first protects the rim and the second stops the ball'`.
  - In `tests/moves.test.js`: `'a defender closing out has his hand up'`.
- [ ] **Step 2: Run** — expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — expected: all pass.
- [ ] **Step 5: Measure** `balance/pace.mjs . 10`, and rebounds by player — expected: within a tenth of today's scoring and pace; the two best rebounders of each team have the most rebounds; the share of rebounds going to the defence between 65% and 80%.
- [ ] **Step 6: By eye:** a still of a box-out and of a closeout.
- [ ] **Step 7: Commit** `feat: the defence sags, closes out, boxes out, covers for a helper and gets back`.

### Task 8: The check, and the owner's play-test

- [ ] **Step 1:** `npm test`; `npm run single` and report its size; the single file opened as the Chromebook opens it: it loads, both modes start, no console error. Frame rate in Firefox on High in five a side beside today's.
- [ ] **Step 2:** Send the build with pictures, and ask the owner:
  1. Do the other nine look alive now, or only busy?
  2. Do your team-mates help you, or get in your way?
  3. Do the players feel different from each other, and are the stars too strong?
  4. Anything that should not have changed?

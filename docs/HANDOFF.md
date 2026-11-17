# Handoff log

Every agent that works on Triple Threat adds an entry here at the end of each task, newest first, so the next one
(another agent, or the same one after a break) knows what happened without the conversation. Keep each entry short:

- **Date, agent, branch** (and whether it is merged).
- **What changed**, in a few lines.
- **Gate numbers**: the suite, Arcade's band, Simulation's table, anything else measured.
- **Not verified, or left undone**, and anything that looked wrong.
- **Decisions the owner made** (their words where it matters), and any change to the rules in `AGENTS.md`.

---

## 2026-11-17 · Codex · `codex/myleague` · awaiting merge

- **Milestone 1.** Create a named slot with any league team. Play, watch or simulate a seeded season, track standings and box scores, finish a best-of series and archive the year. Opponents alternate venues. Both engines share the fixture, final score, confidence and rivalries. Website simulation runs in a worker. IndexedDB keeps revisions, a recovery checkpoint and immutable season archives. [Architecture, defaults and roadmap](MYLEAGUE.md).
- **Gates.** `npm test` passed all 109 files. The detailed test run had 1,297 passes, zero failures, one speed skip and one existing calibration TODO. Both builds passed. Arcade over 30 seeds (points, PPP, seconds) was −3.7%, −3.0%, +0.8% at 3v3 and −3.1%, −3.2%, −0.2% at 5v5. Simulation per 48 (3D / fast) was 96.9/100.6 possessions, 117.2/115.0 points, 87.3/88.6 FGA, 34.6/36.3 3PA, 24.6/23.6 FTA and 14.2/14.8 turnovers. Star usage was 21.9–32.7%. All four balance reports matched the baseline checkout's figures on these seeds.
- **Timing.** The replay file failed under concurrent lab load, then passed all 14 tests alone. The quick-engine guard missed at 11.37 ms on main and 11.09 ms on the branch (12.16 ms when filtered). After profiling the rivalry keys, ratings and unused shot-meter work, it passed at 9.60 ms against 10 ms. Two hundred games matched main on score, RNG, player lines, moods, rivalries, period totals and possessions.
- **Franchise lab.** Across 100 ten-season universes, 101,346 games produced 12 different champions and 162 repeat titles. OKC won 378. Two 25-season universes added 5,074 games. The largest export was 1,413,581 bytes. All saves validated. These runs use three-minute quarters, 14 games per club and the original rosters.
- **Verification limits.** A road fixture reached the final in the headless 3D engine. The worker matched the local engine. The storage adapter passed injected failure and stale-writer tests. Local browser access was declined, leaving visual play, native IndexedDB, controller input and Chromebook frame times unverified.
- **Owner decisions.** Review and merge each playable milestone separately. For players changing clubs, keep faces and generate matching kits.

## 2026-11-17 · Claude Code · `chore/codex-handoff`

Handing over to Codex until the owner's Claude limit resets (Friday).

- **State of `main`:** the overhaul's stages 1-4 are merged and live (see `AGENTS.md`, "Where things stand"); the last
  merge is f7136f3 (stage 4, the broadcast's close-ups).
- **Added for the handoff:** `AGENTS.md` (the rules and the state), this log, `CLAUDE.md` (points Claude Code here),
  and `tools/sim/gates/` (the scripts behind the balance tests).
- **Gates at the last merge:** the full suite passed (1,288 of 1,290; one skipped as the machine was busy, one to
  do), in about 80 s. Arcade over 30 seeds: 3 on 3 points -3.7%, 5 on 5 -3.1% against the baseline (limit 10%).
  Simulation's 3D game: 117.2 points, 34.6 threes a game (targets 116 and 37, limit 15%); the fast engine agrees.
- **Not verified:** nobody has played a match with a controller since stage 1; a scorer's close-up (stage 4) was
  seen only in headless matches, not in the browser.
- **Next, the owner's choice:** MyLeague (franchise mode), from the owner's own brief; then stage 5, the Chromebook
  performance pass.

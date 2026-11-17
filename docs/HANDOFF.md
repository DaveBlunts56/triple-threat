# Handoff log

Every agent that works on Triple Threat adds an entry here at the end of each task, newest first, so the next one
(another agent, or the same one after a break) knows what happened without the conversation. Keep each entry short:

- **Date, agent, branch** (and whether it is merged).
- **What changed**, in a few lines.
- **Gate numbers**: the suite, Arcade's band, Simulation's table, anything else measured.
- **Not verified, or left undone**, and anything that looked wrong.
- **Decisions the owner made** (their words where it matters), and any change to the rules in `AGENTS.md`.

---

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

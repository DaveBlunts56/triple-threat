# Measuring computer matches

`measure.mjs` plays computer matches with no renderer and prints, per team per game:

- **The box score:** points, shooting, rebounds split into offensive and defensive, assists, steals, blocks, turnovers.
- **Possessions,** counted where they end (control passes to the other team, or a period ends), next to the box-score estimate FGA − OREB + TOV + 0.44 × FTA.
- **Possession length,** and the share under 8 s.
- **The shot mix:** at the rim (a finish, or within 1.5 m), close, mid-range, corner three, three above the break.
- **What else happened:** the plays called, fouls by kind, substitutions, overtime.
- **The glide meter:** the share of moving player-steps whose feet slip against the floor by more than 20% and 35%, and the share of steps at a steady 2.3–3.0 m/s jog (held for 0.4 s) that no clip plays naturally. Each player is judged by the leg motion the renderer would draw (its own `noteChanges`, `legLook` and `legMotion`), so a guarding defender's side-steps and back-step count as what they are.
- **Microseconds per step.**

```bash
node tools/sim/measure.mjs --size 5 --minutes 12 --seeds 1-6 --per48
```

`--out file.json` also writes the table. `--per48` scales the counts to 48 minutes.

The glide meter reads the leg motion the renderer would choose (`src/render/motion.js`, which has no Three.js) with the clips' natural speeds from `assets/motion.json`. It measures the clip's rate against the ground covered, not whether a planted foot stays fixed. That is `src/render/feet.js`'s job, and it is checked by eye in the browser.

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

# Auditing the league's box scores

`audit.mjs` plays every pairing of the league's teams in Simulation, by the fast engine (Simulate) or the 3D game, and sets each player's line beside what he is: his position, role, ratings and tendencies. It prints:

- **Whether the profile survives into the numbers:** correlations of rebounds with the rebound rating (overall, within each position, and within positions pooled), offensive rebounds with crashing, shots with usage, the share of threes with the shot diet, assists with passing and handle, blocks with defence, three-point percentage with the three rating.
- **Each position's rates per 36 minutes:** rebounds, offensive rebounds, assists, shots, threes, blocks, steals, minutes.
- **The spread from game to game:** how much a starter's points, rebounds and assists vary, as a share of his mean.
- **Extreme nights and foul trouble, per team-game:** 40 points, 20 rebounds, 15 assists, triple-doubles, 0-for-8, fouled out, five fouls.
- **The scoring environment,** and whether every box score adds up (points from the shots, minutes to five a side, rebounds within the misses, assists within the baskets).
- **The highest and lowest rated rebounders,** side by side.

```bash
node tools/sim/audit.mjs quick 6 12
node tools/sim/audit.mjs 3d 1 12 audit-3d.json
```

The arguments are the engine, games per pairing, minutes per quarter, and a file to save every line to (optional). The fast engine plays 66 pairings in about 1.5 s a game per pairing; the 3D game takes about 3 minutes for one game per pairing. `tests/league-audit.test.js` runs the fast engine's audit twice per pairing and holds it to its bands.

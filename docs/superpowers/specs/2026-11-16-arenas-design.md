# NBA court, hoops, two arenas, fans, and Simulation without a meter: design

Date: 2026-11-16. Status: the owner answered every scoping question on 2026-11-16 (below). Work is on `feat/arenas`, branched from `perf/frame-time`, in four stages, with a download after each.

## What the owner asked for

> For simulation modes, turn off the shooting meter, its solely off ratings and stats. Now two major improvements. The stadium(s), the rim/backboard, and the court, and the fans. The rim is disconnected to the backboard rather than connected, and the court should be NBA sized. The arena itself needs to be a full stadium, not just seats.

## The owner's answers

| Question | Answer |
|---|---|
| Court size | NBA court in both styles. Simulation re-tuned to its NBA targets; Arcade re-tuned until its scoring and pace stay within 10% of today's. |
| Stadiums | A different arena per team, used for home games. |
| Stadium contents | Upper deck over a ring of suites with an LED ribbon between; roof with trusses, catwalks, light rigs and banners; centre-hung video board; aisles, stairs, railings, tunnels and corner exits. |
| Performance | Every level gets the full stadium; the cost scales with the quality level, and Low stays cheap for the Chromebook. |
| Fans | Real-looking people; live reactions; team gear and signs; courtside rows and photographers. |
| Hoops | Rim joined to the board; NBA stanchion; shot clock above each board; red LED edge lights; padding and rim flex. |
| Court look | Home logo at centre court; painted lane and centre circle; names on the baselines and sidelines; every NBA marking. |
| Simulation meter | No shot meter and no free-throw aim bar: ratings only, free throws too. |
| Arena identities | Waves: Tidewater Arena. Scorpions: Red Rock Pavilion. (Invented names.) |
| Video board | Graphics on every level; the live picture and replays on High and Ultra. |
| Delivery | In stages, a download after each. |

## Stage 1: Simulation without a meter, the NBA court, the hoops

### Simulation shooting

- A new styled word, `shot.meter`: Arcade `true`, Simulation `false`.
- With it off, your release time no longer matters. A shot by your player has the make chance a perfectly timed one has, and that comes from his ratings, the distance, the defender and his fatigue. No green release and no boost: the same chance the computer's shooters get.
- The meter beside the shooter is not drawn.
- Free throws, with `shot.meter` off, skip the aim stage. They go up at the shooter's pace and go in with the chance his free-throw rating gives, as the computer's do. The aim bar is not drawn.
- Arcade is untouched.

### The NBA court

Every measurement is the NBA's, in metres:

| | Today (international) | NBA |
|---|---|---|
| Length × width | 28 × 15 | 28.65 × 15.24 |
| Rim centre from the baseline | 1.575 | 1.6 |
| Backboard face from the baseline | 1.2 | 1.22 |
| Rim inner diameter | 0.45 | 0.457 |
| Backboard | 1.8 × 1.05 | 1.83 × 1.07 |
| Three-point arc / corner | 6.75 / 6.6 | 7.24 / 6.71 |
| Lane | 4.9 wide, 5.8 deep | 4.88 wide, free-throw line 4.57 from the board |
| Centre and free-throw circles | 1.8 | 1.83 |
| Restricted area | 1.25 | 1.22 |

- They live in `tuning.js` (`COURT`, `RIM`, `BOARD`, `THREE_PT`, and a new `LANE`). Everything that hard-codes a place on the floor reads them instead, including the shooters' spots on the arc (`offball.js`), the lines on the floor, the camera's reach and the arena's clearances.
- Everything the floor has: sidelines and baselines; the arc and corner lines; the lane with its hash marks and blocks; the free-throw circle, dashed inside the lane; the restricted-area arc; the centre circle; the coaching-box and sideline marks. Painted from the constants, so the lines and the rules can never disagree.

### Re-tuning

- **Simulation:** re-measured with the 50-match and 1,000-game tools. Re-tuned until the Stage 5 bands of the coach-and-sim spec hold again, with the corner share and star usage of the threes-and-usage work.
- **Arcade:** re-tuned until points, PPP and possession length stay within 10% of today's on the band test's seeds. The band test's baseline stays today's numbers; its tuning fixture is re-recorded, because the court's own numbers change.

### The hoops

- **The bracket:** a steel plate on the board and a neck out to the back of the rim, so they are one piece.
- **The stanchion:** a padded base behind the baseline, a padded upright and a curved arm out to the back of the board, in place of today's pole.
- **The shot clock:** a box above each board showing the shot clock in red and the game clock in white. Its picture is redrawn only when a number changes.
- **The LED edge lights:** a strip round each board that glows red when the shot clock or the period runs out.
- **Padding:** on the board's bottom edge and its lower sides.
- **Rim flex:** on a dunk the rim tips down at its bracket and springs back over a fraction of a second. It is drawn only; the ball's flight uses the rim at rest.

### Done when

- `npm test` passes, under 45 s.
- The Simulation and Arcade bands hold as above.
- The picture is checked in the browser on every level.
- Frame cost on Low is checked against today's.

## Stage 2: the first arena (Tidewater Arena)

- **The bowl:**
  - lower bowl with aisles, stairs, railings and vomitories;
  - a ring of suites;
  - an LED ribbon board between the tiers;
  - the upper deck;
  - team tunnels and corner exits.
- **The roof:**
  - steel trusses shaped like waves;
  - catwalks and light rigs;
  - banners;
  - a dark ceiling.
- **The video board:**
  - four sides, centre-hung;
  - score, clocks and graphics on every level;
  - the live picture and replays on High and Ultra (the scene drawn again from a broadcast camera into its screens).
- **The court:**
  - the Waves' logo at centre court;
  - the lane and centre circle in their blue;
  - "HARBOR CITY" on the baselines and "TIDEWATER ARENA" on the sidelines.
- **Looks:** glass and steel, deep blue and teal.
- **Cost scales with quality:**
  - Low gets the whole building, but in few draw calls (merged, instanced) with plain materials.
  - High and Ultra get the full materials, the lights and the live board.
- **Done when:** frame cost on Low is within 10% of Stage 1's, measured as in the frame-time work, and the picture is checked on every level.

## Stage 3: the fans

- **Real-looking people:**
  - low-poly bodies and heads in many builds, ages, skin tones, hair and outfits;
  - drawn instanced, a few kinds of body, with colours varied per fan.
- **Reactions:**
  - stand, clap, cheer, jump, wave towels, boo calls, sit back down;
  - driven by today's crowd mood (`life.js`);
  - moved in the vertex shader, so a reaction costs the main thread nothing per fan.
- **Gear:** home and away jerseys and colours, foam fingers, signs and rally towels.
- **Courtside:** floor seats along the sideline, and photographers under the baskets.
- **On Low:** fewer fans, the simplest body and no props, as today's share.

## Stage 4: the second arena (Red Rock Pavilion)

- **Looks:** the same parts as Stage 2, in sandstone and rust red, angular, with a sunset-orange glow.
- **The court:** the Scorpions' logo, lane and colours; "RED ROCK" on the baselines and "RED ROCK PAVILION" on the sidelines.
- **Which arena is used:** the home side's, in Play, Watch and replays.

## Not in this piece

- A neutral-site arena.
- Arena sounds beyond today's crowd.
- Fans leaving or arriving during a game.

## Risks

- **The court's size runs through the simulation.** Tests that place players at fixed spots may need their spots moved. Each such change is recorded in the ledger with why.
- **A full stadium costs frames.**
  - Every stage measures Low against the stage before.
  - The building is drawn in as few draw calls as it can be.
  - The live video board renders the scene again, so it is only on High and Ultra.

## Stage 2 as built (2026-11-16)

- **The building** (building.js) goes round the lower stands as they were, so the broadcast camera's tested sightlines
  hold:
  - corner blocks with the teams' tunnels (the far corners) and exits (the near ones);
  - the suites' windows;
  - the LED ribbon;
  - a 12-row upper deck behind a glass railing, with corner blocks;
  - the walls behind it;
  - handrails down the aisles cut through every stand;
  - wave-shaped steel trusses, catwalks hung from them, and four banners over each end.
- **The near side** behind the camera: its suites, ribbon and upper deck begin behind the camera (z 19.6). The wall
  in front of them stays under its view.
- **The video board** shows its own graphics on every level (both teams' marks, points, period and clock). On High
  and Ultra it shows the live picture instead: the frame just drawn, copied small whenever the board is in view, so
  it costs no second drawing of the scene. The score strip under the screens is on every level.
- **The court:** the lanes and centre circle painted the Waves' blue, their mark at centre court, "HARBOR CITY"
  along the baselines and "TIDEWATER ARENA" along the sidelines.
- **Cost:**
  - Everything flat and unlit (windows, banners, tunnels, signs, the board's core) is one mesh on one picture.
  - What runs round (the ribbon and the board's ring) is another.
  - The lower steps join the upper deck's concrete.
  - The upper deck's fans are in the crowd's own two batches.
  - Low draws 79 calls against Stage 1's 72. Its JavaScript a frame measured 1.33–1.46 ms against Stage 1's
    1.41–1.99, on the same machine back to back.
- **Not yet:** the upper deck's fans sit still until Stage 3 gives every fan their reactions. Every match is at
  Tidewater until Stage 4 builds Red Rock Pavilion.

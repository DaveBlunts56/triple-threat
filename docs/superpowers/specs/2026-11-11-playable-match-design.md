# Triple Threat — Milestone 1: Playable Match

Date: 2026-11-11 · Status: awaiting review · "Triple Threat" is a working title.

## The whole game (context)

A single-player 3D basketball game for the browser, built with Three.js and WebGPU, made for the owner's own fun.

Agreed with the owner:

- 3v3 on a full court against computer opponents.
- Keyboard controls, TV-style broadcast camera, you control the ball handler.
- Full-simulation rules, realistic MakeHuman players with Mixamo motion, GPU cloth shorts, pro arena with a crowd.

Assumed, not yet confirmed by the owner:

- Single player only. No online or local multiplayer.
- Desktop browser only. No phone or touch support.
- Rosters of five per team (three on court), so substitutions have a bench.

Milestones, in build order. Each gets its own spec and plan:

1. **Playable match** (this document)
2. Full rules: fouls, free throws, violations, stamina, substitutions, jump ball
3. Realistic players: MakeHuman bodies, kits, Mixamo motion
4. GPU cloth shorts
5. Pro arena and crowd

## Goal of milestone 1

A complete 3v3 full-court match you can play from tip to final buzzer against the computer, with placeholder players and a bare court. It answers one question: is the match fun to play?

Done means:

- You can start a match, play four quarters, and see a final score.
- You can move, sprint, dribble, pass, shoot, steal, block and rebound.
- Two computer teammates and three computer opponents play sensibly on offence and defence.
- Twos and threes, out of bounds, and a 24-second shot clock all work.
- It holds 60 fps on the owner's laptop (RTX 4050).

## Not in milestone 1

Left to later milestones: fouls, free throws, travelling, double dribble, backcourt, 3-second and 5-second violations, stamina, substitutions, jump ball, realistic models, animations, cloth, arena, crowd.

Not planned at all unless asked: sound, gamepad, multiplayer, mobile, difficulty levels, player statistics, replays, team or player customisation.

## Approach

**Simulation and drawing are separate.** The match is a plain JavaScript state object advanced by a pure `step` function at a fixed 60 steps per second. The simulation knows nothing about Three.js or the browser. The renderer reads the state each frame and draws it.

Why this matters:

- The match can run headless under Node, so rules, ball physics and AI get automated tests.
- Milestone 3 replaces only the code that draws players. Milestone 2 touches only the rules. Neither disturbs the other.

**One input shape for humans and AI.** Keyboard and AI both produce the same small "intent" object per player per step. The simulation does not know or care which one made it.

```
intent = { moveX, moveZ, sprint, shoot, pass, steal, switch }
```

- `moveX`, `moveZ`: desired direction, each from -1 to 1.
- `shoot`: true while the shoot key is held. Also the jump key on defence.
- `sprint`, `pass`, `steal`, `switch`: booleans.

**No physics engine.** The ball is the only free-flying body, and it only meets a floor, two backboards and two rims. That is a few dozen lines of hand-written maths, fully testable. Players are circles sliding on the floor that push each other apart.

**No build step.** One dependency, `three` (0.187.0), installed with npm and loaded through a browser import map. Files are served by a plain static server. Tests use Node's built-in test runner. Alternative considered: Vite plus Vitest, which adds hot reload but also a toolchain this milestone does not need.

## Court and units

All distances in metres, FIBA dimensions:

- Court 28 × 15. Rim 3.05 high, 0.225 radius, centre 1.575 in from the baseline.
- Three-point line 6.75 from the rim centre, 6.6 in the corners.
- Ball radius 0.12.

`x` runs along the court's length, `z` across its width, `y` up. The court centre is the origin.

## Files

```
index.html              canvas, HUD elements, import map
src/main.js             boot, fixed-step loop, wires input → sim → render
src/input.js            keyboard → intent for the controlled player
src/sim/tuning.js       every tunable number (speeds, shot odds, AI delays)
src/sim/state.js        createMatch(): players, ball, clocks, score, phase
src/sim/ball.js         flight, floor, backboard, rim, basket detection, shot solver
src/sim/players.js      movement, dribble, pass, shoot, steal, block, pickup
src/sim/rules.js        phases, shot clock, out of bounds, scoring, possession
src/sim/ai.js           offence and defence decisions → intents
src/sim/step.js         step(state, intents, dt): calls the above in order
src/render/scene.js     renderer, court, hoops, lights, camera
src/render/actors.js    placeholder player and ball meshes, synced from state
src/render/hud.js       score, clocks, quarter, start / pause / final screens
tests/*.test.js         Node tests for everything under src/sim
```

Nothing in `src/sim` may import Three.js or touch the DOM.

## Gameplay

### Controls

| Key | With the ball | Without the ball |
|---|---|---|
| W A S D | Move | Move |
| Shift | Sprint | Sprint |
| Space | Hold to jump, release to shoot | Jump to block or rebound |
| E | Pass | Switch to the defender nearest the ball |
| Q | — | Steal attempt |
| Esc | Pause | Pause |

On offence, control follows the ball: you are always whichever of your players holds it. On defence you choose with E.

### Shooting

Hold Space to rise, release to let go of the ball. The chance of a make is a product of three factors:

- **Distance** from the rim.
- **Release timing**: best at the top of the jump.
- **Contest**: how close the nearest defender is, and whether they are in the air.

On a make, the ball is launched on the exact arc that drops through the rim centre. On a miss, that arc is nudged off so the ball hits rim or backboard.

After release the ball is pure physics. A basket counts only when the ball actually passes downward through the rim, never because of the dice roll. Misses therefore produce real, live rebounds.

Two or three points is decided by where the shooter's feet were at release.

### Passing

E passes to the teammate best lined up with your movement direction, or the nearest teammate if you are standing still. The pass is a fast physical ball. A defender close to its path can intercept it.

### Dribbling

While a player holds the ball and moves, the ball bounces beside them. This is for looks only in milestone 1; dribbling violations arrive in milestone 2.

### Defence

- **Steal** (Q): works within reach of the ball handler, more likely from the front or side than from behind. A failed attempt has a short cooldown.
- **Block** (Space): a defender in the air close in front of the shooter at release may deflect the ball.
- **Rebound and loose balls**: the first player within reach of a loose ball takes it. Jumping raises reach height.

### Rules in this milestone

- Four quarters of 3 minutes. Tied at the end: 1-minute overtimes until someone leads.
- Your team has the ball to start quarters 1 and 3; the computer starts 2 and 4.
- 24-second shot clock. Resets when the ball hits the rim or possession changes. Expiry gives the ball to the other team.
- Out of bounds: the team that touched it last loses it.
- After a basket, a violation, or out of bounds, play restarts with an inbound. The inbounder stands outside the line, cannot move, and can only pass. There is no 5-second count yet.
- Inbound spots: after a basket, the baseline under that hoop; after out of bounds, the point where the ball left; after a shot-clock expiry, the nearest sideline point; at the start of a quarter, the sideline at half court.
- Clocks stop while the ball is dead and restart when a player on the court touches the inbound pass.

The match moves through phases: `start → inbound → live → dead → inbound …`, with `quarterEnd` and `final` when the game clock runs out.

## Computer players

One AI serves teammates and opponents alike. It makes a decision a few times per second, not every step, so it reacts with a human-like delay.

**Ball handler**, in priority order:

1. Shot clock nearly out: shoot.
2. Open and in range: shoot.
3. Clear lane to the rim: drive.
4. Otherwise pass to the most open teammate.

**Off the ball on offence:** move to one of three spacing spots around the attacking hoop (two wings and a low spot), and trade spots now and then so the defence has to move.

**Defence:** man-to-man. Each defender has one assigned opponent and stays between them and the hoop, tighter on the ball handler. They jump to contest when their opponent starts a shot and occasionally try a steal.

**On a shot:** the two players of each team nearest the rim go for the rebound; the third gets back.

**Change of possession:** everyone runs to the other end.

There is one difficulty. Reaction delay and shooting skill are constants in `tuning.js`.

## Drawing

- **Renderer:** Three.js `WebGPURenderer`. It falls back to WebGL 2 by itself where WebGPU is missing.
- **Court:** a floor with painted lines, two hoops (backboard, rim, pole and a simple static net so makes are easy to read).
- **Players:** a capsule with a head, in team colours, with a marker for which way they face. A ring on the floor marks the player you control.
- **Lighting:** one sky light and one shadow-casting directional light.
- **Camera:** on the sideline, raised, sliding along the court to follow the ball smoothly.
- **HUD:** ordinary HTML over the canvas: score, quarter, game clock, shot clock, a controls reminder, and start, pause and final screens. Real text with strong contrast, so it stays readable and works with screen readers.

## Things that can go wrong

- **No WebGPU and no WebGL 2:** show a plain message naming the problem instead of a blank page.
- **WebGPU missing but WebGL 2 present:** the game runs; a small note in the HUD says which one is in use.
- **Tab hidden or window unfocused:** the match pauses.
- **Slow frame:** the time step is capped so the simulation never tries to catch up on a long stall.

## Testing

Automated, with `node --test`, no browser needed:

- **Ball:** bounce height decays correctly; a clean shot is detected as a basket; a ball that rolls off the rim or rises through it from below is not; the backboard reflects the ball.
- **Shot solver:** the computed launch arc passes through the rim centre from a range of positions.
- **Rules:** shot-clock expiry, out-of-bounds possession, two versus three by foot position, quarter end, overtime on a tie.
- **Whole match:** two AI teams play a full game headless at high speed. The test asserts no invalid numbers appear, the ball never escapes the building, the game reaches `final`, and both teams score.

By hand, in the browser: play a full match and judge feel, camera and frame rate.

## Known risks

- **WebGPU on this machine is unverified.** Only Firefox 146 is installed, on Linux with an NVIDIA GPU, and Firefox's WebGPU support on Linux is uncertain. The first task of the plan is a probe page that reports what the browser offers. Milestone 1 works either way thanks to the WebGL 2 fallback, but milestone 4's GPU cloth needs real WebGPU, so installing Chrome or Chromium may be required.
- **Fun is a matter of tuning.** Speeds, shot odds and AI delays will need several rounds of play-testing. All of them live in one file for that reason.
- **Three.js WebGPU APIs move quickly.** The plan must check the current Three.js documentation for `WebGPURenderer` rather than rely on memory.

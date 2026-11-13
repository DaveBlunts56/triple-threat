# Net, names and positions, start menu: design

Date: 2026-11-13. Status: approved in conversation by the owner; awaiting their read of this file.

This is piece 1 of the eight additions the owner asked for after play-testing milestone 3. The agreed order of the pieces:

1. Net, names and positions, start menu (this spec).
2. A 5v5 option.
3. Defence: matchup arrows, switching, screens that block.
4. Offensive plays.
5. A smarter computer: late-game urgency, intentional fouls, timeouts.

Each later piece gets its own spec and plan.

## Why

- **Net.** The owner: "sometimes I can barely tell if the ball goes in". Today the net is a still wireframe cylinder of hair-thin lines, and the ball passes through it with no effect.
- **Names and positions.** Players are numbers only. Names and positions make them people, and the later pieces (5v5, plays) need positions.
- **Start menu.** The start screen is a title and "Press Enter to play". The owner asked for a futuristic menu: a large glossy disc with neon-blue rings and a silver border, stacked entries in bold white, a bright blue bar on the selected one, on a soft icy-blue background, in the polished style of games from the early 2010s. The design is the game's own; it copies no existing game's menu.

## What stays as it is

- The rules, the sim and the ball's path. Nothing under `src/sim/` changes except the roster data (names, positions, team names) and what carries them.
- The pause and final screens keep their look. The pause roster gains names and positions.
- The single-file build: no new asset file, no font, no picture, no network request. The file stays under 25 MB.
- Controls in play. `G` still switches quality on any screen.

## 1. The net

### Behaviour

- Each hoop's net is 12 strings hanging from the rim, each of 5 knots below its rim point. Neighbouring strings are tied at each knot row. The strings stretch as a real net's mesh does (up to one and a half times their length) and spring back; the ties give like elastic (up to two and a half times their length), which is what lets the ball open a net narrower than itself.
- At rest it hangs as a sleeve 0.40 m long that narrows from the rim's radius (0.225 m) to 0.09 m at the bottom. The bottom is narrower than the ball (radius 0.12 m), so every make must push the strings apart.
- The knots move under gravity, with drag, held by the string lengths. The ball pushes any knot it overlaps to its surface. So a make bulges the net, drags it down, and lets it whip and swing back; a ball that grazes the net from outside moves it a little; a ball that never touches it leaves it still.
- A ball that strikes the rim shakes the net slightly. The renderer cannot see the sim's events, so it detects this from the ball itself: the ball's velocity changes sharply between two frames while the ball is touching the rim's ring.
- The net never changes the ball. The sim does not know the net exists.
- The net moves by match time: it is still while the game is paused, and behaves the same at High and Low quality.

### Look

- Drawn as a see-through white sleeve with a diamond net pattern painted on it at start-up (a canvas picture, no file), visible from both sides. It must read clearly from the game camera at both hoops; thin lines do not.

### Structure

- `src/render/net.js`: the net's physics, plain logic with no Three.js, so it is tested in Node. It makes a net for a hoop, and advances it given the ball's place before and after and the time passed, in fixed sub-steps no longer than the sim's step (1/60 s), moving the ball evenly across the sub-steps so a fast ball cannot skip through.
- The scene builds each hoop's sleeve from the net's knots and updates it every frame. Today's wireframe cylinder goes.

### What the tests must show

- Left alone for 2 seconds it hangs within 1 cm of the shape it was made in, and is then still: no knot moves 1 mm in the next half second.
- A ball falling through the middle at 5 m/s pushes at least one knot 3 cm or more away from where it rests, and 2 seconds after the ball has gone every knot is back within 1 cm of rest.
- No string segment is ever more than one and a half times its rest length, and no tie more than two and a half times its.
- A ball passing 0.5 m from the net moves no knot.
- Steps of 0 seconds and of 0.1 seconds give no number that is not finite, and a step of 0 changes nothing.

## 2. Names and positions

All names are invented. Team 0 is yours.

| Position | Harbor City Waves (blue, team 0) | Red Rock Scorpions (red, team 1) |
|---|---|---|
| PG | No. 4 Jalen Cross | No. 5 Kai Mercer |
| SF | No. 7 Theo Marsh | No. 8 Luca Reyes |
| C | No. 11 Darius Stone | No. 10 Viktor Lund |
| SG | No. 15 Sam Okoro | No. 21 Devon Hale |
| PF | No. 23 Andre Volkov | No. 33 Emeka Bright |

- The rows are in roster order. The first three start, as today: a guard, a forward and a centre. The last two are the bench.
- Each roster entry carries its name and position beside its number. Each team has a name.
- Positions are labels only in this piece. No ratings, and no change to how anyone plays.

### Where they show

- **Pause roster:** each row gives position, name and number, then what it gives today, for example `1 · PG · Jalen Cross · No. 4 · on court · 0 fouls`.
- **The whistle:** a call names the player by surname and number, for example `Reach-in foul on Cross (4). Your ball`.
- **In play:** a small label beside the energy bar names the player you control: `Cross · PG · 4`.
- **The Teams panel** of the start menu (below).
- Substitution notes on the pause screen use surnames in place of `No. 4`.

## 3. The start menu

### Look

As in the mockup the owner saw (`dist/menu-mockup.html`, not kept in the repository):

- A soft icy-blue background that covers the court: pale blue-white light fading to deep blue.
- Centred, a large disc about 78% of the window's shorter side: a silver metallic border, a glowing neon-blue edge, a dark glossy blue face with a bright highlight over its top half, and a glow on the floor beneath it.
- Round the disc, thin neon-blue rings; one dashed ring turns very slowly. It does not turn when the device asks for reduced motion.
- On the face: the title TRIPLE THREAT in small spaced letters, then the entries stacked, bold italic white capitals. The selected entry has a bright blue horizontal bar across the disc.
- Everything is sized from the disc, so it holds its proportions on the Chromebook's screen and a desktop window.
- Plain HTML and CSS with system fonts.

### Entries and panels

The main list: **Play**, **Teams**, **Controls**, **Settings**. The list is data, so piece 2 can add the 3v3 / 5v5 choice without reshaping the menu.

- **Play** starts the match, as Enter does today.
- **Teams** shows both teams inside the disc: each team's name in its colour, and its five players as position, number and name.
- **Controls** shows the keys: move, sprint, shoot or jump, pass or switch, steal, hold the ball, pause, quality.
- **Settings** has two rows, each showing its current value:
  - Quality: High or Low. The same switch as `G`, with the same meaning: once you choose, the game stops choosing for you.
  - Automatic substitutions: On or Off, for your team. The same switch as `A` on the pause screen. The choice is the menu's, so it applies to every match started afterwards, not only the next.

### Keys

- Up and Down arrows, or W and S, move the bar; it wraps round at the ends.
- Enter, or Space, chooses the entry, or changes the selected setting.
- Esc, or Backspace, goes back from a panel to the main list. On the main list it does nothing.
- The mouse works too: pointing at an entry selects it, clicking chooses it.
- The menu is the `start` phase's screen only. On the final screen Enter starts a new match, as today.

### For screen readers

- The list is announced as a list of options with the selected one marked; moving the bar announces the newly selected entry; a changed setting announces its new value.

### Structure

- `src/menu.js`: the menu's state and keys as plain logic, tested in Node, in the way `src/pause.js` holds the pause screen's. It knows the panel shown and the selected row, and turns a key into what should happen (start the match, switch quality, switch automatic substitutions) without touching the page.
- `src/render/hud.js` draws the menu from that state, as it draws the pause screen. `index.html` holds its markup and styles.
- `src/main.js` routes keys to the menu while the phase is `start`, and applies the automatic-substitutions choice to each new match.

### What the tests must show

- The bar moves down and up and wraps at both ends, by arrows and by W and S.
- Enter on Play asks for the match to start; on Teams, Controls and Settings it opens that panel; Esc and Backspace return to the main list with the bar where it was.
- In Settings, Enter on Quality asks for the quality switch, and Enter on Automatic substitutions flips the menu's choice; a match started afterwards has that choice, and so does the one after it.
- The HUD writes the selected entry, the panel shown, the setting values and the Teams panel's ten players from the state it is given.
- Keys pressed on the menu do not act in the match that follows.

## Not in this piece

- Ratings, team selection, difficulty, sound.
- The 3v3 / 5v5 choice (piece 2).
- Restyling the pause and final screens.
- Any effect of the net on the ball.

## What cannot be tested in Node, and is checked by eye

- That the net reads clearly from the game camera at both hoops, and that a make looks like a make.
- The menu's look on the Chromebook's screen, and that the dashed ring's turn costs no frame rate there.

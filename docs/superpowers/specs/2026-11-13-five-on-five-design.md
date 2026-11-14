# 5 on 5: design

Date: 2026-11-13. Status: approved in conversation by the owner (eight players a side, a Mode row on the start menu); awaiting their read of this file.

The owner asked for the game to "expand from 3v3 to 5v5 with an option to choose before starting the game". This is piece 2 of the additions. The defence's matchups and switching, the offensive plays, and the smarter computer with timeouts come after it, each with its own spec.

## What stays as it is

- **3 on 3 plays exactly as it does today.** Every rule, number and test of the three-a-side game holds.
- The rules themselves: clocks, fouls, violations, free throws, scoring, the shot meter, the net.
- The single-file build, the quality levels, the menus' looks.

## 1. The match knows its size

- A match is three a side or five a side, decided when it is made, and never changes while it lasts.
- Three a side has six players on court, five a side has ten. Each team's players stand in order: the first of a team's roster rows start.
- Nothing else in the rules depends on the size except where this spec says so.

## 2. Choosing the mode

- The start menu's main list gains a row between Play and Teams: **Mode: 3 on 3** or **Mode: 5 on 5**. Enter or Space on it switches between the two. It starts on 3 on 3.
- Play starts a match of the size shown. "Play again" on the final screen plays the same size. Quitting to the main menu keeps the choice.
- Screen readers hear the row's new words when it changes, as for the settings.

## 3. Rosters: eight a side

Each team has eight players: the five it has now and three new ones. All names are invented.

| Row | Position | Harbor City Waves | Red Rock Scorpions |
|---|---|---|---|
| 1 | PG | No. 4 Jalen Cross | No. 5 Kai Mercer |
| 2 | SF | No. 7 Theo Marsh | No. 8 Luca Reyes |
| 3 | C | No. 11 Darius Stone | No. 10 Viktor Lund |
| 4 | SG | No. 15 Sam Okoro | No. 21 Devon Hale |
| 5 | PF | No. 23 Andre Volkov | No. 33 Emeka Bright |
| 6 | PG | No. 1 Marcus Bell | No. 2 Rafael Ortiz |
| 7 | SF | No. 13 Noah Vance | No. 14 Jamal Whitaker |
| 8 | C | No. 32 Idris Kane | No. 30 Bogdan Ilic |

- **Five a side:** rows 1 to 5 start; rows 6 to 8 are the bench.
- **Three a side:** rows 1 to 3 start, as today; rows 4 to 8 are the bench.
- **Models:** the six new players are built with the same tools and the same CC0 assets as the first ten (`assets/source/people.json`, `tools/blender/build_players.py`), each with his own height, build, skin, hair and face. `assets/players.glb` holds sixteen. Every asset used is already in `assets/CREDITS.md`; if a new one is needed it is CC0 and is added there.
- **Substitutions** work as now with the bigger bench: by hand on the pause menu, where the list shows all eight and the keys are 1 to 8; and by the automatic rules (tired, in foul trouble, fouled out).
- **The Teams panel** of the start menu lists eight a side and still fits inside the disc.

## 4. How five play

Until the plays piece, five a side uses the same simple game as three a side, spread over five places.

- **Before the tip:** the two fives line up either side of the centre line, facing each other.
- **The tip-off:** each team's centre jumps (row 3). In three a side the jumper is who it is today.
- **Offence without the ball:** five spots in the front court: the top of the key, the two wings, one corner and the low post. Players rotate through them on the same timer as the three spots today.
- **Defence:** man to man, each player guarding the opponent in his own place in the order, as today.
- **Free throws:** the shooter at the line, and a legal place for the other nine: along the lane in the order the rules give, the rest behind the three-point line. Nobody starts inside the lane or on top of another player.
- **Inbounds, rebounds, loose balls, fouls, violations:** the same rules, for ten.
- **The player you control:** as today, with E switching among your five.

## 5. Drawing ten

- The renderer has ten places for players and shows as many as the match has. A bench player's model is put in a place when he comes on, as today.
- With the players' files missing, the capsule fallback draws ten too.
- Each player is one mesh, so ten cost ten things to draw in each pass.

## 6. Housekeeping done first

- `src/render/motion.js` has grown to about seven jobs. It is split into smaller files by job (the shot meter, the ball in the hand, heading and heads, the file checks; motion choice and blending stay), with no change in behaviour. This was put off at the last milestone's review to the start of this piece.
- The places that assume six players or three a side are found and fixed: making and lining up the players, the tip-off's jumpers, the offence's spots, the capsule fallback, the renderer's player places, and the tests' helpers.

## What the tests must show

- A three-a-side match is made exactly as before, and every existing test passes unchanged except where it names the roster's size.
- A five-a-side match has ten players, five to a team, the right people in the right places, and each team's centre jumping.
- The five spots are inside the court, in the front court, apart from each other, and mirrored for the other team.
- A free throw in five a side: all ten have a place, none inside the lane but as the rules allow, none within a body's width of another.
- A whole five-a-side match played by the computer against itself runs to its end from several seeds: it finishes, both teams score, nobody leaves the court, and no call is made more often than a sane game would have.
- Rosters: eight a side with the names, numbers and positions above; substitutions by hand and by the automatic rules reach the three new players; a fouled-out player in five a side is replaced from the bench.
- The menu: the Mode row, its two values, that Play makes a match of that size, and that "play again" and quitting keep it.
- The pause menu and the Teams panel show eight a side.
- The players' file holds sixteen dressed players, each passing the checks the ten pass today.

## What is checked by eye, and by the owner

- By me: five a side on screen at both ends; the tip-off; a free throw; a substitution of a new player; the Teams panel with eight; the frame rate in Firefox with ten players.
- By the owner: how five a side plays (spacing, scoring, how hard it is), and the frame rate on the Chromebook.

## Not in this piece

- Matchup arrows, switching and screens; offensive plays; the smarter computer, late-game urgency, intentional fouls and timeouts. Five a side will feel plain until those arrive.
- Ratings or different abilities for different players.
- Choosing teams or line-ups before the match.

## Risks

- **Balance.** Ten players on the same court change spacing, steals and shot quality. The numbers that set the three-a-side game are left alone; what five a side needs is found by the owner's play-test.
- **The new models.** They depend on the Blender tools working as they did in milestone 3. If a new player cannot be built to the same standard, he is left out and the owner is told, and the bench is smaller.
- **File size.** About 5 MB more, taking the single file to about 33 MB.

# Exhibition and Team Select: design, as built

Date: 2026-11-16. Branch `feat/team-select`, off `main` after the arenas work was merged.

## What the owner asked for

> I was thinking to have the "Play" tab to now be called "Exhibition" and to have the photo attached as the Team
> Select screen (We are going to add more teams, Im creating the team names, identities, colors, players and more)

The photo was a console football game's team select screen:
- the away team on the left and the home team on the right, each with a star athlete;
- the city over the team name, and an overall rating under it, with "vs" between;
- controller icons along the top to pick a side;
- the keys along the bottom.

It is built in Triple Threat's own look, with none of that game's teams, marks or style.

## The owner's answers

| Question | Answer |
|---|---|
| Your side | Move your controller with ← →: away, the middle, or home. Either team can be yours. |
| Watch | Folded into Exhibition: the controller in the middle means watching, with Watch's own style and quarters. |
| Picture | Each team's star as our own 3D model in his kit, posed and drawn live, with his team's mark behind him. |
| New teams' players | Every new player gets his own built model, like today's 16 (about 2 MB each in the download). |

## As built

- **The main menu:** Exhibition, Simulate, Mode, Teams, Controls, Settings. Play, Watch and Stage 4's Home entry are
  gone.
- **Team Select** (Enter on Exhibition):
  - ← → move your controller between Away, the middle (watch) and Home.
  - ↑ ↓ change the team on your controller's side, or the away team's when you watch; picking the team the other
    side has swaps them.
  - R picks two teams at random; Enter starts; Esc goes back.
  - The choice is saved with the other settings.
- **The picture** (studio.js):
  - each side's star (the player with the highest overall) is a copy of his own model, standing in the game's idle
    motion, lit from the front and, low behind, in his team's colour;
  - his team's mark stands faded behind him, against a backdrop of the two teams' colours.
- **The words** (index.html, hud.js): "Exhibition" over the controller row; each team's city, nickname and overall
  (the mean of its first five) along the bottom, in its colours; the keys under them. Screen readers hear the choice.
- **The match:**
  - the team you play is always the match's first side (so the controls are unchanged), whether it is home or away;
  - watching, the away team is first;
  - `state.ids` holds each side's team id and `state.home` the side at home.
  - Everything that names, colours or dresses a team now asks the match which team is on that side: the scorebug's
    names, colours and marks, every panel and announcement, the commentary, the video board, the 3D players' models
    and kits, the benches, the arena, and the crowd's colours and signs.

## Adding a team

A team is one entry in `TEAMS` (src/sim/teams.js). Its place in the list is its id.
- **The sim's fields, as today:**
  - name, abbr, playbook, defence and coach;
  - eight players, each with name, number, position, role and eight ratings.
- **How it looks:**
  - city and nickname;
  - colour (its kit, its fans' shirts), and optionally `bar` and `ink`, the page's brighter and paler shades (mixed from
    the colour when not given);
  - its mark (`logo`: a disc colour, a rim colour, and SVG paths in a 40-unit square);
  - its arena (a key of `ARENAS` in src/render/arenas.js). A team with no arena of its own plays home games at Tidewater
    until one is made.
- **Its players' 3D models** are built into assets/players.glb by the Blender tools, named `player-<id>-<number>`.
  The game refuses to load without one for every player in `TEAMS`.

## Not in this piece

- Simulate still plays the first two teams.
- Every team's 3D players are loaded at the start, which is fine for two teams. Loading only the two in a match will
  matter when there are many.

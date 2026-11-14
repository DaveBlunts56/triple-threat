# Matchups, switching and screens: design

Date: 2026-11-13. Status: approved in conversation by the owner; awaiting their read of this file. One thing is changed since the conversation: the illegal-screen foul moves to the plays piece (section 4 says why).

The owner asked for a "defence matchup indicator (arrow to who you guard, both sides)" and said "the defense CAN switch matchups to better favor the defense (applies to both sides)". This is piece 3 of the additions. The offensive plays, and the smarter computer with timeouts, come after it, each with its own spec.

## What stays as it is

- The rules: clocks, fouls, violations, free throws, scoring, the shot meter, the net.
- The keys. E still passes on offence and, on defence, gives you the team-mate nearest the ball.
- How the offence moves, in both modes.
- The single-file build and its size: this piece adds no asset.

Both modes get this piece. Three a side keeps its rules and numbers, but its defenders can now switch, so a computer-only match no longer plays out move for move as before.

## 1. Who guards whom is part of the match

- Every player has **his man**: the one opponent he guards. Every attacker is the man of exactly one defender, always.
- At the start each player's man is the opponent in the same place of the team's order, as today.
- A substitute takes over the man of the player he replaces, and is guarded by whoever guarded that player.
- At every stoppage (a call, a made basket, out of bounds, free throws, the start of a quarter) everyone goes back to his own man: the opponent in his place of the order.

## 2. The arrow and the marker

Drawn on the floor, for the player you control, in a warm red so they do not read as your own yellow ring.

- **Your team defends** (the other team has the ball): a flat arrow runs from your player toward his man and stops short of him, and a ring marks the man. When your player is within about a metre and a half of his man the arrow is left out and only the ring shows.
- **Your team attacks:** a ring marks the defender who is guarding the player you control. No arrow.
- Both follow at once when you change player with E, when a pass moves control, and when a switch changes the man.
- Shown during live play and inbounds. Not shown at the tip-off, at free throws, between quarters, on the final screen or on the start menu. On the pause screen they stay as they were, frozen with the game.
- Drawn at every quality level, and with the capsule fallback.

## 3. Switching

The same rules for both teams' defenders: the computer's team, and your team including the player you control. When your player's man changes, the arrow shows the new one.

**On a screen.** A defender is screened when he runs into a set attacker (section 4) who is not his man, while his own man is getting away from him: more than a set distance off (the plan sets it; about 2 m). He then swaps men with the defender guarding the screener, but only if that defender is nearer to the man being lost than he is. Otherwise nothing changes and he goes round.

**Getting back.** When the ball changes teams in live play (a steal, a rebound, a loose ball won), the team now defending may re-match once: each defender to an attacker so that the total distance they must run is as short as it can be. The re-match is made only if it saves a long run in total (the plan sets it; about 6 m). A small saving changes nothing, so a team that is already matched up stays as it is.

**How long it lasts.** A switch holds until the next stoppage, then everyone returns to his own man (section 1). Two defenders may swap again before that if the screen rule says so, but a pair that has just swapped may not swap back for a moment (the plan sets it; about 2 seconds), so they do not flick to and fro.

**Not in the rule:** nobody switches to fix a size mismatch, since there are no ratings to judge one by; and there is no key for you to call a switch.

## 4. Screens

- An attacker without the ball who has stood still for a moment is **set**. This is the measure the charge call already uses for a set defender: still for 0.4 seconds.
- Players already block each other's way, so a set attacker is a wall a defender must go round. Nothing new is needed for that.
- What this piece adds is that the switch rule (section 3) knows a set attacker when a defender runs into one. In today's game that happens when a defender chasing his man runs into an attacker standing on his spot.
- **Nobody sets a screen on purpose yet.** The computer does not, until Pick & Roll in the plays piece. You cannot either, because on offence control follows the ball, so the player you control is the one holding it.
- **The illegal-screen foul moves to the plays piece.** In the conversation it was part of this piece. With nobody setting screens yet it could only be called on an accidental bump, which would punish ordinary movement. It belongs with the plays that set screens, where it can be tuned against them.

## What the tests must show

- At the start, and after every kind of stoppage, each player's man is the opponent in his place of the order, in three a side and in five.
- Whatever switches are made, every attacker has exactly one defender and every defender one man.
- A substitute has the man of the player he replaced, and is the man of the same defender.
- The defence guards by the matchup: a defender whose man was changed goes to the new one.
- A screened defender swaps with the screener's defender when that defender is nearer the man being lost; does not when he is farther; does not when the attacker he ran into is moving, is his own man, or holds the ball; and does not swap back within the wait.
- Getting back: a team caught far from its own men re-matches to the shortest total run; a team already near its own men changes nothing.
- The arrow and the marker: which player they point at when your team defends and when it attacks; that they follow a change of player and a switch; and in which phases they show.
- Whole matches played by the computer against itself, three a side and five, from several seeds: they finish, both teams score, no call is made more often than a sane game would have, and switches happen but not more than a few times a possession.

## What is checked by eye, and by the owner

- By me: the arrow and the ring on defence and the ring on offence, at both ends and at each quality level; that they follow E, a pass and a switch; that they are hidden at the tip and at free throws.
- By the owner: whether the arrow is clear without being in the way; whether switching makes the defence better or just confusing when your own man changes; three a side and five.

## Not in this piece

- The illegal-screen foul; the computer setting screens; Pick & Roll and the other plays.
- A key to call a switch; switching for mismatches; help defence or double teams.
- The smarter computer, late-game urgency, intentional fouls and timeouts.

## Risks

- **Your man changing under you.** A switch that moves your player's man may feel like the game took control away. The arrow is the answer to that; if it still confuses, the fix is to leave the player you control out of switches, which is a small change.
- **Balance.** Switching closes some of the openings the offence gets from its movement, so scoring may drop, most of all in five a side. The plan measures computer-only matches before and after and keeps the numbers close to today's.
- **Clutter.** Ten players, number tags, your ring, an arrow and a second ring. If the floor gets busy the arrow is made thinner or fainter before anything is taken away.

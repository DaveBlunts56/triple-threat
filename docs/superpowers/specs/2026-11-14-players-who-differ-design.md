# Players who differ, and off-ball life: design

Date: 2026-11-14. Status: the outline and its place in the order were approved in conversation by the owner; the detail below (the ratings, the sixteen players, the numbers) is mine and awaits their read.

The owner said the game has "barely flavor" beside NBA basketball: all four of player moves, players who differ, big moments and broadcast feel are missing, and it feels flattest watching **the other nine**: team-mates and opponents who "move in a samey, robotic way". This is the first of four pieces that answer it. Sound, player moves, and big moments with broadcast feel come after, each with its own spec.

Today all sixteen players are the same player in a different body, and off the ball all five of a team walk round the same ring of spots at the same instant. This piece gives each player ratings and a role, makes the computer play to them, and gives the nine players you are not controlling things of their own to do.

## What stays as it is

- The rules, the keys, the cameras, the plays and the play list, the difficulty levels, the scorebug.
- You control one player, as now.
- The single-file build. This piece adds no asset and no new motion: it uses the motions the players already have (hand up, defensive stance, side-steps, back-pedal).

## 1. Ratings

Each player has eight ratings from 40 to 99. **A player rated 70 across the board plays exactly as every player does today.** Above 70 he is better than today at that thing, below it worse.

| Rating | What it changes |
|---|---|
| Inside | How often his shots within 3 m go in, and how wide his green window is there. |
| Mid-range | The same, from 3 m out to the three-point line. |
| Three | The same, behind the line. |
| Handle | How fast he moves with the ball, and how hard the ball is to take from him. |
| Speed | How fast he runs and sprints. |
| Defence | How much he takes off a shot he contests, and how often his reach wins the ball. |
| Rebound | How often he comes down with a rebound that he and another player could both reach. |
| Stamina | How slowly he tires. |

- Starting sizes, for the plan to tune: every 10 points is about 7% of a shot's chance and 10% of the green window's width; 2% of running speed; 10% of a steal's chance; 8% of what a contest takes off a shot; 8% of how fast he tires.
- **Overall** is the average of his best five ratings. **Each team's star** is its player with the highest overall.
- Your shooting is still yours: the green window and the difficulty level work as now, on a window that is wider for a good shooter and narrower for a poor one.

## 2. The sixteen players

Each has a role, which says what he is for. The eight ratings behind each are set in the plan; this table is what the owner should check.

| Team | Player | Pos | Role | Overall | Best at | Weakest at |
|---|---|---|---|---|---|---|
| Waves | Jalen Cross ★ | PG | Playmaker | 88 | Handle, Speed, Mid-range | Rebound |
| Waves | Theo Marsh | SF | Slasher | 82 | Inside, Speed | Three |
| Waves | Darius Stone | C | Rim protector | 84 | Defence, Rebound, Inside | Three, Handle |
| Waves | Sam Okoro | SG | Sharpshooter | 83 | Three, Mid-range | Inside, Defence |
| Waves | Andre Volkov | PF | Stretch big | 80 | Three, Rebound | Speed |
| Waves | Marcus Bell | PG | Shot creator | 78 | Mid-range, Handle | Defence |
| Waves | Noah Vance | SF | Lockdown wing | 77 | Defence, Stamina | Mid-range |
| Waves | Idris Kane | C | Rebounder | 76 | Rebound, Inside | Three, Speed |
| Scorpions | Kai Mercer ★ | PG | Shot creator | 89 | Mid-range, Three, Handle | Defence |
| Scorpions | Luca Reyes | SF | Two-way wing | 82 | Defence, Three | Handle |
| Scorpions | Viktor Lund | C | Post scorer | 83 | Inside, Rebound | Speed, Three |
| Scorpions | Devon Hale | SG | Sharpshooter | 83 | Three, Stamina | Rebound |
| Scorpions | Emeka Bright | PF | Glass cleaner | 80 | Rebound, Defence | Three |
| Scorpions | Rafael Ortiz | PG | Lockdown guard | 78 | Defence, Speed | Three |
| Scorpions | Jamal Whitaker | SF | Slasher | 77 | Inside, Speed | Three |
| Scorpions | Bogdan Ilic | C | Rim protector | 76 | Defence, Rebound | Handle, Speed |

The two teams come to the same total overall for the starting three (254), the starting five (417) and the bench (231), so neither side is the stronger.

## 3. Hot and cold

- A player who makes three shots from the floor in a row is **hot**: his shots go in a little more often and his green window is a little wider (about 10% and 20%). His next miss ends it.
- A player who misses three in a row is **cold**: a little worse (about 8%). His next make ends it.
- Free throws count for neither. A streak ends when he is taken off.
- You see it: the name under the player you control says HOT or COLD beside it. The computer feeds a hot player (section 4).

## 4. The computer plays to its players

This is for the computer's team and for your team-mates alike.

- **Who does what in a play.** The parts are cast by ratings, not by the order on the team sheet: the shooter is the best three-point shooter on the floor, the screener and the post man the best inside, the cutter the best slasher.
- **Which play.** The coach calls what suits who is on the floor: Post Up for a strong post scorer, Floppy for a sharpshooter, Clear Out for the star or a hot player, the pick and rolls for a good handler with a good finisher. A play nobody on the floor suits is called seldom.
- **Who shoots from where.** A player takes the open shots he is good at and passes up those he is not, unless the clock is short. A very good shooter may take an open three early in the shot clock; nobody else does.
- **Who gets the ball.** Passes lean toward the star and toward a hot player when they are open, and away from a cold one. The last shot of a close game goes to the star if it can.
- **How each is guarded.** A defender closes out hard on a good shooter and sags off a poor one; a quick handler is given a step more room.

## 5. Off the ball: the offence

The ring of spots that all five walk round at once is gone when no play is on. Instead each player has a place that suits his role, and moves on his own.

- **Places by role.** Shooters stand on the three-point line, one in a corner. Slashers take the wings. One big is low on the weak side; a second stands at the high post.
- **Each on his own time.** Nobody moves at the same instant as a team-mate. Each has his own moments to move, a few seconds apart, so there is always one player doing something.
- **Cuts.** A slasher cuts behind a defender who is watching the ball. Whoever passes may cut to the hoop for the ball back. A big flashes to the high post when the ball is on the wing.
- **Making room for a drive.** When the handler drives, the others move out of his path to open spots he can pass to: the corner man lifts, the man on the wing drifts, the big slides out of the lane.
- **Calling for the ball.** A player who is open in a place he can score from puts his hand up. You can see who wants it.
- **The offensive glass.** When a shot goes up, the team's two best rebounders go to the boards and the rest get back, in place of whoever happens to be nearest.
- **On a fast break** the wings run wide and the big trails.

When a play is on, the play's places come first; a player without a part in it keeps his role's place.

## 6. Off the ball: the defence

- **By how far he is from the ball.** A defender one pass from the ball stays close to his man. A defender two passes away sags toward the lane, where he can help.
- **Closing out.** When his man catches the ball he sprints at him with a hand up, harder at a good shooter.
- **Boxing out.** When a shot goes up, each defender turns and puts his body between his man and the hoop before he goes for the ball. With the rebound rating, that decides who gets it.
- **Help and recover.** When a helper steps in front of a drive, the next defender moves to cover the man the helper left, and the helper goes back when the ball is passed out.
- **Getting back.** The first defender back guards the rim; the second stops the ball.

## 7. What you see

- **The Teams panel** on the start menu shows each player's role and overall, and marks each team's star.
- **The pause menu's Substitutions list** shows each player's role and overall beside his name, so that you know who you are bringing on.
- **The name under the player you control** says HOT or COLD when he is.

## How it is built

In two stages, each playable: first the ratings, the roles, hot and cold, what you see, and the computer's use of them (sections 1 to 4 and 7); then the off-ball life (sections 5 and 6). The owner can play after the first.

## What the tests must show

- A player rated 70 throughout shoots, moves, defends, rebounds and tires exactly as today; one rated higher or lower does each better or worse, by the stated amounts, and only in the thing the rating is for.
- The sixteen players have the roles above; each team's star is who the table says; the two teams' average overall is the same for three a side, five a side and the bench.
- Hot after three makes and cold after three misses, ended by the next miss or make; free throws do not count; what each changes.
- The parts of every play go to the players the ratings pick, in three a side and five.
- The computer's shot choices follow the ratings: a poor three-point shooter passes up an open three that a sharpshooter takes.
- Off the ball: every role has a place; no two team-mates are sent to the same place; no two move in the same instant; a cutter goes when his defender is watching the ball; the others clear a drive; an open player in range calls for the ball.
- On defence: one pass away is closer than two; a closeout is harder on a better shooter; on a shot every defender boxes out his man; a helper's man is covered.
- Whole matches by the computer against itself, three a side and five, from several seeds: they finish; the scoring and the pace stay within a tenth of today's (five a side: about 49 points and 12.8 seconds a possession); the star takes between a quarter and a third of his team's shots; the best three-point shooter makes clearly more of his threes than the worst; the best rebounders have the most rebounds.

## What is checked by eye, and by the owner

- By me: the Teams panel and the pause list with roles and overalls; HOT and COLD under the name; stills of the offence spread by role, a cut, a player calling for the ball, a box-out.
- By the owner: whether the players now feel different in the hand; whether the other nine look alive or merely busy; whether the stars are too strong; whether your team-mates help or get in the way.

## Not in this piece

- Sound; new player moves (crossovers, step-backs, dunks); big moments and broadcast feel. Those are the next three pieces.
- New motions of any kind. A box-out is the defensive stance; calling for the ball is the hand-up the players have.
- Changing a player's ratings, choosing line-ups before the match, trades, or more teams.
- Height and build changing how a player plays: only the ratings do.
- The computer moving its best defender on to your best scorer.

## Risks

- **Balance.** Ratings change every shot, steal and rebound. The scoring and the pace are measured before and after each stage and held near today's. If a star decides every match, his ratings come down before anything else changes.
- **Busy, not alive.** More movement can read as noise. Each move in section 5 has a reason a watcher can see (a defender looking away, a drive, an open spot); a move with no reason is not made.
- **Your team-mates in your way.** A cutter or a big sliding across can block your drive. The rule that the others clear a drive applies to you as to the computer.
- **Plays and roles pulling against each other.** A play's places win while it is on; the tests check that nobody is given two places.

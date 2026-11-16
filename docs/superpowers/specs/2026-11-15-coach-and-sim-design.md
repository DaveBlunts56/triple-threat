# A smarter computer, two styles of game, and a basketball simulation: design

Date: 2026-11-15. Status: the owner approved approach A (one shared basketball model, two engines) on 2026-11-15, with the changes listed below. This spec turns that into a design. It is waiting for the owner's read and "Yes, write the plan".

## What the owner asked for

Two big upgrades, built on one body of basketball logic:

1. **A much smarter computer.** It makes decisions that fit the situation, using:
   - ratings, tendencies and roles;
   - spacing, defensive positioning and matchups;
   - the shot clock, the score and fatigue.

   Players run real actions: pick-and-rolls, off-ball screens, cuts, isolations, post-ups, rotations, switches, closeouts, box-outs and transition. Teams and players have styles you can recognise. The computer has human reaction times, makes realistic mistakes, and its coach adjusts during the game.
2. **A basketball simulation.** It has two parts:
   - computer-against-computer games you can watch;
   - a fast possession-by-possession engine whose full-game scores and box scores look like real professional basketball.

   Results come from attributes, matchups, strategy, shot quality, fatigue, chance and the rules, never from numbers set directly. Calibration covers hundreds or thousands of games, with automated statistical tests.

The owner's changes to the first design:

- **Arcade and Simulation Realism are two separate gameplay modes you can choose.**
  - Arcade keeps today's feel: the fast pace, the explosive animations and the balance. It gets only the smarter decision-making.
  - Simulation Realism is meant to be genuinely NBA-like basketball, not today's game with adjusted numbers. That covers possession lengths, movement, shooting, defence, fatigue, fouls, substitutions and team strategy.
- **The baseline is the completed 2025–26 professional season.** Per team per game that is about:

  | Stat | Per team per game |
  |---|---|
  | Possessions | 99 |
  | Points | 116 |
  | Shots from the floor | 89 |
  | Three-point attempts | 37 |
  | Free-throw attempts | 24 |
  | Assists | 27 |
  | Turnovers | 14.5 |

  The too-many-shots problem gets fixed, and the way possessions are counted gets audited. Every number must come from the decisions made in play. No statistic is ever corrected after the fact.
- **Both modes can be played (Play) and watched as computer against computer (Watch), each with its own settings.** Fast simulation plays 12-minute quarters by default.
- **The computer plays intelligently in both modes:** play calls, individual tendencies, defensive adjustments, reading the situation, and mistakes.
- **Graphics, animations, controls and features all stay.**
- **The shared model must take more teams, players and styles later** without anything written specially for the Waves and the Scorpions.
- **Two kinds of validation:** the statistics, and what actually happens on the court.
- **Results must vary.** Games should range from 94–89 defensive battles to 130–125 shootouts, with upsets and big nights from stars, around league averages that are realistic.

## What stays as it is

- **Graphics and animations:** every motion clip, the arena, the broadcast, commentary, replays and sound. No new motion is made: a double team, a drop and a substitution use the clips that exist (stance, side-steps, run, back-pedal, hand up).
- **Controls and keys, cameras, the play list.** Difficulty levels stay for Play: they set how good the computer is against you.
- **Arcade is the game as it is today:** every number in `src/sim/tuning.js` that today's game uses keeps its value. Only the computer's decisions change.
- The single-file build, invented names only, and nothing personal in any file.
- The architecture: `src/sim/` is a pure simulation that imports nothing from `src/render/`, `src/broadcast/`, `src/audio/`, `src/replay.js`, `src/keys.js` or `src/prefs.js`.

## 1. What I found

From a full read of `src/sim/` and computer matches run in Node:

- **What the computer already does:**
  - It runs 10 plays: Pick & Roll, Pick & Pop, Clear Out, Horns, 5-Out Motion, Post Up, Floppy, Spain, Give & Go, UCLA.
  - It reads open shots and catch-and-shoot chances.
  - It helps on drives, with "help the helper".
  - It boxes out, closes out, switches when screened, and runs fast-break lanes.
  - It has late-game logic: hurry, use the clock, press, foul.
  - It substitutes by energy.
- **Gaps:**
  - Every decision is a fixed if-ladder in `planWithBall` and `planDefence` (`src/sim/ai.js`).
  - Both teams play alike.
  - Only team 1 adapts its defence and calls timeouts.
  - Matchups follow roster order.
  - Nothing in the menu runs computer against computer.
- **Speed:** a 48-minute five-a-side computer match runs in about 1.6 s in Node, with 202,000 steps.
- **One such match (seed 11)** against the 2025–26 averages:

  | Per team | This match | 2025–26 average |
  |---|---|---|
  | Score | 119–103 | 116 |
  | Shots from the floor | 125 and 117 | 89 |
  | FG% | 40 and 39 | 47 |
  | Three-point attempts | 25 and 14 | 37 |
  | Free-throw attempts | 15 and 12 | 24 |
  | Turnovers | 8 and 16 | 14.5 |
  | Rebounds | 67 and 69 | about 45 |

  That is about 112 possessions a team, against the real 99.
- **Why there are too many shots** (the audit the owner asked for):
  - A low FG% means more misses, so more offensive rebounds, so more second shots within one possession.
  - Too few free throws and turnovers end possessions without a shot.
  - Possessions are short: about 12.9 s against the real 14.5 s.
- **How possessions are counted:** the game does not count them at all. My figure of 224 came from counting changes of `state.possession`. That gives about 112 a team, which agrees with the box-score estimate (FGA − OREB + TOV + 0.44 × FTA). Section 8 adds an exact count.

## 2. Two styles of game

A **style** is a complete set of the physical and decision numbers the simulation uses. There are two:

- **`arcade`:** exactly today's numbers.
- **`sim`:** NBA-like.

Each style also has **nine sliders**. A slider at 50 is the style's own value; 0 and 100 are roughly half and one and a half times it (see section 7). The match keeps its style and slider values on `state.style` and `state.sliders`. Every place in the sim that reads such a number reads it through one function, `styled(state, key)` in a new `src/sim/styles.js`. A number has one name, one base value per style, and at most one slider.

### Where each style is used

| | Play (you against the computer) | Watch (computer against computer) | Simulate (fast engine) |
|---|---|---|---|
| Style | Your choice, starts on Arcade | Your choice, starts on Simulation | Simulation |
| Quarter length | Your choice, starts on 3 min (today's) | Your choice, starts on 12 min | Your choice, starts on 12 min |
| Sliders | The chosen style's | The chosen style's | Simulation's |

Each style keeps its own nine sliders, so tuning Simulation never touches Arcade. Play and Watch remember their own style and quarter length.

### What Simulation changes in the 3D game

Arcade keeps every value in the middle column. The Simulation values are starting values: the plan tunes them against the targets in section 8, and the ledger records each change.

| Area | Arcade (today) | Simulation (starting value) |
|---|---|---|
| **Possession length** | Patience 12–19 s; plays called from 6 s | Walk the ball up, set up (about 5–7 s), then run an action; shots spread through the clock, averaging about 14.5 s. Transition after a defensive rebound or a steal, as the team's style says. |
| **Movement** | Acceleration 30 m/s²; sprint whenever more than 2 m from the spot | Acceleration about 14 m/s², so cuts and closeouts have weight. In the half court players walk and jog to their spots and sprint only to cut, close out, run the floor or get back. Speeds and the motion clips are unchanged: the clips follow the speed, as they do today. |
| **Shooting** | Chance falls in a straight line from 0.85 at the rim to 0.15 at 8 m; a green release always goes in | Chance by zone from the league's shooting by distance: at the rim, close, mid-range, corner three, three above the break. Then the defender, the shooter's rating, fatigue and timing apply, as today. A green release is a perfect release: it halves the chance of a miss rather than always going in. Your green window is still shown and timed as now. |
| **Free throws** | Your meter: 95% at centre. The computer: 75%. | A shooter's own chance comes from his touch (mid-range and three ratings), from about 60% to 92%, league average about 78%. Your meter at centre gives him that chance. |
| **Defence** | As today | Gaps from a scouting report (tight on shooters, off non-shooters). Help that comes from the right man at the right time, with rotations behind it. Closeouts under control or flying, by IQ. Fewer gambles for steals. The scheme the coach chose for screens (section 4). |
| **Fatigue** | Sized for 3-minute quarters | Sized for 12-minute quarters: a starter can play stints of about 8–10 minutes, and around 32–36 minutes a game. How tiredness hurts speed and shooting is unchanged. |
| **Fouls** | Reach, shooting, charge and block, at today's chances | The same kinds plus two new ones: a **loose-ball foul** while boxing out for a rebound, and an **illegal screen** (a screener moving into the contact). Contact on drives draws fouls at real rates. And-ones happen. |
| **Rules** | As today | Overtime of 5 minutes for 12-minute quarters (5/12 of a quarter for shorter ones). The shot clock resets to 14 s when the offence gets its own miss back. The last-two-minutes bonus: in the last 2 minutes of a period, a team's second foul is shot if it was not already in the bonus. 7 timeouts a team. |
| **Substitutions** | By energy, and for foul trouble | A rotation plan from the coach (section 4): starters begin each half, bench stints, foul trouble by quarter, and garbage time in a blowout. |
| **Team strategy** | The coach picks plays by personnel | The team's playbook and defensive scheme, adjusted during the game (section 4). |

Arcade gets section 4's coach and section 5's decisions too, with Arcade's numbers. That makes it smarter without making it slower: possession length and points in computer matches stay within 10% of today (section 8).

## 3. The shared basketball model

The basketball itself lives in plain functions in `src/sim/`, called by both engines:

- **The 3D engine** is today's step-by-step physics, used by Play and Watch.
- **The fast engine** is the new possession engine, used by Simulate.

Both run on **the same match state** from `createMatch`. That state holds the same rosters, ratings, energy, fouls, team fouls, timeouts, clocks, score and box score, so the box score, the coach and the rules work on either.

| Piece | File | Used by the 3D engine for | Used by the fast engine for |
|---|---|---|---|
| Styles and sliders | `styles.js` (new) | Every styled number | The same |
| Shot model | `shooting.js` (new; moved out of `players.js` with the numbers unchanged) | The chance, contest, green window and timing of a real shot, from the players' positions | The same functions, with the distance and defender gap drawn from the action being run |
| Free-throw chance | `shooting.js` | The computer's free throws; your meter's centre in Simulation | Every free throw |
| Tendencies | `tendencies.js` (new) | Every decision | The same |
| Decision maker | `choose.js` (new) | The handler's choice, help, cuts | Each decision in a possession |
| Coach | `coach.js` (new; takes in the play-picking from `plays.js` and the timeouts from `late.js`) | Plays, scheme, matchups, rotation, timeouts, adjustments | The same |
| Game situation | `late.js` (kept) | Hurry, use the clock, press, foul, clutch | The same |
| Rules numbers | `tuning.js`, `rules.js`, `fouls.js` | As today | Bonus, foul-outs, clocks, overtime, free throws |
| Fatigue | `stamina.js` | Per step, from how fast each player moves | Per second, from the effort of the action being run, at the same rates |
| Box score | `stats.js` | As today, plus the new columns (section 8) | The same lines |
| Advanced stats | `advanced.js` (new) | Read from the lines | The same |
| Team and player data | `teams.js` (new; the rosters move here from `tuning.js`) | Who plays, styles, roles | The same |

**Nothing in the model names a team.** The coach and the decision maker read only data: ratings, roles, tendencies and the team's playbook and defence (section 6). A test builds a third, invented team in the test file alone and plays it in both engines.

## 4. The coach

Each team has a coach, kept on `state.coach[team]`. Its state is: the phase of the current possession, the play called, the defensive scheme, matchups, its memory of the game, and its rotation.

### Offence: a state machine for each possession

- **Bring:** after a defensive rebound or a steal, the coach checks for an advantage before setting up. It pushes when the advantage is real (the handler is ahead, or attackers outnumber the defenders back) and the style likes to run. Otherwise it walks the ball up.
- **Early:** a quick hitter if a mismatch is already there: a big switched onto a guard, or the star guarded by a weak defender.
- **Set:** the coach calls a play from the team's playbook. The weight of each play is:
  - the playbook's own frequency;
  - × how well it suits who is on the floor (today's `suits`);
  - × the mismatch it hunts (post-ups against a smaller man, isolation against a slow defender, pick-and-roll to pull a poor defender into the action);
  - × what has worked this game (below);
  - × a little chance.
- **Action:** the play runs, as plays run today.
- **Late:** with the shot clock under about 7 s, the ball goes to the best creator on the floor to make something, or the open man takes what is there.
- **Special cases:**
  - After a timeout, the coach calls the play that has worked best.
  - Near the end of a period, it plays for the last shot or for a 2-for-1.
  - Late in a game, the existing `situation()` tells it whether to hurry, use the clock, press or foul.

### Defence

- **The scheme on a ball screen**, from the team's defence data:
  - **Switch:** the two defenders swap men whenever the screen is set.
  - **Drop:** the screener's defender sits back between the ball and the rim; the ball's defender goes over the screen.
  - **Over:** today's way. The ball's defender fights over, and the two switch only if he is lost.
- **Help** sets how far off the ball defenders sag and how eagerly they help.
- **Post double:** a strong post scorer who catches deep draws a second defender. The others rotate to the open men, nearest first.
- **Rebounding:** crash the offensive glass, or get back in transition.
- **Matchups:** at each period start and dead ball, the coach gives its best defender the other team's main threat. That is the player with the highest usage and rating; everyone else is matched by size and speed. Today's code already tries every order of the five (120 orders). `ownMen` uses this assignment instead of roster order.

### Memory and adjustments

- **What it keeps:** points per possession for each kind of action (pick-and-roll, isolation, post-up, motion, transition), and what each opponent scores against it and from where.
- **When it acts:** at timeouts, at period breaks and at certain dead balls.
- **What it does:**
  - It leans its play choice toward what scores. How fast it leans is limited, so one basket never swings it.
  - If the other team's pick-and-roll is scoring, it changes its scheme.
  - It puts its best defender on a scorer who is hot.
  - If threes are falling against it, it plays tighter on shooters.
  - If it is in foul trouble, it gambles less.

Today's team-1-only `adapted()` becomes this, for both coaches. How far a coach adapts is part of the team's data. In Play, the difficulty level still scales the computer's coach as today; in Watch, both coaches adapt alike.

### Rotation and substitutions

- **Simulation:**
  - The coach plans minutes from each player's rating and role. Targets at 12-minute quarters: starters about 32–36, the next two about 18–24, the eighth about 10–14.
  - It brings players in and out at dead balls when a stint is over or energy is low.
  - Foul trouble, as a rule of thumb scaled to the foul limit: 2 fouls in the first quarter, 3 in the second, 4 in the third, or 5 in the fourth sits a player until later.
  - Starters begin each half and close a close game.
  - A lead of 20 or more in the last 5 minutes empties the bench.
- **Arcade:** substitutions work as today, by energy and foul trouble.
- **In both:** "Auto subs" off still leaves your team to you, and your own picks stand as today.

### Timeouts

Both coaches call timeouts:

- when the other team is on a run;
- when their own five are tired;
- to set up a play after the timeout;
- late in a game, to advance the ball or stop the clock (Simulation).

Arcade keeps 3 a team and 3-second breaks. Simulation has 7 a team.

## 5. A player's decisions

### The decision maker

Each player's choice is made by **scoring each option in expected points**. The scores are then adjusted for the player's tendencies and for the clock and the score. The option is picked at random, weighted by those scores, so mistakes are possible (`choose.js`). How sharply the best option wins depends on the player's **IQ** and the offensive or defensive IQ slider:

- a high-IQ player nearly always takes the best option;
- a low-IQ player sometimes takes a worse one.

The ball handler's options:

| Option | What its score is built from |
|---|---|
| Shoot from here | The shot model's chance with his real defender gap × the shot's value, plus the chance he draws a foul. Less early in the clock, unless the shot is excellent; more as the clock runs down. |
| Drive | How open his lane is, his finishing (inside rating and whether he can dunk), help nearby, the chance of drawing a foul, and the risk of a charge or a steal |
| Pass to each team-mate | What that team-mate would score on the catch (a catch-and-shoot look with his gap, or attacking a closeout), × the chance the pass gets there safely, less a small cost for the time it takes |
| Dribble move | Today's moves, scored by his handle against the defender's defence |
| Post up | A post scorer against a smaller or weaker defender |
| Hold or reset | Waiting for a play, a screen, or the clock (using the clock while ahead) |

The **hard rules stay as they are** and come before any choice:

- the inbound;
- a shot already begun;
- behind the backboard;
- the shot clock or the period running out;
- not passing back over the centre line;
- holding the ball a moment after a catch;
- the 3- and 8-second counts.

**Tendencies** come from each player's ratings and role, and any player may override them (section 6):

| Tendency | What it is |
|---|---|
| Usage | How much he looks for his own shot |
| Shot diet | Where he likes to shoot from: the rim, mid-range or three |
| Pass first | How strongly he favours passing over shooting |
| Drive, post, isolation | How much he likes each action |
| Crash | Whether he goes to the offensive glass |
| Gamble | Whether he reaches for steals |
| Help | How eagerly he helps on defence |
| Foul | How often his contact draws a whistle |
| IQ | 0 to 1: how well he decides |

These are what make players recognisable: a sharpshooter waits for his look, a slasher attacks, a shot creator takes tough shots, a playmaker finds others.

### Off the ball

Today's `offball.js` keeps doing what it does: spacing, cuts, clearing a drive, fast-break lanes. Cutting becomes a choice, scored by the decision maker. A **backdoor cut** pays when the cutter's defender is watching the ball (see mistakes, below).

### Defence

Each defender is placed by the **scouting report**: his man's shot diet, ratings and the scheme. Helping, rotating, closing out and boxing out become choices scored in the same way as offence, with the defensive IQ slider in place of the offensive one. Boxing out is weighed against leaking out, from the team's rebounding choice.

### Reaction times

- **How often a player decides:** today everyone decides every 0.3 s, or as the difficulty level says. Now each player's interval is spread around the style's average by his IQ. A sharp player decides more often, a slow one less. Arcade's average stays today's.
- **Reaction time:** his reaction to a shot, a cut or a drive comes after his reaction time.
  - In Arcade it stays today's 0–0.05 s.
  - In Simulation it is about 0.12–0.35 s, from his IQ, his defence rating and the defensive IQ slider.

### Realistic mistakes

These come from the decisions, never from a dice roll that takes the ball away:

- **A misread:** a low-IQ passer sometimes does not see the helper and throws into a lane that is not clear. The defender then intercepts it, as interceptions happen now.
- **Forcing it:** a high-usage player shoots over a good contest when a team-mate was open.
- **Watching the ball:** an off-ball defender drifts toward the ball and reacts late to his man's cut.
- **Flying closeouts:** a low-IQ closeout runs past the shooter and gives him a lane to drive.
- **Lazy transition defence:** a low-IQ defender, or a tired one, jogs back.
- **Gambles and reckless drives:** a gamble for a steal that becomes a foul or leaves a man open; a drive into a set defender that becomes a charge.
- **Clumsy catches under pressure (Simulation):** the chance comes from handle against pressure, and the ball goes loose as a free ball would.

## 6. Teams, players and styles as data

- **Teams** move into `src/sim/teams.js`. Each team has a name, an abbreviation, a playbook key, a defence key, a coach and its players. A player has a name, number, position, role, eight ratings, and optional tendency overrides.
- **`ROSTER`** stays exported from `tuning.js`, built from `teams.js`, so existing code and tests keep working.
- **Roles** (`ROLES`) give each role's starting tendencies. All twelve roles in use today get an entry, so a new player only needs a role and ratings.
- **Playbooks** (`PLAYBOOKS`) give play frequencies, pace, three-point appetite and how much the team runs. **Defences** (`DEFENCES`) give the screen scheme, help, post double, crashing and pressure. **Coaches** (`COACHES`) give how far the coach adapts, how he uses timeouts, and how deep his rotation is.
- **Today's two teams get styles that fit their players:**
  - The **Waves** play **pace and space**: they run, shoot threes, use pick-and-roll and pick-and-pop, switch every screen and get back on defence. They have Cross the playmaker, Okoro the sharpshooter and Volkov the stretch big.
  - The **Scorpions** play **inside-out**: slower, post-ups for Lund, isolation for Mercer, drop coverage, they crash the glass and they double the post. They have Mercer the shot creator, Lund the post scorer and Bright the glass cleaner.
  - A third, plain playbook, **balanced**, is there for teams added later.
- **IQ** is not a ninth rating, so `overall()` and the Teams panel are unchanged. It comes from the role and the overall, and a player may override it.
- **Not in this piece:** choosing other teams in the menu, and kits for new teams (those are drawn by team index in `src/render/`).

## 7. The nine sliders

Each is 0–100. 50 is the style's own value.

| Slider | What it changes, in both engines |
|---|---|
| Pace | How long a possession takes to set up, and how often a team runs |
| Shot selection | Low: more mid-range and post. High: more threes and rim attacks (the shot diet's balance) |
| Shooting | The chance of every shot from the floor |
| Offensive IQ | How sharply the best option wins, how often a passer misreads, how quickly the offence reacts |
| Defensive IQ | How well help and rotations are timed, closeout control, defensive reaction time |
| Ball security | The chance of losing the ball on steals, interceptions and clumsy catches |
| Foul frequency | Every foul chance |
| Rebounding | Offensive rebounding: how many crash, and how strongly a box-out holds them off |
| Fatigue | How fast energy drains, and how much tiredness costs |

Each slider multiplies its numbers by a factor from 0.5 at 0 to 1.5 at 100. The plan sets each one's range; for a few the effect is inverted. A **Reset** row puts the style back to all 50. The values are saved per style (section 9).

## 8. The box score, possessions and advanced stats

- **An exact possession count.** `state.possessions[team]` goes up by one when a possession ends:
  - a basket, after any free throw it earns;
  - the last free throw of a trip, if it goes in or the defence takes the rebound;
  - a defensive rebound;
  - a turnover;
  - the end of a period with the ball in the team's hands.

  An offensive rebound does not start a new possession. Both engines count the same way. A test checks that the count and the box-score estimate agree within 4% over many games, and that the two teams' counts in a period never differ by more than one.
- **New columns:**
  - **MIN:** time on the court, added up in both engines.
  - **OREB:** offensive rebounds. REB stays the total, and DREB is REB − OREB. The shooting team is known when the rebound is taken.
  - **+/-:** each scoring play adds or takes away points for everyone on the court.
  - PF is already shown, from `fouls`.

  The in-game box score adds MIN and +/-. The Simulate screen shows every column.
- **Advanced stats** (`advanced.js`, from the lines alone):
  - possessions and pace (possessions per 48 minutes);
  - offensive and defensive rating (points per 100 possessions);
  - eFG%, TS%, usage%, AST%, TOV%, OREB% and DREB%;
  - free-throw rate (FTA/FGA) and three-point rate (3PA/FGA);
  - Game Score (already there).

## 9. Menus and saved settings

**Main menu:** Play · **Watch** · **Simulate** · Mode: 3 on 3 / 5 on 5 · Teams · Controls · Settings.

- **Watch** starts a computer-against-computer match in the 3D view:
  - Both teams play at All-Star numbers, the same for each side, with no player of yours.
  - It starts on the Broadcast camera, which you can still switch.
  - There is no shot meter, controlled-player name, play list or timeout key.
  - Esc pauses; the pause menu shows Resume, Box score, Settings and Quit.
  - Commentary, replays and sound work as in Play.
- **Simulate** runs the fast engine for a whole game and opens a **result screen**:
  - the final score and points by quarter;
  - both teams' full box scores;
  - the team advanced stats;
  - which style and quarter length were used.

  Enter simulates another game with a new seed, and Esc goes back.

**Settings:** Quality · Auto subs · Camera · Difficulty · **Game styles ▸** · Commentary · Replays · Sound · Keys. The Quarter row moves into Game styles.

**Game styles panel:**
- Play style: Arcade / Simulation
- Play quarters
- Watch style
- Watch quarters
- Simulate quarters
- Arcade sliders ▸
- Simulation sliders ▸

A **slider panel** has nine rows plus Reset. ← and → move a slider by 5 and step through a choice row. The mouse works as on the other panels.

**Saved settings:**
- Play's style and quarters, Watch's, Simulate's quarters, and each style's sliders, all in `prefs`.
- An old saved `minutes` becomes Play's quarter length.
- A saved value that fails its check is dropped on its own, as today.

**While a match is on:** the pause menu does not let you change the style; it is chosen before the match.

## 10. The fast engine

`src/sim/quick/` plays a whole match, possession by possession, on a `createMatch` state:

1. **Start of a possession:** after a basket or a dead ball, an inbound; after a defensive rebound or a steal, live. In a live start the coach's **Bring** decides whether to push. A push looks for the advantage the styles and the players' speed allow: a quick shot at the rim or an open three, or settling into the half court.
2. **Half court:**
   - The ball is brought up in the time the style and the pressure allow.
   - The coach calls a play, with the same function as in the 3D game.
   - Each play has a **shape**, written as data. A shape is a few **beats**. Each beat gives a player a set of options, each with the distance, defender gap and defender its shot would have. Those depend on the play, the defensive scheme, the matchups and both sides' ratings and IQ.
   - Example: a pick-and-roll against drop coverage gives the handler an open pull-up and a contested roll. Against a switch it gives a mismatch to attack.
   - The decision maker picks, exactly as in the 3D game.
3. **What a choice leads to:**
   - **A shot:** made by the shared shot model, with blocks and shooting fouls. The chances come from the same numbers the 3D game's contacts use, worked out per shot.
   - **A pass:** may be intercepted (passer IQ, how dangerous the lane is, the defender's gamble); otherwise the receiver gets his own beat.
   - **A drive:** a finish, a kick-out to the man the help left, a foul drawn, or a charge or steal.
   - **A move:** beats his man or not, by today's handle-against-defence numbers.
4. **Clocks:** each beat takes time from the shot clock and the game clock. A team whose clock is running out goes Late. A shot-clock violation is a turnover.
5. **After a miss:** the shared rebound model decides the rebound. It uses the rebound ratings of those crashing and of those boxing out, the team choices, and how far out the shot was (long misses bounce long). A putback is a beat of its own.
6. **Dead balls:** fouls, free throws, substitutions and timeouts, by the same rules and coach. Late-game hurrying, clock use and fouling come from `situation()`.
7. **Fatigue** runs every simulated second for the ten on the court, and recovery for the bench, at the style's rates.

**Variety comes from things that happen in basketball.** None of it adjusts a result:

- each player's **form** on the night (a small draw per player per game that changes his shooting);
- hot and cold streaks, as today;
- pace that changes with the two styles, the score and fouling late;
- matchups and foul trouble;
- fatigue and blowouts that empty the bench;
- the run of the dice on each shot.

**Requirements:**
- The same seed gives the same game.
- A game takes at most 5 ms in Node.
- Three a side works. Only five a side is calibrated.

## 11. Calibration and validation

### Targets

Per team per game, five a side, 12-minute quarters, Simulation style, all sliders at 50. The owner's figures are the main targets.

| Stat | Target | Band in the tests | Where it comes from |
|---|---|---|---|
| Possessions (pace) | 99 | 96–102 | The owner; Basketball-Reference's 2025–26 summary shows pace 99.4 |
| Points | 116 | 111–121 | The owner; offensive rating 115.8 |
| FGA | 89 | 86–92 | The owner |
| 3PA | 37 | 34–40 | The owner; three-point rate .415 |
| FTA | 24 | 21–27 | The owner; free-throw rate .264 |
| Assists | 27 | 24.5–29.5 | The owner |
| Turnovers | 14.5 | 13–16 | The owner |
| FG% | 47 | 45.5–48.5 | Worked out from the targets above with 3P% 36 and FT% 78 |
| 3P% | 36 | 34.5–37.5 | Recent seasons |
| FT% | 78 | 76–80 | Recent seasons |
| OREB | 11.5 | 10–13 | Recent seasons |
| DREB | 33.5 | 31–36 | What the misses leave |
| Steals | 8 | 7–9.3 | Recent seasons |
| Blocks | 5 | 4.2–6 | Recent seasons |
| Fouls | 20 | 18–22 | Recent seasons, with 24 free-throw attempts |

The Basketball-Reference figures I found may be from part of the season. The owner's figures come first wherever the two differ.

### Variety and the shape of a season

Each item is a band over 1,000 games:

- **Team points:**
  - standard deviation 11–15;
  - share of team games at 130 or more: 6–20%;
  - share at 100 or fewer: 6–18%.
- **Margins and overtime:**
  - the margin's standard deviation: 12–17;
  - the game total's: 16–25;
  - overtime in 3–9% of games.
- **Upsets:** a team whose players are all 5 points worse wins 20–40% of its games against today's teams.
- **Stars:** a star scores 40 or more in 2–10% of his games.
- **Usage.** Two different measures, tested apart:
  - **USG%**, the standard player usage rate: 100 × (FGA + 0.44 × FTA + TOV) × (team minutes ÷ 5) ÷ (his minutes × (team FGA + 0.44 × team FTA + team TOV)). This is a rate while he is on the court, so it does not add up to 100%. Each team's top rotation player is at 26–36%, and the minutes-weighted mean over a team is 20%.
  - **Play share**, his share of the team's plays: his (FGA + 0.44 × FTA + TOV) over the team's, with the team's own turnovers as a share of their own. These add up to 100% for a team. The star's is 18–30%.
- **Minutes:**
  - starters average 28–38;
  - every team's minutes add up to 5 × the game's length.
- **Shot mix:**
  - three-point rate .38–.45;
  - shots at the rim 25–38% of attempts;
  - assisted share of baskets 55–70%;
  - mean possession length 13.5–15.5 s.

### Tests in `npm test`

These should add no more than about 30 s to the run.

- **`calibration.test.js`** runs 1,000 seeded fast games and checks every band above. It reports every miss at once, not just the first.
- **`sliders.test.js`** checks that each slider moves its results the right way in the fast engine:
  - Pace up: more possessions.
  - Shot selection up: more 3PA and rim attempts.
  - Shooting up: higher eFG%.
  - Offensive IQ up: fewer turnovers and better shots.
  - Defensive IQ up: the opponent's eFG% down.
  - Ball security up: fewer turnovers.
  - Fouls up: more free-throw attempts.
  - Rebounding up: more offensive rebounds.
  - Fatigue up: more substitutions and lower efficiency late.
- **Ratings matter:** better shooters score more efficiently, a better defence lowers the opponent's efficiency, and the stronger five wins more often.
- **Integrity:**
  - The box score adds up: points = 2 × FGM + 3PM + FTM.
  - The possession counts agree.
  - Nobody plays after fouling out, and nobody plays more than the game's length.
  - The same seed gives the same game.
- **The 3D game in Simulation (`simplay.test.js`):** a few headless Watch matches at 12-minute quarters, checked against bands about 15% wider than the fast engine's, on pace, points, FGA, 3PA, FTA, turnovers and possession length.
- **The two engines agree:** at Simulation, the fast engine's and the 3D game's averages are within 10% on pace, points, FGA and 3PA, within 15% on FTA, turnovers and offensive rebounds, and within 5 points on the shot-mix shares. This is the check that they share one body of basketball.
- **Arcade is still Arcade:** in computer matches at 3-minute quarters, three and five a side, points, points per possession and seconds per possession stay within 10% of today's, measured on `main` before any change. The smarter computer must not quietly make each difficulty level harder: points per possession is the guard.
- **What happens on the court**, as behaviour tests, each set up in a small situation as `tests/` does today:
  - each screen scheme (a switch swaps on the screen; in a drop the big sits between the ball and the rim);
  - a post double and the rotation behind it;
  - a ball-watching defender giving up a backdoor cut;
  - a flying closeout giving up a drive;
  - each coach adapting its play choice and its scheme;
  - matchups putting the best defender on the threat;
  - rotation and foul trouble;
  - both coaches calling timeouts;
  - the play after a timeout;
  - the last shot and the 2-for-1;
  - the 14-second reset and the last-two-minutes bonus;
  - reaction times differing by IQ.

### Outside the test run

**`tools/calibrate.mjs`** plays hundreds of fast games and 50 headless 3D Simulation matches. It prints each stat against its target, and the shot-location and play-type mixes. Each tuning round in the plan records its table in the ledger.

### In the browser

The pane is hidden, so this uses `dist/hidden.html` with frames driven by hand, as the testing note says. The check covers:
- Watch in Simulation and in Arcade;
- a pick-and-roll against drop coverage, a double team and a substitution;
- the Simulate screen;
- the Game styles and slider panels.

Stills of each go in the ledger.

## 12. Not in this piece

- Seasons, leagues, standings and trades.
- Choosing teams other than these two, and kits for new teams.
- Fast-forward in Watch.
- New motions.
- Injuries, player development, home-court advantage.
- Coach's challenges, held-ball jump balls.
- A hedge coverage. Switch, drop and over are enough to make the two teams' defences differ.

## 13. Risks

- **Bringing the 3D game to NBA rates in Simulation may take many tuning rounds.** Each band it cannot reach without forcing it is reported to the owner, not hidden.
- **Lower acceleration in Simulation may look different** with clips that were timed against today's movement. The browser check covers it. If it looks wrong, the acceleration change is the first to be dialled back.
- **The engines-agree check may expose differences** between the fast engine's shapes and what the 3D game really produces. If so, the shapes are measured from the 3D game (`tools/calibrate.mjs`) rather than written by hand.
- **The utility decisions change the computer's behaviour everywhere.** Tests in `tests/ai.test.js` that pin today's exact choices may need to be rewritten to pin the behaviour instead. Each such change is listed in the ledger.

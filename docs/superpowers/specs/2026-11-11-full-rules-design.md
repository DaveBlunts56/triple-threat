# Triple Threat — Milestone 2: Full Rules

Date: 2026-11-11 · Status: awaiting review · "Triple Threat" is a working title.

Builds on milestone 1 (`2026-11-11-playable-match-design.md`) and the play-test fixes on branch `fix/play-test-feedback`.

## Goal

The match is played under real basketball rules: the whistle blows for fouls and violations, free throws are shot, players tire, and both teams substitute from a bench of two.

Done means:

- Travelling, double dribble, backcourt, 8-second, 3-second and 5-second violations are called.
- Reach-in, shooting, charging and blocking fouls are called, with personal and team foul counts, bonus free throws and fouling out.
- Free throws are shot with a timing meter.
- Every player has energy that drains and recovers, and it affects speed and shooting.
- Each team has five players. Substitutions happen automatically at stoppages, and you can make your own from the pause screen.
- The match starts with a jump ball.
- Two computer teams can still play a whole match headless, and all of the above occurs in it.

## Decided with the owner

- **Dribble:** a pick-up key ends your dribble. After that you may pivot, pass or shoot; walking is a travel and dribbling again is a double dribble. Landing from a jump still holding the ball is a travel.
- **Free throws:** a timing meter.
- **Substitutions:** automatic for both teams, and you can override for your team.
- **Foul limits:** scaled to the short game. A player fouls out on his 3rd foul. A team's 3rd defensive foul in a quarter, and every one after it, gives two free throws.
- **Rosters:** five players per team, three on court.

Still assumed, not confirmed: single player only, desktop browser only.

## Not in milestone 2

Goaltending, technical and flagrant fouls, off-ball and loose-ball fouls, timeouts, held-ball jump balls, lane violations on free throws, defensive 3 seconds, closely-guarded 5 seconds, player ratings (all ten players have equal ability), sound.

Realistic players, cloth and the arena remain milestones 3 to 5.

## Changes to milestone 1 behaviour

These reverse or replace things milestone 1 does today:

- **Holding Space until you land** used to release the shot for you. It is now a travel. You must let go of Space while in the air.
- **An inbounder who never passes** used to stall the game. He now loses the ball after 5 seconds.
- **The shot clock** used to reset to 24 on every inbound. It now keeps its time when the same team inbounds.
- **Quarters** used to start with a fixed team. The match now starts with a jump ball and the result decides who starts each later quarter.
- **A ball through the hoop** used to be worth 2 unless it was a 3-point shot. A free throw is worth 1.

## Controls

Milestone 1's keys are unchanged. New:

| Key | When | What it does |
|---|---|---|
| F | You have the ball and are on the floor | Pick up your dribble (hold the ball) |
| Space | You are shooting a free throw | Stop the meter |
| Space | The opening tip | Jump for the ball |
| 1 to 5 | Pause screen | Choose two of your players to swap |
| A | Pause screen | Turn automatic substitutions for your team on or off |

F does nothing for an inbounder, who can only pass.

The intent object gains one field, `hold`, true while F is down. The computer never sets it.

## Dribble, travelling and double dribble

- A player who gets the ball (catch, pickup, steal, rebound) has a **live dribble**: he may move freely.
- Pressing F while on the floor **picks up** the ball. From then on:
  - He may still move, but only about two steps: 1.5 m in total. Going further is a **travel**.
  - Pressing F again is a **double dribble**.
  - Steal attempts against him succeed 40% as often.
  - He can pass or shoot as normal.
- **Landing with the ball:** a player who jumps to shoot and is still holding the ball when his feet touch the floor has travelled. A pass in the air is still allowed.
- The computer never picks up its dribble and always releases before landing, so it never commits these violations.

## Other violations

All numbers follow FIBA.

- **Backcourt:** once a player of the team with the ball has held it in the front court, no player of that team may hold it in the back court. The status clears when an opponent touches the ball, when possession changes and on every inbound. A ball caught in the back court straight from an inbound pass is legal.
- **8 seconds:** a team with the ball in its back court has 8 seconds to hold it in the front court. The count restarts on a change of possession and on every inbound.
- **3 seconds:** a player whose team has the ball in the front court may not stay in the opponent's key (the painted rectangle, 4.9 m wide and 5.8 m deep) for more than 3 seconds. His count pauses while he is in the air and resets when he leaves the key, when a shot is released and when possession changes.
- **5 seconds:** an inbounder must pass within 5 seconds.
- **Shot clock:** unchanged at 24 seconds, except that it keeps its remaining time when the same team inbounds, and is raised to 14 if lower after a defensive foul.

Every violation stops play and gives the other team an inbound at the nearest sideline point, or at the same spot for a 5-second call.

## Fouls

Fouls are decided by chance at moments of contact. The simulation reports each contact; the rules decide whether it is a foul.

| Foul | Contact | First-guess chance |
|---|---|---|
| Reach-in | A steal attempt that fails | 12% from the front or side, 30% from behind |
| Shooting | A defender in the air within 0.8 m of the shooter as the ball is released | 25% |
| Charge (offensive) | The ball handler, moving faster than 5.5 m/s, runs into a defender who has stood still for 0.4 s | 60% |
| Block | The same collision when the defender was moving | 15% |

A pair of players can be called for a collision at most once a second.

**What a foul gives:**

- **Shooting foul:** the shot carries on. If it goes in, the basket counts and the shooter gets one free throw. If it misses, he gets two, or three if it was a 3-point attempt. Play stops when the shot has scored, been touched or hit the floor.
- **Other defensive fouls:** an inbound for the fouled team at the nearest sideline. If it is the fouling team's 3rd foul of the quarter or later, two free throws instead.
- **Charge:** the ball goes to the defence. An offensive foul never gives free throws.

**Counting:**

- Every foul adds one to the player's personal fouls and one to his team's fouls for the quarter.
- Team fouls reset at the start of each quarter. Overtime continues the 4th quarter's count.
- A player with 3 personal fouls has fouled out and is replaced at once from the bench. He cannot return.
- If no eligible bench player remains, he stays on and cannot foul out.

Fouls cannot happen during a dead ball or against an inbounder.

## Free throws

- A new phase, `freeThrow`. The shooter stands on the free-throw line (5.8 m from the baseline) with the ball. The other five are placed in fixed spots along the lane and behind the 3-point line. Players are moved there directly, as inbounders already are.
- **You shooting:** a marker sweeps back and forth across a bar about 1.5 times a second. Press Space to stop it. Dead centre makes 95% of the time, the edges 20%, in a straight line between. If you do not press within 5 seconds the attempt is a miss.
- **Computer shooting:** shoots after about a second and makes 75%.
- Tiredness lowers both by the same factor it lowers jump shots.
- The ball is then thrown with the existing shot solver and flies under real physics. A free throw that goes through the hoop is worth 1 point.
- **All but the last attempt:** nobody else may move; after the result the ball is handed back.
- **The last attempt:** everyone may move once the ball is released. A make gives the other team an inbound from the baseline. A miss is a live rebound, and the clocks restart when a player gets the ball.
- The shot clock is set to 24 for whoever gets the ball afterwards.

The meter position is part of the match state and advances with the simulation, so it is deterministic and testable. The HUD only draws it.

## Stamina

Each of the ten players has energy from 1 (fresh) to 0 (exhausted). First-guess rates, all in `tuning.js`:

| Activity | Energy per second |
|---|---|
| Sprinting | −0.025 (full to empty in 40 s) |
| Running | −0.006 |
| Standing or walking slower than 1 m/s | +0.02 |
| On the bench | +0.03 |

A jump costs 0.015.

Below half energy, top speed and shot chance fall in a straight line, reaching 75% speed and 80% shot chance at zero. At half energy or above there is no penalty.

## Rosters and substitutions

- Each team has five people with a jersey number, energy and personal fouls. Three are on court, two on the bench.
- The six on-court player objects stay as they are. A substitution changes which person a court player is; his position on the floor, his defensive assignment and who you control do not change.
- Substitutions are applied only at stoppages: a dead ball, a quarter break, and at a foul before any free throws. The free-throw shooter cannot be replaced until he has shot.

**Automatic substitutions** (both teams; yours can be switched off):

- A fouled-out player is always replaced, with the freshest eligible bench player.
- A court player below 35% energy is replaced when a bench player has more than 70%.
- A court player one foul from fouling out is rested when a bench player with fewer fouls has more than 70% energy.

**Your own substitutions**, from the pause screen:

- The screen lists your five as rows 1 to 5: jersey number, on court or bench, energy bar, fouls.
- Press the row number of a player on court, then of a player on the bench (or the other way round). The swap is queued and shown as text, and applied at the next stoppage. Pressing the same pair again cancels it.
- A turns automatic substitutions for your team on or off. When off, only your queued swaps and forced foul-out replacements happen.

Each player shows his jersey number above his head so you can see who is on the floor.

## Jump ball

- The match starts in a new phase, `jumpBall`. One player from each team stands either side of the centre spot; the others stand outside the centre circle as in the milestone 1 line-up.
- You control your team's jumper.
- The ball is tossed straight up from the centre. A jumper may tap it only while it is coming down.
- The first jumper whose hand reaches the ball taps it to his nearest teammate. You jump with Space; the computer jumps with a small random timing error.
- If neither reaches it, the ball lands and is live.
- The clocks start when the ball is tapped or lands.
- The team that loses the tip starts quarters 2 and 4; the team that wins it starts quarter 3. Overtime periods keep alternating.

## The whistle

Every call is recorded in the match state as what was called, on whom, and what follows. The HUD shows it as a short banner during the stoppage, for example "Travelling. Opponent's ball" or "Shooting foul on 7. Two shots", and the screen-reader announcer reads it out.

## Computer players

The AI keeps its milestone 1 decisions, with these additions:

- Steps out of the key before its 3 seconds are up. The low spacing spot moves clear of the key.
- Crosses half court within 8 seconds: it stops looking for a pass and brings the ball up once 5 seconds have gone.
- Shoots its free throws.
- Is substituted by the automatic rules.

Computer fouls come from the same contact rules as yours: its steal attempts, its shot contests and its collisions.

## Scoreboard

- Team fouls for the quarter beside each score.
- An energy bar for the player you control.
- The free-throw meter and "Free throw 1 of 2" while free throws are shot.
- The call banner.
- The pause screen gains the roster list.
- The controls reminder gains "F hold ball".

The meter's centre zone is marked with lines as well as colour, and every banner is real text with strong contrast.

## How it is built

The split from milestone 1 holds: the simulation is pure and knows nothing about the browser.

```
src/sim/tuning.js       new groups: FOUL, FT, STAMINA, VIOLATION, TIP
src/sim/state.js        rosters, team fouls, the last call, counters, intent.hold
src/sim/players.js      pick-up, step counting, landing with the ball; reports contacts
src/sim/violations.js   new: travel, double dribble, backcourt, 8 s, 3 s, 5 s
src/sim/fouls.js        new: contact → foul, counts, bonus, fouling out
src/sim/freethrow.js    new: the freeThrow phase and its meter
src/sim/stamina.js      new: energy drain, recovery and its effect on speed and shooting
src/sim/roster.js       new: substitutions, automatic rules, the queue
src/sim/rules.js        phases jumpBall and freeThrow; shot-clock changes; calls the above
src/sim/ai.js           the additions under "Computer players"
src/sim/step.js         passes the players' reported contacts to the rules with the ball's
src/input.js            F
src/main.js             pause-screen keys
src/render/hud.js       fouls, energy, meter, banner, roster
src/render/actors.js    jersey numbers
index.html              the new HUD elements
```

- **Contacts are reported, not judged, by `players.js`.** It tells the rules "this steal attempt failed from behind" or "these two collided at this speed". Whether that is a foul is decided in one place, `fouls.js`.
- **All stoppages go through one function** in `rules.js`, which records the call, applies substitutions and chooses what follows: an inbound, free throws or the end of the period.
- **Every number above lives in `tuning.js`.**

## Testing

Automated, with `node --test`:

- **Violations:** each one is called in its situation and not called just short of it (1.4 m of steps, 7.9 seconds, a defender's touch before the ball returns to the back court).
- **Fouls:** each contact produces its foul at about the stated rate over many seeds; and-one; two versus three shots; bonus from the 3rd team foul; fouling out and the forced replacement; no free throws for a charge.
- **Free throws:** meter centre and edge odds; the 5-second miss; nobody moves before the last release; a missed last attempt is live; a make is 1 point.
- **Stamina:** drain and recovery rates; the speed and shooting penalties; no penalty at half energy.
- **Substitutions:** the swap keeps position and control; automatic rules; the queue; the shooter is not replaced; a fouled-out player cannot return.
- **Jump ball:** a tap only on the way down; who starts each later quarter.
- **Whole match:** two computer teams play full games over several seeds. The test asserts the game ends, no invalid numbers appear, fouls, free throws and substitutions all occur, and the computer commits no travel or double dribble.

By hand, in the browser: play a full match and judge how often the whistle blows, whether the meter is fair, and how quickly players tire.

## Known risks

- **Whistle frequency is a matter of tuning.** Too many fouls and the game stops constantly; too few and the rules feel absent. The first guesses above aim for roughly 6 to 10 fouls a match.
- **The 3-second call will catch you** if you camp in the key. There is no on-screen counter; the painted key is the only cue.
- **Charges may be exploitable** by standing in front of a sprinting computer player. Play-testing will show whether the 60% needs lowering.
- **The pause-screen substitution keys are bare.** They work, but a nicer screen belongs with the realistic players in milestone 3.

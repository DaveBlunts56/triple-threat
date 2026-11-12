# Triple Threat — Milestone 3, stage 3: motion that feels like the reference

Date: 2026-11-12 · Status: awaiting review · Amends `2026-11-12-realistic-players-design.md` (sections "Motion", "The ball in the hand" and "Controls"). Where the two differ, this document wins.

**Why.** The owner gave a gameplay video of a commercial basketball game as the reference for how players should look and feel. It was studied frame by frame: `docs/superpowers/research/2026-11-12-animation-reference.md`. The video is a reference for timing and feel only. Nothing from it is copied, and the shot meter described here is this game's own design.

**What the study found, in one paragraph.** A jump shot is prepared on the floor for half a second and the jump itself is small. Every motion starts from the pose the last one ended in. The hand stays on the ball for more than half of each dribble. The body leans into starts and turns. Heads follow the ball. A meter beside the shooter fills with the shooting motion and shows a target at its end. The stage 3 plan as first written would have missed most of this: the shot would have popped at the release, every jump was 0.8 m, the ball handler ran with a stiff trunk, and defenders could only stand or run.

## Decided with the owner

- **A gather and a smaller jump when shooting.** Approved on 2026-11-12 ("Yes, add it").
- **The video is the reference for look and feel** (owner's instruction, 2026-11-12).

Proposed here and not yet confirmed: everything else in "Changes to the rules".

## Changes to the rules

These are the only changes under `src/sim/` in stage 3. Walking to spots (stage 4) is unchanged.

### Shooting with a gather

| | Today | New |
|---|---|---|
| Space pressed with the ball | He leaves the floor at once | He gathers: 0.3 s on the floor, braking to a stop, facing the hoop |
| The jump | 0.8 m high, 0.82 s in the air | About 0.25 m high, 0.45 s in the air (take-off speed 2.2 m/s) |
| Letting go of Space | Releases the ball | The same |
| Best moment to let go | The top of the jump, 0.41 s after the press | Just before the top, 0.48 s after the press |
| How timing counts | Full chance at the best moment, falling evenly to 60% at the press and at landing | The same shape, measured from the press |
| Letting go during the gather | Not possible | The ball leaves on the first step of the jump, with the poor timing that moment earns |
| Landing with the ball | A travel | The same |

- Jumps without the ball (contesting, rebounding, the tip) stay as they are: 0.8 m.
- Free throws stay as they are.
- A pump fake (a gather that is called off) is not added. It can be considered after this has been played.
- **The computer.** A computer shooter lets go around the new best moment, with the same spread as today. A computer defender puts a hand up when his man gathers and jumps when his man leaves the floor, not at the gather.
- **Balance.** Because the ball now leaves from lower down and later, blocks and contested shots will shift. Fifty computer matches are measured before and after; points, makes from each range, blocks and shooting fouls per match must stay within a tenth of today's, and the numbers in `SHOT` and `BLOCK` are adjusted until they do.

### Computer players slow down as they arrive

A computer player within 1.5 m of where he wants to be asks for part speed, in proportion to the distance left. Today every player is either still or at full speed, which is why defenders twitch. With this they shuffle, and the side-steps and back-steps become visible. The player the owner controls is unchanged: the keyboard is all or nothing.

### The pass remembers who it is for

`passBall` records the receiver on the ball until it is caught or goes loose. Nothing behaves differently; it lets the receiver's hands and the passer's head be drawn correctly.

### What does not change

A well-timed shot is not made more likely than it is today. The meter shows the rule as it is.

## The shot meter

Shown for the owner's team only, beside the shooter, drawn in the same visual language as the free-throw bar.

- **Appears** when he gathers.
- **Fills** from the bottom to the top over the 0.48 s to the best moment, in step with the ball rising, so the body and the bar teach the same timing. After the best moment the fill drains again.
- **The target** is a marked band at the top end. Its length shows how hard the shot is: longer for a close, open shot, shorter for a long or contested one, from the same distance and defender numbers the rules already use.
- **At the release** the bar freezes. In the band: it turns green and shows a tick. Outside it: a small mark says "early" or "late". Colour is never the only signal.
- **Stays** beside him for 1.2 s, then goes. If he lands still holding the ball it goes at once.
- It does not rise with his jump and never covers the ball.

## Changes to motion

These are drawn only; none touches the rules.

**The shot.** The ball reaches the set point above the forehead as his feet leave the floor and is held there until release. The follow-through stays up until he has landed. The gather shows a small dip.

**Layers.** The lower spine belongs with the legs, so a ball handler keeps the lean of his run. The upper spine, neck, head and arms are the arms layer.

**Turning and leaning.** The drawn heading turns at up to 900 degrees a second instead of snapping. The whole body tips up to 12 degrees forward or back with speeding up and stopping, and up to 10 sideways into a turn.

**Heads.** Each player's head and neck turn toward what matters: the ball for players without it, his man for a defender near him, the hoop for a shooter and then the ball, the nearest defender or the hoop for the ball handler. Up to 70 degrees sideways and 30 up or down, eased.

**One-off moves show what follows the action.** The rules act on the key press, so a pass shows the arms already out, then relaxing; a steal reach is out within 0.07 s. One-offs fade in over 0.07 s and out over 0.2 to 0.25 s. Gaits keep 0.15 s.

**Holding the ball.** A picked-up ball sits on the hip away from the defender, knees and trunk bent, not in front of the chest.

**The dribble.** The ball is at the hand for about 55% of each bounce. He dribbles with the hand away from the nearest defender (the left-hand dribble is the right-hand one mirrored), switching low in front over 0.2 s. When he runs, the bounce is locked to his stride.

**Catching.** A team-mate the pass is going to raises his hands over the last 0.2 s before it arrives and pulls the ball in.

**Defence.** The stance is deeper and wider (hips about 0.25 m lower, arms spread and open). A defender on the floor within 2 m of a man who is shooting raises one hand. Above walking pace he runs, with his head and chest still turned to his man.

**Landing.** The knees give for 0.12 s after a jump.

**Nobody in step.** Each player's idle starts at a different point and runs at a slightly different rate.

## Where each motion comes from (replaces the earlier table)

| Motion | Source |
|---|---|
| Idle, walk, run, sprint, jump | Mixamo, already in the game |
| Side-steps, back-step | Mixamo; a crouched shuffle is looked for first, the upright strafe walk is the fallback |
| Dribble, right hand | Mixamo; the left hand is its mirror |
| Hold on the hip, shot with gather, follow-through, free throw, pass, catch, steal reach, hand up, contest, tip reach, defensive stance | Made by Claude in Blender |

## Not attempted, and why

- Crossovers, spins, step-backs, fadeaways, lay-up and dunk packages: they are leg work the game has neither clips nor rules for.
- Feet or hands locked in place by inverse kinematics: a milestone of its own. A little foot slide is accepted.
- Two players animated as one (screens that bump, box-outs).
- A wind-up delay before a pass or a steal: it would make the controls late.
- Different shot timings per player.
- A camera that moves in during live play. The close-ups of stage 4 are unchanged.

## Testing, in addition to the earlier list

- **Shooting:** the gather lasts 0.3 s and he cannot steer during it; the jump peaks near 0.25 m; the best release is 0.48 s after the press and earns the full chance; letting go during the gather releases at take-off; landing with the ball is still a travel; a blocker must still be in the air and in reach.
- **Balance:** the before-and-after measurement above.
- **The meter:** fill and band from a match state; frozen and marked at release; gone on a travel; never shown for the other team.
- **Motion choice:** each new row (hand up, land, reaching for a pass, dribbling hand by defender side); the eased heading and the lean stay within their limits; a head target for every situation.
- **By eye:** every motion in the game, and the shot beside its meter.

## Risks

- **Shooting is the game's one skill.** Changing its timing can make it too easy or too hard; the measurement and the owner's play-test are the guard.
- **Hand-made motion is still stiffer than motion capture.** There is more of it now.
- **Mixamo may have no crouched shuffle.** The fallback stands up a little with each step.
- **More work.** Stage 3 grows from six tasks to about ten.

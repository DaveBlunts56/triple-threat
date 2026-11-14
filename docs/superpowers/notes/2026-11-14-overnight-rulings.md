# Overnight work, 2026-11-14: what was decided without the owner

The owner asked for seven pieces to be built overnight and answered four questions before sleeping: CC0 downloads allowed alongside what is here; the game starts on the 2K camera; plays are both automatic and callable; work in the order listed. There was no spec or plan to approve for any piece. Everything is on the branch `feat/night-2026-11-14`, one commit a piece, nothing merged. This file lists the calls made on the owner's behalf, so each can be undone.

## Decisions

- **Tip-off.** Jumpers at the centre; two of each team on the circle beside the centre line; in five a side the point guard back in his own half and the power forward up the court. Everyone faces the ball.
- **2K camera.** Behind the team with the ball, 9 m up and 13.5 m back, swinging round by the near side when the ball changes teams. The movement keys follow the camera (W runs up the screen) and keep their meaning through a swing until they are let go. C switches camera; there is a Camera row in both Settings panels. **The hanging scoreboard was raised from 9.6 m to 11.8 m** so the camera passes under it.
- **Plays.** Ten: Pick & Roll, Pick & Pop, Clear Out, Horns, 5-Out Motion, Post Up, Floppy, Spain Pick & Roll, Give & Go, UCLA Cut (five of them in three a side). A coach calls one for each team every possession; T opens your play list and a number calls one. The handler keeps the ball until his play has formed. **A player who has stood still for 0.4 s is now a wall** to whoever runs into him: this is what makes a screen work, and it applies everywhere, in three a side too. The illegal-screen foul promised for this piece was **not** built.
- **Difficulty.** Rookie to Legend, All-Star being the game as it was. For you: the green window's width (2x to 0.5x), how much a badly timed shot keeps, and the free-throw meter's speed. **The jump-shot meter's speed does not change**: it is the jump itself, so slowing it would mean a slower jump. For the computer's team: how well it times shots, how fast it decides, how often it reaches, and how far its defence adapts to what you score with.
- **Smarter computer.** Shoots before a period ends; behind late it hurries, presses and fouls on purpose (within 8 points, under 24 seconds); ahead late it uses the clock; everyone sprints in the last minute of a close game; a helper steps in front of the rim when the handler has a clear lane; passes sometimes go to an open man other than the nearest to the hoop.
- **Timeouts.** Three a team, Z to call yours (with the ball, or at a stoppage), 3 seconds long, everyone gets 0.3 energy back. The computer's coach calls one to stop a run of 8 or rest a tired five.
- **Arena.** Three referees outside the lines who signal every call; benches, commentators and officials at the table, courtside seats on the near side and behind the baselines, photographers whose flashes fire at a basket, camera crews whose cameras follow the ball; nine invented advertisements that change every 9 seconds (the far side's boards were raised to clear the benches); a crowd that jumps when its team scores, shakes at a foul on the home team, waves sticks at a visiting free-throw shooter while the picture shakes, and drifts out of a blowout in the last period. **The referees and courtside people are simple jointed figures, not models like the players.** Nothing was downloaded. There is no sound, so the booing is seen and not heard. Courtside people do not react.
- **Scorebug.** At the bottom centre, as in the 2K reference, in place of the old strip at the top.

## What changed in the numbers

Computer-only matches, 20 each. Before tonight: three a side 85.7 points, five a side 78.5. Now: 76.5 and 73.5. Plays make possessions longer; nothing was tuned to win the points back. Three-second calls are about one a match in five a side (were a third).

## Not done, not checked

- Not played by hand: every check was by test, by measurement, or by a still picture.
- Not looked at: the Chromebook, the Ultra level's mirror with the new people in it, the referees' signals one by one (only two were seen).
- Firefox on the PC, five a side with the arena detail: about 122 fps on High. Not timed again after the scorebug, which is page markup only.

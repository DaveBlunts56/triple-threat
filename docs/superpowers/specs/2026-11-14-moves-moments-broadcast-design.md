# Player moves, big moments, broadcast feel and sound: design

Date: 2026-11-14. Status: the four pieces and four choices were settled in conversation by the owner (a key for each move, with friendly keys; the owner downloads the motion clips; commentary as captions and a voice; replays after big moments; sound from real recordings). On reading the first draft the owner added two things: a setting in both menus to change the keys, and the game remembering its settings for the next time (sections 7 and 8). The detail below (which keys, what each move does, which moments count, the numbers) is mine and awaits their read.

This is the rest of the answer to "barely flavor". Players who differ and off-ball life are built. Here are the other three things the owner named as missing (player moves, big moments, broadcast feel) and sound.

## What stays as it is

- The rules, the cameras, the plays, the difficulty levels, the ratings, the scorebug's look.
- Every key in use today keeps its meaning, until you change it (section 7).
- One HTML file. The sounds and the new motions go inside it.
- The match itself is decided by the same code whether or not captions, replays or sound are on: all three only watch.

## 1. Five moves

Your left hand stays on the movement keys. The moves go under your right hand, on the row it rests on, so that no finger leaves W A S D:

| Key | Move | What it is for |
|---|---|---|
| J | Crossover | The quickest change of side. |
| K | Between the legs | A change of side that keeps the ball safe. |
| L | Behind the back | A change of side at a run. |
| I | Step-back | Room for a jump shot. |
| U | Post fade | A shot over a defender near the hoop. |

J, K and L are the three ways of taking the ball across; I and U, above them, are the two ways to a shot. The Controls panel and the hint line under the court show all five. A move needs the ball in your hands and a dribble still alive (not after F, and not in the air).

**The three dribble moves** each take the ball to the other hand and push the player sideways: toward the side you are holding (A or D as the screen has it), or away from his defender if you hold neither. They differ in three ways:

| | Takes | Push | The ball during it | Running speed kept |
|---|---|---|---|---|
| Crossover | 0.30 s | 1.5 m | In front: a reach from the front wins it half again as often | Half |
| Between the legs | 0.40 s | 1.1 m | Guarded: a reach wins it half as often | Half |
| Behind the back | 0.50 s | 1.2 m | Hidden: a reach from the front cannot win it | All of it |

- **Beating a defender.** If his defender is within 1.6 m and the move goes to the side the defender is not already moving to, the defender is late: he stands for a moment before he follows. How long depends on the handler's Handle against the defender's Defence: 0.25 s when they are equal, more for a better handler, nothing for a much worse one.
- **An ankle-breaker.** Seldom, when the handler is far the better of the two and the defender was moving the wrong way, the defender stumbles for a full second. It is a big moment (section 3).
- **Cost.** Each move takes a little energy, and another cannot start for 0.3 s after one ends, so moves chain but cannot be hammered. A tired player's moves push less far.

**Step-back (I).** A hop of 1.3 m straight away from the hoop, 0.35 s, ending with the ball gathered and ready to shoot. His defender is late by the same rule as above. The dribble is still alive after it. A step-back that carries him behind the three-point line makes the shot a three.

**Post fade (U).** Within 5.5 m of the hoop, hold U and let go at the top, as you do with Space. He turns his shoulder and jumps away from the hoop, drifting 0.8 m back in the air. A defender takes 40% less off a fade than off a plain jump shot from the same spot, and can block it only from very close; in exchange the shot itself is a little harder (about 8% less often in, before his Mid-range or Inside rating is counted). Further out than 5.5 m, U is a plain jump shot.

**The computer uses them too**, team-mates and opponents alike:

- A handler with Handle 78 or better tries a dribble move when his defender is tight and he wants to drive: between the legs or behind the back when the defender is reaching, a crossover otherwise.
- Shot creators and sharpshooters step back when the defender is tight and the shot is one they are good at.
- A post scorer, or anyone with Inside 80 or better who has the ball within 5.5 m with a defender on him, fades.
- How often depends on the level: seldom on Rookie, whenever it is right on Legend.

## 2. The motions, and the clips to download

Each move works from the day it is built, with a motion I make by hand in `tools/blender/poses.py` as the shot and the pass were made. A downloaded clip replaces the hand-made one as soon as its file is in the folder and the motion build is run. Nothing waits on a download.

**I could not look at Mixamo's library**: it shows nothing without your sign-in. So I do not know which of these it has. For each, here are words to search and what a clip must look like to be usable. If there is nothing that fits, leave it: the hand-made motion stays.

| Save as | Search for | A clip that fits |
|---|---|---|
| `crossover.fbx` | crossover, basketball dribble | One change of hands low in front of the knees, right hand to left, feet staying roughly in place. |
| `betweenLegs.fbx` | between legs, through legs dribble | The ball hand goes from the right, between the legs, to the left. |
| `behindBack.fbx` | behind back dribble | The ball hand goes round the back from right to left. |
| `stepBack.fbx` | step back, hop back, jump back, dodge back | One hop backwards off both feet or one, landing balanced and facing the same way. |
| `fade.fbx` | fadeaway, fade away, turnaround jump shot | A jump shot leaning back, taking off and landing in the clip. |
| `celebrate.fbx` | fist pump, victory | Standing, a short fist pump or both arms up, under 3 seconds. |
| `dejected.fbx` | defeated, disappointed | Standing, head down or hands on head, under 3 seconds. |
| `stumble.fbx` | stumble backwards, trip | A stagger of a second or so that ends on his feet. |

The last three are for big moments and are worth having: Mixamo has many clips of each kind.

**How to download each**, exactly as before:

1. On mixamo.com, with the character you uploaded already (`mixamo-upload.fbx`; upload it again from `assets/source/` if Mixamo has forgotten it).
2. Pick the clip, then Download with Format **FBX Binary (.fbx)**, Skin **With Skin**, **30** frames per second, Keyframe Reduction **none**. Leave **In Place unticked**.
3. Save it in `assets/source/mixamo/` under the name in the table. Tell me the clip's name on Mixamo, for the credits.

The build takes a move the same way whichever hand the clip uses: it makes the other hand's version in a mirror, as it does for the dribble. A clip whose rest pose does not match the player's is refused with a message, and the hand-made motion stays in.

## 3. Big moments

A big moment is something in the match that the game marks. Each gets a banner with the player's name, a louder crowd, a line of commentary, and, for those marked ★, a replay (section 5).

| Moment | When |
|---|---|
| ★ Ankle-breaker | A defender stumbles to a move, and the handler scores or sets up a score within 4 s. |
| ★ Block | A shot is blocked. A chase-down block (the blocker came from behind on a fast break) says so. |
| ★ And one | A basket made through a foul. |
| ★ Buzzer-beater | A basket whose shot left the hand in the last second of a period. |
| ★ Game-winner | The basket that puts a team ahead for good in the last 10 seconds of the match. |
| ★ Poster | A basket inside 1.5 m with a defender within a step. |
| Steal and score | A steal turned into a basket within 5 s. |
| Deep three | A three from more than 8.5 m. |
| Clutch | A basket that ties the game or takes the lead in the last minute of the fourth period or of overtime. |
| Heating up / On fire | A player's third make in a row, and his fifth. |
| Run | 8 points in a row by one team, and every 4 after it ("10-0 run"). |
| Comeback | A team that was 10 or more behind ties or leads. |
| Perfect release | Your own green shot from 7 m or more goes in. |

- At most one banner at a time; a bigger moment replaces a smaller one (the table is roughly in order).
- The scorer celebrates and his nearest defender drops his head, with the downloaded clips; without them the scorer raises an arm (the hand-up he has).
- For a buzzer-beater and a game-winner the picture slows to a quarter speed for the last half-metre of the ball's flight. The match clock runs with it, so nothing is gained or lost.

## 4. Broadcast feel

**Statistics.** The match keeps, for every player: points, shots made and taken (and threes, and free throws), rebounds, assists (the pass before a basket made within 3 s of the catch), steals, blocks, turnovers and fouls. For each team: the same in total, plus its biggest lead and longest run.

**Panels**, each skipped with any key:

- **Starting line-ups** before the tip: both teams' starters with position, role and overall, the stars marked. 4 s.
- **End of a period:** the score by period, each team's leading scorer.
- **Half-time:** the two teams side by side: shooting, threes, rebounds, turnovers.
- **Final:** the player of the game (the best line by points, rebounds, assists, steals and blocks, less misses and turnovers) and the full box score.
- **Box score in the pause menu**, at any time.

**Lower thirds**, small cards above the scorebug that come and go on their own:

- At the free-throw line: the shooter's free throws so far.
- On a substitution: who comes on for whom.
- When a player heats up or reaches 10 points, and every 10 after: his line so far.
- At a timeout: who called it, and how many each team has left.

**Commentary: captions and a voice.**

- One commentator calls the game in short lines: who has the ball in a play, a shot going up and what came of it, rebounds, steals, fouls and violations by name, the end of each period, and every big moment. Between plays he sometimes gives a number (a hot hand, a run, a team's shooting).
- Each kind of thing has several wordings, and the same one is not used twice running. The lines name the players, the teams and the plays.
- A line appears as a **caption** above the scorebug and is **spoken** by the browser's own voice. A bigger moment cuts in over a smaller line; a small line that would have to wait is dropped, so the voice never falls behind the play.
- **Settings row "Commentary":** Voice and captions, Captions only, Off. If the browser has no voice (some Linux Firefox set-ups have none), it is captions only and the row says so.
- The voice is whatever the device provides: a Chromebook and a PC will sound different, and neither sounds like a broadcaster. Nothing is recorded or downloaded for it.

## 5. Replays

- After a ★ moment, at the next stop in play (the basket itself, a whistle, the ball out, a timeout, the end of a period), the game shows it again: the last 4 seconds before the moment and 1 after, at half speed, from a low camera beside the hoop that was attacked, with a REPLAY mark in the corner.
- Any key skips it. The match does not move while it plays.
- No more than one replay at a stop, and none within 20 seconds of match time of the last, so a busy stretch is not all replays. A buzzer-beater or a game-winner is always shown.
- **Settings row "Replays":** On, Off.
- The players in a replay move exactly as they did: the game keeps the last 8 seconds of the match as it was drawn, sets a ★ moment's five seconds aside until the next stop, and plays them back. It keeps nothing after that.

## 6. Sound

Real recordings, all CC0, converted to small files and put inside the one HTML file (about 1.5 MB in all).

| Sound | When |
|---|---|
| Ball on the floor (three takes) | Every bounce of a dribble and of a loose ball, quieter the lower the bounce. |
| Ball on the rim, on the backboard | When it hits them. |
| Net | A made basket; a sharper one for a shot that touches nothing. |
| Shoe squeaks (three takes) | Hard stops and cuts, dribble moves, a defender's slides. |
| Catch | A pass caught. |
| Whistle, short and long | Fouls and violations; the end of a period. |
| Horn | The shot clock running out; the end of a period. |
| Crowd, a steady murmur | Always, louder in a close game late on, thinner once the crowd has left a blowout. |
| Crowd cheer, small and big | The home team's baskets; big moments. |
| Crowd groan | The visitors' baskets and big moments. |
| Crowd boo | A foul called on the home team. |
| Crowd noise for free throws | A visitor at the line, with the sticks and the shaking picture that are there now. |

- **Where they come from.** Three collections that state CC0 on each sound's own page: BigSoundBank, Wikimedia Commons and Freesound. I will not use a sound whose page does not say CC0. Freesound gives its original files only to signed-in users; from there I take the file its page plays to everyone, a smaller MP3 of the same recording, unless you would rather download the originals yourself with a free account.
- **Your go-ahead.** The plan will list every file: its name, the page it is on, its size and its licence line. Saying "Yes, build it" to that plan is the go-ahead to download exactly those files and no others. If one is gone or not what it says when I fetch it, I stop and ask.
- Each is listed in `assets/CREDITS.md`. The downloaded originals stay out of the repository; the small converted files are in it.
- **Settings row "Sound":** Full, Quiet, Off. Sound starts with your first key press, as browsers require.
- No music.

## 7. Changing the keys

Both Settings panels (the start menu's and the pause menu's) get a row **Keys**, which opens a list of everything a key does, each with its key:

| | |
|---|---|
| Move up, left, down, right | W, A, S, D |
| Sprint | Shift |
| Shoot / jump | Space |
| Pass / switch player | E |
| Steal | Q |
| Hold the ball | F |
| Crossover, Between the legs, Behind the back, Step-back, Post fade | J, K, L, I, U |
| Plays | T |
| Timeout | Z |
| Camera | C |
| Quality | G |

- Choose a row, press Enter, then press the key you want. Escape leaves it as it was.
- **A key that already does something else changes places** with the one you are setting, so nothing is ever left without a key and no key does two things.
- Both Shift keys count as one. Any letter, digit, punctuation key, Space, Shift, Tab or arrow key can be used. Ctrl and Alt cannot: with a letter they are the browser's own shortcuts (Ctrl and W closes the tab).
- **Not changeable:** Escape (pause, back), Enter, and the keys that move through the menus (the arrows, W and S, Enter and Space there). The numbers still call a play while the play list is open and still pick players in Substitutions, whatever else they have been given.
- The last row, **Reset all keys**, puts every key back as in the table.
- The Controls panels and the line of keys under the court show the keys as they are now.

## 8. What the game remembers

The game keeps your settings in the browser and starts with them the next time: **difficulty, quality, camera**, the mode (3 on 3 or 5 on 5), quarter length, automatic substitutions, commentary, replays, sound, and your keys.

- They are saved the moment you change one, in either menu or with its key (G, C).
- **Quality:** a level you chose is kept, and the game then leaves it alone. A level the game lowered to by itself on a slow frame rate is not kept: the next time it starts high and finds its level again.
- Nothing about a match is saved: no score, no statistics.
- They are kept for this copy of the file in this browser. A different browser, a private window, or clearing the browser's data starts from the defaults. If the browser will not keep anything for the file (some do not for a file opened from Google Drive), the game plays as now and simply starts from the defaults each time. I cannot test the Chromebook from here.
- A saved value the game no longer understands is ignored, one setting at a time.

## How it is built

One plan, four stages, a build sent after each so the owner can play as it goes:

1. **Moves, the Keys panel and remembered settings** (sections 1, 2, 7 and 8), with hand-made motions; downloaded clips are taken in whenever they arrive.
2. **Statistics, big moments and broadcast** (sections 3 and 4).
3. **Replays** (section 5).
4. **Sound** (section 6).

## What the tests must show

- Each move: only with the ball and a live dribble; the ball changes hand; the push is to the side asked for, or away from the defender; its length, push and kept speed are those in the table; a reach during it wins the ball as much more or less often as the table says; a second move cannot start for 0.3 s.
- A defender is late to a move by an amount that grows with Handle less Defence, and is not late when he was already moving that way; an ankle-breaker needs both conditions in section 1.
- A step-back moves the player 1.3 m from the hoop, keeps the dribble, and makes a shot from behind the line a three. A fade inside 5.5 m drifts back, is contested 40% less and goes in about 8% less often; outside 5.5 m it is a plain shot.
- The computer: a good handler uses a move on a tight defender and a poor one does not; a post scorer fades; on Rookie it happens seldom.
- Statistics: points, shots, rebounds, assists, steals, blocks, turnovers and fouls each go to the right player; a team's totals are the sum of its players'; the points in the box score equal the score.
- Every big moment in section 3 is marked when its condition is met and not otherwise; a bigger one replaces a smaller.
- Commentary: every kind of event has a line; names are filled in; the same wording is not used twice running; a small line is dropped while a line is being spoken, a big one cuts in; with the row at Off nothing is shown or spoken.
- Replays: one is queued by a ★ moment and shown at the next stop; the frames shown are the frames that were recorded; a key skips it; the match is the same, step for step, with replays on and off.
- Sound: each event asks for its sound once; the crowd's loudness follows the score and the clock; with the row at Off nothing is asked for.
- Keys: every action has a key; setting a key in use swaps the two; Escape cancels; Escape and Enter cannot be given away; Reset puts all back; the match reads the keys as they are now; the Controls panel and the hint line show them.
- Remembered settings: each setting changed is written at once and read back at the start; a quality the game chose itself is not written; a broken or unknown saved value is ignored and the rest still apply; with no storage at all the game starts and plays.
- Whole matches by the computer against itself, three a side and five, from several seeds, with moves on: they finish; the scoring and the pace stay within a tenth of today's (five a side: about 52 points and 13.6 seconds a possession); steals do not rise by more than a tenth.
- The motion build with no new clips, and with any that are there: the eight existing motions come out unchanged.

## What is checked by eye, and by the owner

- By me: stills of each move's motion, each panel, a lower third, a caption, a banner, a replay frame; that the single file plays its sounds in the browser here.
- By the owner: whether the settings come back on the Chromebook; whether the keys sit well under the hand; whether the moves feel useful or too strong; whether the commentary is welcome or tiresome; whether the voice is bearable on the Chromebook; whether replays come too often; how loud the crowd should be.

## Not in this piece

- Dunks, lay-up packages, alley-oops, spin moves, hesitations, pump fakes, post back-downs. The five moves are the start the owner asked for.
- Recorded commentary, a second commentator, music, players' voices.
- Saved replays, a replay you can steer, highlights at half-time.
- Season statistics: a match's numbers are gone when it ends.

## Risks

- **Remembering on the Chromebook.** A file opened from Google Drive may not be allowed to keep anything. Then nothing is remembered there, and nothing else breaks.

- **Moves too strong.** A move that always beats a defender makes every possession the same. How late a defender is rests on the two ratings, and the computer's defenders give a good handler a step more room already. Scoring and steals are measured before and after.
- **Hand-made motions look stiff.** The player's legs cannot be posed far by hand. If Mixamo has no clip for a move, that move will read less well than the others; I will say which.
- **The voice.** It may sound flat, lag on a slow device, or be missing. Captions carry everything, and the row turns the voice off.
- **Replays in the way.** They stop the game for a few seconds. They are capped, skipped with a key, and can be turned off.
- **The file grows.** About 1.5 MB of sound and a little motion on top of 34 MB.
- **Your team-mates' moves.** A team-mate dribbling on his own initiative could waste the clock; he uses a move only on the way to a drive or a shot he was going to take anyway.

## As built (2026-11-14)

Where the build differs from the text above. Each was my call; the plan's ledger has the reasons.

- **The computer's dribble moves** may come from 6 seconds into the shot clock, and a handler who has just beaten his man drives at once. With a defender within reach of the ball the computer goes between the legs or behind the back, and crosses over only with room.
- **The three hand-made dribble moves** were first made for the arms only, with the ball carried in both hands at the waist; play-testing showed that read as nothing but a change of direction. They are now of the whole body: a low wide stance for the crossover and behind the back, a stride for between the legs. The ball is drawn on its own: out of one hand, off the floor (in front of him, between his legs, behind his heels) and up into the other. The feet do not step during a move, so at a run they slide for its 0.3 to 0.5 s.
- **Replays** keep the last 16 seconds, not 8, so that a game-winner can be shown from its basket. The camera is in the corner, 2.6 m up, not low beside the hoop.
- **The period and half-time panels** hold the match for 5 and 9 seconds, or until a key, as the line-ups do. A replay comes before a panel.
- **Sound:** fifteen recordings are used, not sixteen: the crowd gasp could not be told for one without hearing it, and a groan stands in. Twenty-two sounds, 0.65 MB. The long whistle is the short one stretched.
- **Turnovers that are nobody's** (the shot clock, eight seconds) are counted for the team, not a player.
- **Kept but shown nowhere:** each team's biggest lead and longest run.
- **A defender's slides** make no sound of their own: shoes squeak on hard stops, sharp cuts, moves and stumbles.

# Triple Threat — Milestone 3: Realistic Players

Date: 2026-11-12 · Status: awaiting review · "Triple Threat" is a working title.

Builds on milestones 1 and 2 (`2026-11-11-playable-match-design.md`, `2026-11-11-full-rules-design.md`), both merged into `main`.

## Goal

The six capsules become ten distinct, dressed, animated basketball players, on this computer and on the owner's Chromebook.

Done means:

- Ten different people, five per team, made in Blender with the MakeHuman generator, wearing a team kit with their jersey number.
- They stand, walk, run, sprint, jump, side-step on defence, dribble, hold, shoot, pass, catch, reach for steals, contest shots and jump for the tip.
- A player who has the ball is seen holding or dribbling it.
- The camera moves in close for free throws and the opening tip.
- Players walk to inbound and free-throw spots instead of appearing there.
- The game runs at two quality levels, and the whole of it still fits in the single file the Chromebook plays.

> 2026-11-13: by the owner's decision stage 4 (Tasks 13 to 16) was not built in milestone 3; walking to the inbound and free-throw spots moves to after the 5v5 option, and the camera close-ups move to the arena work. The order of the work that follows is in `docs/superpowers/specs/2026-11-13-net-names-menu-design.md`.

## Decided with the owner

- **Where it runs:** both devices, at two quality levels.
- **Variety:** ten distinct players.
- **Close-ups:** at stoppages (free throws and the opening tip). No zoom key.
- **Motion:** Mixamo motion capture where it has the move; Claude animates the rest in Blender.
- **From the first scoping:** MakeHuman generator for bodies, Mixamo for motion, glTF for the files.

Confirmed by the owner on 2026-11-12: the Chromebook runs the game on WebGPU, from the single file.

Still assumed, not confirmed: single player only, desktop keyboard only.

## Not in milestone 3

Bench players are not drawn. Faces and fingers do not animate beyond what a clip contains. No cloth (milestone 4), arena or crowd (milestone 5), sound, replays, celebrations, player names or ratings. Height and build are looks only: every player keeps the same reach, speed and size in the rules.

## Changes to earlier behaviour

- **Inbounds and free throws** used to place players on their spots instantly. They now walk there, and the stoppage lasts until they arrive.
- **Your keys during a walk:** a player who is being walked to a spot ignores the keyboard until play resumes.
- **The inbounder** used to be chosen when the stoppage ended. He is now chosen when the whistle blows.
- **The camera** used to stay in the broadcast view for the whole match.
- **The corner label** used to show only WebGPU or WebGL 2. It now also shows the quality level and the frame rate.

## Controls

Earlier keys are unchanged. New:

| Key | When | What it does |
|---|---|---|
| G | Any time | Switch between high and low quality |

## The players

Ten people are generated from a table kept in the project: for each, the jersey number, height (1.85 to 2.08 m), build, face, skin tone, and hair style and colour. The table is the single source for the look, so a player can be changed by editing one row and rebuilding.

- **One skeleton for everyone**, compatible with Mixamo, so every motion fits every player.
- **Body, hair, socks and shoes** come from the generator and its asset packs. Only assets with a licence that allows use without conditions (CC0) are used, and each one is listed in a credits file.
- **Jersey and shorts are made for this game.** The jersey is sleeveless. The shorts are loose, knee-length and a separate mesh with even, cloth-friendly faces, because milestone 4 will simulate them. In this milestone they follow the legs.
- **Skin hidden under the kit is removed**, so nothing pokes through and nothing unseen is drawn.
- **Team colour and number are painted when the game loads**: team 0 blue with white trim, team 1 red with white trim, the number on chest and back. No texture file is stored per player.
- **The floating number above each head stays**, because the jersey number is too small to read from the broadcast camera.

A substitution shows the incoming person's model in the same place.

## Motion

Each player's motion comes in two layers, so legs and arms can do different things: the legs carry him, and the arms and torso handle the ball.

**Legs and body**

| State in the match | Motion |
|---|---|
| Standing | Idle; a lower, wider stance when his team is defending |
| Moving | Walk, run or sprint, blended by speed and played at the rate that matches his real speed, so feet do not slide |
| Defending within 4 m of his man | Drawn facing his man, with side-steps and back-steps |
| In the air | Take-off, hang and landing, following his real height |

The rules never read which way a defender faces, so turning him toward his man is display only.

**Arms and torso**

| State in the match | Motion |
|---|---|
| Has the ball, dribble still live | Dribble, standing or on the move |
| Has picked up the ball, is inbounding, or is at the free-throw line | Hold |
| Going up for a shot | Ball raised overhead; a follow-through after release |
| Free throw released | A set shot with both feet on the floor, then the follow-through |
| Just passed | Chest pass |
| Just received the ball | Catch |
| Just tried a steal | Reach |
| In the air without the ball | Arms up, to contest or rebound |
| Jumper at the tip | Reach up |
| Otherwise | Whatever the leg motion includes |

Changes between motions blend over about 0.15 seconds.

**Where each motion comes from**

| Motion | Source |
|---|---|
| Idle, walk, run, sprint, jump, side-step, back-step | Mixamo |
| Dribble, hold, jump shot, free throw, chest pass, catch | Mixamo if it has the move; otherwise made by Claude |
| Defensive stance, steal reach, contest, tip reach | Made by Claude |

Motions made by Claude are arm-and-torso poses keyed in Blender and played over the motion-capture legs.

All motion plays on the spot. Where a player is and which way he faces always come from the match, never from a clip.

## The ball in the hand

While a player holds the ball, its position in the rules is for looks only. So:

- **Held:** the ball is drawn in his hand. On the dribble it bounces between his hand and the floor in time with the dribble motion.
- **Released:** the ball is drawn where the rules say. The switch is blended over a tenth of a second so the ball does not jump.

## Camera

- **Live play:** the broadcast camera, unchanged.
- **Free throws:** the camera moves in to frame the shooter from the front and side, with the lane behind him. It returns to the broadcast view when the last attempt is released.
- **Opening tip:** the camera starts close on the two jumpers and pulls back when the ball is tapped or lands.
- Moves between views take about 0.6 seconds and never cut.

The free-throw meter and the scoreboard stay on screen in close-ups.

## Walking to spots

This is the only change to the rules.

- When the whistle blows for an inbound, the player who will inbound is chosen at once (the nearest of his team to the spot) and walks to it.
- Before free throws, all six players walk to their free-throw spots.
- A player with a spot to reach is moved by the game at running speed. The keyboard and the computer's own plan are ignored for him until play resumes.
- The stoppage ends when everyone with a spot has arrived and the usual 1.5-second pause has passed. If someone has not arrived after 6 seconds, he is placed there directly, as today.
- Other players behave as now.
- The start of a period still places both teams directly. It is a fresh line-up, shown as a cut, not a walk.

Clocks stay stopped throughout.

## Quality levels

| | High | Low |
|---|---|---|
| Textures | Full size | Half size |
| Render resolution | Screen resolution, up to 2× | 0.75× |
| Shadows | 2048 map | 1024 map |

- The game starts on High. If the first three seconds of play average under 40 frames a second, it switches to Low once. After that only the G key changes it.
- Low is derived when the game loads: no second set of files.
- The corner label reads, for example, "WebGPU · High · 60 fps".

**Targets**

| What | Target |
|---|---|
| This computer, High | 60 frames a second |
| Chromebook, Low | 30 frames a second, as reported by the owner |
| Triangles per player | At most 20,000 |
| Single file | At most 25 MB |

If the Chromebook misses its target on Low, lighter meshes are added for Low. That is decided by measurement during the build, not guessed now.

## The single file

`npm run single` keeps producing one HTML file that plays from disk. It now also packs the models and the motion. The game asks one small module where each file is; from a server that is a normal address, and in the single file it is the packed copy.

## How it is built

```
assets/players.glb          ten dressed bodies on one skeleton, no motion
assets/motion.glb           the skeleton and every motion
assets/CREDITS.md           every generator asset and Mixamo clip used, with its licence
assets/source/people.json   the table of ten people
assets/source/              Blender scenes; Mixamo downloads (not committed)
tools/blender/              scripts run inside Blender: generate, dress, rig, import motion, export
tools/single-file.mjs       also packs assets/
src/render/assets.js        where a file is loaded from
src/render/people.js        loads the ten models, shows six, swaps on substitution, paints kits
src/render/motion.js        match state → which motions, how strongly, how fast (no Three.js)
src/render/animator.js      plays what motion.js chose
src/render/camera.js        broadcast and close-up views
src/render/quality.js       the two levels, the automatic choice, the G key
src/render/actors.js        the ball and the ring; players move to people.js
src/sim/rules.js            walking to spots
```

- **The simulation stays in charge.** Apart from walking to spots, nothing under `src/sim/` changes. The models read the match; they never steer it.
- **Choosing a motion is plain logic**, kept apart from Three.js so it can be tested without a browser. It works from the match state and what changed since the last frame (a pass thrown, a catch, a steal attempt).
- **The pipeline is repeatable.** The Blender scripts rebuild both model files from the people table and the downloaded clips, so a look or a motion can be changed without redoing the rest by hand.

## Order of work

1. **An early look.** One finished player, dressed and on the skeleton, standing, running and jumping in the game. The owner looks at him on both devices and says whether the look is right. Nothing else is built until then.
2. The other nine players, the kits and numbers, the quality levels, the single file.
3. The basketball motions and the ball in the hand.
4. Close-ups and walking to spots.

## What the owner does

- Approves installing Blender 4.2 or newer beside the current 4.0.2, with the MakeHuman plugin (MPFB) and its asset pack. About 350 MB for Blender; Claude asks before downloading anything.
- Opens the new Blender and starts its MCP server.
- Downloads about ten clips from Mixamo, from a list with exact names and settings, into a folder Claude names. This needs the owner's own Adobe login.
- Reports the frame rate shown in the corner on the Chromebook.

## Testing

Automated, with `node --test`:

- **Motion choice:** each row of the two motion tables, from a match state built for it; the speed bands for walk, run and sprint; a defender near his man faces him and side-steps; one-off motions (pass, catch, reach, follow-through) start on the right change and end on time.
- **Model files:** `players.glb` holds ten players named by team and number, each on the shared skeleton and within the triangle limit; `motion.glb` holds every motion the tables name.
- **Walking to spots:** the inbounder and the free-throw six arrive on foot; the stoppage waits for them; the 6-second limit places a blocked player; a walked player ignores keys; clocks stay stopped; whole matches still finish.
- **Single file:** every model and motion is packed, and the page asks the network for nothing.
- **Quality:** the automatic switch happens once, below 40 frames a second, and never overrides the G key.

By eye:

- Each player from several sides in Blender, then in the game on High and Low.
- Every motion in the game, and the ball staying in the hand.
- Both close-ups, in and out.
- Frame rate on this computer and, from the owner, on the Chromebook.

## Known risks

- **The look.** Generator humans look like good game characters, not photographs. The early look exists so this is judged before nine more are made.
- **Hand-made motion is stiffer than motion capture.** The more basketball moves Mixamo lacks, the more of the game is hand-made.
- **Mixamo's catalogue is unconfirmed.** Claude could not check it without a login. The list given to the owner names a first choice and a fallback for each motion.
- **The generator's Mixamo skeleton is marked experimental.** If it gives bad results, each body goes through Mixamo's own auto-rigger instead, which is one upload per body for the owner.
- **Chromebook speed is unknown.** Six detailed, animated players are far heavier than six capsules.
- **File size.** Ten bodies, textures and motion may pass 25 MB; the fallback is fewer triangles and smaller textures.
- **Blender versions.** The MCP add-on has to work in the new Blender. If it does not, the scripts are run from the command line instead and Claude loses the ability to look at the scene while working.
- **Licences.** Mixamo allows its motion in a game but not sharing the raw clips, so the downloads are kept out of the repository. This matters more if the project is ever published.

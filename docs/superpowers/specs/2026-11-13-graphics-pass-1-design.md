# Graphics pass 1, the building and the light: design

Date: 2026-11-13. Status: the design below was approved in conversation by the owner, including the one download; awaiting their read of this file.

The owner called graphics "the biggest thing to improve": physically based rendering, high-resolution textures, a detailed arena, dynamic lighting, accurate shadows, reflections, ambient occlusion and subtle post-processing, at 60 frames a second, with High and Ultra levels for a powerful home machine and Low and Medium for the school Chromebook. This is the first of two passes. Pass 2 (players' skin and hair, cloth, cinematic cameras, and tuning for ten players) comes after the 5v5 option, which changes how much there is to draw.

## What this pass can and cannot be

It makes the court, the hall around it and the light look far better than they do now. It does not reach a modern commercial basketball game: that needs scanned faces, motion capture and artist-built arenas. The dev machine has no WebGPU and a small browser panel, so the owner is the judge of how each step looks and runs.

## What stays as it is

- Nothing under `src/sim/` changes. The renderer still only reads the match.
- One self-contained HTML file for every machine (`npm run single`). There is no size cap now; each step reports the file's size.
- WebGPU where the browser has it, WebGL 2 where it does not. Everything in this pass must work on both.
- The camera, the controls, the menus, the shot meter, the net and the players' models and motions.
- If the players' files fail to load, the capsule fallback still plays.
- Every asset is CC0 and listed in `assets/CREDITS.md`. No real brand, team, league or person appears anywhere in the arena.

## 1. Four quality levels

Today there are two, High and Low. There will be four.

| | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Meant for | Chromebook | Chromebook | home | home |
| Drawn pixels per screen pixel, at most | 0.75 | 1 | 2 | 2 |
| Players' pictures | half size | half size | full | full |
| Floor texture | 1k | 1k | 2k | 2k |
| Shadow map | 1024, hard | 1024, soft | 2048, soft | 4096, soft |
| Crowd shown | 15% | 50% | all | all |
| Anti-aliasing | none | FXAA | SMAA | SMAA |
| Ambient occlusion | off | off | on | on |
| Bloom and vignette | off | off | on | on |
| Floor mirror reflection | off | off | half size, blurred | full size |

- **The game's own choice.** It starts on High and measures the first 3 seconds of play, as now. Under 40 frames a second it steps down to Medium and measures another 3 seconds; under 40 again, to Low. It never steps up, and never picks Ultra.
- **Your choice.** `G` steps Low, Medium, High, Ultra and round again, on any screen. The Quality row of both menus' Settings does the same and shows the level. Once you choose, the game stops choosing.
- The corner label names the level, as now.

## 2. Light

- **The arena's light is built when the game starts**, not downloaded: a small hidden scene of bright panels over a dark bowl is turned into the environment that lights and is reflected by everything. It is the same on every level.
- **One key light** from high above casts the shadows, soft at Medium and above.
- **Filmic tone mapping** and correct colour handling throughout, tuned so the court is about as bright as it is now and nothing bleaches white.

## 3. Materials

- **Floor:** the scanned wood (colour, bumps and gloss) repeated across the hall, with the court's lines, key and centre circle laid over it as paint. The 1k versions for Low and Medium are made from the 2k files when the game loads, as the players' smaller pictures are.
- **Ball:** pebbled leather with seams, painted at start-up.
- **Rim, supports, backboards:** metal rim; glass backboards with their white markings; padded supports.
- **Players:** their pictures as now, with physically sensible gloss. Their skin, hair and cloth are pass 2.

## 4. The arena

- **Stands** on all four sides, rising in tiers from behind a run-off, with a dark upper level. On the camera's side they stay low: nothing of the arena may come between the camera and the court from any place the camera goes.
- **A crowd** of simple seated figures in varied colours, drawn as one batch. How many are shown follows the quality level. They do not move in this pass.
- **Ad boards** along the far sideline and behind the baselines, lit, carrying the game's own name and invented words only.
- **A scorer's table** on the far sideline.
- **A hanging scoreboard** over centre court showing both teams' abbreviations, the score and the period, repainted only when one of them changes.

## 5. Post-processing (High and Ultra)

- Ambient occlusion, so feet, the rim and the stands sit in soft contact shadow.
- A soft bloom that only the lights, the ad boards and the brightest highlights reach.
- A slight vignette.
- Low draws straight to the screen, as now. Medium adds only FXAA.

## 6. Floor reflections (High and Ultra)

- The floor mirrors the players, the ball, the hoops and the boards: blurred and at half size on High, sharp on Ultra. The gloss map breaks the mirror up along the planks.
- Low and Medium reflect only the arena's light.

## The one download

Three files of the texture "Wood Floor" from Poly Haven (polyhaven.com), by Dimitrios Savva, licence CC0, 6.9 MB together: `wood_floor_diff_2k.jpg` (2.9 MB), `wood_floor_nor_gl_2k.jpg` (1.8 MB), `wood_floor_rough_2k.jpg` (2.2 MB). They go in `assets/floor/`, are packed into the single file, and are listed in `assets/CREDITS.md`. The single file grows from 18.3 MB to about 25 MB.

## How it is built

The current renderer is upgraded in steps. The game stays playable after each one, and the owner is sent a build and a picture from the game camera at 1366 by 768 after each:

1. The four quality levels: their table, the game's own choice, `G` and the Settings rows.
2. Light, tone mapping and materials.
3. The floor's wood.
4. The arena: stands, crowd, boards, table, scoreboard.
5. Post-processing.
6. Floor reflections.
7. Tuning each level, and a last check of the single file.

### Structure

- `src/render/quality.js` keeps the levels and the game's own choice as plain logic.
- `src/render/scene.js` is split by purpose as it grows: the light (`light.js`), the floor (`floor.js`), the arena (`arena.js`) and the post-processing chain (`post.js`), each told the quality level when it changes.
- Where things stand in the arena (seats, boards, the scoreboard) is plain logic, so it can be tested without a browser.

### What the tests must show

- The four levels and each setting in the table above.
- The game's own choice: from High, two slow measurements end on Low, one slow then one fast end on Medium, a fast first one stays on High; it never reaches Ultra; a choice by hand stops it.
- `G` and the Settings rows step through the four levels in order and wrap.
- No seat, board or part of the stands is inside the court or its run-off, and none lies between any camera position and any point of the court.
- The crowd shown at each level is the stated share of the seats, and the same seats every time.
- The three floor files are in the asset list, packed into the single file byte for byte, and named in the credits.

### What is checked by eye, and by whom

- By me, from screenshots at 1366 by 768 on WebGL 2: each step from the game camera at both ends of the court, at each level.
- By the owner: how it looks in motion; WebGPU at home; and the frame rate the Chromebook holds at the level the game settles on.

## Not in this pass

- Players' skin, hair and cloth; cinematic cameras, replays, depth of field and motion blur; a crowd that moves; sound.
- The 5v5 option and the other gameplay additions.
- Lighting baked in Blender. If the arena looks flat after this pass, that is the next lever.

## Risks

- **WebGL 2.** Ambient occlusion, bloom and the mirror are written for WebGPU first. If one of them does not work on WebGL 2, that effect is left off there and the owner is told which.
- **The Chromebook.** Medium may be too much for it; the game's own choice then lands on Low, which must look no worse than today.
- **File size and start-up.** About 25 MB after this pass. How long the Chromebook takes to open it is not known until the owner tries.
- **Cost of the mirror.** It draws the scene twice. If High cannot hold 60 frames a second at home with it, High loses it and only Ultra keeps it.

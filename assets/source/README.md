# Rebuilding the player models and their motion

Everything under `assets/` that the game loads is built by the scripts in `tools/blender/`. Nothing is edited by hand.

## Tools (installed 2026-11-12)

| What | Version | Where |
|---|---|---|
| Blender | 4.5.16 LTS | `~/.local/opt/blender-4.5.16-linux-x64/`, command `blender-4.5` (Blender 4.0.2 stays as `blender`) |
| MPFB (MakeHuman plugin) | 2.0.18, build 20261010 | Blender extension, module `bl_ext.user_default.mpfb` |
| MakeHuman system assets | `makehuman_system_assets_cc0.zip` (CC0) | loaded into MPFB's user data |

To set up on another machine:

```bash
blender-4.5 --command extension install-file -r user_default -e add-on-mpfb-v2.0.18.zip
blender-4.5 --background --python-expr "import bpy; bpy.ops.mpfb.load_pack(filepath='/full/path/makehuman_system_assets_cc0.zip')"
```

The downloads are kept in `assets/source/packs/`, which is not committed.

## Build

```bash
blender-4.5 --background --python tools/blender/build_players.py -- --shots /some/folder
npm test
```

`build_players.py` reads `people.json` and writes `assets/players.glb`. With `--shots` it also renders each player from four sides, his head and his legs, so the result can be looked at. Blender runs without a window.

## Motion

```bash
blender-4.5 --background --python tools/blender/export_mixamo_doll.py
blender-4.5 --background --python tools/blender/build_motion.py -- --shots /some/folder
npm test
```

1. `export_mixamo_doll.py` writes `assets/source/mixamo-upload.fbx`: the first player, clothed and plain grey, on the game's skeleton.
2. On mixamo.com (signed in), "Upload Character" takes that file. Mixamo recognises the skeleton and asks for no markers.
3. Each clip in the table in `assets/CREDITS.md` is downloaded with Format "FBX Binary (.fbx)", Skin **"With Skin"**, 30 frames per second, Keyframe Reduction "none", and **"In Place" left unticked**, then saved in `assets/source/mixamo/` as `idle.fbx`, `walk.fbx`, `run.fbx`, `sprint.fbx`, `jump.fbx`, `strafeLeft.fbx`, `backpedal.fbx` and `dribble.fbx`. That folder is not committed.
4. `build_motion.py` puts the clips on the player's skeleton and writes `assets/motion.glb` and `assets/motion.json`. With `--shots` it renders six frames of each motion from two sides, brightly lit against grey. It also makes three motions of its own from the clips: `land` from the frames of `jump.fbx` that follow the landing, and `strafeRight` and `dribbleLeft` from `strafeLeft` and `dribble` in a mirror. If a clip is missing the build stops and writes nothing.
5. After the clips it keys the hand-made motions in `poses.py` (below), which need no download.

### Clips the build takes if they are there

Eight more clips are optional. If its file is in `assets/source/mixamo/`, the build uses it; if not, the build goes on without it and says so in its last lines (`MOTION optional: crossover hand, ... stumble absent`).

| Save as | What it is | Without it |
|---|---|---|
| `crossover.fbx`, `betweenLegs.fbx`, `behindBack.fbx` | The three dribble moves, the ball going from the right hand to the left | A motion of the arms and the upper trunk made by hand in `poses.py`, on the step he is taking |
| `stepBack.fbx` | One hop backwards | The same |
| `fade.fbx` | A jump shot leaning back | The same |
| `celebrate.fbx`, `dejected.fbx`, `stumble.fbx` | After a big basket, and a defender beaten by a move | A raised arm; nothing; a low stagger |

They are downloaded with the same settings as the others. A downloaded clip is played by the whole body, so his feet stand where the clip puts them and slide if he is moving; a hand-made one moves the arms and the upper trunk and leaves the legs to the step he is taking, so his feet do not slide. (A hand-made motion that keys the legs would be played by the whole body too, and says `"whole": true` in `assets/motion.json`; none does.) In a dribble move the game draws the ball itself: out of the hand it starts in, off the floor (in front of him, between his legs or behind him) and up into the other, so a clip only has to put the two hands in the right places. The build makes the left-handed twin of each dribble move in a mirror. A clip whose rest pose is not the player's is refused with a line `MOTION refused <name>.fbx: ...` and treated as absent. `assets/motion.json` says for each of these where it came from: `"from": "clip"` or `"from": "hand"`.

`--strips crossover,fade` with `--shots` draws only those motions' film strips.

Why those settings:

- **With Skin.** Without the skin, Mixamo sends the skeleton back resting in a T-pose instead of the player's own rest pose, and the motion can no longer be carried over exactly. `build_motion.py` refuses a clip whose rest pose is more than 5 mm from the player's.
- **Not in place.** The script measures how fast each gait really travels (the `gaits` in `motion.json`, which the game uses to stop feet sliding) and then takes the travel out itself.
- **The jump** must take off and land in the clip. Only the frames with both feet off the floor are kept, and the climb is removed, because the game lifts the player. `land` carries on from the frame the jump ends on to the lowest the hips sink in the next ten frames.
- **The steps** (`strafeLeft`, `strafeRight`, `backpedal`) must travel the way their names say: to the player's left, to his right, and backwards. The build stops if one does not. The side-step is a crouched one; the back-step is an upright walk, because Mixamo's crouched backward walks hold a weapon.
- **The mirror.** Each bone turns from its rest pose as the bone on the other side did, seen in a mirror, and the skeleton is then put back together from the hips. The player's skeleton is not quite the same on both sides (the shoulder joints rest 14 mm apart in a mirror), which costs a few millimetres; the build stops if a joint is more than 20 mm from its twin's mirror image.

What `assets/motion.json` says about each clip, besides how long it is:

- `kind`: `loop` for a motion that repeats, `held` for one where the game sets how far through it is (`jump`, `land`, `gather`, `shoot`, `follow`, `catch`, `contest`, `tip`), `once` for one played through (`freeThrow`, `pass`, `reach`). `loop` is true exactly when `kind` is `loop`.
- `crouch` (the three steps): how many metres lower the hips sit, on average over the clip, than they do in `idle`.
- `strike` (`walk`, `run`, `sprint`): for the `left` and the `right` foot, the share of the cycle (0 to 1) at which it is furthest ahead of the hips, which is when it lands.
- `push` (`dribble`): the share of the cycle at which the right hand is lowest. `dribbleLeft` has the same timing.
- `bounces` (`dribble`): how many times the hand goes down and comes back up in one cycle.

## The motions made by hand

`tools/blender/poses.py` holds the motions that are not downloaded: `stance`, `gather`, `hold`, `shoot`, `follow`, `freeThrow`, `pass`, `catch`, `reach`, `handUp`, `contest` and `tip`. It also holds `crossover`, `betweenLegs`, `behindBack`, `stepBack` and `fade`, used until a clip of that name is downloaded. The build makes `holdLeft` from `hold` in a mirror. Each is a few key poses; nothing is posed in Blender's window.

How a pose is written:

- A key pose is `{ bone: (x, y, z) }`. The bone is named without its `mixamorig:` prefix. `(x, y, z)` are degrees turned about the rig's own axes as it stands at rest (X toward his left, Y toward his back, Z up), applied in that order. He faces -Y, so a plus `x` bends the trunk forward, a plus `y` tips him to his left (and lowers his left arm, raises his right) and a plus `z` turns him to his left.
- A bone's turn is on top of its parent's: a raised upper arm carries the forearm with it. A bone the pose leaves out is at rest, and at rest the arms hang out to the sides with the forearms forward, not straight down.
- `both({...})` takes the turns of his right side and adds the same for his left.
- A motion is `{ 'kind', 'seconds', 'keys': [(share of the length, key pose), ...] }`. The first key is at 0 and the last at 1; for a loop they are the same pose. Between keys each bone turns the short way round, easing in and out, so every key is a moment of rest.
- When a pose turns a leg bone, `pose_frames` moves the hips down or up so that the lower toe stays at the height it rests at. A pose cannot move the hips sideways.

What to keep to when changing one:

- The game plays a motion on one layer only. `stance` is for the whole body and `gather` for the legs (it turns leg bones only). All the others are for the arms layer and turn only `Spine1`, `Spine2`, the neck, the head, the shoulders, the arms and the hands, never `Hips` or `Spine`.
- `tests/poses.test.js` measures every one of them in the shipped file. Look at the film strip as well: nothing through the body, shoulders not up at the ears, wrists not twisted round, and a loop's sway small enough that the hands stay put.

## What the scripts rely on in MPFB

- Services are imported as `bl_ext.user_default.mpfb.services.<module>`: `HumanService`, `TargetService`, `AssetService`.
- Body shape: `TargetService.get_default_macro_info_dict()` has `gender` (1.0 is male), `age`, `muscle`, `weight`, `proportions`, `height`, and `race` with `asian`, `caucasian`, `african`.
- Skeleton: `HumanService.add_builtin_rig(body, 'mixamo')` gives 52 bones named `mixamorig:*`. It must be added before hair or shoes.
- The body mesh carries helper surfaces as vertex groups. `body` is the skin; `helper-tights` is a body stocking the jersey and shorts are cut from.
- Skins in the pack: `young`, `middleage` and `old`, each `african`, `asian` or `caucasian`, `male` or `female`. Hair: `afro01`, `short01` to `short04` and longer styles. Shoes: `shoes01` to `shoes06`; `shoes05` is the white trainer used.

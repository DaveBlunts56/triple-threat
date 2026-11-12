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
3. Each clip in the table in `assets/CREDITS.md` is downloaded with Format "FBX Binary (.fbx)", Skin **"With Skin"**, 30 frames per second, Keyframe Reduction "none", and **"In Place" left unticked**, then saved in `assets/source/mixamo/` as `idle.fbx`, `walk.fbx`, `run.fbx`, `sprint.fbx` and `jump.fbx`. That folder is not committed.
4. `build_motion.py` puts the clips on the player's skeleton and writes `assets/motion.glb` and `assets/motion.json`. With `--shots` it renders six frames of each motion from two sides.

Why those settings:

- **With Skin.** Without the skin, Mixamo sends the skeleton back resting in a T-pose instead of the player's own rest pose, and the motion can no longer be carried over exactly. `build_motion.py` refuses a clip whose rest pose is more than 5 mm from the player's.
- **Not in place.** The script measures how fast each gait really travels (the `gaits` in `motion.json`, which the game uses to stop feet sliding) and then takes the travel out itself.
- **The jump** must take off and land in the clip. Only the frames with both feet off the floor are kept, and the climb is removed, because the game lifts the player.

## What the scripts rely on in MPFB

- Services are imported as `bl_ext.user_default.mpfb.services.<module>`: `HumanService`, `TargetService`, `AssetService`.
- Body shape: `TargetService.get_default_macro_info_dict()` has `gender` (1.0 is male), `age`, `muscle`, `weight`, `proportions`, `height`, and `race` with `asian`, `caucasian`, `african`.
- Skeleton: `HumanService.add_builtin_rig(body, 'mixamo')` gives 52 bones named `mixamorig:*`. It must be added before hair or shoes.
- The body mesh carries helper surfaces as vertex groups. `body` is the skin; `helper-tights` is a body stocking the jersey and shorts are cut from.
- Skins in the pack: `young`, `middleage` and `old`, each `african`, `asian` or `caucasian`, `male` or `female`. Hair: `afro01`, `short01` to `short04` and longer styles. Shoes: `shoes01` to `shoes06`; `shoes05` is the white trainer used.

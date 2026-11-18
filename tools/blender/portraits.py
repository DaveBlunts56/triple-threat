"""Render roster portraits from the exported models with Blender 4.5.

Run from the repository root: blender-4.5 -b -t 4 -P tools/blender/portraits.py
Pass -- and model stems to render just those players.
"""
from pathlib import Path
import sys

import bpy
from mathutils import Vector

output = Path("assets/portraits")
output.mkdir(exist_ok=True)
models = sorted(Path("assets/players").glob("*.glb"))
if "--" in sys.argv:
    names = sys.argv[sys.argv.index("--") + 1:]
    models = [path for path in models if path.stem in names]

for path in models:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    scene = bpy.context.scene
    for part in scene.objects:
        if part.name.endswith("-far"):
            part.hide_render = True

    rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    head = rig.matrix_world @ rig.pose.bones["mixamorig:Head"].head
    target = head + Vector((0, 0, 0.025))
    bpy.ops.object.camera_add(location=target + Vector((0.19, -2, 0.065)))
    camera = bpy.context.object
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 0.43
    scene.camera = camera

    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "TEXTURE"
    shading.show_shadows = True
    scene.display.render_aa = "8"
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 86
    scene.render.filepath = str((output / (path.stem + ".webp")).resolve())
    bpy.ops.render.render(write_still=True)

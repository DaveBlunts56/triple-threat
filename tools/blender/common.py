"""Helpers shared by the Triple Threat Blender scripts.

Run inside Blender 4.5 with the MPFB extension installed (see assets/source/README.md):
    blender-4.5 --background --python tools/blender/<script>.py
"""
import importlib
import os

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MPFB = 'bl_ext.user_default.mpfb'


def service(module, name):
    """An MPFB service class, e.g. service('humanservice', 'HumanService')."""
    return getattr(importlib.import_module(f'{MPFB}.services.{module}'), name)


def project(*parts):
    return os.path.join(ROOT, *parts)


def clear_scene():
    """Empty the file completely, so a build never depends on what was there before."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    importlib.import_module('addon_utils').enable(MPFB, default_set=False)


def bounds(objects):
    """World-space bounding box of the objects: (lowest corner, highest corner)."""
    bpy.context.view_layer.update()   # a freshly made object has no bounding box until then
    points = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    return (Vector(tuple(min(p[i] for p in points) for i in range(3))),
            Vector(tuple(max(p[i] for p in points) for i in range(3))))


# Direction from the subject toward the camera. MPFB humans face -Y.
VIEWS = {'front': (0, -1, 0.08), 'side': (1, 0, 0.08), 'back': (0, 1, 0.08), 'three_quarter': (0.75, -0.75, 0.2)}


def snapshot(path, objects, views=('front', 'side', 'back', 'three_quarter'), tile=(384, 576), box=None, textured=True):
    """Render the objects from several sides into one PNG, side by side, so the result can be looked at.

    `box` overrides the framed region as (lowest corner, highest corner), for close-ups.
    """
    scene = bpy.context.scene
    lo, hi = box or bounds(objects)
    centre, size = (lo + hi) / 2, hi - lo

    camera = bpy.data.objects.new('snapshot-camera', bpy.data.cameras.new('snapshot-camera'))
    scene.collection.objects.link(camera)
    camera.data.type = 'ORTHO'
    camera.data.clip_end = 100
    scene.camera = camera
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE' if textured else 'MATERIAL'
    scene.render.resolution_x, scene.render.resolution_y = tile
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'

    tiles = []
    for view in views:
        direction = Vector(VIEWS[view]).normalized()
        camera.location = centre + direction * 20
        camera.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
        # ortho_scale is the size of the longer side of the picture: fit the subject's height and width with a margin.
        across = max(abs(size.x), abs(size.y))
        portrait = tile[1] >= tile[0]
        camera.data.ortho_scale = 1.08 * (max(size.z, across * tile[1] / tile[0]) if portrait else max(across, size.z * tile[0] / tile[1]))
        scene.render.filepath = f'{path}.{view}.png'
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(scene.render.filepath)
        tiles.append(np.array(image.pixels[:], dtype=np.float32).reshape(tile[1], tile[0], 4))
        bpy.data.images.remove(image)
        os.remove(scene.render.filepath)

    sheet = np.concatenate(tiles, axis=1)
    out = bpy.data.images.new('snapshot', width=sheet.shape[1], height=sheet.shape[0])
    out.pixels = sheet.ravel()
    out.filepath_raw, out.file_format = path, 'PNG'
    out.save()
    bpy.data.images.remove(out)
    bpy.data.objects.remove(camera)
    return path

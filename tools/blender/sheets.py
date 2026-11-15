"""Contact sheets of finished players, rendered with their materials, to look at the models stage by stage.

    blender-4.5 --background assets/source/players.blend --python tools/blender/sheets.py -- --out DIR [--players a,b,c]

For each player (by the name of his skeleton, e.g. player-0-4; by default three of them): his whole body from the
front, three-quarter and back, his head from the front, three-quarter and side, and his legs, each as one PNG in DIR.
EEVEE with three lights over a grey floor, so that skin, cloth and hair show as materials, not as flat colour.
"""
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import VIEWS, bounds  # noqa: E402

DEFAULT = ('player-0-4', 'player-1-10', 'player-0-23')
LIGHTS = [((3, -4, 4), 900), ((-4, -2, 3), 350), ((0, 4, 3.5), 600)]   # key, fill, rim: place and power in watts


def stage():
    """EEVEE, a camera, three area lights and a backdrop, once."""
    scene = bpy.context.scene
    engines = [item.identifier for item in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    scene.render.engine = next(e for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE') if e in engines)
    scene.view_settings.view_transform = 'AgX'
    scene.render.film_transparent = False
    if not scene.world:
        scene.world = bpy.data.worlds.new('sheets')
    scene.world.use_nodes = True
    background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs[0].default_value = (0.18, 0.19, 0.21, 1)
    background.inputs[1].default_value = 0.6
    for at, power in LIGHTS:
        light = bpy.data.objects.new('sheet-light', bpy.data.lights.new('sheet-light', 'AREA'))
        light.data.energy, light.data.size = power, 2.5
        light.location = at
        light.rotation_euler = (-Vector(at)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    camera = bpy.data.objects.new('sheet-camera', bpy.data.cameras.new('sheet-camera'))
    camera.data.lens = 85
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def shoot(path, camera, box, views, tile):
    """One PNG of the box seen from each of `views`, side by side."""
    scene = bpy.context.scene
    lo, hi = box
    centre, size = (lo + hi) / 2, max((hi - lo).z, (hi - lo).x)
    scene.render.resolution_x, scene.render.resolution_y = tile[0] * len(views), tile[1]
    scene.render.resolution_percentage = 100
    tiles = []
    for view in views:
        direction = Vector(VIEWS[view]).normalized()
        camera.location = centre + direction * size * 3.6
        camera.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
        scene.render.resolution_x = tile[0]
        scene.render.filepath = f'{path}.{view}.png'
        bpy.ops.render.render(write_still=True)
        tiles.append(scene.render.filepath)
    # Side by side with Blender's own images: no other library is needed.
    import numpy as np
    pictures = []
    for file in tiles:
        image = bpy.data.images.load(file)
        pictures.append(np.array(image.pixels[:], dtype=np.float32).reshape(tile[1], tile[0], 4))
        bpy.data.images.remove(image)
        os.remove(file)
    sheet = np.concatenate(pictures, axis=1)
    out = bpy.data.images.new('sheet', width=sheet.shape[1], height=sheet.shape[0])
    out.pixels = sheet.ravel()
    out.filepath_raw, out.file_format = f'{path}.png', 'PNG'
    out.save()
    bpy.data.images.remove(out)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = args[args.index('--out') + 1]
    names = args[args.index('--players') + 1].split(',') if '--players' in args else DEFAULT
    os.makedirs(out, exist_ok=True)
    camera = stage()
    meshes = {o.parent.name: o for o in bpy.data.objects if o.type == 'MESH' and o.parent and o.parent.name.startswith('player-') and not o.name.endswith('-far')}
    for name in names:
        for owner, mesh in meshes.items():
            for child in mesh.parent.children:
                child.hide_render = owner != name
        body = [o for o in meshes[name].parent.children if o.type == 'MESH' and not o.name.endswith('-far')]
        lo, hi = bounds(body)
        shoot(os.path.join(out, f'{name}.body'), camera, (lo, hi), ('front', 'three_quarter', 'back'), (420, 720))
        shoot(os.path.join(out, f'{name}.head'), camera, (Vector((-0.16, -0.16, hi.z - 0.34)), Vector((0.16, 0.16, hi.z))), ('front', 'three_quarter', 'side'), (420, 420))
        shoot(os.path.join(out, f'{name}.legs'), camera, (Vector((-0.3, -0.3, 0.0)), Vector((0.3, 0.3, 1.1))), ('front', 'three_quarter', 'back'), (420, 720))
        print('SHEETS', name)


if __name__ == '__main__':
    main()

"""Adds a render-accurate preview setup to weiclaw-book.blend.

The book rig itself stays flat and editable; a Preview camera, two suns, and
a warm world replicate the website render's look (same framing math as
scripts/render-weiclaw-book-turn.py, with the book pitch folded into the
camera orbit) so F12 or viewport Rendered shading shows the final image.

Usage:
  blender -b public/models/weiclaw-book.blend -P scripts/build-weiclaw-book-preview.py
"""

import math
import os

import bpy
from mathutils import Matrix, Vector

RESOLUTION_X = 1536
RESOLUTION_Y = 972
CAMERA_FOV = 34
COVER_WIDTH = 2.06
COVER_HEIGHT = 1.336
BOOK_PITCH_DEGREES = 24

# ------------------------------------------------------------- clean up old
for name in ("PreviewCamera", "PreviewSun", "PreviewFill", "PreviewTarget"):
    obj = bpy.data.objects.get(name)
    if obj is not None:
        bpy.data.objects.remove(obj, do_unlink=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = RESOLUTION_X
scene.render.resolution_y = RESOLUTION_Y
scene.render.resolution_percentage = 100
scene.render.film_transparent = False

# ------------------------------------------------------------------- camera
# Same framing as the render script, but the -24deg book pitch is folded into
# the camera orbit so the rig stays flat in the viewport.
pitch = Matrix.Rotation(math.radians(BOOK_PITCH_DEGREES), 4, "X")
aspect = RESOLUTION_X / RESOLUTION_Y
half_fov_tan = math.tan(math.radians(CAMERA_FOV) / 2)
half_width = COVER_WIDTH / 2 + 0.14
half_height = COVER_HEIGHT / 2 + 0.24
distance = max(half_width / (half_fov_tan * aspect), half_height / half_fov_tan) * 1.12
target = Vector((0, -0.06, 0))
camera_offset = pitch @ Vector((distance * 0.3, distance * 0.14, distance * 0.94))


def look_at(obj, target_point, world_up=(0, 1, 0)):
    forward = (Vector(target_point) - obj.location).normalized()
    right = forward.cross(Vector(world_up)).normalized()
    up = right.cross(forward).normalized()
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Matrix((right, up, -forward)).transposed().to_quaternion()


bpy.ops.object.camera_add(location=target + camera_offset)
camera = bpy.context.object
camera.name = "PreviewCamera"
camera.data.sensor_fit = "VERTICAL"
camera.data.angle = math.radians(CAMERA_FOV)
look_at(camera, target)
scene.camera = camera


# -------------------------------------------------------------------- suns
def add_sun(name, position, color, energy, angle_degrees):
    direction = pitch @ Vector(position)
    bpy.ops.object.light_add(type="SUN", location=direction)
    sun = bpy.context.object
    sun.name = name
    sun.data.color = color
    sun.data.energy = energy
    sun.data.angle = math.radians(angle_degrees)
    sun.rotation_mode = "QUATERNION"
    sun.rotation_quaternion = (-direction).normalized().to_track_quat("-Z", "Y")
    return sun


add_sun("PreviewSun", (-1.6, 1.4, 2.4), (1.0, 0.945, 0.878), 2.4, 12)
add_sun("PreviewFill", (1.6, -0.6, 1.8), (0.875, 0.910, 1.0), 0.8, 24)

# -------------------------------------------------------------------- world
world = bpy.data.worlds.get("RenderWorld")
if world is None:
    world = bpy.data.worlds.new("RenderWorld")
scene.world = world
world.use_nodes = True
for node in world.node_tree.nodes:
    if node.bl_idname == "ShaderNodeBackground":
        node.inputs[0].default_value = (0.82, 0.76, 0.68, 1.0)
        node.inputs[1].default_value = 0.45

# ----------------------------------------------------------- paper fiber bump
fiber_path = os.path.join(os.getcwd(), "public/images/weiclaw/book/paper-fiber-v2.png")


def principled_node(material):
    for node in material.node_tree.nodes:
        if node.bl_idname == "ShaderNodeBsdfPrincipled":
            return node
    return None


if os.path.exists(fiber_path):
    for mat_name in ("weiclaw_page_edge", "weiclaw_paper"):
        material = bpy.data.materials.get(mat_name)
        if material is None or not material.use_nodes:
            continue
        bsdf = principled_node(material)
        if bsdf is None or any(n.bl_idname == "ShaderNodeBump" for n in material.node_tree.nodes):
            continue
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image = bpy.data.images.load(fiber_path)
        bump = material.node_tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.12
        bump.inputs["Distance"].default_value = 0.02
        material.node_tree.links.new(texture.outputs[0], bump.inputs["Height"])
        material.node_tree.links.new(bump.outputs[0], bsdf.inputs["Normal"])

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print("preview setup saved: PreviewCamera + PreviewSun + PreviewFill + RenderWorld")

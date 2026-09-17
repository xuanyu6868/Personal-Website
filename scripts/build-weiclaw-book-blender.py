"""Builds the WeiClaw book body (page block + cover + spine) as a GLB.

Coordinates are authored directly in the runtime's book space: the book lies
in the XY plane (x right, y up the page) with thickness toward +z. The glTF
exporter maps Blender (x,y,z) -> glTF (x,z,-y), and the runtime wraps the
imported scene in a +90deg X rotation, recovering the authored coordinates.

Usage:
  Blender -b -P scripts/build-weiclaw-book-blender.py -- \
      /tmp/weiclaw-book-body.json public/models/weiclaw-book.glb
"""

import json
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
SPEC_PATH, OUT_PATH = argv[0], argv[1]

with open(SPEC_PATH) as handle:
    spec = json.load(handle)

bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

LEATHER_NAME = "weiclaw_leather"
EDGE_NAME = "weiclaw_page_edge"


def make_material(name, color):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    return material


leather_mat = make_material(LEATHER_NAME, (0.31, 0.24, 0.17))
edge_mat = make_material(EDGE_NAME, (0.93, 0.89, 0.82))


def mesh_object(name, verts, faces, uvs=None, material=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    if uvs is not None:
        layer = mesh.uv_layers.new(name="UVMap")
        for poly in mesh.polygons:
            for loop_index in poly.loop_indices:
                layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    if material is not None:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    return obj


# ---------------------------------------------------------------- page block
loops = spec["loops"]
bottom_z = spec["blockBottomZ"]
CHAMFER = 0.018
UV_U_SCALE = 14.0
UV_V_SCALE = 1.0

count = len(loops)


def inset_xy(point, distance):
    x, y = point[0], point[1]
    length = math.hypot(x, y)
    if length < 1e-6:
        return x, y
    return x - x / length * distance, y - y / length * distance


ring_specs = []  # (z_offset_from_top or absolute, inset) per ring, top -> bottom
# ring z values are absolute; the top z varies per outline point.
RING_DEFS = [
    ("top", None, 0.0),
    ("chamfer_top", "top", -CHAMFER),
    ("chamfer_bottom", "abs", bottom_z + CHAMFER * 0.6),
    ("bottom", "abs", bottom_z),
]

verts = []
uvs = []
for index, point in enumerate(loops):
    x, y, z_top = point[0], point[1], point[2]
    ring_zs = [
        z_top,
        z_top - CHAMFER,
        bottom_z + CHAMFER * 0.6,
        bottom_z,
    ]
    for ring_index, z in enumerate(ring_zs):
        inset = 0.0 if ring_index in (0, 3) else CHAMFER
        px, py = (x, y) if inset == 0.0 else inset_xy(point, inset)
        verts.append((px, py, z))
        uvs.append((0.0, (z_top - z) * UV_V_SCALE))

# u coordinate from cumulative outline arc length (ring 0 vertices)
arc = 0.0
for index in range(count):
    if index > 0:
        prev, curr = loops[index - 1], loops[index]
        arc += math.hypot(curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2])
    for ring in range(4):
        vert_index = index * 4 + ring
        uvs[vert_index] = (arc * UV_U_SCALE, uvs[vert_index][1])

faces = []
faces_uv_fix = None
for index in range(count - 1):  # no closing wall along the gutter chord
    for ring in range(3):
        a = index * 4 + ring
        b = (index + 1) * 4 + ring
        faces.append((a, b, b + 1, a + 1))

bottom_face = tuple(index * 4 + 3 for index in range(count))
faces.append(bottom_face)

block = mesh_object("PageBlock", verts, faces, uvs=uvs, material=edge_mat)
tri = block.modifiers.new("triangulate", "TRIANGULATE")
# --------------------------------------------------------------------- cover
cover = spec["cover"]
bpy.ops.mesh.primitive_cube_add(location=(0, 0, cover["topZ"] - cover["thickness"] / 2))
cover_obj = bpy.context.object
cover_obj.name = "Cover"
cover_obj.dimensions = (cover["width"], cover["height"], cover["thickness"])
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bevel = cover_obj.modifiers.new("cover_bevel", "BEVEL")
bevel.width = cover["cornerRadius"]
bevel.segments = 3
bevel.limit_method = "ANGLE"
cover_obj.data.materials.append(leather_mat)

# ------------------------------------------------- viewport camera + preview
# Saved into the .blend so opening it shows the book instead of an empty scene.
# The glTF export below only exports the selected book meshes.
bpy.ops.object.camera_add(location=(2.5, -3.0, 1.9))
camera = bpy.context.object
camera.name = "PreviewCamera"
target = bpy.data.objects.new("PreviewTarget", None)
bpy.context.collection.objects.link(target)
target.location = (0, 0, -0.05)
track = camera.constraints.new(type="TRACK_TO")
track.target = target
bpy.context.scene.camera = camera
bpy.ops.object.light_add(type="SUN", location=(1.5, -2.0, 3.0))
sun = bpy.context.object
sun.name = "PreviewSun"
sun.data.energy = 4.0

if OUT_PATH.endswith(".glb"):
    blend_path = OUT_PATH[: -len(".glb")] + ".blend"
else:
    blend_path = OUT_PATH + ".blend"
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

# -------------------------------------------------------------------- export
bpy.ops.object.select_all(action="DESELECT")
for obj in (block, cover_obj):
    obj.select_set(True)
bpy.context.view_layer.objects.active = cover_obj

bpy.ops.export_scene.gltf(
    filepath=OUT_PATH,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_animations=False,
    export_materials="EXPORT",
)
print(f"wrote {OUT_PATH}")

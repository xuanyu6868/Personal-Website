"""Rebuilds the WeiClaw free-flip multi-page rig inside weiclaw-book.blend.

Idempotent: removes the legacy PageBlock and any existing rig objects, then
recreates the independent page stack (24 curved sheets), the reusable
high-resolution TurningPage, and the BookRig control empty with its custom
properties. Embeds scripts/weiclaw-rig-runtime.py as the auto-running Text
datablock that makes the rig scrubbable in the viewport.

Settled-page math mirrors scripts/render-weiclaw-book-turn.py (a port of
components/weiclaw/paperGeometry.ts) so viewport pages and website renders
share one paper shape.

Usage:
  blender -b public/models/weiclaw-book.blend -P scripts/build-weiclaw-book-pages.py -- \
      [--output public/models/weiclaw-book.blend] [--page-count 24] [--active-page 12]
"""

import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUTPUT = None
PAGE_COUNT = 24
ACTIVE_PAGE = 12
if "--output" in argv:
    OUTPUT = argv[argv.index("--output") + 1]
if "--page-count" in argv:
    PAGE_COUNT = int(argv[argv.index("--page-count") + 1])
if "--active-page" in argv:
    ACTIVE_PAGE = int(argv[argv.index("--active-page") + 1])
ACTIVE_PAGE = max(0, min(PAGE_COUNT, ACTIVE_PAGE))

PAGE_WIDTH = 1.0
PAGE_HEIGHT = 1.28
PAGE_BASE_LIFT = 0.012
SETTLE_SCALE = 0.5
PAGE_COLUMNS = 16
PAGE_ROWS = 8
TURNING_COLUMNS = 48
TURNING_ROWS = 18
# Stacks rest on the cover's top surface (z = -0.09) and reach just under the
# settled spread, so no hollow shows between cover and pages.
STACK_GAP = 0.0066
STACK_BASE_Z = -0.081
PAGE_SOLIDIFY = 0.004
RIG_OBJECT = "BookRig"
RUNTIME_TEXT = "weiclaw_book_rig.py"


def clamp(value, low=0.0, high=1.0):
    return min(high, max(low, value))


def smoothstep(edge0, edge1, value):
    amount = clamp((value - edge0) / max(edge1 - edge0, 1e-12))
    return amount * amount * (3 - 2 * amount)


def gaussian(value, center, radius):
    return math.exp(-((value - center) / radius) ** 2)


def settled_depth(u, v):
    spine_dip = -0.058 * gaussian(u, 0, 0.33)
    inner_crest = 0.055 * gaussian(u, 0.3, 0.29)
    broad_arc = 0.012 * smoothstep(0.2, 1, u) ** 1.8
    outer_lift = 0.026 * smoothstep(0.66, 1, u) ** 1.5
    vertical_bow = 0.004 * (1 - ((v - 0.49) * 2) ** 2)
    page_twist = 0.0016 * math.sin(math.pi * v) * (u - 0.42)
    return spine_dip + inner_crest + broad_arc + outer_lift + vertical_bow + page_twist


def settled_horizontal(u):
    return u - 0.04 * math.sin(math.pi * u) * (1 - 0.35 * u)


def open_book_boundary_offset(u, v):
    arch = math.sin(math.pi * u)
    top_offset = 0.024 * (1 - u) + 0.028 * arch
    bottom_offset = -0.031 * (1 - u) - 0.011 * arch
    edge_ripple = (
        0.00022 * math.sin(u * math.pi * 5.4) + 0.00012 * math.sin(u * math.pi * 11.3)
    ) * (u ** 0.8) * (1 if v < 0.5 else -0.65)
    return top_offset * (1 - v) + bottom_offset * v + edge_ripple


def fore_edge_offset(u, v):
    edge_influence = smoothstep(0.66, 1, u) ** 2
    centered = v - 0.48
    broad_bow = 0.0022 * (1 - 4 * centered * centered)
    corner_inset = -0.0026 * (abs(v - 0.5) * 2) ** 5
    handmade_variation = 0.00048 * math.sin(v * math.pi * 3.2) - 0.00042 * v
    return edge_influence * (broad_bow + corner_inset + handmade_variation)


def settled_grid(columns, rows, side):
    """Rest-pose grid for one page; side 'left' spans x -1..0, 'right' 0..1."""
    sign = 1 if side == "right" else -1
    points = []
    for row in range(rows + 1):
        v = row / rows
        corner_distance = abs(v - 0.5) * 2
        corner_droop = (corner_distance ** 5) * (-0.0035 if v < 0.5 else 0.0025)
        base_y = (0.5 - v) * PAGE_HEIGHT
        for column in range(columns + 1):
            u = column / columns
            x = sign * PAGE_WIDTH * settled_horizontal(u)
            y = base_y + open_book_boundary_offset(u, v) * SETTLE_SCALE
            y += corner_droop * smoothstep(0.76, 1, u) ** 2 * SETTLE_SCALE
            z = settled_depth(u, v) * SETTLE_SCALE
            x += sign * fore_edge_offset(u, v) * SETTLE_SCALE
            points.append((x, y, z + PAGE_BASE_LIFT))
    faces = []
    for row in range(rows):
        for column in range(columns):
            top_left = row * (columns + 1) + column
            bottom_left = top_left + columns + 1
            top_right = top_left + 1
            bottom_right = bottom_left + 1
            faces.append((top_left, bottom_left, bottom_right, top_right))
    return points, faces


def remove_object(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        return
    mesh = obj.data if obj.type == "MESH" else None
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh is not None and mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def principled_node(material):
    for node in material.node_tree.nodes:
        if node.bl_idname == "ShaderNodeBsdfPrincipled":
            return node
    return None


def paper_material(name, color):
    material = bpy.data.materials.get(name)
    if material is not None:
        return material
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = principled_node(material)
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.94
    return material


# ----------------------------------------------------------------- clean up
remove_object("PageBlock")
cover = bpy.data.objects.get("Cover")
if cover is not None:
    keep_world = cover.matrix_world.copy()
    cover.parent = None
    cover.matrix_world = keep_world
for index in range(PAGE_COUNT * 2):
    remove_object(f"Page_{index + 1:03d}")
remove_object("TurningPage")
remove_object(RIG_OBJECT)

# --------------------------------------------------------------------- rig
rig = bpy.data.objects.new(RIG_OBJECT, None)
bpy.context.scene.collection.objects.link(rig)
rig.empty_display_size = 0.35
rig["page_count"] = PAGE_COUNT
rig["active_page"] = ACTIVE_PAGE
rig["turn_progress"] = 0.0
rig["turn_direction"] = "next"

pages_collection = bpy.data.collections.get("Pages")
if pages_collection is None:
    pages_collection = bpy.data.collections.new("Pages")
    bpy.context.scene.collection.children.link(pages_collection)

page_mat = paper_material("weiclaw_page_edge", (0.88, 0.84, 0.76))
turn_mat = paper_material("weiclaw_paper", (0.965, 0.933, 0.855))

for index in range(PAGE_COUNT):
    side = "left" if index < ACTIVE_PAGE else "right"
    stack_index = index if side == "left" else index - ACTIVE_PAGE
    points, faces = settled_grid(PAGE_COLUMNS, PAGE_ROWS, side)
    mesh = bpy.data.meshes.new(f"Page_{index + 1:03d}")
    mesh.from_pydata(points, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = True
    page = bpy.data.objects.new(f"Page_{index + 1:03d}", mesh)
    pages_collection.objects.link(page)
    page.data.materials.append(page_mat)
    page.parent = rig
    page.location = (0.0, 0.0, STACK_BASE_Z + stack_index * STACK_GAP)
    solidify = page.modifiers.new("Solidify", "SOLIDIFY")
    solidify.thickness = PAGE_SOLIDIFY
    solidify.offset = -1.0

points, faces = settled_grid(TURNING_COLUMNS, TURNING_ROWS, "right")
turn_mesh = bpy.data.meshes.new("TurningPage")
turn_mesh.from_pydata(points, [], faces)
turn_mesh.update()
for poly in turn_mesh.polygons:
    poly.use_smooth = True
turning = bpy.data.objects.new("TurningPage", turn_mesh)
pages_collection.objects.link(turning)
turning.data.materials.append(turn_mat)
turning.parent = rig
turning.hide_render = True
turning.hide_viewport = True

if cover is not None:
    keep_world = cover.matrix_world.copy()
    cover.parent = rig
    cover.matrix_world = keep_world

# ------------------------------------------------------------- rig runtime
script_dir = os.path.dirname(os.path.abspath(__file__))
runtime_path = os.path.join(script_dir, "weiclaw-rig-runtime.py")
with open(runtime_path, "r", encoding="utf-8") as handle:
    runtime_source = handle.read()

old_text = bpy.data.texts.get(RUNTIME_TEXT)
if old_text is not None:
    bpy.data.texts.remove(old_text)
text = bpy.data.texts.new(RUNTIME_TEXT)
text.write(runtime_source)
text.use_module = True

try:
    exec(compile(runtime_source, runtime_path, "exec"), {"__name__": "weiclaw_book_rig"})
except Exception as exc:  # handler registration is best-effort in -b mode
    print(f"rig runtime registration skipped: {exc}")

target = OUTPUT or bpy.data.filepath
bpy.ops.wm.save_as_mainfile(filepath=target)
print(f"built {PAGE_COUNT} pages (active {ACTIVE_PAGE}) + TurningPage -> {target}")

"""Renders the WeiClaw page-turn frame sequence for the portfolio book.

Ports the turning-paper math from components/weiclaw/paperGeometry.ts
(turning + settled modes, direction "next") into Blender geometry, frames it
with the same camera the runtime Three.js scene used, and writes a webp
sequence:

  frame-0000.webp  book body only (page merged in the right stack)
  frame-0001..0039 page turning right -> left, progress = frame/40
  frame-0040.webp  book body only (page merged in the left stack)

Frame 0 and frame 40 are identical except for the invisible page-stack delta,
so the player can snap 40 -> 0 seamlessly. Settled pages carry the page prints
baked into the paper (see --prints-dir); no DOM overlay is needed on top.

Usage:
  blender -b public/models/weiclaw-book.blend -P scripts/render-weiclaw-book-turn.py -- \
      [--out-root public/sequence/weiclaw-turn] [--spread-start 0] [--spread-count 5] \
      [--physical-pages 24] [--frames 41] [--test] \
      [--front-page public/images/weiclaw/prints/page-02.png \
       --back-page public/images/weiclaw/prints/page-03.png]

Use --out for an exact legacy output directory; otherwise frames are written to
<out-root>/spread-XXXX/frame-XXXX.webp.

--front-page/--back-page print the turning sheet with the DOM page captures
(transparent PNGs over the paper base). The front print is the right page of
this spread, the back print the left page of the next spread; the back print is
sampled mirrored on U so it reads correctly once the leaf lands on the left.

Settled sheets are printed per spread: frame 0 shows this spread's left/right
pages, mid frames reveal the next spread's right page under the lifting sheet,
and frame 40 shows the next spread fully settled. Missing pages (the blank
half of the last spread) fall back to plain paper.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
OUT_ROOT = "public/sequence/weiclaw-turn"
OUT_DIR = None
SPREAD_START = 0
SPREAD_COUNT = 5
SPREAD_STEP = 2
PHYSICAL_PAGES = 24
FRAME_COUNT = 41
TEST_MODE = False
FRONT_PAGE = None
BACK_PAGE = None
PRINTS_DIR = "public/images/weiclaw/prints"
if "--out-root" in argv:
    OUT_ROOT = argv[argv.index("--out-root") + 1]
if "--out" in argv:
    OUT_DIR = argv[argv.index("--out") + 1]
if "--spread-start" in argv:
    SPREAD_START = int(argv[argv.index("--spread-start") + 1])
if "--spread-count" in argv:
    SPREAD_COUNT = int(argv[argv.index("--spread-count") + 1])
if "--physical-pages" in argv:
    PHYSICAL_PAGES = int(argv[argv.index("--physical-pages") + 1])
if "--frames" in argv:
    FRAME_COUNT = int(argv[argv.index("--frames") + 1])
if "--front-page" in argv:
    FRONT_PAGE = argv[argv.index("--front-page") + 1]
if "--back-page" in argv:
    BACK_PAGE = argv[argv.index("--back-page") + 1]
if "--prints-dir" in argv:
    PRINTS_DIR = argv[argv.index("--prints-dir") + 1]
if "--test" in argv:
    TEST_MODE = True
if "--debug" in argv:
    TEST_MODE = True
    DEBUG_MODE = True
else:
    DEBUG_MODE = False
SAVE_SCENE = None
if "--save-scene" in argv:
    SAVE_SCENE = argv[argv.index("--save-scene") + 1]

MAX_SPREAD_START = max(0, SPREAD_COUNT - 1)
SPREAD_START = max(0, min(SPREAD_START, MAX_SPREAD_START))
HAS_TURN = SPREAD_START + SPREAD_STEP < SPREAD_COUNT
if OUT_DIR is None:
    OUT_DIR = os.path.join(OUT_ROOT, f"spread-{SPREAD_START:04d}")

# ------------------------------------------------------------ page constants
PAGE_WIDTH = 1.0
PAGE_HEIGHT = 1.28
PAGE_BASE_LIFT = 0.012
SETTLE_SCALE = 0.5
SETTLED_COLUMNS = 48
SETTLED_ROWS = 20
TURNING_COLUMNS = 64
TURNING_ROWS = 24
BOOK_PITCH_DEGREES = 24
CAMERA_FOV = 34
COVER_WIDTH = 2.06
COVER_HEIGHT = 1.336

RESOLUTION_X = 1024 if TEST_MODE else 1536
RESOLUTION_Y = 648 if TEST_MODE else 972


def clamp(value, low=0.0, high=1.0):
    return min(high, max(low, value))


def smoothstep(edge0, edge1, value):
    amount = clamp((value - edge0) / max(edge1 - edge0, 1e-12))
    return amount * amount * (3 - 2 * amount)


def gaussian(value, center, radius):
    return math.exp(-((value - center) / radius) ** 2)


def settled_depth(u, v):
    # Pressed-open hardcover profile: a deep narrow gutter at the spine, the
    # page rising onto a flat plateau, then draping slightly at the fore-edge.
    gutter = -0.095 * gaussian(u, 0, 0.17)
    rise = 0.075 * smoothstep(0.03, 0.45, u) ** 1.15
    drape = -0.02 * smoothstep(0.58, 1, u) ** 1.7
    crown = 0.0032 * (1 - ((v - 0.49) * 2) ** 2)
    twist = 0.0014 * math.sin(math.pi * v) * (u - 0.42)
    return gutter + rise + drape + crown + twist


def settled_horizontal(u):
    return u - 0.04 * math.sin(math.pi * u) * (1 - 0.35 * u)


def open_book_boundary_offset(u, v):
    # Nearly straight top/bottom edges with a slight sag toward the fore-edge
    # and a whisper of ripple, instead of the old pillow silhouette.
    sag = 0.007 * smoothstep(0.45, 1, u) ** 1.4
    top_offset = -sag
    bottom_offset = sag
    edge_ripple = (
        0.00022 * math.sin(u * math.pi * 5.4) + 0.00012 * math.sin(u * math.pi * 11.3)
    ) * (u ** 0.8) * (1 if v < 0.5 else -0.65)
    return top_offset * (1 - v) + bottom_offset * v + edge_ripple


def fore_edge_offset(u, v):
    edge_influence = smoothstep(0.7, 1, u) ** 2
    centered = v - 0.5
    broad_bow = 0.0018 * (1 - 4 * centered * centered)
    corner_inset = -0.005 * (abs(v - 0.5) * 2) ** 6
    return edge_influence * (broad_bow + corner_inset)


def resolve_turn_pose(progress, curve_intensity=1.0):
    bounded = clamp(progress)
    rotation = math.pi * bounded
    bend = min(-math.sin(rotation) / 2, -0.0001)
    twist = math.sin(rotation) / 10
    curve = (-1 + 2 * bounded) * (-math.sin(rotation) + 1) * clamp(curve_intensity)
    return bend, twist, curve


def paper_positions(columns, rows, side, mode, progress=0.0):
    """Port of createPaperMesh() positions for one page grid (book space)."""
    settled_sign = 1 if side == "right" else -1
    initial_sign = 1  # direction "next"
    bend, twist, curve = resolve_turn_pose(progress) if mode == "turning" else (0, 0, 0)
    delta = PAGE_WIDTH / columns
    points = []

    for row in range(rows + 1):
        v = row / rows
        corner_distance = abs(v - 0.5) * 2
        corner_droop = (corner_distance ** 6) * (-0.008 if v < 0.5 else 0.008)
        base_y = (0.5 - v) * PAGE_HEIGHT
        integrated_x = 0.0
        integrated_z = 0.0
        previous_angle = 0.0

        for column in range(columns + 1):
            u = column / columns
            x = settled_sign * PAGE_WIDTH * settled_horizontal(u)
            y = base_y + open_book_boundary_offset(u, v) * SETTLE_SCALE
            y += corner_droop * smoothstep(0.76, 1, u) ** 2 * SETTLE_SCALE
            z = settled_depth(u, v) * SETTLE_SCALE

            if mode == "settled":
                x += settled_sign * fore_edge_offset(u, v) * SETTLE_SCALE

            if mode == "turning":
                corner_asymmetry = 0.018 if v < 0.5 else 0.035
                corner_delay = (corner_distance ** 1.7) * (0.065 + corner_asymmetry)
                propagation_delay = (1 - u) * 0.48 + corner_delay
                local_progress = (
                    1.0 if progress == 1 else smoothstep(propagation_delay, 0.98 + corner_delay * 0.15, progress)
                )
                curl_pulse = math.sin(math.pi * progress) * math.sin(math.pi * u)
                bend_wave = bend * math.sin(math.pi * local_progress) * math.sin(math.pi * u) * 0.96
                curve_wave = math.sin(math.pi * progress) * (0.08 + abs(curve) * 0.12) * math.sin(math.pi * u)
                tangent_angle = math.pi * local_progress + curl_pulse * 0.52 + bend_wave + curve_wave

                if column > 0:
                    mid_angle = (previous_angle + tangent_angle) * 0.5
                    integrated_x += initial_sign * delta * math.cos(mid_angle)
                    integrated_z += delta * math.sin(abs(mid_angle))

                x = integrated_x
                moving_side = initial_sign if math.cos(math.pi * progress) >= 0 else -initial_sign
                settled_compression = (
                    PAGE_WIDTH * (settled_horizontal(u) - u) * SETTLE_SCALE * abs(math.cos(math.pi * progress))
                )
                x += moving_side * settled_compression
                x += moving_side * fore_edge_offset(u, v)
                z += integrated_z + math.sin(math.pi * u) * math.sin(math.pi * progress) * 0.055
                y += initial_sign * twist * (v - 0.5) * (0.72 * u + 0.28 * math.sin(math.pi * u)) * 0.16
                previous_angle = tangent_angle

            points.append((x, y, z + PAGE_BASE_LIFT))

    faces = []
    for row in range(rows):
        for column in range(columns):
            top_left = row * (columns + 1) + column
            bottom_left = top_left + columns + 1
            top_right = top_left + 1
            bottom_right = bottom_left + 1
            faces.append((top_left, bottom_left, top_right))
            faces.append((top_right, bottom_left, bottom_right))
    return points, faces


def build_grid_object(name, columns, rows, side, mode, material):
    points, faces = paper_positions(columns, rows, side, mode)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj, points, faces


def update_grid_object(obj, points):
    for vertex, point in zip(obj.data.vertices, points):
        vertex.co = point
    obj.data.update()


# --------------------------------------------------------------- scene setup
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = RESOLUTION_X
scene.render.resolution_y = RESOLUTION_Y
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "WEBP"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.quality = 85

# Drop the preview rig; the render builds its own camera and lights.
for name in ("PreviewCamera", "PreviewSun", "PreviewFill", "PreviewTarget"):
    preview = bpy.data.objects.get(name)
    if preview is not None:
        bpy.data.objects.remove(preview, do_unlink=True)

book_empty = bpy.data.objects.new("BookGroup", None)
bpy.context.collection.objects.link(book_empty)
cover = bpy.data.objects["Cover"]
block = bpy.data.objects.get("PageBlock")
if block is not None:
    bpy.data.objects.remove(block, do_unlink=True)

# The .blend carries the interactive viewport rig (BookRig + shaped page
# sheets). Hide it so only this script's own pages and stacks render.
# Its depsgraph handler re-poses (and re-shows) the rig pages on every
# evaluation, so unregister it first or the prints on the rig sheets leak
# through the settled spreads.
bpy.app.handlers.depsgraph_update_post[:] = [
    handler
    for handler in bpy.app.handlers.depsgraph_update_post
    if getattr(handler, "__name__", "") != "weiclaw_book_rig_update"
]
rig = bpy.data.objects.get("BookRig")
if rig is not None:
    rig.hide_render = True
    for child in rig.children_recursive:
        if child != cover:
            child.hide_render = True

# Give the book a real hardcover silhouette: a wider, darker cover with a
# beveled lip so the pages sit visibly inside the shell.
COVER_WIDTH_TARGET = 2.26
COVER_HEIGHT_TARGET = 1.52
COVER_COLOR = (0.135, 0.098, 0.072)
cover.scale = (
    COVER_WIDTH_TARGET / cover.dimensions.x,
    COVER_HEIGHT_TARGET / cover.dimensions.y,
    1.0,
)
for modifier in list(cover.modifiers):
    if modifier.type == "BEVEL":
        cover.modifiers.remove(modifier)
cover_bevel = cover.modifiers.new("Bevel", "BEVEL")
cover_bevel.width = 0.02
cover_bevel.segments = 3
cover_mat = cover.data.materials[0] if cover.data.materials else None
if cover_mat is not None and cover_mat.use_nodes:
    cover_bsdf = next((n for n in cover_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if cover_bsdf is not None:
        cover_bsdf.inputs["Base Color"].default_value = (*COVER_COLOR, 1.0)
cover.parent = book_empty
cover.matrix_parent_inverse = book_empty.matrix_world.inverted()

# Paper materials: blank cream with a subtle fiber bump.
repo_root = os.getcwd()
fiber_path = os.path.join(repo_root, "public/images/weiclaw/book/paper-fiber-v2.png")


def principled_node(material):
    for node in material.node_tree.nodes:
        if node.bl_idname == "ShaderNodeBsdfPrincipled":
            return node
    raise RuntimeError("Principled BSDF node not found")


def socket(node, identifier):
    for candidate in node.inputs:
        if candidate.identifier == identifier:
            return candidate
    raise RuntimeError(f"socket {identifier} not found on {node.name}")


def make_paper_material(name, color):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = principled_node(material)
    socket(bsdf, "Base Color").default_value = (*color, 1.0)
    socket(bsdf, "Roughness").default_value = 0.94
    if os.path.exists(fiber_path):
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image = bpy.data.images.load(fiber_path)
        bump = material.node_tree.nodes.new("ShaderNodeBump")
        socket(bump, "Strength").default_value = 0.12
        socket(bump, "Distance").default_value = 0.02
        material.node_tree.links.new(texture.outputs[0], socket(bump, "Height"))
        material.node_tree.links.new(bump.outputs[0], socket(bsdf, "Normal"))
    return material


def make_printed_turning_material(name, color, front_path, back_path):
    """Paper base with the DOM page prints alpha-composited on both sides.

    The back print is sampled mirrored on U so the verso reads correctly once
    the leaf lands on the left stack (the mesh flips around the spine axis).
    Prints soak into the sheet like ink: print color multiplies with the
    paper tone so whites dissolve, and the paper fiber multiplies back over
    the print (plus a gentle bump) so the sheet never reads as a sticker.
    """
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = principled_node(material)
    socket(bsdf, "Roughness").default_value = 0.94
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    paper = (*color, 1.0)

    def inked_side(image_path, mirrored):
        uv = nodes.new("ShaderNodeUVMap")
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(image_path)
        if mirrored:
            mirror = nodes.new("ShaderNodeMapping")
            mirror.inputs["Location"].default_value = (1.0, 0.0, 0.0)
            mirror.inputs["Scale"].default_value = (-1.0, 1.0, 1.0)
            links.new(uv.outputs[0], mirror.inputs[0])
            links.new(mirror.outputs[0], tex.inputs[0])
        else:
            links.new(uv.outputs[0], tex.inputs[0])
        soak = nodes.new("ShaderNodeMixRGB")
        soak.blend_type = "MULTIPLY"
        soak.inputs[0].default_value = 1.0
        soak.inputs[2].default_value = paper
        links.new(tex.outputs["Color"], soak.inputs[1])
        inked = nodes.new("ShaderNodeMixRGB")
        inked.inputs[1].default_value = paper
        links.new(tex.outputs["Alpha"], inked.inputs[0])
        links.new(soak.outputs[0], inked.inputs[2])
        return inked.outputs[0], uv.outputs[0]

    front, front_uv = inked_side(front_path, mirrored=False)
    back, _ = inked_side(back_path, mirrored=True)

    fiber_image = bpy.data.images.load(fiber_path) if os.path.exists(fiber_path) else None
    if fiber_image is not None:
        fiber_tex = nodes.new("ShaderNodeTexImage")
        fiber_tex.image = fiber_image
        links.new(front_uv, fiber_tex.inputs[0])
        grain = nodes.new("ShaderNodeMixRGB")
        grain.inputs[0].default_value = 0.18
        grain.inputs[1].default_value = (1.0, 1.0, 1.0, 1.0)
        links.new(fiber_tex.outputs["Color"], grain.inputs[2])

        def over_grain(color_socket):
            over = nodes.new("ShaderNodeMixRGB")
            over.blend_type = "MULTIPLY"
            over.inputs[0].default_value = 1.0
            links.new(color_socket, over.inputs[1])
            links.new(grain.outputs[0], over.inputs[2])
            return over.outputs[0]

        front = over_grain(front)
        back = over_grain(back)

    geometry = nodes.new("ShaderNodeNewGeometry")
    choose = nodes.new("ShaderNodeMixRGB")
    links.new(geometry.outputs["Backfacing"], choose.inputs[0])
    links.new(front, choose.inputs[1])
    links.new(back, choose.inputs[2])
    links.new(choose.outputs[0], socket(bsdf, "Base Color"))

    if fiber_image is not None:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = fiber_image
        bump = nodes.new("ShaderNodeBump")
        socket(bump, "Strength").default_value = 0.12
        socket(bump, "Distance").default_value = 0.02
        links.new(texture.outputs[0], socket(bump, "Height"))
        links.new(bump.outputs[0], socket(bsdf, "Normal"))
    return material


def add_page_uvs(obj, columns, rows):
    """UV (u, 1-v) so prints sit upright with u=0 at the spine."""
    layer = obj.data.uv_layers.new(name="PageUV")
    for poly in obj.data.polygons:
        for loop_index in poly.loop_indices:
            vertex_index = obj.data.loops[loop_index].vertex_index
            row = vertex_index // (columns + 1)
            column = vertex_index % (columns + 1)
            layer.data[loop_index].uv = (column / columns, 1.0 - row / rows)


def make_printed_settled_material(name, color, image_path, mirrored):
    """Single-sided ink-soaked print for a settled sheet (only its top shows).

    Same soak/grain/bump treatment as the turning sheet. Left pages pass
    mirrored=True: the grid has u=0 at the spine on both sides, but a left
    page's print has the spine at the image's right edge.
    """
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = principled_node(material)
    socket(bsdf, "Roughness").default_value = 0.94
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    paper = (*color, 1.0)

    uv = nodes.new("ShaderNodeUVMap")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(image_path)
    if mirrored:
        mirror = nodes.new("ShaderNodeMapping")
        mirror.inputs["Location"].default_value = (1.0, 0.0, 0.0)
        mirror.inputs["Scale"].default_value = (-1.0, 1.0, 1.0)
        links.new(uv.outputs[0], mirror.inputs[0])
        links.new(mirror.outputs[0], tex.inputs[0])
    else:
        links.new(uv.outputs[0], tex.inputs[0])
    soak = nodes.new("ShaderNodeMixRGB")
    soak.blend_type = "MULTIPLY"
    soak.inputs[0].default_value = 1.0
    soak.inputs[2].default_value = paper
    links.new(tex.outputs["Color"], soak.inputs[1])
    inked = nodes.new("ShaderNodeMixRGB")
    inked.inputs[1].default_value = paper
    links.new(tex.outputs["Alpha"], inked.inputs[0])
    links.new(soak.outputs[0], inked.inputs[2])
    color_socket = inked.outputs[0]

    fiber_image = bpy.data.images.load(fiber_path) if os.path.exists(fiber_path) else None
    if fiber_image is not None:
        fiber_tex = nodes.new("ShaderNodeTexImage")
        fiber_tex.image = fiber_image
        links.new(uv.outputs[0], fiber_tex.inputs[0])
        grain = nodes.new("ShaderNodeMixRGB")
        grain.inputs[0].default_value = 0.18
        grain.inputs[1].default_value = (1.0, 1.0, 1.0, 1.0)
        links.new(fiber_tex.outputs["Color"], grain.inputs[2])
        over = nodes.new("ShaderNodeMixRGB")
        over.blend_type = "MULTIPLY"
        over.inputs[0].default_value = 1.0
        links.new(color_socket, over.inputs[1])
        links.new(grain.outputs[0], over.inputs[2])
        color_socket = over.outputs[0]

        bump_tex = nodes.new("ShaderNodeTexImage")
        bump_tex.image = fiber_image
        bump = nodes.new("ShaderNodeBump")
        socket(bump, "Strength").default_value = 0.12
        socket(bump, "Distance").default_value = 0.02
        links.new(bump_tex.outputs[0], socket(bump, "Height"))
        links.new(bump.outputs[0], socket(bsdf, "Normal"))

    links.new(color_socket, socket(bsdf, "Base Color"))
    return material


paper_mat = make_paper_material("weiclaw_paper", (0.965, 0.933, 0.855))

# Stacks rest on the cover's top surface (z = -0.09) and reach just under the
# settled spread at full height. They start u=0.25 away from the spine so the
# block never pokes through the gutter dip of the open pages.
PAGE_STACK_THICKNESS = 0.004
PAGE_STACK_GAP = 0.0042
PAGE_STACK_BASE_Z = -0.081
STACK_INNER_X = 0.25
STACK_OUTER_X = 0.998
STACK_HEIGHT = 1.262
# Slightly deeper tone than the open pages so the fore-edge reads as a block.
stack_mat = make_paper_material("weiclaw_page_stack", (0.78, 0.735, 0.655))
stack_pages = []
for index in range(PHYSICAL_PAGES):
    bpy.ops.mesh.primitive_cube_add(location=(0.625, 0.0, 0.0))
    page = bpy.context.object
    page.name = f"Page_{index + 1:03d}"
    page.dimensions = (STACK_OUTER_X - STACK_INNER_X, STACK_HEIGHT, PAGE_STACK_THICKNESS)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    page_bevel = page.modifiers.new("Bevel", "BEVEL")
    page_bevel.width = 0.0015
    page_bevel.segments = 2
    page.data.materials.append(stack_mat)
    page.parent = book_empty
    page.matrix_parent_inverse = book_empty.matrix_world.inverted()
    stack_pages.append(page)


def rest_stack_counts(spread_start):
    bounded = max(0, min(spread_start, MAX_SPREAD_START))
    left = int(round((bounded / MAX_SPREAD_START) * PHYSICAL_PAGES)) if MAX_SPREAD_START else PHYSICAL_PAGES
    return left, PHYSICAL_PAGES - left


def pose_page_stack(progress):
    left_start, right_start = rest_stack_counts(SPREAD_START)
    if HAS_TURN:
        left_end, right_end = rest_stack_counts(SPREAD_START + SPREAD_STEP)
    else:
        left_end, right_end = left_start, right_start

    if progress <= 0:
        left_count, right_count = left_start, right_start
    elif progress >= 1:
        left_count, right_count = left_end, right_end
    else:
        left_count, right_count = left_start, max(0, right_start - 1)

    for index, page in enumerate(stack_pages):
        if index < left_count:
            side = -1
            stack_index = index
        elif index < left_count + right_count:
            side = 1
            stack_index = index - left_count
        else:
            page.hide_render = True
            continue
        page.hide_render = False
        stack_center_x = (STACK_INNER_X + STACK_OUTER_X) / 2
        page.location = (side * stack_center_x, 0.0, PAGE_STACK_BASE_Z + stack_index * PAGE_STACK_GAP)


pose_page_stack(0)

settled_left, _, _ = build_grid_object("SettledLeft", SETTLED_COLUMNS, SETTLED_ROWS, "left", "settled", paper_mat)
settled_right, _, _ = build_grid_object("SettledRight", SETTLED_COLUMNS, SETTLED_ROWS, "right", "settled", paper_mat)


# Settled prints: frame 0 shows this spread, mid frames already reveal the
# next spread's right page under the lifting sheet, frame 40 shows the next
# spread settled. Missing pages fall back to blank paper.
def settled_print_material(page_index, side):
    path = os.path.join(PRINTS_DIR, f"page-{page_index + 1:02d}.png")
    if page_index >= SPREAD_COUNT or not os.path.exists(path):
        return paper_mat
    return make_printed_settled_material(
        f"weiclaw_paper_settled_{side}_{page_index + 1:02d}",
        (0.965, 0.933, 0.855),
        path,
        mirrored=(side == "left"),
    )


next_spread_start = SPREAD_START + SPREAD_STEP if HAS_TURN else SPREAD_START
settled_mats = {
    "cur_left": settled_print_material(SPREAD_START, "left"),
    "cur_right": settled_print_material(SPREAD_START + 1, "right"),
    "next_left": settled_print_material(next_spread_start, "left"),
    "next_right": settled_print_material(next_spread_start + 1, "right"),
}
add_page_uvs(settled_left, SETTLED_COLUMNS, SETTLED_ROWS)
add_page_uvs(settled_right, SETTLED_COLUMNS, SETTLED_ROWS)

turning, turning_points_at, turning_faces = None, None, None
PRINTS_READY = (
    HAS_TURN
    and FRONT_PAGE is not None
    and BACK_PAGE is not None
    and os.path.exists(FRONT_PAGE)
    and os.path.exists(BACK_PAGE)
)
if HAS_TURN and (FRONT_PAGE or BACK_PAGE) and not PRINTS_READY:
    raise RuntimeError(f"turning-page prints not found: front={FRONT_PAGE} back={BACK_PAGE}")
turning_mat = paper_mat
if PRINTS_READY:
    turning_mat = make_printed_turning_material(
        "weiclaw_paper_printed", (0.965, 0.933, 0.855), FRONT_PAGE, BACK_PAGE
    )
turning, _, _ = build_grid_object("TurningPage", TURNING_COLUMNS, TURNING_ROWS, "right", "turning", turning_mat)
if PRINTS_READY:
    add_page_uvs(turning, TURNING_COLUMNS, TURNING_ROWS)
for obj in (settled_left, settled_right, turning):
    obj.parent = book_empty
    obj.matrix_parent_inverse = book_empty.matrix_world.inverted()

book_empty.rotation_euler.x = math.radians(-BOOK_PITCH_DEGREES)
book_empty.scale = (1, 1.04, 1)

# ------------------------------------------------------------------- camera
aspect = RESOLUTION_X / RESOLUTION_Y
half_fov_tan = math.tan(math.radians(CAMERA_FOV) / 2)
half_width = COVER_WIDTH / 2 + 0.14
half_height = COVER_HEIGHT / 2 + 0.24
distance = max(half_width / (half_fov_tan * aspect), half_height / half_fov_tan) * 1.12
camera_position = (distance * 0.3, distance * 0.14, distance * 0.94)

def look_at(obj, target_point, world_up=(0, 1, 0)):
    forward = (Vector(target_point) - obj.location).normalized()
    right = forward.cross(Vector(world_up)).normalized()
    up = right.cross(forward).normalized()
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Matrix((right, up, -forward)).transposed().to_quaternion()


bpy.ops.object.camera_add(location=camera_position)
camera = bpy.context.object
camera.name = "RenderCamera"
camera.data.sensor_fit = "VERTICAL"
camera.data.angle = math.radians(CAMERA_FOV)
look_at(camera, (0, -0.06, 0))
scene.camera = camera

# ------------------------------------------------------- per-frame zoom plan
# Settled frames (0/last) are also the static spreads, so they get a tighter
# crop; mid-turn frames pull back so the flying page tip stays in frame. The
# cover's bottom edge stays anchored at the same screen row in every frame,
# so the book itself never moves during a turn -- only the framing dollies.
from bpy_extras.object_utils import world_to_camera_view

BASE_DISTANCE = distance
BASE_TARGET = Vector((0, -0.06, 0))
CAM_DIR = (BASE_TARGET - Vector(camera_position)).normalized()
CAM_RIGHT = CAM_DIR.cross(Vector((0, 1, 0))).normalized()
CAM_UP = CAM_RIGHT.cross(CAM_DIR).normalized()
ZOOM_CAP = 1.16
ANCHOR_BOTTOM_PX = round(918 * RESOLUTION_Y / 972)
TOP_MARGIN_PX = round(6 * RESOLUTION_Y / 972)
SMOOTH_WINDOW = 2


def frame_content_points(progress):
    points = []
    for corner in cover.bound_box:
        points.append(cover.matrix_world @ Vector(corner))
    for obj in (settled_left, settled_right):
        matrix = obj.matrix_world
        for vertex in obj.data.vertices:
            points.append(matrix @ vertex.co)
    for page in stack_pages:
        if page.hide_render:
            continue
        matrix = page.matrix_world
        for corner in page.bound_box:
            points.append(matrix @ Vector(corner))
    if HAS_TURN:
        turning_points, _ = paper_positions(TURNING_COLUMNS, TURNING_ROWS, "right", "turning", progress)
        matrix = book_empty.matrix_world
        for point in turning_points:
            points.append(matrix @ Vector(point))
    return points


def measure_bbox_px(points, cam=camera):
    min_x, max_x, min_y, max_y = 1.0, 0.0, 1.0, 0.0
    for point in points:
        coord = world_to_camera_view(scene, cam, point)
        if coord.z <= 0:
            continue
        min_x = min(min_x, coord.x)
        max_x = max(max_x, coord.x)
        min_y = min(min_y, coord.y)
        max_y = max(max_y, coord.y)
    top_px = (1 - max_y) * RESOLUTION_Y
    bottom_px = (1 - min_y) * RESOLUTION_Y
    return min_x * RESOLUTION_X, max_x * RESOLUTION_X, top_px, bottom_px


# Measure every frame at the base camera, then derive a smooth zoom curve.
raw_zoom = []
for frame_index in range(FRAME_COUNT):
    progress = frame_index / (FRAME_COUNT - 1)
    pose_page_stack(progress if HAS_TURN else 0.0)
    bpy.context.view_layer.update()
    _, _, top_px, bottom_px = measure_bbox_px(frame_content_points(progress if HAS_TURN else 0.0))
    extent = max(1.0, bottom_px - top_px)
    zoom = min(ZOOM_CAP, (ANCHOR_BOTTOM_PX - TOP_MARGIN_PX) / extent)
    raw_zoom.append((zoom, bottom_px))

zoom_plan = []
for frame_index in range(FRAME_COUNT):
    lo = max(0, frame_index - SMOOTH_WINDOW)
    hi = min(FRAME_COUNT, frame_index + SMOOTH_WINDOW + 1)
    zoom_plan.append(min(zoom for zoom, _ in raw_zoom[lo:hi]))


def place_camera(zoom, base_bottom_px):
    """Dolly to `zoom`, keeping the cover bottom anchored at ANCHOR_BOTTOM_PX."""
    dolly = BASE_DISTANCE / zoom
    # Zooming around the frame center would land the measured bottom here:
    bottom_after = RESOLUTION_Y / 2 + (base_bottom_px - RESOLUTION_Y / 2) * zoom
    delta_px = bottom_after - ANCHOR_BOTTOM_PX
    visible_half = dolly * half_fov_tan
    # Moving the target down lifts the content in frame (and vice versa).
    target = BASE_TARGET - (delta_px * (2 * visible_half) / RESOLUTION_Y) * CAM_UP
    camera.location = target - dolly * CAM_DIR
    look_at(camera, target)
    return dolly


COVER_BOTTOM_LOCAL = Vector((0, -COVER_HEIGHT_TARGET / 2, 0))


def correct_anchor(dolly):
    """One exact linear correction so the cover bottom sits on the anchor row."""
    bpy.context.view_layer.update()
    anchor_world = cover.matrix_world @ COVER_BOTTOM_LOCAL
    coord = world_to_camera_view(scene, camera, anchor_world)
    bottom_px = (1 - coord.y) * RESOLUTION_Y
    delta_px = bottom_px - ANCHOR_BOTTOM_PX
    if abs(delta_px) < 0.5:
        return
    visible_half = dolly * half_fov_tan
    target = camera.matrix_world @ Vector((0, 0, -dolly))  # current aim point
    target = target - (delta_px * (2 * visible_half) / RESOLUTION_Y) * CAM_UP
    camera.location = target - dolly * CAM_DIR
    look_at(camera, target)

# -------------------------------------------------------------------- lights
DBG_NOBUMP = os.environ.get("DBG_NOBUMP") == "1"
DBG_NOSHADOW = os.environ.get("DBG_NOSHADOW") == "1"


def add_sun(name, position, color, energy, angle_degrees=18.0):
    bpy.ops.object.light_add(type="SUN", location=position)
    sun = bpy.context.object
    sun.name = name
    sun.data.color = color
    sun.data.energy = energy
    sun.data.angle = math.radians(angle_degrees)
    sun.rotation_mode = "QUATERNION"
    sun.rotation_quaternion = (-Vector(position)).normalized().to_track_quat("-Z", "Y")
    return sun


add_sun("KeyLight", (-1.6, 1.4, 2.4), (1.0, 0.945, 0.878), 2.4, 12)
add_sun("FillLight", (1.6, -0.6, 1.8), (0.875, 0.910, 1.0), 0.8, 24)
if DBG_NOSHADOW:
    for obj in bpy.data.objects:
        if obj.type == "LIGHT":
            obj.data.use_shadow = False
if DBG_NOBUMP:
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.bl_idname == "ShaderNodeBump":
                node.inputs[0].default_value = 0.0

world = bpy.data.worlds.new("RenderWorld") if scene.world is None else scene.world
scene.world = world
world.use_nodes = True
background = None
for node in world.node_tree.nodes:
    if node.bl_idname == "ShaderNodeBackground":
        background = node
        break
background.inputs[0].default_value = (0.82, 0.76, 0.68, 1.0)
background.inputs[1].default_value = 0.45

# ------------------------------------------------------------------- render
os.makedirs(OUT_DIR, exist_ok=True)
last_frame = FRAME_COUNT - 1

if SAVE_SCENE is not None:
    # Inspection build: pose the turning page mid-curl, select the book, save.
    pose_page_stack(0.4 if HAS_TURN else 0.0)
    turning.hide_render = not HAS_TURN
    if HAS_TURN:
        points, _ = paper_positions(TURNING_COLUMNS, TURNING_ROWS, "right", "turning", 0.4)
        update_grid_object(turning, points)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (cover, settled_left, settled_right, turning, *stack_pages):
        obj.select_set(True)
    book_empty.select_set(True)
    bpy.context.view_layer.objects.active = book_empty
    bpy.ops.wm.save_as_mainfile(filepath=SAVE_SCENE)
    print(f"saved inspection scene to {SAVE_SCENE}")
    sys.exit(0)

if DEBUG_MODE:
    scene.render.film_transparent = False
    background.inputs[0].default_value = (0.2, 0.3, 0.45, 1.0)
    background.inputs[1].default_value = 1.0
    forward = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
    print("DEBUG camera loc", tuple(round(v, 3) for v in camera.matrix_world.translation))
    print("DEBUG camera forward", tuple(round(v, 3) for v in forward))
    print("DEBUG empty rot", tuple(round(math.degrees(a), 2) for a in book_empty.rotation_euler))
    render_objects = (cover, settled_left, settled_right, turning, *stack_pages)
    for obj in render_objects:
        world_center = obj.matrix_world @ Vector((0, 0, 0))
        print("DEBUG obj", obj.name, "world", tuple(round(v, 3) for v in world_center))
    stack_names = {page.name for page in stack_pages}
    variants = {
        "all": set(),
        "body": {"SettledLeft", "SettledRight", "TurningPage", *stack_names},
        "paper": {"Cover", *stack_names},
    }
    for label, hidden in variants.items():
        for obj in render_objects:
            obj.hide_render = obj.name in hidden
        pose_page_stack(0.5 if HAS_TURN else 0.0)
        if HAS_TURN and not turning.hide_render:
            points, _ = paper_positions(TURNING_COLUMNS, TURNING_ROWS, "right", "turning", 0.5)
            update_grid_object(turning, points)
        scene.render.filepath = os.path.join(OUT_DIR, f"debug-{label}.webp")
        bpy.ops.render.render(write_still=True)
        print(f"rendered debug-{label}", flush=True)
    sys.exit(0)

progress_frames = [f for f in range(FRAME_COUNT) if f not in (0, last_frame)]
if TEST_MODE:
    progress_frames = [f for f in (10, 20, 30) if f < FRAME_COUNT]

for frame_index in [0, *progress_frames, last_frame]:
    progress = frame_index / last_frame
    pose_page_stack(progress if HAS_TURN else 0.0)
    turning.hide_render = (not HAS_TURN) or frame_index in (0, last_frame)
    if HAS_TURN and not turning.hide_render:
        points, _ = paper_positions(TURNING_COLUMNS, TURNING_ROWS, "right", "turning", progress)
        update_grid_object(turning, points)
    if frame_index == 0:
        settled_left.data.materials[0] = settled_mats["cur_left"]
        settled_right.data.materials[0] = settled_mats["cur_right"]
    elif frame_index == last_frame:
        settled_left.data.materials[0] = settled_mats["next_left"]
        settled_right.data.materials[0] = settled_mats["next_right"]
    else:
        settled_left.data.materials[0] = settled_mats["cur_left"]
        settled_right.data.materials[0] = settled_mats["next_right"]
    dolly = place_camera(zoom_plan[frame_index], raw_zoom[frame_index][1])
    correct_anchor(dolly)
    scene.render.filepath = os.path.join(OUT_DIR, f"frame-{frame_index:04d}.webp")
    bpy.ops.render.render(write_still=True)
    print(f"rendered frame {frame_index:04d} (progress {progress:.3f})", flush=True)

print(f"wrote {FRAME_COUNT} frames to {OUT_DIR}")

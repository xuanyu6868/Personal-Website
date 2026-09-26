"""Embed the WeiClaw DOM page prints into the .blend page meshes.

The viewport rig (public/models/weiclaw-book.blend) ships blank cream pages;
this script prints the captured page PNGs onto the sheets that are actually
visible while browsing the book in Blender:

  Page_012    front = page-01 (spread 0, left)
  Page_013    front = page-02 (spread 0, right) / back = page-03 (spread 2, left)
  Page_014    front = page-04 (spread 2, right) / back = page-05 (spread 4, left)
  TurningPage front = page-02 / back = page-03 (the sheet flown by the rig)

The print is blended like ink soaked into paper: the print color multiplies
with the paper tone (whites dissolve into the sheet), the paper-fiber grain
multiplies back over the print, and the same fiber drives a gentle bump so
the sheet never reads as a flat sticker.

Usage:
  blender -b public/models/weiclaw-book.blend -P scripts/print-weiclaw-book-pages.py
"""

import os

import bpy

PAGE_COLUMNS = 16
PAGE_ROWS = 8
TURNING_COLUMNS = 48
TURNING_ROWS = 18

PAPER = (0.965, 0.933, 0.855, 1.0)
PRINTS_DIR = "//../images/weiclaw/prints"
FIBER_PATH = "//../images/weiclaw/book/paper-fiber-v2.png"

# object name -> (front print, back print, mirror front). Backs are always
# sampled mirrored on U so they read correctly once the leaf lands on the
# left stack; Page_012 is baked as a left sheet (u=0 at the spine), so its
# front needs the same mirror to read upright.
PRINT_TARGETS = {
    "Page_012": ("page-01.png", "page-01.png", True),
    "Page_013": ("page-02.png", "page-03.png", False),
    "Page_014": ("page-04.png", "page-05.png", False),
    "Page_024": ("page-02.png", "page-02.png", False),
    "TurningPage": ("page-02.png", "page-03.png", False),
}
OBJECT_GRIDS = {
    "Page_012": (PAGE_COLUMNS, PAGE_ROWS),
    "Page_013": (PAGE_COLUMNS, PAGE_ROWS),
    "Page_014": (PAGE_COLUMNS, PAGE_ROWS),
    "Page_024": (PAGE_COLUMNS, PAGE_ROWS),
    "TurningPage": (TURNING_COLUMNS, TURNING_ROWS),
}


def load_image(path):
    absolute = bpy.path.abspath(path)
    if not os.path.exists(absolute):
        raise RuntimeError(f"missing print texture: {absolute}")
    image = bpy.data.images.load(absolute, check_existing=True)
    image.filepath = path  # keep the .blend portable across machines
    return image


def add_page_uvs(obj, columns, rows):
    """UV (u, 1-v) so prints sit upright with u=0 at the spine."""
    layer = obj.data.uv_layers.get("PageUV") or obj.data.uv_layers.new(name="PageUV")
    for poly in obj.data.polygons:
        for loop_index in poly.loop_indices:
            vertex_index = obj.data.loops[loop_index].vertex_index
            row = vertex_index // (columns + 1)
            column = vertex_index % (columns + 1)
            layer.data[loop_index].uv = (column / columns, 1.0 - row / rows)


def socket(node, name):
    return node.inputs[name]


def make_print_material(name, front_path, back_path, mirror_front, fiber_image):
    material = bpy.data.materials.get(name)
    if material is not None:
        bpy.data.materials.remove(material)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(n for n in nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    socket(bsdf, "Roughness").default_value = 0.94

    def inked_side(image_path, mirrored):
        uv = nodes.new("ShaderNodeUVMap")
        uv.uv_map = "PageUV"
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = load_image(image_path)
        if mirrored:
            mirror = nodes.new("ShaderNodeMapping")
            mirror.inputs["Location"].default_value = (1.0, 0.0, 0.0)
            mirror.inputs["Scale"].default_value = (-1.0, 1.0, 1.0)
            links.new(uv.outputs[0], mirror.inputs[0])
            links.new(mirror.outputs[0], tex.inputs[0])
        else:
            links.new(uv.outputs[0], tex.inputs[0])
        # Ink on paper: print x paper so whites adopt the sheet tone.
        soak = nodes.new("ShaderNodeMixRGB")
        soak.blend_type = "MULTIPLY"
        soak.inputs[0].default_value = 1.0
        soak.inputs[2].default_value = PAPER
        links.new(tex.outputs["Color"], soak.inputs[1])
        inked = nodes.new("ShaderNodeMixRGB")
        inked.inputs[1].default_value = PAPER
        links.new(tex.outputs["Alpha"], inked.inputs[0])
        links.new(soak.outputs[0], inked.inputs[2])
        return inked.outputs[0]

    front = inked_side(front_path, mirrored=mirror_front)
    back = inked_side(back_path, mirrored=True)

    fiber_uv = nodes.new("ShaderNodeUVMap")
    fiber_uv.uv_map = "PageUV"
    fiber_tex = nodes.new("ShaderNodeTexImage")
    fiber_tex.image = fiber_image
    links.new(fiber_uv.outputs[0], fiber_tex.inputs[0])

    grain = nodes.new("ShaderNodeMixRGB")
    grain.inputs[0].default_value = 0.18
    grain.inputs[1].default_value = (1.0, 1.0, 1.0, 1.0)
    links.new(fiber_tex.outputs["Color"], grain.inputs[2])

    def over_paper_grain(color_socket):
        over = nodes.new("ShaderNodeMixRGB")
        over.blend_type = "MULTIPLY"
        over.inputs[0].default_value = 1.0
        links.new(color_socket, over.inputs[1])
        links.new(grain.outputs[0], over.inputs[2])
        return over.outputs[0]

    geometry = nodes.new("ShaderNodeNewGeometry")
    choose = nodes.new("ShaderNodeMixRGB")
    links.new(geometry.outputs["Backfacing"], choose.inputs[0])
    links.new(over_paper_grain(front), choose.inputs[1])
    links.new(over_paper_grain(back), choose.inputs[2])
    links.new(choose.outputs[0], socket(bsdf, "Base Color"))

    bump = nodes.new("ShaderNodeBump")
    socket(bump, "Strength").default_value = 0.12
    socket(bump, "Distance").default_value = 0.02
    links.new(fiber_tex.outputs["Color"], socket(bump, "Height"))
    links.new(bump.outputs[0], socket(bsdf, "Normal"))
    return material


fiber_image = load_image(FIBER_PATH)
for obj_name, (front_name, back_name, mirror_front) in PRINT_TARGETS.items():
    obj = bpy.data.objects.get(obj_name)
    if obj is None:
        print(f"skip {obj_name}: object not found")
        continue
    columns, rows = OBJECT_GRIDS[obj_name]
    add_page_uvs(obj, columns, rows)
    material = make_print_material(
        f"weiclaw_print_{obj_name.lower()}",
        f"{PRINTS_DIR}/{front_name}",
        f"{PRINTS_DIR}/{back_name}",
        mirror_front,
        fiber_image,
    )
    obj.data.materials.clear()
    obj.data.materials.append(material)
    print(f"printed {obj_name}: front={front_name} back={back_name}")

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print(f"saved prints into {bpy.data.filepath}")

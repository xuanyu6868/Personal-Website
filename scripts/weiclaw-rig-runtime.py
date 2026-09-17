"""WeiClaw free-flip book rig runtime, embedded in weiclaw-book.blend.

Loaded as a Blender Text datablock named ``weiclaw_book_rig.py`` with
``use_module = True`` so it re-registers on file load (requires Blender's
"Auto Run Python Scripts" preference). Drives the multi-page rig:

  BookRig["active_page"]    pages resting on the left stack (0..page_count)
  BookRig["turn_progress"]  0..1 flip of a single page, free scrubbing
  BookRig["turn_direction"] "next" (right -> left) or "previous"

Dragging turn_progress to 1 completes the turn: the counter folds the page
into active_page and turn_progress resets to 0, so repeated flips are just
repeated drags. The turning-sheet math mirrors
scripts/render-weiclaw-book-turn.py (itself a port of
components/weiclaw/paperGeometry.ts), direction "next"; "previous" renders
the same curl mirrored on X.
"""

import math

import bpy

PAGE_WIDTH = 1.0
PAGE_HEIGHT = 1.28
PAGE_BASE_LIFT = 0.012
SETTLE_SCALE = 0.5
SETTLED_COLUMNS = 48
SETTLED_ROWS = 18
# Stacks rest on the cover's top surface (z = -0.09) and reach just under the
# settled spread, so no hollow shows between cover and pages.
STACK_GAP = 0.0066
STACK_BASE_Z = -0.081
FLIGHT_CLEARANCE = 0.01

_state = {"last": None, "busy": False}


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


def resolve_turn_pose(progress, curve_intensity=1.0):
    bounded = clamp(progress)
    rotation = math.pi * bounded
    bend = min(-math.sin(rotation) / 2, -0.0001)
    twist = math.sin(rotation) / 10
    curve = (-1 + 2 * bounded) * (-math.sin(rotation) + 1) * clamp(curve_intensity)
    return bend, twist, curve


def settled_points(side, columns=SETTLED_COLUMNS, rows=SETTLED_ROWS):
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
    return points


def turning_points(progress, columns=SETTLED_COLUMNS, rows=SETTLED_ROWS):
    """Curl pose for a page turning right -> left (direction "next")."""
    bend, twist, curve = resolve_turn_pose(progress)
    delta = PAGE_WIDTH / columns
    points = []
    for row in range(rows + 1):
        v = row / rows
        corner_distance = abs(v - 0.5) * 2
        corner_droop = (corner_distance ** 5) * (-0.0035 if v < 0.5 else 0.0025)
        base_y = (0.5 - v) * PAGE_HEIGHT
        integrated_x = 0.0
        integrated_z = 0.0
        previous_angle = 0.0
        for column in range(columns + 1):
            u = column / columns
            x = PAGE_WIDTH * settled_horizontal(u)
            y = base_y + open_book_boundary_offset(u, v) * SETTLE_SCALE
            y += corner_droop * smoothstep(0.76, 1, u) ** 2 * SETTLE_SCALE
            z = settled_depth(u, v) * SETTLE_SCALE

            corner_asymmetry = 0.018 if v < 0.5 else 0.035
            corner_delay = (corner_distance ** 1.7) * (0.065 + corner_asymmetry)
            propagation_delay = (1 - u) * 0.48 + corner_delay
            local_progress = (
                1.0
                if progress == 1
                else smoothstep(propagation_delay, 0.98 + corner_delay * 0.15, progress)
            )
            curl_pulse = math.sin(math.pi * progress) * math.sin(math.pi * u)
            bend_wave = bend * math.sin(math.pi * local_progress) * math.sin(math.pi * u) * 0.96
            curve_wave = math.sin(math.pi * progress) * (0.08 + abs(curve) * 0.12) * math.sin(math.pi * u)
            tangent_angle = math.pi * local_progress + curl_pulse * 0.52 + bend_wave + curve_wave

            if column > 0:
                mid_angle = (previous_angle + tangent_angle) * 0.5
                integrated_x += delta * math.cos(mid_angle)
                integrated_z += delta * math.sin(abs(mid_angle))

            x = integrated_x
            moving_side = 1 if math.cos(math.pi * progress) >= 0 else -1
            settled_compression = (
                PAGE_WIDTH * (settled_horizontal(u) - u) * SETTLE_SCALE * abs(math.cos(math.pi * progress))
            )
            x += moving_side * settled_compression
            x += moving_side * fore_edge_offset(u, v)
            z += integrated_z + math.sin(math.pi * u) * math.sin(math.pi * progress) * 0.055
            y += twist * (v - 0.5) * (0.72 * u + 0.28 * math.sin(math.pi * u)) * 0.16
            previous_angle = tangent_angle
            points.append((x, y, z + PAGE_BASE_LIFT))
    return points


def _baked_side(page):
    """Which stack this page's mesh curvature was built for (-1 left, 1 right)."""
    if "baked_side" not in page:
        xs = [v.co.x for v in page.data.vertices]
        page["baked_side"] = -1 if (min(xs) + max(xs)) < 0 else 1
    return int(page["baked_side"])


def _restack(pages, active, flipping_index):
    left_i = 0
    right_i = 0
    for index, page in enumerate(pages):
        if page is None:
            continue
        if index == flipping_index:
            page.hide_viewport = True
            page.hide_render = True
            continue
        page.hide_viewport = False
        page.hide_render = False
        on_left = index < active
        if on_left:
            page.location = (0.0, 0.0, STACK_BASE_Z + left_i * STACK_GAP)
            left_i += 1
        else:
            page.location = (0.0, 0.0, STACK_BASE_Z + right_i * STACK_GAP)
            right_i += 1
        target_side = -1 if on_left else 1
        page.scale.x = 1.0 if target_side == _baked_side(page) else -1.0


def _pose_turning_sheet(turning, progress, direction):
    points = turning_points(progress)
    mesh = turning.data
    if len(mesh.vertices) != len(points):
        return
    for vertex, point in zip(mesh.vertices, points):
        vertex.co = point
    mesh.update()
    turning.scale.x = 1.0 if direction == "next" else -1.0
    turning.location.z = FLIGHT_CLEARANCE + 0.02 * math.sin(math.pi * progress)


def pose_book():
    rig = bpy.data.objects.get("BookRig")
    if rig is None:
        return
    page_count = int(rig.get("page_count", 24))
    active = max(0, min(page_count, int(rig.get("active_page", page_count // 2))))
    progress = clamp(float(rig.get("turn_progress", 0.0)))
    direction = "previous" if rig.get("turn_direction", "next") == "previous" else "next"

    if progress >= 1.0:
        # Fold a finished turn into the counter and reset for the next flip.
        _state["busy"] = True
        try:
            if direction == "next" and active < page_count:
                rig["active_page"] = active + 1
            elif direction == "previous" and active > 0:
                rig["active_page"] = active - 1
            rig["turn_progress"] = 0.0
        finally:
            _state["busy"] = False
        _state["last"] = None
        pose_book()
        return

    flipping_index = None
    if progress > 0.0:
        candidate = active if direction == "next" else active - 1
        if 0 <= candidate < page_count:
            flipping_index = candidate

    pages = [bpy.data.objects.get(f"Page_{i + 1:03d}") for i in range(page_count)]
    _restack(pages, active, flipping_index)

    turning = bpy.data.objects.get("TurningPage")
    if turning is not None:
        in_flight = flipping_index is not None
        turning.hide_viewport = not in_flight
        turning.hide_render = not in_flight
        if in_flight:
            _pose_turning_sheet(turning, progress, direction)


from bpy.app.handlers import persistent  # noqa: E402


@persistent
def weiclaw_book_rig_update(scene, depsgraph=None):
    if _state["busy"]:
        return
    rig = bpy.data.objects.get("BookRig")
    if rig is None:
        return
    snapshot = (
        int(rig.get("page_count", 24)),
        int(rig.get("active_page", 12)),
        round(float(rig.get("turn_progress", 0.0)), 4),
        rig.get("turn_direction", "next"),
    )
    if snapshot == _state["last"]:
        return
    _state["last"] = snapshot
    _state["busy"] = True
    try:
        pose_book()
    finally:
        _state["busy"] = False


def register():
    handlers = bpy.app.handlers.depsgraph_update_post
    for existing in list(handlers):
        if getattr(existing, "__name__", "") == "weiclaw_book_rig_update":
            handlers.remove(existing)
    handlers.append(weiclaw_book_rig_update)
    rig = bpy.data.objects.get("BookRig")
    if rig is not None:
        page_count = int(rig.get("page_count", 24))
        rig.id_properties_ui("active_page").update(
            min=0, max=page_count, description="Pages resting on the left stack"
        )
        rig.id_properties_ui("turn_progress").update(
            min=0.0, max=1.0, description="Drag to flip one page; 1.0 completes the turn"
        )
        rig.id_properties_ui("turn_direction").update(
            description='"next" flips right-to-left, "previous" flips back'
        )
    _state["last"] = None
    pose_book()


register()

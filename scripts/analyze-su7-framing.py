"""Analyze per-frame camera framing of the SU7 drift scene.

Runs inside Blender:
  blender --background design/capabilities/su7-drift.blend \
    --python scripts/analyze-su7-framing.py

Prints, for every frame, the projected screen-space bounds (0..1 across the
frame) of each object group, so we can compute the zoom-out factor that keeps
the whole car (and smoke) inside the frame with a safe margin.
"""

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

GROUPS = {
    "CAR": ("untitled:", "Mer:", "3DWheel", "SM_Disk", "SM_Hub"),
    "SMOKE": ("SMOKE_",),
    "MARK": ("MARK_",),
    "GROUND": ("GROUND", "TOP"),
}


def group_of(name):
    for g, prefixes in GROUPS.items():
        if name.startswith(prefixes):
            return g
    return None


def sample_world_points(obj, stride=7):
    """Evaluated-mesh vertex positions in world space (subsampled)."""
    mesh = obj.to_mesh()
    try:
        mw = obj.matrix_world
        n = len(mesh.vertices)
        flat = [0.0] * (n * 3)
        mesh.vertices.foreach_get("co", flat)
        return [mw @ Vector(flat[i * 3 : i * 3 + 3]) for i in range(0, n, stride)]
    finally:
        obj.to_mesh_clear()


def main():
    scene = bpy.context.scene
    cam = scene.camera

    objs = {}
    for o in bpy.data.objects:
        g = group_of(o.name)
        if g and o.type == "MESH":
            objs[o.name] = g

    worst = {g: [1.0, 0.0, 1.0, 0.0] for g in GROUPS}  # min_x max_x min_y max_y
    per_frame = []
    for f in range(scene.frame_start, scene.frame_end + 1):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        fb = {g: [1.0, 0.0, 1.0, 0.0] for g in GROUPS}
        for name, g in objs.items():
            o = bpy.data.objects[name].evaluated_get(dg)
            if o.hide_render:
                continue
            pts = sample_world_points(o)
            if not pts:
                continue
            for c in pts:
                v = world_to_camera_view(scene, cam, c)
                b = fb[g]
                b[0] = min(b[0], v.x)
                b[1] = max(b[1], v.x)
                b[2] = min(b[2], v.y)
                b[3] = max(b[3], v.y)
        for g in GROUPS:
            w = worst[g]
            b = fb[g]
            w[0] = min(w[0], b[0])
            w[1] = max(w[1], b[1])
            w[2] = min(w[2], b[2])
            w[3] = max(w[3], b[3])
        per_frame.append((f, fb))
        if f % 50 == 0:
            print("frame", f, "done")

    print("=== WORST BOUNDS (min_x max_x min_y max_y) ===")
    for g, w in worst.items():
        print(f"{g}: {w[0]:.4f} {w[1]:.4f} {w[2]:.4f} {w[3]:.4f}")

    print("=== FRAMES WHERE CAR EXITS [0,1] ===")
    for f, fb in per_frame:
        b = fb["CAR"]
        if b[0] < 0 or b[1] > 1 or b[2] < 0 or b[3] > 1:
            print(f"frame {f}: {b[0]:.3f} {b[1]:.3f} {b[2]:.3f} {b[3]:.3f}")

    print("=== REQUIRED ZOOM-OUT FACTOR k (margin m) ===")
    for m in (0.03, 0.05, 0.08):
        for g in ("CAR", "SMOKE"):
            w = worst[g]
            kx = max((w[1] - 0.5), (0.5 - w[0])) / (0.5 - m)
            ky = max((w[3] - 0.5), (0.5 - w[2])) / (0.5 - m)
            print(f"margin {m} {g}: k = {max(kx, ky, 1.0):.4f}")


main()

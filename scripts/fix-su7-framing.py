"""Fix SU7 drift camera framing and re-render the d_/r_ frame sequences.

Runs inside Blender:
  blender --background design/capabilities/su7-drift.blend \
    --python scripts/fix-su7-framing.py -- /tmp/su7-render

What it does:
  1. Zooms the camera out by K (lens /= K) so the car stays fully inside the
     frame for the whole 580-frame timeline. Guarded by a scene custom prop
     so re-running never double-applies the zoom.
  2. Saves the .blend with the new framing.
  3. Renders frames 1..400 as d_001.webp.. and 401..580 as r_001.webp..
     (WEBP RGBA, same resolution/quality as the scene) into the output dir.
"""

import os
import sys

import bpy

K = 1.75  # zoom-out factor: car x-range was [0.066, 1.269], needs ~1.71 @5% margin


def iter_action_fcurves(action):
    """Version-tolerant fcurve iteration (slotted actions in Blender 4.4+)."""
    if hasattr(action, "fcurves"):
        yield from action.fcurves
        return
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                yield from channelbag.fcurves


def apply_zoom(scene):
    if scene.get("su7_zoom_k"):
        print(f"zoom already applied (k={scene['su7_zoom_k']}), skipping")
        return
    cam = scene.camera
    data = cam.data
    animated = False
    if data.animation_data and data.animation_data.action:
        for fc in iter_action_fcurves(data.animation_data.action):
            if fc.data_path == "lens":
                animated = True
                for kp in fc.keyframe_points:
                    kp.co.y /= K
                    kp.handle_left.y /= K
                    kp.handle_right.y /= K
                fc.update()
    if not animated:
        print(f"lens not animated: {data.lens} -> {data.lens / K}")
        data.lens /= K
    else:
        print("scaled animated lens keyframes by 1/K")
    scene["su7_zoom_k"] = K


def render_all(scene, outdir):
    os.makedirs(outdir, exist_ok=True)
    start, end = scene.frame_start, scene.frame_end
    for f in range(start, end + 1):
        scene.frame_set(f)
        if f <= 400:
            name = f"d_{f:03d}.webp"
        else:
            name = f"r_{f - 400:03d}.webp"
        scene.render.filepath = os.path.join(outdir, name)
        bpy.ops.render.render(write_still=True)
        if f % 25 == 0:
            print(f"rendered frame {f}/{end}")


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    outdir = argv[0] if argv else "/tmp/su7-render"
    scene = bpy.context.scene
    apply_zoom(scene)
    bpy.ops.wm.save_mainfile()
    print("blend saved with new framing")
    if "--render" in argv or True:
        render_all(scene, outdir)


main()

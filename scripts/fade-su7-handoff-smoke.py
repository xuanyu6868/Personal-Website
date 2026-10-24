"""Smooth the smoke pop at the d_ -> r_ handoff (frame 400 -> 401).

Runs inside Blender:
  blender --background design/capabilities/su7-drift.blend \
    --python scripts/fade-su7-handoff-smoke.py -- /tmp/su7-render

14 SMOKE sprites hard-hide at frame 401 while still visibly lit, which makes
the dust cloud behind the parked car vanish in a single frame. This script:
  1. Moves those hide keys from 401 to 413.
  2. Extends each sprite's object-color alpha to fade to 0 across 401..412,
     with a slight scale growth so the cloud dissipates instead of freezing.
  3. Re-renders frames 401..412 (r_001.webp .. r_012.webp) into the output
     dir and saves the .blend.
"""

import os
import sys

import bpy

HIDE_FROM = 401
HIDE_TO = 413
FADE_END = 412
GROW = 1.12


def iter_action_fcurves(action):
    if hasattr(action, "fcurves"):
        yield from action.fcurves
        return
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                yield from channelbag.fcurves


def fcurves_of(obj, data_path):
    ad = obj.animation_data
    if not ad or not ad.action:
        return []
    return [fc for fc in iter_action_fcurves(ad.action) if fc.data_path == data_path]


def move_hide_key(fc, src, dst):
    for kp in list(fc.keyframe_points):
        if int(kp.co.x) == src and kp.co.y > 0.5:
            fc.keyframe_points.remove(kp, fast=True)
    kp = fc.keyframe_points.insert(dst, 1.0)
    kp.interpolation = "CONSTANT"
    fc.update()


def add_fade(obj):
    alpha_fcs = [fc for fc in fcurves_of(obj, "color") if fc.array_index == 3]
    if alpha_fcs:
        fc = alpha_fcs[0]
        start_val = fc.evaluate(HIDE_FROM - 1)
    else:
        start_val = obj.color[3]
        fc = None
    if fc is None:
        obj.color[3] = start_val
        obj.keyframe_insert("color", index=3, frame=HIDE_FROM)
        obj.color[3] = 0.0
        obj.keyframe_insert("color", index=3, frame=FADE_END)
        return
    kp = fc.keyframe_points.insert(HIDE_FROM, start_val)
    kp.interpolation = "LINEAR"
    kp = fc.keyframe_points.insert(FADE_END, 0.0)
    kp.interpolation = "LINEAR"
    fc.update()


def add_growth(obj):
    for fc in fcurves_of(obj, "scale"):
        v = fc.evaluate(HIDE_FROM - 1)
        kp = fc.keyframe_points.insert(HIDE_FROM, v)
        kp.interpolation = "LINEAR"
        kp = fc.keyframe_points.insert(FADE_END, v * GROW)
        kp.interpolation = "LINEAR"
        fc.update()


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    outdir = argv[0] if argv else "/tmp/su7-render"
    scene = bpy.context.scene

    if scene.get("su7_handoff_fade"):
        print("handoff fade already applied, skipping edits")
    else:
        touched = []
        for o in bpy.data.objects:
            if not o.name.startswith("SMOKE_"):
                continue
            hide_fcs = fcurves_of(o, "hide_render")
            hides_at_401 = any(
                int(kp.co.x) == HIDE_FROM and kp.co.y > 0.5
                for fc in hide_fcs
                for kp in fc.keyframe_points
            )
            if not hides_at_401:
                continue
            for fc in hide_fcs + fcurves_of(o, "hide_viewport"):
                move_hide_key(fc, HIDE_FROM, HIDE_TO)
            add_fade(o)
            add_growth(o)
            touched.append(o.name)
        print("faded sprites:", touched)
        scene["su7_handoff_fade"] = 1
        bpy.ops.wm.save_mainfile()
        print("blend saved")

    for f in range(HIDE_FROM, HIDE_TO):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(outdir, f"r_{f - 400:03d}.webp")
        bpy.ops.render.render(write_still=True)
        print("re-rendered frame", f)


main()

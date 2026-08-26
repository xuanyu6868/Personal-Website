import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentSource = await readFile(new URL("../components/Portfolio.tsx", import.meta.url), "utf8");
const controllerSource = componentSource.slice(
  componentSource.indexOf("function SceneSnapController"),
  componentSource.indexOf("export default function Portfolio"),
);

test("settles a light wheel gesture onto the adjacent scene", () => {
  assert.match(controllerSource, /const GESTURE_SETTLE_DELAY = 280/);
  assert.match(controllerSource, /let gestureStartScroll = 0/);
  assert.match(controllerSource, /const settleGesture = \(\) =>/);
  assert.match(
    controllerSource,
    /const targetIndex\s*=\s*movement\s*<\s*window\.innerHeight\s*\*\s*LIGHT_GESTURE_MAX[\s\S]*?clampSceneIndex\(startIndex\s*\+\s*direction/,
    "small gestures should advance exactly one scene in their direction",
  );
  assert.doesNotMatch(controllerSource, /if \(magnitude < 8\) return/);
  assert.doesNotMatch(controllerSource, /const GESTURE_MIN = 170/);
});

test("moves upward to the current scene anchor before crossing to the previous scene", () => {
  assert.match(
    controllerSource,
    /const targetIndex = direction < 0 && currentScroll - anchors\[currentIndex\]\.top > 24[\s\S]*?\? currentIndex[\s\S]*?: clampSceneIndex\(currentIndex \+ direction/,
    "an upward gesture inside a scene should not skip that scene's anchor",
  );
});

test("lets a large wheel gesture land on the nearest scene", () => {
  assert.match(
    controllerSource,
    /const targetIndex[\s\S]*?nearestSceneIndex\(window\.scrollY,\s*anchors\)/,
    "large gestures should use the actual final scroll position",
  );
  assert.match(
    controllerSource,
    /window\.setTimeout\(settleGesture,\s*GESTURE_SETTLE_DELAY\)/,
    "snapping should wait until the wheel burst settles",
  );
  assert.match(controllerSource, /settleTimer\s*=\s*window\.setTimeout\(settleGesture/);
  assert.doesNotMatch(controllerSource, /const ENTRY_ZONE = 0\.42/);
});

test("captures a light wheel gesture with a damped animation", () => {
  assert.match(
    controllerSource,
    /const LIGHT_WHEEL_MAX = 48/,
    "mouse-wheel-sized deltas should stay on the browser native scroll path",
  );
  assert.match(controllerSource, /const DAMPING_DURATION = 780/);
  assert.match(controllerSource, /const animateTo = \(targetTop: number\) =>/);
  assert.match(controllerSource, /requestAnimationFrame\(animateFrame\)/);
  assert.match(controllerSource, /event\.preventDefault\(\);[\s\S]*?animateTo\(target\.top\)/);
  assert.match(
    controllerSource,
    /const easedProgress = progress < 0\.5[\s\S]*?4 \* Math\.pow\(progress, 3\)[\s\S]*?1 - Math\.pow\(-2 \* progress \+ 2, 3\) \/ 2/,
  );
});

test("leaves large wheel gestures to native scrolling", () => {
  assert.match(
    controllerSource,
    /if \(magnitude <= LIGHT_WHEEL_MAX && wheelDirection === lightGestureDirection\)[\s\S]*?return;[\s\S]*?gestureDelta \+= delta;[\s\S]*?scheduleSnap\(\);/,
    "large gestures should continue through the native scroll path",
  );
  assert.match(controllerSource, /if \(!nativeGestureActive && magnitude <= LIGHT_WHEEL_MAX\)/);
});

test("does not snap discrete mouse-wheel input after native scrolling", () => {
  assert.match(
    controllerSource,
    /const isDiscreteWheel = \(event: WheelEvent, magnitude: number\) =>/,
    "mouse-wheel input needs an explicit discrete-input classification",
  );
  assert.match(
    controllerSource,
    /if \(isDiscreteWheel\(event, magnitude\)\) \{[\s\S]*?clearLightGestureTimer\(\)[\s\S]*?return;/,
    "discrete mouse wheels should bypass delayed scene snapping",
  );
});

test("does not layer native correction over the damped animation", () => {
  assert.match(
    controllerSource,
    /const onScroll = \(\) => \{\s*if \(animationFrame !== null\) return;/,
    "the legacy correction pass should stay idle while RAF damping is active",
  );
});

test("locks one light swipe against momentum re-triggering another scene", () => {
  assert.match(controllerSource, /const LIGHT_GESTURE_COOLDOWN = 420/);
  assert.match(controllerSource, /let lightGestureLockUntil = 0/);
  assert.match(
    controllerSource,
    /lightGestureLockUntil = Date\.now\(\) \+ DAMPING_DURATION \+ LIGHT_GESTURE_COOLDOWN/,
    "a light swipe should remain locked through its damping tail",
  );
  assert.match(
    controllerSource,
    /if \(now < lightGestureLockUntil\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?return;/,
    "momentum wheel events should not trigger another adjacent-scene jump",
  );
});

test("promotes a locked gesture to native scrolling when its delta grows", () => {
  assert.match(
    controllerSource,
    /if \(now < lightGestureLockUntil\) \{[\s\S]*?if \(magnitude <= LIGHT_WHEEL_MAX && wheelDirection === lightGestureDirection\)[\s\S]*?event\.preventDefault\(\);[\s\S]*?return;[\s\S]*?cancelAnimation\(\);[\s\S]*?lightGestureLockUntil = 0;/,
    "a large continuation should escape the light-gesture lock",
  );
});

test("keeps the full continuation of a large gesture on the native path", () => {
  assert.match(controllerSource, /let nativeGestureActive = false/);
  assert.match(
    controllerSource,
    /if \(nativeGestureActive && now - lastWheelAt > GESTURE_WINDOW\) \{[\s\S]*?nativeGestureActive = false;/,
  );
  assert.match(
    controllerSource,
    /if \(!nativeGestureActive && magnitude <= LIGHT_WHEEL_MAX\)[\s\S]*?return;[\s\S]*?gestureDelta \+= delta;[\s\S]*?scheduleSnap\(\);/,
    "small momentum events after a large delta should not trigger light snapping",
  );
});

test("classifies a light gesture briefly before starting its animation", () => {
  assert.match(controllerSource, /const LIGHT_CLASSIFICATION_DELAY = 90/);
  assert.match(controllerSource, /let lightGestureTimer: number \| null = null/);
  assert.match(
    controllerSource,
    /lightGestureTimer = window\.setTimeout\([\s\S]*?animateTo\(target\.top\)/,
    "light snapping should wait briefly for a possible large continuation",
  );
  assert.match(
    controllerSource,
    /if \(lightGestureTimer !== null\) window\.clearTimeout\(lightGestureTimer\)/,
  );
});

test("allows an opposite-direction swipe to reverse the current transition", () => {
  assert.match(controllerSource, /let lightGestureDirection = 0/);
  assert.match(controllerSource, /lightGestureDirection = Math\.sign\(distance\)/);
  assert.match(
    controllerSource,
    /const wheelDirection = Math\.sign\(delta\)[\s\S]*?magnitude <= LIGHT_WHEEL_MAX && wheelDirection === lightGestureDirection/,
    "only same-direction momentum should remain blocked",
  );
  assert.match(
    controllerSource,
    /wheelDirection !== lightGestureDirection[\s\S]*?lightGestureLockUntil = 0[\s\S]*?cancelAnimation\(\)/,
    "an opposite swipe should release the lock and reverse",
  );
});

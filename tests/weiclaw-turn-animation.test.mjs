import assert from "node:assert/strict";
import test from "node:test";

import {
  animatePaperProgress,
  shouldCompletePaperTurn,
} from "../components/weiclaw/paperTurnAnimation.ts";

function createAnimationHarness() {
  let now = 0;
  let nextId = 0;
  const callbacks = new Map();
  return {
    requestFrame(callback) {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      callbacks.delete(id);
    },
    now: () => now,
    advance(milliseconds) {
      now += milliseconds;
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(now);
    },
    get pending() {
      return callbacks.size;
    },
  };
}

test("continues from the released progress and completes at the target", () => {
  const harness = createAnimationHarness();
  const values = [];
  let completed = 0;
  animatePaperProgress({
    from: 0.42,
    to: 1,
    duration: 400,
    reducedMotion: false,
    requestFrame: harness.requestFrame,
    cancelFrame: harness.cancelFrame,
    now: harness.now,
    onUpdate: (value) => values.push(value),
    onComplete: () => { completed += 1; },
  });

  harness.advance(200);
  assert.ok(values[0] > 0.42 && values[0] < 1);
  harness.advance(200);
  assert.equal(values.at(-1), 1);
  assert.equal(completed, 1);
  assert.equal(harness.pending, 0);
});

test("finishes immediately when reduced motion is requested", () => {
  const harness = createAnimationHarness();
  const values = [];
  let completed = 0;
  animatePaperProgress({
    from: 0.2,
    to: 0,
    duration: 300,
    reducedMotion: true,
    requestFrame: harness.requestFrame,
    cancelFrame: harness.cancelFrame,
    now: harness.now,
    onUpdate: (value) => values.push(value),
    onComplete: () => { completed += 1; },
  });

  assert.deepEqual(values, [0]);
  assert.equal(completed, 1);
  assert.equal(harness.pending, 0);
});

test("cancellation prevents later updates and completion", () => {
  const harness = createAnimationHarness();
  const values = [];
  let completed = 0;
  const animation = animatePaperProgress({
    from: 0,
    to: 1,
    duration: 300,
    reducedMotion: false,
    requestFrame: harness.requestFrame,
    cancelFrame: harness.cancelFrame,
    now: harness.now,
    onUpdate: (value) => values.push(value),
    onComplete: () => { completed += 1; },
  });

  animation.cancel();
  harness.advance(500);
  assert.deepEqual(values, []);
  assert.equal(completed, 0);
});

test("completes on either sufficient distance or an intentional flick", () => {
  assert.equal(shouldCompletePaperTurn(0.29, 0), true);
  assert.equal(shouldCompletePaperTurn(0.12, 0.48), true);
  assert.equal(shouldCompletePaperTurn(0.12, 0.08), false);
  assert.equal(shouldCompletePaperTurn(0.27, -0.5), false);
});

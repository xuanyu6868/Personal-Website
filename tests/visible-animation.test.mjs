import assert from "node:assert/strict";
import test from "node:test";
import { createVisibleAnimation } from "../components/weiclaw-preview/visibleAnimation.ts";

function harness() {
  let time = 0, id = 0;
  const pending = new Map(), ticks = [], resumes = [];
  const loop = createVisibleAnimation({
    request: (callback) => { pending.set(++id, callback); return id; },
    cancel: (handle) => pending.delete(handle),
    now: () => time,
    tick: (timestamp) => ticks.push(timestamp),
    resume: (duration) => resumes.push(duration),
  });
  const advance = (timestamp) => {
    time = timestamp;
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach((callback) => callback(timestamp));
  };
  return { loop, pending, ticks, resumes, advance, setTime: (value) => { time = value; } };
}

test("renders only when the scene and the page are visible", () => {
  const { loop, pending, ticks, resumes, advance, setTime } = harness();
  assert.equal(pending.size, 0);
  loop.setVisible(true);
  advance(16);
  assert.deepEqual(ticks, [16]);
  setTime(25);
  loop.setVisible(false);
  assert.equal(pending.size, 0);
  advance(100);
  assert.deepEqual(ticks, [16]);
  loop.setVisible(true);
  assert.deepEqual(resumes, [0, 75]);
  advance(116);
  loop.setPageVisible(false);
  assert.equal(pending.size, 0);
  loop.setVisible(false);
  loop.setPageVisible(true);
  assert.equal(pending.size, 0);
  loop.setVisible(true);
  advance(200);
  assert.deepEqual(ticks, [16, 116, 200]);
  loop.destroy();
  assert.equal(pending.size, 0);
  loop.setVisible(true);
  assert.equal(pending.size, 0);
});

test("repeated visibility notifications never schedule duplicate frames", () => {
  const { loop, pending, advance } = harness();
  loop.setVisible(true);
  loop.setVisible(true);
  loop.setPageVisible(true);
  assert.equal(pending.size, 1);
  advance(16);
  assert.equal(pending.size, 1);
  loop.destroy();
});

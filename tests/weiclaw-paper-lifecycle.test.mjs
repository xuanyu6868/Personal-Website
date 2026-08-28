import assert from "node:assert/strict";
import test from "node:test";

import {
  createPaperTexturePreloadRequests,
  createPaperTextureRequests,
} from "../components/weiclaw/paperTextureRequests.ts";
import { createPaperRenderScheduler } from "../components/weiclaw/paperRenderScheduler.ts";
import { weiclawBookPages } from "../data/weiclaw-book.ts";

function createFrameHarness() {
  const callbacks = new Map();
  const cancelled = [];
  let cursor = 0;
  return {
    request(callback) {
      const id = ++cursor;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) {
      cancelled.push(id);
      callbacks.delete(id);
    },
    flush() {
      const entries = [...callbacks.entries()];
      callbacks.clear();
      for (const [, callback] of entries) callback(16.7);
    },
    get pending() {
      return callbacks.size;
    },
    cancelled,
  };
}

test("coalesces repeated updates into one requested frame", () => {
  const frames = createFrameHarness();
  let renders = 0;
  const scheduler = createPaperRenderScheduler({
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
    render: () => { renders += 1; },
  });

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(frames.pending, 1);
  frames.flush();
  assert.equal(renders, 1);
  assert.equal(frames.pending, 0);
});

test("pauses offscreen and renders the latest state once visible", () => {
  const frames = createFrameHarness();
  const rendered = [];
  let value = 1;
  const scheduler = createPaperRenderScheduler({
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
    render: () => rendered.push(value),
  });

  scheduler.setVisible(false);
  scheduler.schedule();
  value = 2;
  assert.equal(frames.pending, 0);
  scheduler.setVisible(true);
  frames.flush();
  assert.deepEqual(rendered, [2]);
});

test("cancels a pending frame and rejects new work after disposal", () => {
  const frames = createFrameHarness();
  let renders = 0;
  const scheduler = createPaperRenderScheduler({
    requestFrame: frames.request,
    cancelFrame: frames.cancel,
    render: () => { renders += 1; },
  });

  scheduler.schedule();
  scheduler.dispose();
  scheduler.schedule();
  frames.flush();
  assert.equal(renders, 0);
  assert.deepEqual(frames.cancelled, [1]);
});

test("builds all five renderer texture roles and preserves blank boundary pages", () => {
  const requests = createPaperTextureRequests({
    leftPage: weiclawBookPages[4],
    rightPage: null,
    underPage: weiclawBookPages[4],
    turningFrontPage: null,
    turningBackPage: weiclawBookPages[3],
    direction: "next",
  });

  assert.deepEqual(requests.map((request) => request.role), [
    "left",
    "right",
    "under",
    "turningFront",
    "turningBack",
  ]);
  assert.equal(requests[0].side, "left");
  assert.equal(requests[1].page, null);
  assert.equal(requests[3].page, null);
  assert.equal(requests[4].side, "left");
});

test("preloads every editorial page on its physical book side before interaction", () => {
  const requests = createPaperTexturePreloadRequests(weiclawBookPages);

  assert.deepEqual(requests.map((request) => `${request.page?.id ?? "blank"}:${request.side}`), [
    "dashboard:left",
    "chat:right",
    "customer:left",
    "agent:right",
    "settings:left",
    "blank:left",
    "blank:right",
  ]);
});

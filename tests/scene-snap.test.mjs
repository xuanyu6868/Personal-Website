import assert from "node:assert/strict";
import test from "node:test";
import { nearbySceneTarget, preferSharpFrame } from "../lib/scroll-behavior.ts";
import { installSceneScrollController } from "../lib/scene-scroll-controller.ts";

function createHarness() {
  let now = 0, nextId = 0;
  const listeners = new Map(), timers = new Map(), frames = new Map();
  class Element {
    constructor({ overflowY = "visible", scrollHeight = 0, clientHeight = 0, dialog = false } = {}) {
      Object.assign(this, { overflowY, scrollHeight, clientHeight, dialog });
    }
    matches() { return this.dialog; }
  }
  const body = new Element();
  body.dataset = {};
  const documentElement = new Element({ scrollHeight: 4000, clientHeight: 1000 });
  let anchorTops = [0, 1000, 2000, 3000];
  const win = {
    HTMLElement: Element,
    innerHeight: 1000,
    scrollY: 0,
    performance: { now: () => now },
    getComputedStyle: (element) => ({ overflowY: element.overflowY }),
    addEventListener: (name, fn, options) => listeners.set(name, { fn, options }),
    removeEventListener: (name) => listeners.delete(name),
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, due: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    scrollTo: ({ top }) => { win.scrollY = top; listeners.get("scroll")?.fn(); },
  };
  const doc = { body, documentElement, hidden: false, querySelectorAll: () => anchorTops.map((top) => ({ getBoundingClientRect: () => ({ top: top - win.scrollY }) })) };
  const stop = installSceneScrollController(win, doc);
  const wheel = (overrides = {}) => {
    const event = { deltaX: 0, deltaY: 12, ctrlKey: false, composedPath: () => [body], preventDefault: () => { throw Error("native wheel was blocked"); }, stopPropagation: () => { throw Error("wheel propagation was blocked"); }, ...overrides };
    listeners.get("wheel").fn(event);
  };
  const scrollTo = (top) => { win.scrollY = top; listeners.get("scroll").fn(); };
  const advance = (ms) => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); }
  };
  const render = (ms) => {
    now += ms;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((fn) => fn(now));
  };
  return { win, doc, Element, listeners, timers, frames, wheel, scrollTo, advance, render, stop, setAnchors: (value) => { anchorTops = value; } };
}

test("only aligns when close to a scene edge", () => {
  assert.equal(nearbySceneTarget(850, [0, 1000, 2000], 1000, 2000), 1000);
  assert.equal(nearbySceneTarget(500, [0, 1000, 2000], 1000, 2000), null);
  assert.equal(nearbySceneTarget(998, [0, 1000], 1000, 2000), null);
  assert.equal(nearbySceneTarget(0, [], 1000, 2000), null);
  assert.equal(nearbySceneTarget(1880, [0, 2300], 1000, 1900), 1900);
});

test("small position adjustments remain in place after the gesture ends", () => {
  const h = createHarness();
  assert.equal(h.listeners.get("wheel").options.passive, true);
  h.wheel(); h.scrollTo(30); h.advance(179);
  assert.equal(h.win.scrollY, 30);
  assert.equal(h.frames.size, 0);
  h.advance(1); assert.equal(h.frames.size, 0);
  assert.equal(h.win.scrollY, 30);
  h.stop();
});

test("meaningful gestures align gently near an edge after settling", () => {
  const h = createHarness();
  h.wheel(); h.scrollTo(850); h.advance(179);
  assert.equal(h.win.scrollY, 850);
  assert.equal(h.frames.size, 0);
  h.advance(1); assert.equal(h.frames.size, 1);
  h.render(400); assert.equal(h.win.scrollY, 1000);
  h.stop();
});

test("a mid-page pause does not force the next or previous scene", () => {
  const h = createHarness();
  h.wheel(); h.scrollTo(500); h.advance(180);
  assert.equal(h.win.scrollY, 500);
  assert.equal(h.frames.size, 0);
  h.stop();
});

test("continuous and reversed input immediately cancel a landing", () => {
  const h = createHarness();
  h.wheel(); h.scrollTo(850); h.advance(180); h.render(40);
  assert.equal(h.frames.size, 1);
  h.wheel({ deltaY: -16 });
  assert.equal(h.frames.size, 0);
  h.scrollTo(700); h.advance(180);
  assert.equal(h.win.scrollY, 700);
  assert.equal(h.frames.size, 0);
  h.stop();
});

test("nested scrollers, dialogs and horizontal gestures are left alone", () => {
  const h = createHarness();
  const nested = new h.Element({ overflowY: "auto", scrollHeight: 500, clientHeight: 100 });
  h.wheel({ composedPath: () => [nested, h.doc.body] });
  h.scrollTo(850); h.advance(180); assert.equal(h.frames.size, 0);
  h.wheel({ deltaX: 20, deltaY: 2 }); h.advance(180); assert.equal(h.frames.size, 0);
  h.doc.body.dataset.overlayOpen = "true";
  h.wheel(); h.advance(180); assert.equal(h.frames.size, 0);
  h.stop();
});

test("uses current scene positions after asynchronous layout changes", () => {
  const h = createHarness();
  h.wheel(); h.scrollTo(1020); h.setAnchors([0, 1050, 2050]); h.advance(180); h.render(400);
  assert.equal(h.win.scrollY, 1050);
  h.stop();
});

test("uses sharp nearby frames during fast scrolling without showing distant frames", () => {
  assert.equal(preferSharpFrame(100, 98, true), true);
  assert.equal(preferSharpFrame(100, 96, true), false);
  assert.equal(preferSharpFrame(100, null, true), false);
  assert.equal(preferSharpFrame(100, 90, false), true);
});

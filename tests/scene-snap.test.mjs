import assert from "node:assert/strict";
import test from "node:test";
import { adjacentSceneTarget, nearestSceneTarget, preferSharpFrame } from "../lib/scroll-behavior.ts";
import { installSceneScrollController } from "../lib/scene-scroll-controller.ts";

function createHarness() {
  let now = 0, nextId = 0;
  const listeners = new Map(), timers = new Map(), frames = new Map();
  class Element {
    constructor({ overflowY = "visible", scrollHeight = 0, clientHeight = 0, dialog = false } = {}) { Object.assign(this, { overflowY, scrollHeight, clientHeight, dialog }); }
    matches() { return this.dialog; }
  }
  const body = new Element(); body.dataset = {};
  const documentElement = new Element({ scrollHeight: 4000, clientHeight: 1000 });
  let anchorTops = [0, 1000, 2000, 3000];
  const win = {
    HTMLElement: Element, innerHeight: 1000, scrollY: 0, performance: { now: () => now },
    getComputedStyle: (element) => ({ overflowY: element.overflowY }),
    addEventListener: (name, fn, options) => listeners.set(name, { fn, options }),
    removeEventListener: (name) => listeners.delete(name),
    setTimeout: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, due: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    scrollTo: ({ top }) => { win.scrollY = Math.max(0, Math.min(3000, top)); listeners.get("scroll")?.fn(); },
  };
  const doc = { body, documentElement, hidden: false, querySelectorAll: () => anchorTops.map((top) => ({ getBoundingClientRect: () => ({ top: top - win.scrollY }) })) };
  const stop = installSceneScrollController(win, doc);
  const wheel = (overrides = {}) => {
    let prevented = false;
    const event = { deltaX: 0, deltaY: 12, deltaMode: 0, cancelable: true, ctrlKey: false, composedPath: () => [body], preventDefault: () => { prevented = true; }, ...overrides };
    listeners.get("wheel").fn(event);
    if (!prevented) win.scrollTo({ top: win.scrollY + event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 1000 : 1) });
    return prevented;
  };
  const scrollTo = (top) => win.scrollTo({ top });
  const advance = (ms) => { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); } };
  const render = (ms) => { now += ms; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn(now)); };
  return { win, doc, Element, listeners, timers, frames, wheel, scrollTo, advance, render, stop, setAnchors: (value) => { anchorTops = value; } };
}

test("finds adjacent scenes in the intended direction and clamps page edges", () => {
  assert.equal(adjacentSceneTarget(0, [0, 1000, 2000, 4000], 1, 3000), 1000);
  assert.equal(adjacentSceneTarget(1300, [0, 1000, 2000], 1, 3000), 2000);
  assert.equal(adjacentSceneTarget(1300, [0, 1000, 2000], -1, 3000), 1000);
  assert.equal(adjacentSceneTarget(3000, [0, 1000, 4000], 1, 3000), null);
});

test("a gentle gesture moves exactly one scene and suppresses its momentum", () => {
  const h = createHarness();
  assert.equal(h.listeners.get("wheel").options.passive, false);
  assert.equal(h.wheel({ deltaY: 8 }), true); h.advance(70); h.render(60);
  assert.equal(h.wheel({ deltaY: 5 }), true); h.render(600);
  assert.equal(h.win.scrollY, 1000); assert.equal(h.frames.size, 0); h.stop();
});

test("a mouse wheel notch goes to the adjacent scene", () => {
  for (const event of [{ deltaY: 100, deltaMode: 0 }, { deltaY: 3, deltaMode: 1 }]) {
    const h = createHarness(); assert.equal(h.wheel(event), true); h.advance(70); h.render(600);
    assert.equal(h.win.scrollY, 1000); h.stop();
  }
});

test("a small fractional trackpad gesture still advances one scene", () => {
  const h = createHarness();
  assert.equal(h.wheel({ deltaY: 0.5 }), true);
  h.advance(70); h.render(600);
  assert.equal(h.win.scrollY, 1000);
  h.stop();
});

test("a fast gesture remains free and settles to the nearest scene even from the middle", () => {
  const h = createHarness(); assert.equal(h.wheel({ deltaY: 80 }), false);
  h.scrollTo(1550); h.advance(219); assert.equal(h.frames.size, 0);
  h.advance(1); h.render(600); assert.equal(h.win.scrollY, 2000); h.stop();
});

test("acceleration during classification releases the earlier deltas to native scrolling", () => {
  const h = createHarness(); assert.equal(h.wheel({ deltaY: 30 }), true); h.advance(20);
  assert.equal(h.wheel({ deltaY: 40 }), true); h.advance(20);
  assert.equal(h.wheel({ deltaY: 50 }), false); assert.equal(h.win.scrollY, 120);
  h.scrollTo(1430); h.advance(220); h.render(600); assert.equal(h.win.scrollY, 1000); h.stop();
});

test("a fast continuation can interrupt a light scene transition", () => {
  const h = createHarness(); h.wheel({ deltaY: 8 }); h.advance(70); h.render(60);
  assert.equal(h.frames.size, 1); const before = h.win.scrollY;
  assert.equal(h.wheel({ deltaY: 80 }), false); assert.equal(h.frames.size, 0);
  assert.ok(h.win.scrollY > before); h.scrollTo(1600); h.advance(220); h.render(600);
  assert.equal(h.win.scrollY, 2000); h.stop();
});

test("opposite direction interrupts a light transition immediately", () => {
  const h = createHarness(); h.wheel({ deltaY: 8 }); h.advance(70); h.render(90);
  assert.ok(h.win.scrollY > 3); assert.equal(h.wheel({ deltaY: -8 }), true);
  assert.equal(h.frames.size, 0); h.advance(70); h.render(600);
  assert.equal(h.win.scrollY, 0); h.stop();
});

test("a separate same-direction mouse notch can advance again without a fixed cooldown", () => {
  const h = createHarness(); h.wheel({ deltaY: 100 }); h.advance(70); h.render(40);
  h.advance(70); assert.equal(h.wheel({ deltaY: 100 }), true); h.advance(70); h.render(700);
  assert.equal(h.win.scrollY, 2000); h.stop();
});

test("nested scrollers, dialogs and horizontal gestures remain native", () => {
  const h = createHarness(); const nested = new h.Element({ overflowY: "auto", scrollHeight: 500, clientHeight: 100 });
  assert.equal(h.wheel({ composedPath: () => [nested, h.doc.body] }), false);
  assert.equal(h.wheel({ deltaX: 20, deltaY: 2 }), false);
  h.doc.body.dataset.overlayOpen = "true"; assert.equal(h.wheel(), false);
  h.advance(500); assert.equal(h.frames.size, 0); h.stop();
});

test("uses current scene positions after asynchronous layout changes", () => {
  const h = createHarness(); h.wheel({ deltaY: 80 }); h.scrollTo(1500); h.setAnchors([0, 1100, 2050]);
  h.advance(220); h.render(600); assert.equal(h.win.scrollY, 1100); h.stop();
});

test("nearest alignment and high-resolution frame selection", () => {
  assert.equal(nearestSceneTarget(1450, [0, 1000, 2000], 2000), 1000);
  assert.equal(nearestSceneTarget(1550, [0, 1000, 2000], 2000), 2000);
  assert.equal(nearestSceneTarget(1000, [0, 1000], 2000), null);
  assert.equal(preferSharpFrame(100, 98, true), true);
  assert.equal(preferSharpFrame(100, 96, true), false);
});

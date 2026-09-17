import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TURN_FRAME_COUNT,
  resolveActiveTurn,
  resolveTurnFrame,
} from "../components/weiclaw/sequenceTurn.ts";

test("shows the resting book when no page is turning", () => {
  assert.deepEqual(resolveActiveTurn({
    direction: null,
    hoverDirection: null,
    hoverLift: 0,
    progress: 0,
    reducedMotion: false,
  }), { direction: null, hoverTurn: false, progress: 0 });
  assert.equal(resolveTurnFrame({
    direction: null,
    hoverDirection: null,
    hoverLift: 0,
    progress: 0,
    reducedMotion: false,
  }), 0);
});

test("lets an active drag override the edge hover lift", () => {
  assert.deepEqual(resolveActiveTurn({
    direction: "next",
    hoverDirection: "previous",
    hoverLift: 1,
    progress: 0.42,
    reducedMotion: false,
  }), { direction: "next", hoverTurn: false, progress: 0.42 });
  assert.equal(resolveTurnFrame({
    direction: "next",
    hoverDirection: "previous",
    hoverLift: 1,
    progress: 0.42,
    reducedMotion: false,
  }), Math.round(0.42 * (TURN_FRAME_COUNT - 1)));
});

test("renders a restrained corner lift when the reader approaches a page edge", () => {
  assert.deepEqual(resolveActiveTurn({
    direction: null,
    hoverDirection: "next",
    hoverLift: 1,
    progress: 0,
    reducedMotion: false,
  }), { direction: "next", hoverTurn: true, progress: 0.105 });

  assert.equal(resolveActiveTurn({
    direction: null,
    hoverDirection: "next",
    hoverLift: 1,
    progress: 0,
    reducedMotion: true,
  }).direction, null);

  assert.equal(resolveActiveTurn({
    direction: null,
    hoverDirection: "next",
    hoverLift: 0,
    progress: 0,
    reducedMotion: false,
  }).direction, null);
});

test("clamps drag progress into the unit interval", () => {
  assert.equal(resolveActiveTurn({
    direction: "previous",
    hoverDirection: null,
    hoverLift: 0,
    progress: 1.4,
    reducedMotion: false,
  }).progress, 1);
});

test("maps progress onto bounded sequence frame indexes", () => {
  const frame = (progress) => resolveTurnFrame({
    direction: "next",
    hoverDirection: null,
    hoverLift: 0,
    progress,
    reducedMotion: false,
  });
  assert.equal(frame(0), 0);
  assert.equal(frame(1), TURN_FRAME_COUNT - 1);
  assert.equal(frame(0.5), Math.round((TURN_FRAME_COUNT - 1) / 2));
  assert.ok(frame(0.73) <= TURN_FRAME_COUNT - 1);
});

test("ships a complete prerendered turn sequence", async () => {
  const { readdir } = await import("node:fs/promises");
  const dir = new URL("../public/sequence/weiclaw-turn/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".webp")).sort();
  assert.equal(files.length, TURN_FRAME_COUNT);
  assert.equal(files[0], "frame-0000.webp");
  assert.equal(files[files.length - 1], `frame-${String(TURN_FRAME_COUNT - 1).padStart(4, "0")}.webp`);
});

test("player canvas sits under the DOM spread and fades in when ready", async () => {
  const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(stylesheet, /\.weiclaw-book__canvas\s*\{[^}]*z-index:1/);
  assert.match(stylesheet, /\.weiclaw-book__canvas\s*\{[^}]*opacity:0/);
  assert.match(stylesheet, /\.weiclaw-book\.is-sequence-ready\s+\.weiclaw-book__canvas\s*\{[^}]*opacity:1/);
  assert.doesNotMatch(stylesheet, /\.weiclaw-book\.is-mesh-ready/);
});

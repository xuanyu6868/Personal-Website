import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaperDrawPlan,
  createPaperViewProjection,
  getPaperMeshResolution,
} from "../components/weiclaw/webglPaperRenderer.ts";

test("orders receiver pages before the shadow and moving sheet surfaces", () => {
  const next = buildPaperDrawPlan({ direction: "next" });
  assert.deepEqual(next, [
    { kind: "paper", side: "left", texture: "left" },
    { kind: "paper", side: "right", texture: "under" },
    { kind: "shadow" },
    { kind: "turning", face: "back", texture: "turningBack" },
    { kind: "turning", face: "front", texture: "turningFront" },
    { kind: "edge" },
  ]);

  const previous = buildPaperDrawPlan({ direction: "previous" });
  assert.deepEqual(previous.slice(0, 2), [
    { kind: "paper", side: "left", texture: "under" },
    { kind: "paper", side: "right", texture: "right" },
  ]);
});

test("draws only the settled spread when no page is turning", () => {
  assert.deepEqual(buildPaperDrawPlan({ direction: null }), [
    { kind: "paper", side: "left", texture: "left" },
    { kind: "paper", side: "right", texture: "right" },
  ]);
});

test("uses the bounded desktop and narrow mesh resolutions", () => {
  assert.deepEqual(getPaperMeshResolution(1165), { columns: 40, rows: 16 });
  assert.deepEqual(getPaperMeshResolution(560), { columns: 24, rows: 10 });
});

test("creates a finite perspective matrix that changes with aspect ratio", () => {
  const wide = createPaperViewProjection(1.58);
  const tall = createPaperViewProjection(1.1);

  assert.equal(wide.length, 16);
  assert.ok(Array.from(wide).every(Number.isFinite));
  assert.notDeepEqual(Array.from(wide), Array.from(tall));
  assert.ok(wide[0] < tall[0], "wide view should require less horizontal magnification");
});

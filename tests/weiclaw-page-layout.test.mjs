import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPrintTone,
  buildPageTexturePlan,
} from "../components/weiclaw/createPageTexture.ts";
import { resolvePagePrintLayout } from "../components/weiclaw/pageTextureLayout.ts";
import { weiclawBookPages } from "../data/weiclaw-book.ts";

const expectedLayouts = [
  "dashboard-bleed",
  "chat-column",
  "customer-dominant",
  "agent-details",
  "settings-wide",
];

test("assigns a distinct editorial layout to every real page", () => {
  assert.deepEqual(weiclawBookPages.map((page) => page.layout), expectedLayouts);
  assert.equal(new Set(weiclawBookPages.map((page) => page.layout)).size, 5);
  for (const page of weiclawBookPages) {
    assert.match(page.image, /^\/images\/weiclaw\/pages\/.+\.png$/);
  }
});

test("keeps normalized print rectangles inside the controlled bleed area", () => {
  for (const page of weiclawBookPages) {
    for (const side of ["left", "right"]) {
      const layout = resolvePagePrintLayout(page, side);
      const rectangles = [layout.header, layout.image, layout.note, ...(layout.detailImages ?? [])];
      for (const rectangle of rectangles) {
        assert.ok(rectangle.x >= -0.08 && rectangle.y >= -0.08, `${page.id} starts beyond bleed`);
        assert.ok(rectangle.x + rectangle.width <= 1.08, `${page.id} exceeds horizontal bleed`);
        assert.ok(rectangle.y + rectangle.height <= 1.08, `${page.id} exceeds vertical bleed`);
        assert.ok(rectangle.width > 0 && rectangle.height > 0, `${page.id} has an empty rectangle`);
      }
    }
  }
});

test("mirrors page-safe margins without changing editorial proportions", () => {
  const page = weiclawBookPages[0];
  const left = resolvePagePrintLayout(page, "left");
  const right = resolvePagePrintLayout(page, "right");

  assert.ok(left.header.x > right.header.x, "left page needs a larger outer-left safe margin");
  assert.equal(left.image.width, right.image.width);
  assert.equal(left.image.height, right.image.height);
});

test("plans paper, copy, real artwork, note, and folio as one printed surface", () => {
  const page = weiclawBookPages[0];
  const plan = buildPageTexturePlan(page, "left");

  assert.deepEqual(plan.map((command) => command.kind), [
    "paper",
    "number",
    "type",
    "title",
    "description",
    "image",
    "note",
    "folio",
  ]);
  const image = plan.find((command) => command.kind === "image");
  assert.equal(image.source, "/images/weiclaw/pages/dashboard.png");
  assert.deepEqual(image.crop, { x: 0, y: 0.04, width: 1, height: 0.92 });
  assert.ok(image.destination.width > 0.9, "dashboard artwork should bleed toward the outer edge");
});

test("prints an agent detail crop from the same real screenshot", () => {
  const page = weiclawBookPages.find((candidate) => candidate.id === "agent");
  const images = buildPageTexturePlan(page, "right").filter((command) => command.kind === "image");

  assert.equal(images.length, 2);
  assert.ok(images.every((image) => image.source === "/images/weiclaw/pages/agent.png"));
  assert.deepEqual(images[1].crop, { x: 0.48, y: 0.08, width: 0.42, height: 0.48 });
});

test("warms printed pixels deterministically without changing alpha", () => {
  const original = new Uint8ClampedArray([80, 120, 180, 77, 220, 210, 200, 199]);
  const toned = applyPrintTone(original);

  assert.deepEqual(Array.from(original), [80, 120, 180, 77, 220, 210, 200, 199]);
  assert.equal(toned[3], 77);
  assert.equal(toned[7], 199);
  assert.notDeepEqual(Array.from(toned.slice(0, 3)), [80, 120, 180]);
  assert.deepEqual(Array.from(applyPrintTone(original)), Array.from(toned));
});

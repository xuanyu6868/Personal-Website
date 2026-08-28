import assert from "node:assert/strict";
import test from "node:test";

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

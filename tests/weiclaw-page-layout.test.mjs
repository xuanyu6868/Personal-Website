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
  assert.deepEqual(image.crop, { x: 0.05, y: 0.06, width: 0.92, height: 0.82 });
  assert.ok(image.destination.x >= 0.1, "dashboard artwork should start inside the paper field");
  assert.ok(image.destination.width <= 0.88, "dashboard artwork should leave a deliberate outer margin");
});

test("prints an agent detail crop from the same real screenshot", () => {
  const page = weiclawBookPages.find((candidate) => candidate.id === "agent");
  const images = buildPageTexturePlan(page, "right").filter((command) => command.kind === "image");

  assert.equal(images.length, 2);
  assert.ok(images.every((image) => image.source === "/images/weiclaw/pages/agent.png"));
  assert.deepEqual(images[0].crop, { x: 0.14, y: 0.17, width: 0.36, height: 0.5 });
  assert.deepEqual(images[1].crop, { x: 0.46, y: 0.16, width: 0.48, height: 0.38 });
  assert.ok(images[0].destination.width < 0.5, "agent overview should read as a focused printed fragment");
  assert.ok(images[1].destination.x > images[0].destination.x + images[0].destination.width);
});

test("splits customer management into an asymmetric editorial pair", () => {
  const page = weiclawBookPages.find((candidate) => candidate.id === "customer");
  const images = buildPageTexturePlan(page, "left").filter((command) => command.kind === "image");

  assert.equal(images.length, 2);
  assert.ok(images[0].destination.width <= 0.64);
  assert.ok(images[1].destination.x >= 0.5);
  assert.notEqual(images[0].destination.y, images[1].destination.y);
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

test("pulls near-white interface pixels into the warm paper range", () => {
  const toned = applyPrintTone(new Uint8ClampedArray([252, 252, 252, 255]));

  assert.ok(toned[0] <= 244, `red channel stayed too digital: ${toned[0]}`);
  assert.ok(toned[1] <= 239, `green channel stayed too digital: ${toned[1]}`);
  assert.ok(toned[2] <= 229, `blue channel stayed too digital: ${toned[2]}`);
  assert.ok(toned[0] > toned[2] + 8, "paper whites should retain a warm printed cast");
});

test("gives the chat artwork an intentional editorial inset", () => {
  const chat = weiclawBookPages.find((page) => page.id === "chat");
  const image = buildPageTexturePlan(chat, "right").find((command) => command.kind === "image");

  assert.ok(image.destination.width <= 0.68, "chat artwork should not read as a full-page UI panel");
  assert.ok(image.destination.x + image.destination.width <= 0.88, "chat artwork needs breathing room at the fore edge");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPrintTone,
  buildPageTexturePlan,
  createPageTexture,
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
  assert.ok(image.destination.x < 0, "dashboard artwork should intentionally bleed beyond the outer paper edge");
  assert.ok(image.destination.width > 1, "dashboard artwork should establish a full-width editorial field");
  assert.ok(image.destination.y >= 0.34, "dashboard title band should remain distinct above the bleed");
  assert.ok(image.destination.y + image.destination.height <= 0.94, "dashboard bleed should preserve the printed folio");
});

test("prints an agent detail crop from the same real screenshot", () => {
  const page = weiclawBookPages.find((candidate) => candidate.id === "agent");
  const images = buildPageTexturePlan(page, "right").filter((command) => command.kind === "image");

  assert.equal(images.length, 2);
  assert.ok(images.every((image) => image.source === "/images/weiclaw/pages/agent.png"));
  assert.deepEqual(images[0].crop, { x: 0.16, y: 0.22, width: 0.27, height: 0.35 });
  assert.deepEqual(images[1].crop, { x: 0.43, y: 0.22, width: 0.37, height: 0.35 });
  assert.ok(images[0].destination.width < 0.5, "agent overview should read as a focused printed fragment");
  assert.ok(images[0].destination.height >= 0.43, "AI status should be enlarged enough to read");
  assert.ok(images[1].destination.width >= 0.68, "workflow should be the dominant editorial crop");
});

test("splits customer management into an asymmetric editorial pair", () => {
  const page = weiclawBookPages.find((candidate) => candidate.id === "customer");
  const images = buildPageTexturePlan(page, "left").filter((command) => command.kind === "image");

  assert.equal(images.length, 2);
  assert.deepEqual(images[0].crop, { x: 0.13, y: 0.08, width: 0.2, height: 0.84 });
  assert.deepEqual(images[1].crop, { x: 0.35, y: 0.22, width: 0.3, height: 0.64 });
  assert.ok(images[0].destination.width <= 0.42, "customer list should read as a deliberate column crop");
  assert.ok(images[1].destination.x >= 0.4, "customer detail should be separated from the list crop");
  assert.ok(images[1].destination.width >= 0.54, "customer detail should be enlarged rather than showing a tiny dashboard overview");
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

test("preserves printed black and midtone detail while tinting only light UI surfaces", () => {
  const dark = [20, 24, 28, 255];
  const midtone = [128, 140, 160, 255];
  const tonedDark = Array.from(applyPrintTone(new Uint8ClampedArray(dark)));
  const tonedMidtone = Array.from(applyPrintTone(new Uint8ClampedArray(midtone)));

  assert.ok(tonedDark.slice(0, 3).every((channel, index) => Math.abs(channel - dark[index]) <= 3), "black UI details should remain solid");
  assert.ok(tonedMidtone.slice(0, 3).every((channel, index) => Math.abs(channel - midtone[index]) <= 4), "midtone borders and labels should remain readable");
});

test("renders default page textures at a print-safe raster resolution", async () => {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const gradient = { addColorStop() {} };
  const sampledCanvases = [];
  let imageCreations = 0;
  const makeCanvas = () => {
    const canvas = { width: 0, height: 0 };
    const context = {
      scale() {}, save() {}, restore() {}, fillRect() {}, drawImage() {}, translate() {}, rotate() {}, fillText() {}, putImageData() {},
      measureText(text) { return { width: text.length * 12 }; },
      createRadialGradient() { return gradient; },
      createLinearGradient() { return gradient; },
      getImageData() {
        sampledCanvases.push([canvas.width, canvas.height]);
        return { data: new Uint8ClampedArray(canvas.width * canvas.height * 4) };
      },
    };
    canvas.getContext = () => context;
    return canvas;
  };
  class FakeImage {
    constructor() { imageCreations += 1; }
    naturalWidth = 1586;
    naturalHeight = 992;
    async decode() {}
  }

  globalThis.document = { fonts: { ready: Promise.resolve() }, createElement: () => makeCanvas() };
  globalThis.Image = FakeImage;
  try {
    const canvas = await createPageTexture(weiclawBookPages[0], "left", { pixelRatio: 1 });
    await createPageTexture(weiclawBookPages[0], "right", { pixelRatio: 1 });
    assert.ok(canvas.width >= 1536, `page texture width is only ${canvas.width}px`);
    assert.ok(canvas.height >= 1980, `page texture height is only ${canvas.height}px`);
    assert.equal(imageCreations, 2, "paper and artwork images should be decoded once and reused across page sides");
    assert.ok(
      sampledCanvases.every(([width, height]) => width < canvas.width || height < canvas.height),
      "print-tone processing should sample artwork layers, not the entire high-resolution page",
    );
  } finally {
    globalThis.document = previousDocument;
    globalThis.Image = previousImage;
  }
});

test("turns chat into a focused portrait crop instead of another full UI screenshot", () => {
  const chat = weiclawBookPages.find((page) => page.id === "chat");
  const image = buildPageTexturePlan(chat, "right").find((command) => command.kind === "image");

  assert.ok(image.crop.x >= 0.32, "chat crop should remove the global navigation and conversation list");
  assert.ok(image.crop.width <= 0.4, "chat crop should enlarge the core messages instead of shrinking a broad UI region");
  assert.ok(image.crop.y >= 0.08 && image.crop.height <= 0.68, "chat crop should select the primary exchange rather than the entire workspace height");
  assert.ok(image.destination.width >= 0.74, "the focused conversation should be enlarged on the page");
  assert.ok(image.destination.height >= 0.62, "chat should form a tall editorial counterpoint to the dashboard bleed");
  assert.ok(image.destination.x + image.destination.width <= 0.94, "the portrait crop should keep a deliberate fore-edge margin");
});

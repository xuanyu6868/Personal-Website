import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

import {
  SPARK_BELT_IMAGE_SIZES,
  sparkBeltLaneBottom,
  sparkBeltLaneMiddle,
  sparkBeltLaneTop,
  sparkBeltWebSrcSet,
} from "../data/sparkcommerce-belt.ts";

const webTiles = [
  ...sparkBeltLaneTop,
  ...sparkBeltLaneMiddle,
  ...sparkBeltLaneBottom,
];

test("offers smaller belt candidates while retaining each original screenshot", () => {
  assert.equal(SPARK_BELT_IMAGE_SIZES, "35vh");
  assert.equal(
    sparkBeltWebSrcSet(sparkBeltLaneTop[2]),
    "/projects/sparkcommerce/web-03-480.png 480w, /projects/sparkcommerce/web-03-768.png 768w, /projects/sparkcommerce/web-03-1024.png 1024w, /projects/sparkcommerce/web-03.png 2880w",
  );
  assert.equal(
    sparkBeltWebSrcSet(sparkBeltLaneTop[7]),
    "/projects/sparkcommerce/web-08-480.png 480w, /projects/sparkcommerce/web-08-768.png 768w, /projects/sparkcommerce/web-08-1024.png 1024w, /projects/sparkcommerce/web-08.png 1440w",
  );
  assert.equal(sparkBeltLaneTop[2].image, "/projects/sparkcommerce/web-03.png");
});

test("keeps responsive belt assets uncropped at their declared widths", async () => {
  for (const tile of webTiles) {
    const originalUrl = new URL(`../public${tile.image}`, import.meta.url);
    const original = await sharp(originalUrl.pathname).metadata();
    const candidates = sparkBeltWebSrcSet(tile).split(",").map((entry) => entry.trim());

    for (const candidate of candidates) {
      const [url, descriptor] = candidate.split(" ");
      const path = new URL(`../public${url}`, import.meta.url).pathname;
      await access(path);
      const metadata = await sharp(path).metadata();
      const declaredWidth = Number(descriptor.replace("w", ""));
      assert.equal(metadata.width, declaredWidth, `${url} has the wrong width`);
      assert.equal(metadata.format, "png");
      const originalRatio = original.width / original.height;
      const candidateRatio = metadata.width / metadata.height;
      assert.ok(
        Math.abs(originalRatio - candidateRatio) < 0.001,
        `${url} must preserve the original aspect ratio`,
      );
    }
  }
});

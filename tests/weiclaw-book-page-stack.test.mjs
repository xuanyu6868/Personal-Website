import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const stackAsset = fileURLToPath(
  new URL("../public/images/weiclaw/book/book-page-stack.png", import.meta.url),
);

async function alphaAt(image, x, y) {
  const { data } = await image
    .clone()
    .ensureAlpha()
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return data[3];
}

test("keeps the real side and bottom page stacks while clearing the paper surface", async () => {
  const image = sharp(stackAsset);
  const metadata = await image.metadata();

  assert.equal(metadata.width, 1536);
  assert.equal(metadata.height, 1024);
  assert.equal(metadata.hasAlpha, true);
  assert.ok((await alphaAt(image, 150, 500)) > 180, "left page stack should remain visible");
  assert.ok((await alphaAt(image, 1380, 500)) > 180, "right page stack should remain visible");
  assert.ok((await alphaAt(image, 768, 875)) > 180, "bottom page stack should remain visible");
  assert.equal(await alphaAt(image, 768, 500), 0, "the page surface must stay transparent");
});

test("tapers the side stacks into narrow layered fore edges", async () => {
  const image = sharp(stackAsset);

  assert.ok((await alphaAt(image, 180, 500)) > 180, "left stack should retain its outer paper layers");
  assert.ok((await alphaAt(image, 200, 500)) < 40, "left stack must not form a broad straight strip");
  assert.ok((await alphaAt(image, 1360, 500)) > 180, "right stack should retain its outer paper layers");
  assert.ok((await alphaAt(image, 1340, 500)) < 40, "right stack must not form a broad straight strip");
});

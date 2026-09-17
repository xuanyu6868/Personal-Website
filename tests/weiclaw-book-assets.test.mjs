import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");

async function readAsset(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  await access(absolutePath);
  return sharp(absolutePath).metadata();
}

test("ships a high-resolution photographic fiber texture for the cover and printed pages", async () => {
  const metadata = await readAsset("public/images/weiclaw/book/paper-fiber-v2.png");

  assert.ok(metadata.width >= 1200, `expected paper texture width >= 1200px, got ${metadata.width}`);
  assert.ok(metadata.height >= 1200, `expected paper texture height >= 1200px, got ${metadata.height}`);
});

for (const page of ["dashboard", "chat", "customer", "agent", "settings"]) {
  test(`ships a real raster ${page} page artwork`, async () => {
    const metadata = await readAsset(`public/images/weiclaw/pages/${page}.png`);

    assert.ok(metadata.width >= 900, `expected ${page} artwork width >= 900px, got ${metadata.width}`);
    assert.ok(metadata.height >= 560, `expected ${page} artwork height >= 560px, got ${metadata.height}`);
  });
}

for (const page of ["01", "02", "03", "04", "05"]) {
  test(`ships a transparent ${page} page print for the turning sheet`, async () => {
    const metadata = await readAsset(`public/images/weiclaw/prints/page-${page}.png`);

    assert.equal(metadata.hasAlpha, true);
    assert.ok(metadata.width >= 500, `expected ${page} print width >= 500px, got ${metadata.width}`);
    assert.ok(metadata.height >= 800, `expected ${page} print height >= 800px, got ${metadata.height}`);
  });
}

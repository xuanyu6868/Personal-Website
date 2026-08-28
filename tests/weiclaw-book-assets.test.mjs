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

test("ships a high-resolution transparent photographic book shell", async () => {
  const metadata = await readAsset("public/images/weiclaw/book/book-shell.png");

  assert.ok(metadata.width >= 1400, `expected shell width >= 1400px, got ${metadata.width}`);
  assert.ok(metadata.height >= 800, `expected shell height >= 800px, got ${metadata.height}`);
  assert.equal(metadata.hasAlpha, true, "book shell must preserve a transparent background");
});

for (const page of ["dashboard", "chat", "customer", "agent", "settings"]) {
  test(`ships a real raster ${page} page artwork`, async () => {
    const metadata = await readAsset(`public/images/weiclaw/pages/${page}.png`);

    assert.ok(metadata.width >= 900, `expected ${page} artwork width >= 900px, got ${metadata.width}`);
    assert.ok(metadata.height >= 560, `expected ${page} artwork height >= 560px, got ${metadata.height}`);
  });
}

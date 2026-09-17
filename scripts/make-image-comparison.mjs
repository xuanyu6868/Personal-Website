import process from "node:process";
import sharp from "sharp";

const [referencePath, implementationPath, outputPath] = process.argv.slice(2);

if (!referencePath || !implementationPath || !outputPath) {
  throw new Error("Usage: node scripts/make-image-comparison.mjs <reference> <implementation> <output>");
}

const size = { width: 1536, height: 1024 };
const [reference, implementation] = await Promise.all([
  sharp(referencePath).resize(size.width, size.height, { fit: "fill" }).png().toBuffer(),
  sharp(implementationPath).resize(size.width, size.height, { fit: "fill" }).png().toBuffer(),
]);

await sharp({
  create: {
    width: size.width * 2,
    height: size.height,
    channels: 4,
    background: { r: 10, g: 10, b: 10, alpha: 1 },
  },
})
  .composite([
    { input: reference, left: 0, top: 0 },
    { input: implementation, left: size.width, top: 0 },
  ])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(outputPath);

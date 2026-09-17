import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const [inputPath, outputPath, trimFlag] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/chroma-key-image.mjs <input> <output> [--trim]");
}

const { data, info } = await sharp(inputPath)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const rgba = Buffer.alloc(info.width * info.height * 4);

for (let source = 0, target = 0; source < data.length; source += 3, target += 4) {
  let red = data[source];
  let green = data[source + 1];
  let blue = data[source + 2];
  const greenDominance = green - Math.max(red, blue);
  const alpha = Math.round(255 * Math.max(0, Math.min(1, (82 - greenDominance) / 54)));

  if (alpha < 255) {
    green = Math.min(green, Math.max(red, blue) + 8);
  }

  rgba[target] = red;
  rgba[target + 1] = green;
  rgba[target + 2] = blue;
  rgba[target + 3] = alpha;
}

await mkdir(path.dirname(outputPath), { recursive: true });
let output = sharp(rgba, {
  raw: {
    width: info.width,
    height: info.height,
    channels: 4,
  },
});

if (trimFlag === "--trim") {
  output = output.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
}

await output.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outputPath);

import sharp from "sharp";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(
  new URL("../public/images/weiclaw/book/book-shell.png", import.meta.url),
);
const outputPath = fileURLToPath(
  new URL("../public/images/weiclaw/book/book-page-stack.png", import.meta.url),
);

const { data, info } = await sharp(sourcePath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const output = Buffer.from(data);

for (let y = 0; y < info.height; y += 1) {
  const sideProgress = Math.min(1, Math.max(0, (y - 118) / 700));
  const sideCurve = Math.sin(Math.PI * sideProgress);
  const leftInnerEdge = 205 - sideProgress * 28 + sideCurve * 3;
  const rightInnerEdge = 1331 + sideProgress * 34 - sideCurve * 3;

  for (let x = 0; x < info.width; x += 1) {
    const bottomStackTop = 838 + 0.000075 * (x - info.width / 2) ** 2;
    const sideFeather = Math.max(leftInnerEdge - x, x - rightInnerEdge);
    const bottomFeather = y - bottomStackTop;
    const maskDistance = Math.max(sideFeather, bottomFeather);
    const maskAlpha = Math.min(1, Math.max(0, (maskDistance + 0.5) / 5));
    const pixelIndex = (y * info.width + x) * info.channels;
    const alphaIndex = pixelIndex + 3;

    output[alphaIndex] = Math.round(output[alphaIndex] * maskAlpha);
    if (output[alphaIndex] === 0) {
      output[pixelIndex] = 0;
      output[pixelIndex + 1] = 0;
      output[pixelIndex + 2] = 0;
    }
  }
}

await sharp(output, {
  raw: {
    width: info.width,
    height: info.height,
    channels: info.channels,
  },
})
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

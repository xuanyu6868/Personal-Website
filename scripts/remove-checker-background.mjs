import sharp from "sharp";

const [input, output] = process.argv.slice(2);

if (!input || !output) {
  throw new Error("Usage: node scripts/remove-checker-background.mjs <input> <output>");
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixels = info.width * info.height;
const visited = new Uint8Array(pixels);
const queue = new Uint32Array(pixels);
let head = 0;
let tail = 0;

function isChecker(index) {
  const offset = index * 4;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const alpha = data[offset + 3];
  const lightest = Math.max(red, green, blue);
  const darkest = Math.min(red, green, blue);
  const y = Math.floor(index / info.width);
  const lowerShadowBackdrop = y > info.height * 0.9 && darkest > 115 && lightest - darkest < 30;
  return alpha < 8 || (darkest > 175 && lightest - darkest < 9) || lowerShadowBackdrop;
}

function enqueue(index) {
  if (visited[index] || !isChecker(index)) return;
  visited[index] = 1;
  queue[tail++] = index;
}

for (let x = 0; x < info.width; x += 1) {
  enqueue(x);
  enqueue((info.height - 1) * info.width + x);
}
for (let y = 0; y < info.height; y += 1) {
  enqueue(y * info.width);
  enqueue(y * info.width + info.width - 1);
}

while (head < tail) {
  const index = queue[head++];
  const x = index % info.width;
  const y = Math.floor(index / info.width);
  if (x > 0) enqueue(index - 1);
  if (x + 1 < info.width) enqueue(index + 1);
  if (y > 0) enqueue(index - info.width);
  if (y + 1 < info.height) enqueue(index + info.width);
}

for (let index = 0; index < pixels; index += 1) {
  if (visited[index]) data[index * 4 + 3] = 0;
}

await sharp(data, { raw: info }).png().toFile(output);

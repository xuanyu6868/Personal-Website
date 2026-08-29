import type { NormalizedRect, WeiClawBookPage } from "../../data/weiclaw-book";
import { resolvePagePrintLayout, type PageSide } from "./pageTextureLayout.ts";

export type PageTextureOptions = {
  width?: number;
  height?: number;
  pixelRatio?: number;
};

type TextureCommandBase = {
  kind: "paper" | "number" | "type" | "title" | "description" | "image" | "note" | "folio";
};

export type PaperTextureCommand = TextureCommandBase & {
  kind: "paper";
};

export type TextTextureCommand = TextureCommandBase & {
  kind: "number" | "type" | "title" | "description" | "note" | "folio";
  text: string;
  rectangle: NormalizedRect;
};

export type ImageTextureCommand = TextureCommandBase & {
  kind: "image";
  source: string;
  crop: NormalizedRect;
  destination: NormalizedRect;
  rotation: number;
};

export type PageTextureCommand = PaperTextureCommand | TextTextureCommand | ImageTextureCommand;

const PAPER_COLOR = "#eee8da";
const PAPER_TEXTURE_SOURCE = "/images/weiclaw/book/paper-fiber-v2.png";
const INK_COLOR = "#3d3831";
const MUTED_INK = "rgba(61, 56, 49, 0.64)";
const ORANGE_INK = "#c96042";

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const amount = Math.min(1, Math.max(0, (value - edge0) / Math.max(edge1 - edge0, Number.EPSILON)));
  return amount * amount * (3 - 2 * amount);
};

export function buildPageTexturePlan(page: WeiClawBookPage, side: PageSide): PageTextureCommand[] {
  const layout = resolvePagePrintLayout(page, side);
  const commands: PageTextureCommand[] = [
    { kind: "paper" },
    { kind: "number", text: page.number, rectangle: layout.header },
    { kind: "type", text: page.type, rectangle: layout.header },
    { kind: "title", text: page.title, rectangle: layout.header },
    { kind: "description", text: page.description, rectangle: layout.header },
    {
      kind: "image",
      source: page.image,
      crop: { ...page.imageCrop },
      destination: { ...layout.image },
      rotation: layout.imageRotation,
    },
  ];

  if (page.detailCrop && layout.detailImages?.[0]) {
    commands.push({
      kind: "image",
      source: page.image,
      crop: { ...page.detailCrop },
      destination: { ...layout.detailImages[0] },
      rotation: -layout.imageRotation * 1.4,
    });
  }

  commands.push(
    { kind: "note", text: page.note, rectangle: layout.note },
    {
      kind: "folio",
      text: `WEICLAW / ${page.number}`,
      rectangle: { x: side === "left" ? 0.73 : 0.69, y: 0.952, width: 0.22, height: 0.025 },
    },
  );
  return commands;
}

export function applyPrintTone(source: Uint8ClampedArray): Uint8ClampedArray {
  const toned = new Uint8ClampedArray(source);
  for (let index = 0; index < toned.length; index += 4) {
    const grain = (((index * 17) % 29) - 14) * 0.16;
    const red = toned[index] * 0.985 + 3.2 + grain;
    const green = toned[index + 1] * 0.976 + 2.4 + grain;
    const blue = toned[index + 2] * 0.952 + 0.8 + grain;
    const luminance = toned[index] * 0.2126 + toned[index + 1] * 0.7152 + toned[index + 2] * 0.0722;
    const paperBlend = smoothstep(184, 252, luminance) * 0.62;
    toned[index] = Math.min(255, red + (238 - red) * paperBlend);
    toned[index + 1] = Math.min(255, green + (232 - green) * paperBlend);
    toned[index + 2] = Math.min(255, blue + (218 - blue) * paperBlend);
  }
  return toned;
}

export async function loadPageImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();
  return image;
}

const inPixels = (rectangle: NormalizedRect, width: number, height: number) => ({
  x: rectangle.x * width,
  y: rectangle.y * height,
  width: rectangle.width * width,
  height: rectangle.height * height,
});

const sourceRectangle = (crop: NormalizedRect, image: HTMLImageElement) => ({
  x: crop.x * image.naturalWidth,
  y: crop.y * image.naturalHeight,
  width: crop.width * image.naturalWidth,
  height: crop.height * image.naturalHeight,
});

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  let currentY = y;
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        context.fillText(line, x, currentY);
        currentY += lineHeight;
        line = character;
      } else {
        line = candidate;
      }
    }
    if (line) context.fillText(line, x, currentY);
    currentY += lineHeight;
  }
}

function drawPaper(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  paperTexture: HTMLImageElement,
) {
  context.fillStyle = PAPER_COLOR;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.38;
  context.globalCompositeOperation = "multiply";
  context.drawImage(paperTexture, 0, 0, width, height);
  context.restore();

  const shade = context.createRadialGradient(width * 0.52, height * 0.36, width * 0.12, width * 0.5, height * 0.45, width * 0.78);
  shade.addColorStop(0, "rgba(255, 252, 244, 0.12)");
  shade.addColorStop(0.7, "rgba(226, 216, 198, 0.035)");
  shade.addColorStop(1, "rgba(109, 84, 58, 0.075)");
  context.fillStyle = shade;
  context.fillRect(0, 0, width, height);

  const edgeTone = context.createLinearGradient(0, 0, width, 0);
  edgeTone.addColorStop(0, "rgba(88, 66, 43, 0.035)");
  edgeTone.addColorStop(0.12, "rgba(255, 250, 238, 0.015)");
  edgeTone.addColorStop(0.78, "rgba(255, 250, 238, 0.01)");
  edgeTone.addColorStop(1, "rgba(88, 66, 43, 0.045)");
  context.fillStyle = edgeTone;
  context.fillRect(0, 0, width, height);
}

function drawImageCommand(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  command: ImageTextureCommand,
  width: number,
  height: number,
) {
  const source = sourceRectangle(command.crop, image);
  const destination = inPixels(command.destination, width, height);
  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.round(destination.width));
  layer.height = Math.max(1, Math.round(destination.height));
  const layerContext = layer.getContext("2d", { alpha: true });
  if (!layerContext) throw new Error("Unable to create WeiClaw printed image layer");

  layerContext.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    layer.width,
    layer.height,
  );
  layerContext.globalCompositeOperation = "destination-in";
  const horizontalMask = layerContext.createLinearGradient(0, 0, layer.width, 0);
  horizontalMask.addColorStop(0, "rgba(0,0,0,0.5)");
  horizontalMask.addColorStop(0.025, "rgba(0,0,0,0.96)");
  horizontalMask.addColorStop(0.965, "rgba(0,0,0,0.96)");
  horizontalMask.addColorStop(1, "rgba(0,0,0,0.48)");
  layerContext.fillStyle = horizontalMask;
  layerContext.fillRect(0, 0, layer.width, layer.height);

  const verticalMask = layerContext.createLinearGradient(0, 0, 0, layer.height);
  verticalMask.addColorStop(0, "rgba(0,0,0,0.76)");
  verticalMask.addColorStop(0.035, "rgba(0,0,0,1)");
  verticalMask.addColorStop(0.96, "rgba(0,0,0,1)");
  verticalMask.addColorStop(1, "rgba(0,0,0,0.68)");
  layerContext.fillStyle = verticalMask;
  layerContext.fillRect(0, 0, layer.width, layer.height);

  context.save();
  context.translate(destination.x + destination.width / 2, destination.y + destination.height / 2);
  context.rotate(command.rotation);
  context.globalAlpha = 0.93;
  context.globalCompositeOperation = "multiply";
  context.drawImage(
    layer,
    0,
    0,
    layer.width,
    layer.height,
    -destination.width / 2,
    -destination.height / 2,
    destination.width,
    destination.height,
  );
  context.restore();
}

function drawTextCommand(
  context: CanvasRenderingContext2D,
  command: TextTextureCommand,
  width: number,
  height: number,
) {
  const rectangle = inPixels(command.rectangle, width, height);
  const headerTop = rectangle.y;
  context.textBaseline = "top";

  if (command.kind === "number") {
    context.fillStyle = "rgba(61, 56, 49, 0.37)";
    context.font = `${Math.round(width * 0.062)}px Georgia, serif`;
    context.fillText(command.text, rectangle.x, headerTop);
    return;
  }
  if (command.kind === "type") {
    context.fillStyle = "rgba(61, 56, 49, 0.42)";
    context.font = `${Math.round(width * 0.015)}px ui-monospace, monospace`;
    context.fillText(command.text, rectangle.x + width * 0.105, headerTop + height * 0.025);
    return;
  }
  if (command.kind === "title") {
    context.fillStyle = INK_COLOR;
    context.font = `500 ${Math.round(width * 0.068)}px Georgia, "Songti SC", serif`;
    drawWrappedText(context, command.text, rectangle.x, headerTop + height * 0.085, rectangle.width, height * 0.062);
    context.fillStyle = "#406ec9";
    context.fillRect(rectangle.x, headerTop + height * 0.195, width * 0.07, 3);
    return;
  }
  if (command.kind === "description") {
    context.fillStyle = MUTED_INK;
    context.font = `${Math.round(width * 0.022)}px "PingFang SC", sans-serif`;
    drawWrappedText(context, command.text, rectangle.x, headerTop + height * 0.22, rectangle.width * 0.84, height * 0.032);
    return;
  }
  if (command.kind === "note") {
    context.save();
    context.translate(rectangle.x, rectangle.y);
    context.rotate(-0.055);
    context.fillStyle = "rgba(61, 56, 49, 0.58)";
    context.font = `${Math.round(width * 0.024)}px "Bradley Hand", "Marker Felt", cursive`;
    drawWrappedText(context, command.text, 0, 0, rectangle.width, height * 0.033);
    context.fillStyle = ORANGE_INK;
    context.fillRect(rectangle.width * 0.55, rectangle.height * 0.72, rectangle.width * 0.22, 2);
    context.restore();
    return;
  }

  context.fillStyle = "rgba(61, 56, 49, 0.34)";
  context.font = `${Math.round(width * 0.012)}px ui-monospace, monospace`;
  context.fillText(command.text, rectangle.x, rectangle.y);
}

export async function createPageTexture(
  page: WeiClawBookPage,
  side: PageSide,
  options: PageTextureOptions = {},
): Promise<HTMLCanvasElement> {
  const width = options.width ?? 1024;
  const height = options.height ?? 1320;
  const pixelRatio = Math.min(options.pixelRatio ?? window.devicePixelRatio ?? 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Unable to create WeiClaw page texture context");
  context.scale(pixelRatio, pixelRatio);

  const plan = buildPageTexturePlan(page, side);
  const imageSources = [...new Set([
    PAPER_TEXTURE_SOURCE,
    ...plan.filter((command): command is ImageTextureCommand => command.kind === "image").map((command) => command.source),
  ])];
  const [, images] = await Promise.all([
    document.fonts.ready,
    Promise.all(imageSources.map(async (source) => [source, await loadPageImage(source)] as const)),
  ]);
  const imageMap = new Map(images);

  for (const command of plan) {
    if (command.kind === "paper") {
      const paperTexture = imageMap.get(PAPER_TEXTURE_SOURCE);
      if (!paperTexture) throw new Error(`Unable to load WeiClaw paper texture: ${PAPER_TEXTURE_SOURCE}`);
      drawPaper(context, width, height, paperTexture);
    } else if (command.kind === "image") {
      const image = imageMap.get(command.source);
      if (!image) throw new Error(`Unable to load WeiClaw page image: ${command.source}`);
      drawImageCommand(context, image, command, width, height);
    } else {
      drawTextCommand(context, command, width, height);
    }
  }

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  pixels.data.set(applyPrintTone(pixels.data));
  context.putImageData(pixels, 0, 0);
  return canvas;
}

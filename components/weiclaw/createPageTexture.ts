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
const INK_COLOR = "#3d3831";
const MUTED_INK = "rgba(61, 56, 49, 0.64)";
const ORANGE_INK = "#c96042";

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
    toned[index] = Math.min(255, toned[index] * 0.985 + 3.2 + grain);
    toned[index + 1] = Math.min(255, toned[index + 1] * 0.976 + 2.4 + grain);
    toned[index + 2] = Math.min(255, toned[index + 2] * 0.952 + 0.8 + grain);
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

function drawPaper(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = PAPER_COLOR;
  context.fillRect(0, 0, width, height);
  const shade = context.createRadialGradient(width * 0.52, height * 0.36, width * 0.12, width * 0.5, height * 0.45, width * 0.78);
  shade.addColorStop(0, "rgba(255, 252, 244, 0.16)");
  shade.addColorStop(0.72, "rgba(226, 216, 198, 0.04)");
  shade.addColorStop(1, "rgba(109, 84, 58, 0.11)");
  context.fillStyle = shade;
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
  context.save();
  context.translate(destination.x + destination.width / 2, destination.y + destination.height / 2);
  context.rotate(command.rotation);
  context.globalAlpha = 0.94;
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
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
  const imageSources = [...new Set(plan.filter((command): command is ImageTextureCommand => command.kind === "image").map((command) => command.source))];
  const [, images] = await Promise.all([
    document.fonts.ready,
    Promise.all(imageSources.map(async (source) => [source, await loadPageImage(source)] as const)),
  ]);
  const imageMap = new Map(images);

  for (const command of plan) {
    if (command.kind === "paper") {
      drawPaper(context, width, height);
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

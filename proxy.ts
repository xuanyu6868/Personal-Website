import { existsSync, statSync, createReadStream } from "node:fs";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/video/:path*", "/geist-:file.woff2"],
};

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
};

type RangeResult =
  | { kind: "full"; start: number; end: number }
  | { kind: "partial"; start: number; end: number }
  | { kind: "invalid" }
  | { kind: "unsatisfiable"; size: number };

function parseRangeHeader(
  rangeHeader: string | null,
  size: number,
): RangeResult {
  if (!rangeHeader) {
    return { kind: "full", start: 0, end: size - 1 };
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return { kind: "invalid" };
  }
  const startText = match[1];
  const endText = match[2];
  if (startText === "" && endText === "") {
    return { kind: "invalid" };
  }
  if (startText === "") {
    // Suffix range: last N bytes.
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return { kind: "invalid" };
    }
    if (suffixLength >= size) {
      return { kind: "full", start: 0, end: size - 1 };
    }
    return { kind: "partial", start: size - suffixLength, end: size - 1 };
  }
  const start = Number(startText);
  if (!Number.isInteger(start) || start < 0 || start >= size) {
    return { kind: "unsatisfiable", size };
  }
  const end = endText === "" ? size - 1 : Number(endText);
  if (!Number.isInteger(end) || end < start) {
    return { kind: "invalid" };
  }
  if (end >= size) {
    return { kind: "partial", start, end: size - 1 };
  }
  return { kind: "partial", start, end };
}

function contentTypeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return VIDEO_CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function resolveVideoFile(relativePath: string): string | null {
  // Keep the request confined to the video directory. URL encoding has
  // already been decoded by the runtime, but normalize defensively and make
  // sure the resolved path stays under one of the known video roots.
  const safeName = normalize(relativePath).replace(/^(\.\.(\/|\\))+/, "");

  // In the bundled dist/server/index.js (vinext build) this module's
  // import.meta.url lives under dist/server/, so it cannot locate the video
  // directory. `npm start` and `vinext start` always run from the project
  // root, so prefer process.cwd() and fall back to probing upward from the
  // module URL until a directory containing public/video is found.
  const roots = new Set<string>();
  if (typeof process !== "undefined" && process.cwd()) {
    roots.add(process.cwd());
  }
  let moduleDir = fileURLToPath(new URL(".", import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    roots.add(moduleDir);
    const parent = join(moduleDir, "..");
    if (parent === moduleDir) break;
    moduleDir = parent;
  }

  const candidates = [
    ...[...roots].map((root) => join(root, "dist", "client", "video", safeName)),
    ...[...roots].map((root) => join(root, "public", "video", safeName)),
    // Google Fonts are copied into dist/client/ by scripts/copy-fonts.sh and
    // referenced from the injected <style data-vinext-fonts> with relative
    // urls (url(./geist-xxx.woff2)) that resolve to the site root.
    ...[...roots].map((root) => join(root, "dist", "client", safeName)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

export function proxy(request: NextRequest) {
  // In the Worker/edge environment we intentionally do not handle the file
  // locally: Cloudflare serves the static assets with proper Range support.
  // In Node (dev server and `npm start`) the production server does not
  // implement Range on static files, so serve the video ourselves.
  const isNode = typeof process !== "undefined" && !!process.versions?.node;
  if (!isNode) {
    return new Response(null, { headers: { "x-middleware-next": "1" } });
  }

  const method = request.method;
  if (method !== "GET" && method !== "HEAD") {
    return new Response(null, { headers: { "x-middleware-next": "1" } });
  }

  const pathname = new URL(request.url).pathname;
  const relativePath = pathname.startsWith("/video/")
    ? pathname.slice("/video/".length)
    : pathname.slice(1);
  const filePath = resolveVideoFile(relativePath);
  if (!filePath) {
    return new Response(null, { headers: { "x-middleware-next": "1" } });
  }

  const size = statSync(filePath).size;
  if (size === 0) {
    return new Response(null, { status: 200 });
  }

  const range = parseRangeHeader(request.headers.get("range"), size);
  if (range.kind === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  if (range.kind === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Content-Type": contentTypeForPath(filePath),
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  if (method === "HEAD") {
    return new Response(null, {
      status: range.kind === "full" ? 200 : 206,
      headers: {
        ...commonHeaders,
        "Content-Length": String(range.end - range.start + 1),
        ...(range.kind === "partial"
          ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` }
          : {}),
      },
    });
  }

  const stream = createReadStream(filePath, {
    start: range.start,
    end: range.end,
  });
  return new Response(stream as unknown as BodyInit, {
    status: range.kind === "full" ? 200 : 206,
    headers: {
      ...commonHeaders,
      "Content-Length": String(range.end - range.start + 1),
      ...(range.kind === "partial"
        ? { "Content-Range": `bytes ${range.start}-${range.end}/${size}` }
        : {}),
    },
  });
}

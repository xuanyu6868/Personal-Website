# WeiClaw WebGL Paper System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WeiClaw’s rigid DOM page flip with a WebGL-rendered deformable paper system whose printed content, page curvature, spine compression, edge thickness, and dynamic shadows move as one physical surface.

**Architecture:** `WeiClawBook.tsx` remains the interaction and spread-state orchestrator. Focused modules generate deterministic paper geometry, define editorial page layouts, bake each complete page into one Canvas texture, and render settled and turning sheets through a WebGL 1.0 renderer; a React boundary owns lifecycle, visibility, resize, texture caching, and fallback behavior.

**Tech Stack:** React 19, TypeScript 5.9, native WebGL 1.0 / GLSL ES 1.00, Canvas 2D, Pointer Events, Framer Motion `useReducedMotion`, Node 24 test runner, existing Next/Vinext build.

**Spec:** `docs/superpowers/specs/2026-08-28-weiclaw-webgl-paper-design.md`

## Global Constraints

- Do not add Three.js or any new runtime dependency.
- Preserve the full-screen background video, navigation, project rail, full-screen wheel scrolling, left WeiClaw introduction, preview Overlay, and every non-WeiClaw scene.
- Keep the book at approximately 50%–58% of viewport width, center-right, with mountain background visible around all four sides.
- Use only the existing real WeiClaw screenshots in `public/images/weiclaw/pages/` and the existing shell in `public/images/weiclaw/book/book-shell.png`.
- Do not use `page-curl*.png`, `reference-book*.png`, CSS-art curl assets, glow, HUD, neon borders, or a permanent animation loop.
- WebGL must use a WebGL 1.0-compatible API and GLSL; CPU-generated normals avoid derivative extensions.
- Desktop mesh target: 40 × 16 segments, at most 1,280 triangles per page; narrow viewport target: 24 × 10 segments, at most 480 triangles per page.
- Cap Canvas DPR at 2; never rebuild page textures during Pointer Move.
- Keep wheel input unhandled by the book and release Pointer Capture immediately after drag completion or cancellation.
- Keep an accessible semantic page description and visible DOM fallback; mark the WebGL Canvas decorative.
- Honor `prefers-reduced-motion`, pause rendering outside the scene, and clean up RAF, observers, listeners, buffers, textures, shaders, and programs.
- The worktree is already dirty. Never reset, clean, overwrite, or stage unrelated user changes; each commit must stage only files named by its task.

## File Map

- `data/weiclaw-book.ts`: page copy, real image paths, and five distinct editorial layout/crop configurations.
- `components/weiclaw/pageTextureLayout.ts`: pure layout resolution from page data to normalized print rectangles.
- `components/weiclaw/paperGeometry.ts`: pure settled/turning mesh generation, finite-difference normals, edge geometry, and projected shadow mesh.
- `components/weiclaw/createPageTexture.ts`: image loading and complete page-to-Canvas composition.
- `components/weiclaw/webglPaperRenderer.ts`: shaders, WebGL buffers/textures, draw ordering, resize, and disposal.
- `components/weiclaw/WeiClawPaperMesh.tsx`: React lifecycle boundary, texture cache, observers, request-on-demand rendering, context recovery, and DOM fallback readiness.
- `components/WeiClawBook.tsx`: drag/click/snap orchestration, spread selection, preview, accessibility, and renderer integration.
- `app/globals.css`: physical shell/canvas placement, fallback visibility, interaction hit areas, responsive layout, and removal of rigid turning-sheet styles.
- `tests/weiclaw-page-layout.test.mjs`: page data and normalized editorial layout tests.
- `tests/weiclaw-paper-geometry.test.mjs`: geometry, curvature, spine, corner-lag, mirror, UV, and finite-number tests.
- `tests/weiclaw-webgl-source.test.mjs`: renderer lifecycle, shader/material, on-demand RAF, and fallback source contracts.
- `tests/weiclaw-book.test.mjs`: integration contract updated from rigid DOM rotation to the paper mesh.
- `package.json`: repeatable `test:weiclaw` command.

---

### Task 1: Lock the Editorial Page Data Contract

**Files:**
- Modify: `data/weiclaw-book.ts`
- Create: `components/weiclaw/pageTextureLayout.ts`
- Create: `tests/weiclaw-page-layout.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `WeiClawBookPage` copy and `/images/weiclaw/pages/*.png` assets.
- Produces: `WeiClawPageLayout`, `NormalizedRect`, `PagePrintLayout`, `resolvePagePrintLayout(page, side)`, and `npm run test:weiclaw`.

- [ ] **Step 1: Add the page-layout test before changing production data**

Create `tests/weiclaw-page-layout.test.mjs` with these assertions:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { weiclawBookPages } from "../data/weiclaw-book.ts";
import { resolvePagePrintLayout } from "../components/weiclaw/pageTextureLayout.ts";

const expectedLayouts = [
  "dashboard-bleed",
  "chat-column",
  "customer-dominant",
  "agent-details",
  "settings-wide",
];

test("assigns a distinct editorial layout to every real page", () => {
  assert.deepEqual(weiclawBookPages.map((page) => page.layout), expectedLayouts);
  assert.equal(new Set(weiclawBookPages.map((page) => page.layout)).size, 5);
  for (const page of weiclawBookPages) assert.match(page.image, /^\/images\/weiclaw\/pages\/.+\.png$/);
});

test("keeps all normalized print rectangles inside a controlled bleed area", () => {
  for (const page of weiclawBookPages) {
    for (const side of ["left", "right"]) {
      const layout = resolvePagePrintLayout(page, side);
      for (const rect of [layout.header, layout.image, layout.note, ...(layout.detailImages ?? [])]) {
        assert.ok(rect.x >= -0.08 && rect.y >= -0.08, `${page.id} starts beyond bleed`);
        assert.ok(rect.x + rect.width <= 1.08, `${page.id} exceeds horizontal bleed`);
        assert.ok(rect.y + rect.height <= 1.08, `${page.id} exceeds vertical bleed`);
        assert.ok(rect.width > 0 && rect.height > 0, `${page.id} has an empty rectangle`);
      }
    }
  }
});

test("mirrors page-safe margins without changing editorial proportions", () => {
  const page = weiclawBookPages[0];
  const left = resolvePagePrintLayout(page, "left");
  const right = resolvePagePrintLayout(page, "right");
  assert.ok(left.header.x > right.header.x, "left page needs a larger outer-left safe margin");
  assert.equal(left.image.width, right.image.width);
  assert.equal(left.image.height, right.image.height);
});
```

- [ ] **Step 2: Run the new test and confirm the missing contract fails**

Run: `node --test tests/weiclaw-page-layout.test.mjs`

Expected: FAIL because `pageTextureLayout.ts` and `page.layout` do not exist.

- [ ] **Step 3: Extend page data with exact layout and crop types**

Add these public types to `data/weiclaw-book.ts` and assign the layouts in the exact order asserted above:

```ts
export type WeiClawPageLayout =
  | "dashboard-bleed"
  | "chat-column"
  | "customer-dominant"
  | "agent-details"
  | "settings-wide";

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WeiClawBookPage = {
  id: string;
  number: string;
  type: string;
  title: string;
  description: string;
  image: string;
  note: string;
  layout: WeiClawPageLayout;
  imageCrop: NormalizedRect;
  detailCrop?: NormalizedRect;
};
```

Use these crop values, all expressed in source-image normalized coordinates:

```ts
dashboard: { imageCrop: { x: 0, y: 0.04, width: 1, height: 0.92 } }
chat:      { imageCrop: { x: 0.10, y: 0, width: 0.72, height: 1 } }
customer:  { imageCrop: { x: 0, y: 0.06, width: 1, height: 0.88 } }
agent:     { imageCrop: { x: 0.02, y: 0.02, width: 0.96, height: 0.96 }, detailCrop: { x: 0.48, y: 0.08, width: 0.42, height: 0.48 } }
settings:  { imageCrop: { x: 0, y: 0.10, width: 1, height: 0.78 } }
```

- [ ] **Step 4: Create the pure editorial layout resolver**

Create `components/weiclaw/pageTextureLayout.ts` with these exports and fixed normalized layouts:

```ts
import type { NormalizedRect, WeiClawBookPage } from "../../data/weiclaw-book";

export type PageSide = "left" | "right";

export type PagePrintLayout = {
  header: NormalizedRect;
  image: NormalizedRect;
  note: NormalizedRect;
  detailImages?: NormalizedRect[];
  imageRotation: number;
};

const layouts: Record<WeiClawBookPage["layout"], Omit<PagePrintLayout, "header"> & { header: NormalizedRect }> = {
  "dashboard-bleed": {
    header: { x: 0.12, y: 0.08, width: 0.46, height: 0.24 },
    image: { x: 0.07, y: 0.39, width: 0.96, height: 0.56 },
    note: { x: 0.61, y: 0.10, width: 0.26, height: 0.18 },
    imageRotation: -0.006,
  },
  "chat-column": {
    header: { x: 0.10, y: 0.08, width: 0.48, height: 0.27 },
    image: { x: 0.18, y: 0.34, width: 0.76, height: 0.68 },
    note: { x: 0.62, y: 0.09, width: 0.27, height: 0.20 },
    imageRotation: 0.005,
  },
  "customer-dominant": {
    header: { x: 0.11, y: 0.07, width: 0.52, height: 0.22 },
    image: { x: 0.04, y: 0.30, width: 0.99, height: 0.67 },
    note: { x: 0.66, y: 0.09, width: 0.24, height: 0.16 },
    imageRotation: -0.004,
  },
  "agent-details": {
    header: { x: 0.10, y: 0.07, width: 0.50, height: 0.23 },
    image: { x: 0.09, y: 0.36, width: 0.62, height: 0.58 },
    note: { x: 0.66, y: 0.08, width: 0.25, height: 0.18 },
    detailImages: [{ x: 0.66, y: 0.51, width: 0.30, height: 0.32 }],
    imageRotation: 0.004,
  },
  "settings-wide": {
    header: { x: 0.10, y: 0.08, width: 0.50, height: 0.23 },
    image: { x: 0.05, y: 0.42, width: 1.01, height: 0.47 },
    note: { x: 0.65, y: 0.10, width: 0.24, height: 0.17 },
    imageRotation: -0.003,
  },
};

export function resolvePagePrintLayout(page: WeiClawBookPage, side: PageSide): PagePrintLayout {
  const base = layouts[page.layout];
  const spineShift = side === "left" ? 0.035 : -0.015;
  return {
    ...base,
    header: { ...base.header, x: base.header.x + spineShift },
    image: { ...base.image },
    note: { ...base.note },
    detailImages: base.detailImages?.map((rect) => ({ ...rect })),
  };
}
```

- [ ] **Step 5: Add the focused test script and run it green**

Add to `package.json` scripts:

```json
"test:weiclaw": "node --test tests/weiclaw-*.test.mjs"
```

Run: `npm run test:weiclaw`

Expected: PASS for the new data/layout test and all pre-existing WeiClaw tests.

- [ ] **Step 6: Commit only the page contract files**

```bash
git add package.json data/weiclaw-book.ts components/weiclaw/pageTextureLayout.ts tests/weiclaw-page-layout.test.mjs
git commit -m "feat: define WeiClaw editorial page layouts"
```

---

### Task 2: Build and Test the Deformable Paper Geometry

**Files:**
- Create: `components/weiclaw/paperGeometry.ts`
- Create: `tests/weiclaw-paper-geometry.test.mjs`

**Interfaces:**
- Consumes: `PageSide` from `components/weiclaw/pageTextureLayout.ts`.
- Produces: `PaperMesh`, `PageEdgeMesh`, `ShadowMesh`, `PaperMeshOptions`, `createPaperMesh(options)`, `createPageEdgeMesh(mesh)`, and `createProjectedShadowMesh(mesh, light, progress)`.

- [ ] **Step 1: Write geometry tests for endpoints, curvature, spine, lag, and finite values**

Create `tests/weiclaw-paper-geometry.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createPaperMesh } from "../components/weiclaw/paperGeometry.ts";

const options = { columns: 40, rows: 16, width: 1, height: 1.28 };
const position = (mesh, column, row = 8) => {
  const index = (row * (mesh.columns + 1) + column) * 3;
  return mesh.positions.slice(index, index + 3);
};

test("anchors the spine throughout a next-page turn", () => {
  const start = createPaperMesh({ ...options, side: "right", mode: "turning", direction: "next", progress: 0 });
  for (const progress of [0.2, 0.5, 0.8, 1]) {
    const mesh = createPaperMesh({ ...options, side: "right", mode: "turning", direction: "next", progress });
    assert.deepEqual([...position(mesh, 0)], [...position(start, 0)]);
  }
});

test("moves the outer edge before the spine transition band", () => {
  const start = createPaperMesh({ ...options, side: "right", mode: "turning", direction: "next", progress: 0 });
  const early = createPaperMesh({ ...options, side: "right", mode: "turning", direction: "next", progress: 0.2 });
  const outerTravel = Math.hypot(...position(early, 40).map((value, index) => value - position(start, 40)[index]));
  const innerTravel = Math.hypot(...position(early, 4).map((value, index) => value - position(start, 4)[index]));
  assert.ok(outerTravel > innerTravel * 2);
});

test("forms a non-collinear curved cross-section at half turn", () => {
  const mesh = createPaperMesh({ ...options, side: "right", mode: "turning", direction: "next", progress: 0.5 });
  const z = [4, 12, 20, 28, 36, 40].map((column) => position(mesh, column)[2]);
  assert.ok(Math.max(...z) - Math.min(...z) > 0.12);
  assert.ok(new Set(z.map((value) => value.toFixed(3))).size >= 5);
});

test("lags top and bottom corners behind the page center", () => {
  const mesh = createPaperMesh({ ...options, side: "right", mode: "turning", direction: "next", progress: 0.38 });
  const center = position(mesh, 40, 8)[2];
  const top = position(mesh, 40, 0)[2];
  const bottom = position(mesh, 40, 16)[2];
  assert.ok(center > top);
  assert.ok(center > bottom);
  assert.notEqual(top.toFixed(4), bottom.toFixed(4));
});

test("settles on opposite sides and mirrors previous-page turns", () => {
  const nextEnd = createPaperMesh({ ...options, side: "right", mode: "turning", direction: "next", progress: 1 });
  const previousEnd = createPaperMesh({ ...options, side: "left", mode: "turning", direction: "previous", progress: 1 });
  assert.ok(position(nextEnd, 40)[0] < 0);
  assert.ok(position(previousEnd, 40)[0] > 0);
  assert.ok(Math.abs(position(nextEnd, 40)[0] + position(previousEnd, 40)[0]) < 0.02);
});

test("returns finite positions, normals, uvs, and valid indices", () => {
  for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
    const mesh = createPaperMesh({ ...options, side: "right", mode: "turning", direction: "next", progress });
    for (const values of [mesh.positions, mesh.normals, mesh.uvs]) {
      assert.ok([...values].every(Number.isFinite));
    }
    assert.ok([...mesh.indices].every((index) => index < (mesh.columns + 1) * (mesh.rows + 1)));
  }
});
```

- [ ] **Step 2: Run the geometry suite and confirm it fails on the missing module**

Run: `node --test tests/weiclaw-paper-geometry.test.mjs`

Expected: FAIL with module-not-found for `paperGeometry.ts`.

- [ ] **Step 3: Implement the mesh types, grid indices, and settled surface**

Create `components/weiclaw/paperGeometry.ts` with these public types:

```ts
import type { PageSide } from "./pageTextureLayout";

export type TurnDirection = "next" | "previous";
export type PaperMode = "settled" | "turning";

export type PaperMeshOptions = {
  columns: number;
  rows: number;
  width: number;
  height: number;
  side: PageSide;
  mode: PaperMode;
  direction?: TurnDirection;
  progress: number;
  cornerLift?: number;
};

export type PaperMesh = {
  columns: number;
  rows: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
};

export type ShadowMesh = {
  positions: Float32Array;
  alphas: Float32Array;
  indices: Uint16Array;
};

export type PageEdgeMesh = {
  positions: Float32Array;
  indices: Uint16Array;
};
```

Use a `(columns + 1) × (rows + 1)` grid. Generate two counter-clockwise triangles per cell. Settled positions use:

```ts
const sideSign = side === "right" ? 1 : -1;
const y = (0.5 - v) * height;
const spineDip = -0.032 * Math.exp(-u * 13);
const outerLift = 0.014 * u * u;
const verticalBow = 0.006 * (1 - Math.pow((v - 0.5) * 2, 2));
const x = sideSign * width * u;
const z = spineDip + outerLift + verticalBow;
```

- [ ] **Step 4: Implement propagated turning curvature and asymmetric corner lag**

For a turning sheet, build every row from the anchored spine outward. Clamp progress and use:

```ts
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const cornerDistance = Math.abs(v - 0.5) * 2;
const cornerAsymmetry = v < 0.5 ? 0.018 : 0.035;
const cornerDelay = Math.pow(cornerDistance, 1.7) * (0.065 + cornerAsymmetry);
const propagationDelay = (1 - u) * 0.30 + cornerDelay;
const localProgress = smoothstep(propagationDelay, 0.92 + cornerDelay * 0.2, progress);
const curlPulse = Math.sin(Math.PI * progress) * Math.sin(Math.PI * u);
const tangentAngle = Math.PI * localProgress + curlPulse * 0.34 * (0.5 - progress);
```

Integrate adjacent column tangents rather than rotating complete vertices:

```ts
const initialSign = direction === "next" ? 1 : -1;
const delta = width / columns;
const midAngle = (previousAngle + tangentAngle) * 0.5;
x += initialSign * delta * Math.cos(midAngle);
z += delta * Math.sin(Math.abs(midAngle));
z += Math.sin(Math.PI * u) * Math.sin(Math.PI * progress) * 0.055;
```

Keep column zero exactly equal to its settled spine position. At `progress === 1`, force all tangent angles to `Math.PI` so the sheet lays flat on the opposite side. Add `cornerLift * Math.sin(Math.PI * u) * Math.pow(cornerDistance, 1.5)` to `z` only when `cornerLift` is supplied by hover state.

- [ ] **Step 5: Compute finite-difference normals, edge mesh, and projected shadow mesh**

Compute each normal from neighboring horizontal and vertical tangents:

```ts
const tx = subtract(positionAt(Math.min(column + 1, columns), row), positionAt(Math.max(column - 1, 0), row));
const ty = subtract(positionAt(column, Math.min(row + 1, rows)), positionAt(column, Math.max(row - 1, 0)));
const normal = normalize(cross(tx, ty));
```

Export `createPageEdgeMesh(mesh)` as the ordered outer, top, and bottom edge segments with a `0.0025` normal offset between front and back surfaces. Export `createProjectedShadowMesh(mesh, { x: -0.22, y: 0.08, z: 1 }, progress)` by projecting each moving vertex to `z = -0.018`; set each alpha to `clamp(0.12 + Math.max(vertexZ, 0) * 2.4, 0, 0.72) * Math.sin(Math.PI * progress)` and fade the first and last two columns.

- [ ] **Step 6: Run geometry tests and focused TypeScript validation**

Run:

```bash
node --test tests/weiclaw-paper-geometry.test.mjs
npx tsc --noEmit
```

Expected: all geometry tests PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit the geometry deliverable**

```bash
git add components/weiclaw/paperGeometry.ts tests/weiclaw-paper-geometry.test.mjs
git commit -m "feat: add deformable WeiClaw paper geometry"
```

---

### Task 3: Bake Complete Editorial Pages into Canvas Textures

**Files:**
- Create: `components/weiclaw/createPageTexture.ts`
- Modify: `tests/weiclaw-page-layout.test.mjs`

**Interfaces:**
- Consumes: `WeiClawBookPage`, `PageSide`, and `resolvePagePrintLayout(page, side)`.
- Produces: `PageTextureOptions`, `loadPageImage(source)`, and `createPageTexture(page, side, options): Promise<HTMLCanvasElement>`.

- [ ] **Step 1: Add source-contract tests for one-surface composition**

Append to `tests/weiclaw-page-layout.test.mjs`:

```js
import { readFile } from "node:fs/promises";

test("bakes paper, copy, and raster artwork into one canvas texture", async () => {
  const source = await readFile(new URL("../components/weiclaw/createPageTexture.ts", import.meta.url), "utf8");
  assert.match(source, /document\.fonts\.ready/);
  assert.match(source, /drawImage\(/);
  assert.match(source, /fillText\(/);
  assert.match(source, /resolvePagePrintLayout/);
  assert.match(source, /imageCrop/);
  assert.match(source, /getImageData/);
  assert.match(source, /putImageData/);
});
```

- [ ] **Step 2: Run the texture contract test and confirm it fails**

Run: `node --test tests/weiclaw-page-layout.test.mjs`

Expected: FAIL because `createPageTexture.ts` does not exist.

- [ ] **Step 3: Implement image loading, crop conversion, and deterministic Canvas setup**

Create `components/weiclaw/createPageTexture.ts` with:

```ts
import type { WeiClawBookPage, NormalizedRect } from "../../data/weiclaw-book";
import { resolvePagePrintLayout, type PageSide } from "./pageTextureLayout";

export type PageTextureOptions = {
  width?: number;
  height?: number;
  pixelRatio?: number;
};

export async function loadPageImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = source;
  await image.decode();
  return image;
}

const sourceRect = (crop: NormalizedRect, image: HTMLImageElement) => ({
  x: crop.x * image.naturalWidth,
  y: crop.y * image.naturalHeight,
  width: crop.width * image.naturalWidth,
  height: crop.height * image.naturalHeight,
});
```

Default logical page size is `1024 × 1320`; multiply backing dimensions by `min(pixelRatio, 2)` and scale the 2D context back to logical pixels. Await `document.fonts.ready` and `loadPageImage(page.image)` in parallel.

- [ ] **Step 4: Draw the complete printed page in one pass**

Inside `createPageTexture`, perform this fixed draw order:

1. Warm paper base `#eee8da` plus a subtle radial edge gradient.
2. Header number/type/title/description using Georgia and the existing sans/mono fallbacks.
3. Main screenshot using `page.imageCrop`, `layout.image`, and `layout.imageRotation`.
4. `detailCrop` into `layout.detailImages[0]` for the AI Agent page.
5. Handwritten note and orange directional mark.
6. `WEICLAW / NN` folio.
7. A single pixel-level print integration pass.

Use this print integration pass on the entire canvas so screenshots and paper share material:

```ts
const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
for (let index = 0; index < pixels.data.length; index += 4) {
  const grain = (((index * 17) % 29) - 14) * 0.16;
  pixels.data[index] = Math.min(255, pixels.data[index] * 0.985 + 3.2 + grain);
  pixels.data[index + 1] = Math.min(255, pixels.data[index + 1] * 0.976 + 2.4 + grain);
  pixels.data[index + 2] = Math.min(255, pixels.data[index + 2] * 0.952 + 0.8 + grain);
}
context.putImageData(pixels, 0, 0);
```

Use `context.save()`, translate to each image rectangle center, rotate by `imageRotation`, draw the cropped source into the destination rectangle, and `context.restore()`. Do not draw rounded UI-card frames.

- [ ] **Step 5: Run focused tests and build validation**

Run:

```bash
npm run test:weiclaw
npx tsc --noEmit
```

Expected: all WeiClaw tests PASS and TypeScript reports no errors.

- [ ] **Step 6: Commit the texture generator**

```bash
git add components/weiclaw/createPageTexture.ts tests/weiclaw-page-layout.test.mjs
git commit -m "feat: bake WeiClaw editorial page textures"
```

---

### Task 4: Implement the WebGL Paper Renderer

**Files:**
- Create: `components/weiclaw/webglPaperRenderer.ts`
- Create: `tests/weiclaw-webgl-source.test.mjs`

**Interfaces:**
- Consumes: `PaperMesh`, `ShadowMesh`, Canvas page textures, page side, direction, and progress.
- Produces: `WeiClawPaperRenderer`, `PaperTextureSet`, and `PaperRenderFrame`.

- [ ] **Step 1: Write renderer source-contract tests before the renderer**

Create `tests/weiclaw-webgl-source.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const renderer = await readFile(new URL("../components/weiclaw/webglPaperRenderer.ts", import.meta.url), "utf8");

test("uses WebGL 1 with dynamic mesh buffers and unified texture lighting", () => {
  assert.match(renderer, /getContext\("webgl"/);
  assert.match(renderer, /DYNAMIC_DRAW/);
  assert.match(renderer, /aNormal/);
  assert.match(renderer, /uLightDirection/);
  assert.match(renderer, /uSpineDarkening/);
  assert.match(renderer, /texture2D\(uPageTexture/);
});

test("draws receiver pages, projected shadow, moving back, moving front, and edge in order", () => {
  assert.match(renderer, /drawSettledPages[\s\S]*drawProjectedShadow[\s\S]*drawTurningBack[\s\S]*drawTurningFront[\s\S]*drawPageEdge/);
});

test("releases every WebGL resource", () => {
  assert.match(renderer, /deleteBuffer/);
  assert.match(renderer, /deleteTexture/);
  assert.match(renderer, /deleteProgram/);
  assert.match(renderer, /deleteShader/);
});
```

- [ ] **Step 2: Run the renderer test and confirm it fails**

Run: `node --test tests/weiclaw-webgl-source.test.mjs`

Expected: FAIL because `webglPaperRenderer.ts` does not exist.

- [ ] **Step 3: Define exact renderer inputs and compile the two shader programs**

Create these interfaces:

```ts
export type PaperTextureSet = {
  left: HTMLCanvasElement;
  right: HTMLCanvasElement;
  under: HTMLCanvasElement;
  turningFront: HTMLCanvasElement;
  turningBack: HTMLCanvasElement;
};

export type PaperRenderFrame = {
  textures: PaperTextureSet;
  direction: "next" | "previous" | null;
  hoverDirection: "next" | "previous" | null;
  progress: number;
  hoverLift: number;
  reducedMotion: boolean;
};

export class WeiClawPaperRenderer {
  constructor(canvas: HTMLCanvasElement);
  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void;
  render(frame: PaperRenderFrame): void;
  dispose(): void;
}
```

The paper vertex shader must accept `aPosition`, `aNormal`, and `aUv`, multiply by `uProjection * uView`, and pass normalized normal, UV, world position, and spine coordinate. The fragment shader must sample one `uPageTexture` and apply the same lighting to every pixel:

```glsl
precision mediump float;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
uniform sampler2D uPageTexture;
uniform vec3 uLightDirection;
uniform float uSpineDarkening;
uniform float uBackFace;

void main() {
  vec3 normal = normalize(vNormal) * (uBackFace > 0.5 ? -1.0 : 1.0);
  float diffuse = 0.82 + max(dot(normal, normalize(uLightDirection)), 0.0) * 0.20;
  float spineShade = 1.0 - uSpineDarkening * exp(-abs(vWorldPosition.x) * 16.0);
  float crest = pow(max(dot(normal, normalize(vec3(-0.25, 0.35, 1.0))), 0.0), 7.0) * 0.055;
  vec4 paper = texture2D(uPageTexture, vUv);
  gl_FragColor = vec4(paper.rgb * diffuse * spineShade + crest, paper.a);
}
```

Use a second simple shader for projected shadow and page edges; it accepts per-vertex alpha and outputs warm black `vec4(0.08, 0.055, 0.035, alpha)`.

- [ ] **Step 4: Implement buffer updates, texture caching, and draw order**

Create one dynamic position buffer, one dynamic normal buffer, one static UV buffer, and one static index buffer per active surface. Upload positions and normals with `gl.bufferData(..., gl.DYNAMIC_DRAW)`; update existing allocations with `gl.bufferSubData` when lengths match.

Cache WebGL textures by the input Canvas object in a `Map<HTMLCanvasElement, WebGLTexture>`. Configure `CLAMP_TO_EDGE`, `LINEAR`, `UNPACK_FLIP_Y_WEBGL`, and premultiplied alpha. Remove cached textures that are absent from the next `PaperTextureSet`.

Within `render(frame)`, call methods in this exact order:

```ts
this.drawSettledPages(frame);
if (frame.direction) {
  this.drawProjectedShadow(frame);
  this.drawTurningBack(frame);
  this.drawTurningFront(frame);
  this.drawPageEdge(frame);
}
```

Enable alpha blending with `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`; enable depth testing for paper surfaces, disable depth writes for the projected shadow, and use face culling to select front/back texture orientation without creating separate moving geometry.

- [ ] **Step 5: Implement resize and complete disposal**

`resize` sets backing width/height to rounded CSS dimensions multiplied by `Math.min(pixelRatio, 2)`, updates viewport, and recomputes a 36° perspective projection matching the current book aspect ratio.

`dispose` iterates every buffer and cached texture, deletes both programs and both shader pairs, clears maps, and sets a `disposed` guard so late image promises cannot upload resources.

- [ ] **Step 6: Run tests and TypeScript validation**

Run:

```bash
node --test tests/weiclaw-webgl-source.test.mjs tests/weiclaw-paper-geometry.test.mjs
npx tsc --noEmit
```

Expected: both suites PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit the renderer**

```bash
git add components/weiclaw/webglPaperRenderer.ts tests/weiclaw-webgl-source.test.mjs
git commit -m "feat: render WeiClaw paper with WebGL"
```

---

### Task 5: Add the React WebGL Lifecycle Boundary

**Files:**
- Create: `components/weiclaw/WeiClawPaperMesh.tsx`
- Modify: `tests/weiclaw-webgl-source.test.mjs`

**Interfaces:**
- Consumes: `WeiClawBookPage`, `createPageTexture`, and `WeiClawPaperRenderer`.
- Produces: `WeiClawPaperMesh`, `WeiClawPaperMeshProps`, `onReady(ready)`, and on-demand render scheduling.

- [ ] **Step 1: Extend source tests for observers, context recovery, no permanent RAF, and Canvas semantics**

Append:

```js
const boundary = await readFile(new URL("../components/weiclaw/WeiClawPaperMesh.tsx", import.meta.url), "utf8");

test("owns observable on-demand rendering and a semantic DOM fallback signal", () => {
  assert.match(boundary, /new ResizeObserver/);
  assert.match(boundary, /new IntersectionObserver/);
  assert.match(boundary, /requestAnimationFrame/);
  assert.match(boundary, /cancelAnimationFrame/);
  assert.match(boundary, /webglcontextlost/);
  assert.match(boundary, /webglcontextrestored/);
  assert.match(boundary, /aria-hidden="true"/);
  assert.match(boundary, /onReady/);
  assert.doesNotMatch(boundary, /function animate\([\s\S]*requestAnimationFrame\(animate\)/);
});
```

- [ ] **Step 2: Run the source test and confirm the lifecycle boundary is missing**

Run: `node --test tests/weiclaw-webgl-source.test.mjs`

Expected: FAIL because `WeiClawPaperMesh.tsx` does not exist.

- [ ] **Step 3: Create the component and texture cache**

Use this props contract:

```ts
export type WeiClawPaperMeshProps = {
  leftPage: WeiClawBookPage;
  rightPage: WeiClawBookPage | null;
  underPage: WeiClawBookPage;
  turningFrontPage: WeiClawBookPage | null;
  turningBackPage: WeiClawBookPage | null;
  direction: "next" | "previous" | null;
  hoverDirection: "next" | "previous" | null;
  progress: number;
  hoverLift: number;
  reducedMotion: boolean;
  onReady: (ready: boolean) => void;
};
```

Render one `<canvas className="weiclaw-book__paper-canvas" aria-hidden="true" />`. Cache texture canvases by `${page.id}:${side}:${dprBucket}`. Generate only current left/right, under, front, and back textures; reuse cached entries for overlap and evict canvases not used by current or adjacent spread.

When `rightPage`, `turningFrontPage`, or `turningBackPage` is null at the five-page boundary, generate and cache a plain warm-paper Canvas with no title or screenshot. `PaperTextureSet` must always contain five valid canvases before `onReady(true)`.

- [ ] **Step 4: Implement request-on-demand rendering and observers**

Maintain `frameRef`, `visibleRef`, `latestFrameRef`, and `rendererRef`. Use this scheduling shape:

```ts
const scheduleRender = () => {
  if (!visibleRef.current || frameRef.current !== 0 || !rendererRef.current || !latestFrameRef.current) return;
  frameRef.current = window.requestAnimationFrame(() => {
    frameRef.current = 0;
    rendererRef.current?.render(latestFrameRef.current!);
  });
};
```

- `ResizeObserver` calls renderer `resize` and schedules one frame.
- `IntersectionObserver` sets visibility; on re-entry it schedules one frame.
- Prop and texture changes replace `latestFrameRef.current` and schedule one frame.
- No render call schedules its own successor.

- [ ] **Step 5: Implement readiness, context loss, and cleanup**

- Call `onReady(true)` only after all required textures are generated and one render succeeds.
- On `webglcontextlost`, call `event.preventDefault()`, dispose the renderer, set `onReady(false)`, and preserve semantic DOM pages.
- On `webglcontextrestored`, create a new renderer, regenerate currently required GL textures from cached Canvas textures, resize, and render.
- On unmount, cancel RAF, disconnect observers, remove both context listeners, dispose the renderer, and ignore late texture promises through a `destroyed` flag.

- [ ] **Step 6: Run lifecycle tests and build validation**

Run:

```bash
npm run test:weiclaw
npx tsc --noEmit
```

Expected: tests PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit the lifecycle component**

```bash
git add components/weiclaw/WeiClawPaperMesh.tsx tests/weiclaw-webgl-source.test.mjs
git commit -m "feat: add WeiClaw paper renderer lifecycle"
```

---

### Task 6: Integrate Physical Page Turns with Existing Interaction

**Files:**
- Modify: `components/WeiClawBook.tsx`
- Modify: `tests/weiclaw-book.test.mjs`

**Interfaces:**
- Consumes: `WeiClawPaperMeshProps`, existing spread page selection, Pointer Events, `useReducedMotion`, and preview Overlay.
- Produces: continuous progress animation, WebGL readiness/fallback state, semantic spread text, and renderer page selection.

- [ ] **Step 1: Replace rigid-page expectations with mesh integration expectations**

Remove the two tests that require `rotateY`, `.weiclaw-book__turning-sheet`, front/back DOM faces, and `--turn-angle`. Replace them with:

```js
test("renders settled and turning content through the deformable paper mesh", () => {
  assert.match(componentSource, /import WeiClawPaperMesh from "\.\/weiclaw\/WeiClawPaperMesh"/);
  assert.match(componentSource, /<WeiClawPaperMesh/);
  assert.match(componentSource, /turningFrontPage=\{turnFrontPage\}/);
  assert.match(componentSource, /turningBackPage=\{turnBackPage\}/);
  assert.match(componentSource, /underPage=\{underPage\}/);
  assert.doesNotMatch(componentSource, /weiclaw-book__turning-sheet/);
  assert.doesNotMatch(stylesheet, /--turn-angle/);
});

test("animates from the released progress instead of rotating a rigid sheet", () => {
  assert.match(componentSource, /animateProgress/);
  assert.match(componentSource, /requestAnimationFrame/);
  assert.match(componentSource, /setDragProgress\(value\)/);
  assert.match(componentSource, /setSpreadStart/);
  assert.doesNotMatch(componentSource, /setDragProgress\(1\)[\s\S]{0,220}setTimeout/);
});

test("keeps semantic page content and reports completed spreads", () => {
  assert.match(componentSource, /aria-live="polite"/);
  assert.match(componentSource, /weiclaw-book__semantic-pages/);
  assert.match(componentSource, /Open .* preview/);
});
```

Keep the existing tests for page count, scene isolation, pointer capture, snap threshold, no wheel listener, preview, and Reduced Motion.

- [ ] **Step 2: Run the integration test and confirm it fails against the rigid implementation**

Run: `node --test tests/weiclaw-book.test.mjs`

Expected: FAIL because `WeiClawPaperMesh` and `animateProgress` are not integrated and the rigid turning sheet remains.

- [ ] **Step 3: Replace timer-based completion with frame-based progress**

Add refs for `animationFrameRef`, `progressRef`, and `meshReady`. Keep `dragProgress` state synchronized with `progressRef` through:

```ts
const setProgress = (value: number) => {
  const clamped = clamp(value);
  progressRef.current = clamped;
  setDragProgress(clamped);
};

const animateProgress = (target: 0 | 1, duration: number, onComplete: () => void) => {
  window.cancelAnimationFrame(animationFrameRef.current);
  if (reduceMotion) {
    setProgress(target);
    onComplete();
    return;
  }
  const from = progressRef.current;
  const startedAt = performance.now();
  const frame = (now: number) => {
    const elapsed = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    setProgress(from + (target - from) * eased);
    if (elapsed < 1) animationFrameRef.current = window.requestAnimationFrame(frame);
    else onComplete();
  };
  animationFrameRef.current = window.requestAnimationFrame(frame);
};
```

`finishTurn` calls `animateProgress(1, TURN_DURATION * (1 - progressRef.current), callback)` and updates `spreadStart` only in the callback. `returnPage` calls `animateProgress(0, TURN_RETURN_DURATION * progressRef.current, callback)`. Cleanup cancels the frame.

- [ ] **Step 4: Pass complete spread state to the mesh and remove the rigid moving DOM sheet**

Inside the physical book, retain shell, contact shadow, gutter, interaction buttons, and semantic DOM fallback. Replace `.weiclaw-book__under-page` and `.weiclaw-book__turning-sheet` markup with:

```tsx
<WeiClawPaperMesh
  leftPage={currentPage}
  rightPage={nextPage}
  underPage={underPage}
  turningFrontPage={turnFrontPage}
  turningBackPage={turnBackPage}
  direction={dragDirection}
  hoverDirection={hoverEdge}
  progress={dragProgress}
  hoverLift={hoverEdge && !dragDirection && !reduceMotion ? 1 : 0}
  reducedMotion={Boolean(reduceMotion)}
  onReady={setMeshReady}
/>
```

Apply `is-mesh-ready` to `.weiclaw-book` only when the first complete frame renders. Keep `BookPage` underneath as the visible fallback while `meshReady` is false, and fade it without removing its semantic content when ready.

- [ ] **Step 5: Preserve preview and accessible spread semantics**

Keep preview Overlay behavior unchanged. Add a visually-hidden semantic container:

```tsx
<div className="weiclaw-book__semantic-pages" aria-live="polite">
  <span>{currentPage.number} {currentPage.type} {currentPage.title.replace("\n", " ")} {currentPage.description}</span>
  {nextPage && <span>{nextPage.number} {nextPage.type} {nextPage.title.replace("\n", " ")} {nextPage.description}</span>}
</div>
```

Retain labeled previous/next buttons. Preserve `openPreview`, ESC close, backdrop close, body overflow restoration, drag click suppression, and no Wheel listener.

- [ ] **Step 6: Verify interaction contracts**

Run:

```bash
npm run test:weiclaw
npx tsc --noEmit
```

Expected: all WeiClaw tests PASS and TypeScript reports no errors.

- [ ] **Step 7: Commit integration only**

```bash
git add components/WeiClawBook.tsx tests/weiclaw-book.test.mjs
git commit -m "feat: connect WeiClaw drag turns to paper mesh"
```

---

### Task 7: Replace Rigid Flip CSS with Canvas, Fallback, and Responsive Physical Styling

**Files:**
- Modify: `app/globals.css:460-532`
- Modify: `app/globals.css:777-780`
- Modify: `app/globals.css:841-848`
- Modify: `app/globals.css:909-921`
- Modify: `tests/weiclaw-book.test.mjs`

**Interfaces:**
- Consumes: `.weiclaw-book__paper-canvas`, `.is-mesh-ready`, `.weiclaw-book__semantic-pages`, shell, gutter, fallback spread, and hit-area markup.
- Produces: exact canvas alignment, fallback crossfade, non-rigid hover affordance, and responsive mesh sizing.

- [ ] **Step 1: Add CSS integration assertions before changing styles**

Append to `tests/weiclaw-book.test.mjs`:

```js
test("layers the WebGL paper inside the photographic shell without rigid flip CSS", () => {
  assert.match(stylesheet, /\.weiclaw-book__paper-canvas[^}]*position:absolute/);
  assert.match(stylesheet, /\.weiclaw-book__paper-canvas[^}]*pointer-events:none/);
  assert.match(stylesheet, /\.weiclaw-book\.is-mesh-ready[^}]*weiclaw-book__spread/);
  assert.match(stylesheet, /\.weiclaw-book__semantic-pages/);
  assert.doesNotMatch(stylesheet, /\.weiclaw-book__turning-sheet/);
  assert.doesNotMatch(stylesheet, /\.weiclaw-book__under-page/);
});
```

- [ ] **Step 2: Run the test and confirm old CSS fails the contract**

Run: `node --test tests/weiclaw-book.test.mjs`

Expected: FAIL because Canvas/fallback selectors are absent and rigid selectors remain.

- [ ] **Step 3: Remove the rigid page variables and selectors**

From `.weiclaw-book`, remove `--turn-angle`, `--turn-curve`, `--turn-shadow`, `--turn-width`, `--turn-lift`, `--turn-under-opacity`, `--turn-face-opacity`, `--turn-edge-opacity`, and `--turn-cast-opacity`.

Delete the complete selector block for:

```css
.weiclaw-book__under-page
.weiclaw-book__under-page--right
.weiclaw-book__under-page--left
.weiclaw-book.is-turn-active .weiclaw-book__under-page
.weiclaw-book__under-page::after
.weiclaw-book__turning-sheet
.weiclaw-book.is-turn-active .weiclaw-book__turning-sheet
.weiclaw-book.is-dragging-turn .weiclaw-book__turning-sheet
.weiclaw-book.is-returning-turn .weiclaw-book__turning-sheet
.weiclaw-book__turning-sheet--next
.weiclaw-book__turning-sheet--previous
.weiclaw-book__turning-sheet-front
.weiclaw-book__turning-sheet-back
.weiclaw-book__turning-sheet-edge
.weiclaw-book__turning-sheet-shadow
```

Do not remove the physical shell, large contact shadow, gutter, edge hit areas, overlay, or preview styles.

- [ ] **Step 4: Add exact Canvas and fallback layers**

Add:

```css
.weiclaw-book__paper-canvas {
  position:absolute;
  z-index:6;
  inset:9.5% 9.2% 13.2%;
  display:block;
  width:81.6%;
  height:77.3%;
  pointer-events:none;
}
.weiclaw-book__spread {
  transition:opacity 180ms ease;
}
.weiclaw-book.is-mesh-ready .weiclaw-book__spread {
  opacity:0;
}
.weiclaw-book:not(.is-mesh-ready) .weiclaw-book__spread {
  opacity:1;
}
.weiclaw-book__semantic-pages {
  position:absolute;
  width:1px;
  height:1px;
  padding:0;
  margin:-1px;
  overflow:hidden;
  clip:rect(0,0,0,0);
  white-space:nowrap;
  border:0;
}
```

Keep `.weiclaw-book__spread` aligned to the shell for fallback. Change edge hover from rigid leaf `rotateY(.65deg)` to a subtle shell-level shadow response or cursor change; the paper corner lift itself comes from `hoverLift` in the mesh.

- [ ] **Step 5: Add responsive canvas placement and Reduced Motion rules**

At `max-width: 820px`, keep the canvas inset proportional to the shell and cap the mesh component’s logical segments to 24 × 10 through its resize decision. At `max-width: 560px`, preserve the current book aspect ratio and ensure the Canvas remains fully inside the shell.

Inside the existing `prefers-reduced-motion` block, disable book Parallax transitions and avoid hover lift:

```css
@media (prefers-reduced-motion: reduce) {
  .weiclaw-book { transition:none; }
  .weiclaw-book__spread { transition:none; }
}
```

- [ ] **Step 6: Run focused tests and production build**

Run:

```bash
npm run test:weiclaw
npx tsc --noEmit
npm run build
```

Expected: all tests PASS and the production build completes successfully.

- [ ] **Step 7: Commit the physical styling migration**

```bash
git add app/globals.css tests/weiclaw-book.test.mjs
git commit -m "style: layer WeiClaw paper mesh into book shell"
```

---

### Task 8: Browser QA, Reference Comparison, and Performance Verification

**Files:**
- Modify when evidence requires: `components/weiclaw/paperGeometry.ts`
- Modify when evidence requires: `components/weiclaw/createPageTexture.ts`
- Modify when evidence requires: `components/weiclaw/webglPaperRenderer.ts`
- Modify when evidence requires: `components/weiclaw/WeiClawPaperMesh.tsx`
- Modify when evidence requires: `components/WeiClawBook.tsx`
- Modify when evidence requires: `app/globals.css`
- Modify when behavior changes: matching `tests/weiclaw-*.test.mjs`
- Create: `design-qa-weiclaw-webgl-settled.png`
- Create: `design-qa-weiclaw-webgl-turn-20.png`
- Create: `design-qa-weiclaw-webgl-turn-50.png`
- Create: `design-qa-weiclaw-webgl-turn-80.png`
- Create: `design-qa-weiclaw-webgl-comparison.png`

**Interfaces:**
- Consumes: completed paper system and the user’s reference screenshot `/var/folders/9j/_8nq6sh97tbf3k2rgt35gg7c0000gn/T/codex-clipboard-9283f247-4574-430b-8317-8b0f4440584b.png`.
- Produces: verified visual evidence, browser interaction evidence, no-console-error evidence, and final regression results.

- [ ] **Step 1: Run the complete automated baseline**

Run:

```bash
npm run test:weiclaw
npm run lint
npm run build
```

Expected: every command exits 0. If lint reports unrelated pre-existing errors, record their exact files and confirm no error comes from a Task 1–7 file before proceeding.

- [ ] **Step 2: Start the verified local preview in the existing browser workflow**

Run in a persistent terminal:

```bash
npm run dev -- --host 127.0.0.1 --port 4173
```

Open the existing Codex in-app browser at `http://127.0.0.1:4173/?audit=verified#project-weiclaw`. Use a 2048 × 1052 viewport, matching the resized reference’s aspect and scene state.

- [ ] **Step 3: Capture the settled state and compare it with the reference in one image**

Capture `design-qa-weiclaw-webgl-settled.png`. Use the existing `scripts/make-image-comparison.mjs` to place the reference and implementation side by side:

```bash
node scripts/make-image-comparison.mjs \
  /var/folders/9j/_8nq6sh97tbf3k2rgt35gg7c0000gn/T/codex-clipboard-9283f247-4574-430b-8317-8b0f4440584b.png \
  design-qa-weiclaw-webgl-settled.png \
  design-qa-weiclaw-webgl-comparison.png
```

Inspect the combined image. Correct visible mismatches in this order: book position/scale, shell/canvas registration, outer paper silhouette, gutter depth, screenshot deformation at the spine, shared light across printed content, then editorial crop/spacing.

- [ ] **Step 4: Capture real drag states at 20%, 50%, and 80%**

Use the right page edge and drag left by `0.20`, `0.50`, and `0.80` of the interaction width while Pointer Capture remains active. Capture each state before release.

At 20% verify: outer edge rises first; inner 12% remains compressed; cast shadow is broad and soft.

At 50% verify: the page cross-section is visibly curved; top/bottom outlines are not straight; screenshot, title, and note bend together; the shadow is narrow and deepest near the spine.

At 80% verify: most content is revealed on the left; spine transition is still curved; the page back and thin edge remain visible; shadow direction has switched.

- [ ] **Step 5: Verify completion, return, reverse, preview, and scroll coexistence**

- Release below threshold and confirm continuous return from the current position.
- Release above threshold and confirm the spread index changes only after the page lands.
- Drag the left edge to perform the mirrored previous turn.
- Click right and left page controls to turn without dragging.
- Open the current screenshot preview, close with ESC, reopen, and close by backdrop.
- Scroll to the previous and next project; confirm the book installs no wheel handler and rendering pauses offscreen.
- Resize below 820px and 560px; confirm no canvas/shell drift and no clipped paper.
- Emulate Reduced Motion; confirm Parallax and hover curl are removed while navigation remains usable.

- [ ] **Step 6: Inspect runtime behavior and rendering cost**

Confirm the browser console has no Shader compile/link, image decode, Context, ResizeObserver, or React cleanup errors. In the Performance panel or RAF instrumentation, verify no frames are requested while the scene is settled and the pointer is idle; while dragging, verify frame work stays below approximately 16.7ms on the current Mac.

- [ ] **Step 7: Re-run verification after visual corrections**

Run:

```bash
npm run test:weiclaw
npm run lint
npm run build
git diff --check
```

Expected: all in-scope tests and build PASS, no whitespace errors, no new console errors, and the latest combined comparison clearly shows a printed curved page rather than a flat screenshot card.

- [ ] **Step 8: Commit only final in-scope corrections and QA evidence**

Stage only files actually changed by visual correction plus the five named QA images:

```bash
git add components/weiclaw data/weiclaw-book.ts components/WeiClawBook.tsx app/globals.css tests/weiclaw-*.test.mjs design-qa-weiclaw-webgl-*.png
git commit -m "fix: refine WeiClaw physical page turning"
```

Do not stage older QA files, scripts, assets, or unrelated dirty files.

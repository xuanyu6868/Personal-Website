import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentSource = await readFile(
  new URL("../components/WeiClawBook.tsx", import.meta.url),
  "utf8",
);
const pageData = await readFile(
  new URL("../data/weiclaw-book.ts", import.meta.url),
  "utf8",
);
const portfolioSource = await readFile(
  new URL("../components/Portfolio.tsx", import.meta.url),
  "utf8",
);
const stylesheet = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const sequenceSource = await readFile(
  new URL("../components/weiclaw/WeiClawBookSequence.tsx", import.meta.url),
  "utf8",
);
const turnSource = await readFile(
  new URL("../components/weiclaw/sequenceTurn.ts", import.meta.url),
  "utf8",
);
const renderScript = await readFile(
  new URL("../scripts/render-weiclaw-book-turn.py", import.meta.url),
  "utf8",
);
const designSource = `${componentSource}\n${stylesheet}`;

test("defines five distinct WeiClaw book pages with real raster media", () => {
  assert.equal((pageData.match(/\n\s+id: "[a-z-]+",/g) ?? []).length, 5);
  assert.match(pageData, /images\/weiclaw\/pages\/dashboard\.png/);
  assert.match(pageData, /images\/weiclaw\/pages\/chat\.png/);
  assert.match(pageData, /images\/weiclaw\/pages\/customer\.png/);
  assert.match(pageData, /images\/weiclaw\/pages\/agent\.png/);
  assert.match(pageData, /images\/weiclaw\/pages\/settings\.png/);
});

test("renders the book only in the WeiClaw project scene", () => {
  assert.match(componentSource, /export default function WeiClawBook/);
  assert.match(portfolioSource, /project\.id === "weiclaw"[\s\S]*?<WeiClawBook\s*\/>/);
  assert.match(portfolioSource, /import WeiClawBook from "\.\/weiclaw-preview\/WeiClawBook"/);
});

test("supports pointer drag, edge click, pointer capture, and snap thresholds", () => {
  assert.match(componentSource, /onPointerDown/);
  assert.match(componentSource, /onPointerMove/);
  assert.match(componentSource, /onPointerUp/);
  assert.match(componentSource, /setPointerCapture/);
  assert.match(componentSource, /shouldCompletePaperTurn/);
  assert.match(componentSource, /instantaneousVelocity/);
  assert.match(componentSource, /const finishTurn[\s\S]*?movedRef\.current = false/);
  assert.match(componentSource, /<button[^>]+aria-label="Previous page"/);
  assert.match(componentSource, /<button[^>]+aria-label="Next page"/);
  assert.match(componentSource, /aria-label="Previous page"[^>]+onPointerDown/);
  assert.match(componentSource, /aria-label="Next page"[^>]+onPointerDown/);
  assert.match(componentSource, /suppressClickRef/);
  assert.match(componentSource, /onClick=\{\(event\) => \{ event\.stopPropagation\(\); onOpen\(page, event\.currentTarget\); \}\}/);
});

test("plays the prerendered turn sequence under the DOM spread", () => {
  assert.match(componentSource, /import WeiClawBookSequence from "\.\/weiclaw\/WeiClawBookSequence"/);
  assert.match(componentSource, /<WeiClawBookSequence/);
  assert.match(componentSource, /direction=\{dragDirection\}/);
  assert.match(componentSource, /progress=\{dragProgress\}/);
  assert.match(componentSource, /spreadStart=\{spreadStart\}/);
  assert.match(sequenceSource, /sequence\/weiclaw-turn\/spread-/);
  assert.match(sequenceSource, /resolveSequenceSpread/);
  assert.match(turnSource, /TURN_FRAME_COUNT = 41/);
  assert.match(turnSource, /resolveSequenceSpread/);
  assert.match(turnSource, /spreadStart - SPREAD_STEP/);
  assert.match(turnSource, /turn\.direction === "previous" \? lastFrame - forwardFrame : forwardFrame/);
  assert.match(designSource, /perspective/);
  assert.doesNotMatch(componentSource, /weiclaw-book__turning-sheet/);
});

test("models the physical book body in Blender instead of a photographic shell", () => {
  assert.doesNotMatch(componentSource, /book-shell\.png/);
  assert.doesNotMatch(componentSource, /book-page-stack\.png/);
  assert.doesNotMatch(componentSource, /weiclaw-book__gutter/);
  assert.match(renderScript, /weiclaw-book\.blend/);
  assert.match(renderScript, /--spread-start/);
  assert.match(renderScript, /--physical-pages/);
  assert.match(renderScript, /--front-page/);
  assert.match(renderScript, /--back-page/);
  assert.match(renderScript, /Backfacing/);
  assert.match(renderScript, /add_page_uvs/);
  assert.match(renderScript, /spread-\{SPREAD_START:04d\}/);
  assert.match(renderScript, /Page_\{index \+ 1:03d\}/);
  assert.match(renderScript, /pose_page_stack/);
  assert.match(renderScript, /bpy\.data\.objects\.remove\(block, do_unlink=True\)/);
  assert.match(renderScript, /frame-\{frame_index:04d\}\.webp/);
  assert.match(renderScript, /film_transparent = True/);
  assert.match(renderScript, /paper_positions\(TURNING_COLUMNS/);
  assert.match(stylesheet, /\.weiclaw-book__canvas\s*\{[^}]*position:absolute/);
});

test("reveals under-pages and veils covered pages while the sequence turns", () => {
  assert.match(componentSource, /weiclaw-book__page--under/);
  assert.match(componentSource, /is-veiled/);
  assert.match(componentSource, /resolveActiveTurn/);
  assert.match(componentSource, /const nextSpreadRight = weiclawBookPages\[spreadStart \+ 3\] \?\? null/);
  assert.match(componentSource, /turnLiftSide/);
  assert.match(componentSource, /turnLandSide/);
});

test("animates completion and return from the released sequence progress", () => {
  assert.match(componentSource, /TURN_RETURN_DURATION/);
  assert.match(componentSource, /animatePaperProgress/);
  assert.match(componentSource, /const returnPage/);
  assert.match(componentSource, /setReturning\(direction\)/);
  assert.match(componentSource, /progressRef/);
  assert.match(componentSource, /setProgress/);
});

test("keeps semantic page content and reports completed spreads", () => {
  assert.match(componentSource, /aria-live="polite"/);
  assert.match(componentSource, /weiclaw-book__semantic-pages/);
  assert.match(componentSource, /Open \$\{page\.title/);
});

test("places a concise Chinese page-turn cue beside the book", () => {
  assert.match(componentSource, /拖动页角翻页/);
  assert.doesNotMatch(componentSource, /DRAG THE PAGE TO EXPLORE/);
  assert.match(stylesheet, /\.weiclaw-book__status\s*\{[^}]*font-size:(?:9|10)px/);
});

test("layers the sequence canvas beneath the DOM spread without clip-path switching", () => {
  assert.match(stylesheet, /\.weiclaw-book__canvas\s*\{[^}]*position:absolute/);
  assert.match(stylesheet, /\.weiclaw-book__canvas\s*\{[^}]*pointer-events:none/);
  assert.doesNotMatch(stylesheet, /\.weiclaw-book__canvas\s*\{[^}]*clip-path/);
  assert.match(stylesheet, /\.weiclaw-book\.is-sequence-ready\s+\.weiclaw-book__canvas/);
  assert.match(stylesheet, /\.weiclaw-book__semantic-pages/);
  assert.match(stylesheet, /\.weiclaw-book__page--under/);
  assert.match(stylesheet, /\.weiclaw-book__leaf\.is-veiled/);
  assert.doesNotMatch(stylesheet, /\.weiclaw-book__turning-sheet/);
  assert.doesNotMatch(stylesheet, /\.weiclaw-book__under-page/);
});

test("does not install a wheel handler for the book and honors reduced motion", () => {
  assert.doesNotMatch(componentSource, /addEventListener\(["']wheel/);
  assert.match(componentSource, /useReducedMotion/);
  assert.match(designSource, /prefers-reduced-motion/);
  assert.match(componentSource, /if \(reduceMotion\)[\s\S]*?setParallax\(\{ x: 0, y: 0 \}\)/);
  assert.match(componentSource, /removeEventListener/);
});

test("preserves the book framing on narrow screens", () => {
  assert.doesNotMatch(stylesheet, /@media \(max-width:560px\)[\s\S]*?\.weiclaw-book\s*\{[^}]*aspect-ratio:1\.28/);
});

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
  assert.match(portfolioSource, /import WeiClawBook from "\.\/WeiClawBook"/);
});

test("supports pointer drag, edge click, pointer capture, and snap thresholds", () => {
  assert.match(componentSource, /onPointerDown/);
  assert.match(componentSource, /onPointerMove/);
  assert.match(componentSource, /onPointerUp/);
  assert.match(componentSource, /setPointerCapture/);
  assert.match(componentSource, /DRAG_THRESHOLD/);
  assert.match(componentSource, /const finishTurn[\s\S]*?movedRef\.current = false/);
  assert.match(componentSource, /<button[^>]+aria-label="Previous page"/);
  assert.match(componentSource, /<button[^>]+aria-label="Next page"/);
  assert.match(componentSource, /aria-label="Previous page"[^>]+onPointerDown/);
  assert.match(componentSource, /aria-label="Next page"[^>]+onPointerDown/);
  assert.match(componentSource, /suppressClickRef/);
  assert.match(componentSource, /onClick=\{\(event\) => \{ event\.stopPropagation\(\); onOpen\(page\); \}\}/);
});

test("renders settled and turning content through the deformable paper mesh", () => {
  assert.match(componentSource, /import WeiClawPaperMesh from "\.\/weiclaw\/WeiClawPaperMesh"/);
  assert.match(componentSource, /<WeiClawPaperMesh/);
  assert.match(componentSource, /turningFrontPage=\{turnFrontPage\}/);
  assert.match(componentSource, /turningBackPage=\{turnBackPage\}/);
  assert.match(componentSource, /underPage=\{underPage\}/);
  assert.match(designSource, /perspective/);
  assert.doesNotMatch(componentSource, /weiclaw-book__turning-sheet/);
});

test("builds the physical silhouette from the photographic shell and full page leaves", () => {
  assert.match(componentSource, /book-shell\.png/);
  assert.match(componentSource, /weiclaw-book__gutter/);
  assert.match(componentSource, /WeiClawPaperMesh/);
  assert.match(stylesheet, /\.weiclaw-book__shell[^}]*object-fit:contain/);
  assert.match(stylesheet, /\.weiclaw-book__gutter[^}]*linear-gradient/);
  assert.doesNotMatch(componentSource, /Array\.from\(\{ length: 14/);
});

test("keeps the settled book normal without a baked or separate curl asset", () => {
  assert.doesNotMatch(componentSource, /page-curl-v2\.png/);
  assert.doesNotMatch(componentSource, /reference-book-01-clean\.png/);
  assert.doesNotMatch(componentSource, /weiclaw-book__page-curl/);
  assert.doesNotMatch(componentSource, /showReferenceSpread/);
});

test("passes distinct front, back, and under-page textures to the mesh", () => {
  assert.match(componentSource, /turningFrontPage=\{turnFrontPage\}/);
  assert.match(componentSource, /turningBackPage=\{turnBackPage\}/);
  assert.match(componentSource, /underPage=\{underPage\}/);
  assert.match(componentSource, /direction=\{dragDirection\}/);
  assert.match(componentSource, /progress=\{dragProgress\}/);
});

test("animates completion and return from the released mesh progress", () => {
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

test("does not install a wheel handler for the book and honors reduced motion", () => {
  assert.doesNotMatch(componentSource, /addEventListener\(["']wheel/);
  assert.match(componentSource, /useReducedMotion/);
  assert.match(designSource, /prefers-reduced-motion/);
  assert.match(componentSource, /removeEventListener/);
});

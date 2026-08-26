import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentSource = await readFile(new URL("../components/Portfolio.tsx", import.meta.url), "utf8");
const stylesheet = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("keeps Agent2Agent feature cards in a scene-wide bottom row", () => {
  const rightColumnStart = componentSource.indexOf('<div className="a2a-v2__right">');
  const featureRowStart = componentSource.indexOf('<Reveal className="a2a-v2__features"');

  assert.ok(rightColumnStart >= 0, "the Agent2Agent diagram column should exist");
  assert.ok(featureRowStart > rightColumnStart, "feature cards should follow the diagram column");
  assert.match(
    stylesheet,
    /\.a2a-v2\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/,
    "the scene should reserve a bottom grid row for feature cards",
  );
  assert.match(
    stylesheet,
    /\.a2a-v2__features\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/,
    "feature cards should span the full scene width",
  );
});

test("keeps the Agent2Agent title inside the left column", () => {
  assert.match(
    stylesheet,
    /\.a2a-v2__title\s*\{[^}]*font-size:\s*clamp\(64px,\s*7vw,\s*120px\)[^}]*max-width:\s*100%/,
    "the title should use a bounded desktop size and width",
  );
});

test("anchors the Agent2Agent diagram to the right column start", () => {
  assert.match(
    stylesheet,
    /\.a2a-diagram__row\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*auto\s+minmax\(40px,\s*1fr\)\s+auto\s+minmax\(40px,\s*1fr\)\s+auto/,
    "the diagram row should use fixed node columns and flexible connectors",
  );
  assert.match(
    stylesheet,
    /\.a2a-diagram__node\s*\{[^}]*flex:\s*0\s+0\s+auto/,
    "diagram nodes should not expand away from the left edge",
  );
});

test("aligns the Agent2Agent diagram with the left title", () => {
  assert.match(
    stylesheet,
    /\.a2a-v2__right\s*\{[^}]*padding-top:\s*calc\(clamp\(16px,\s*2\.4vh,\s*28px\)\s*\+\s*clamp\(8px,\s*1\.2vh,\s*14px\)\s*\+\s*clamp\(14px,\s*1\.8vh,\s*18px\)\)/,
    "the diagram column should offset past the left section label to align with the title",
  );
});

test("keeps the note sync gallery in the 04 scene", () => {
  const labelSceneStart = componentSource.indexOf("function NoteSyncGalleryScene");
  const labelSceneEnd = componentSource.indexOf("function Capabilities");
  const labelSceneSource = componentSource.slice(labelSceneStart, labelSceneEnd);

  assert.match(
    labelSceneSource,
    /id=["']project-wechat-obsidian["']/,
    "the WeChat to Obsidian scene should keep its dedicated anchor",
  );
  assert.match(
    labelSceneSource,
    /label=["']微信接入知识库["']/,
    "the scene should keep the note sync page label",
  );
  assert.match(
    stylesheet,
    /\.note-sync-scene\s*\{[^}]*justify-content:flex-start/,
    "the note sync scene should align its content from the top",
  );
  assert.match(
    componentSource,
    /<NoteSyncGallery\s*\/>/,
    "the 04 scene should render the immersive note sync gallery",
  );
});

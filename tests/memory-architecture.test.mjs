import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const portfolioSource = await readFile(
  new URL("../components/Portfolio.tsx", import.meta.url),
  "utf8",
);
const gallerySource = await readFile(
  new URL("../components/NoteSyncGallery.tsx", import.meta.url),
  "utf8",
);

const sequenceSource = portfolioSource.slice(
  portfolioSource.indexOf("function ScrollFrameSequence"),
  portfolioSource.indexOf("function AmbientBackground"),
);
const portraitSource = portfolioSource.slice(
  portfolioSource.indexOf("function InteractivePortrait"),
  portfolioSource.indexOf("function ScrollFrameSequence"),
);
const snapSource = portfolioSource.slice(
  portfolioSource.indexOf("function SceneSnapController"),
  portfolioSource.indexOf("export default function Portfolio"),
);

test("preserves the full-resolution sequence and 29.97fps draw target", () => {
  assert.match(portfolioSource, /const FRAME_COUNT = 815/);
  assert.match(portfolioSource, /const FRAME_WIDTH = 1920/);
  assert.match(portfolioSource, /const FRAME_HEIGHT = 1080/);
  assert.match(portfolioSource, /const DRAW_INTERVAL = 1000 \/ \(30000 \/ 1001\)/);
});

test("bounds the resident hot frame budget to at most 24 frames", () => {
  assert.match(portfolioSource, /MAX_HOT_FRAMES\s*=\s*(?:16|17|18|19|20|21|22|23|24)/);
  assert.match(portfolioSource, /MAX_ACTIVE_DECODES\s*=\s*3/);
  assert.doesNotMatch(sequenceSource, /Math\.min\(120/);
  assert.doesNotMatch(sequenceSource, /HOT_FRAME_RADIUS\s*=\s*60/);
});

test("prioritizes nearby frames ahead of distant fast-scroll predictions", () => {
  assert.match(portfolioSource, /const PREDICTED_FRAME_PRIORITY = 20/);
  assert.match(
    sequenceSource,
    /addCandidate\(safeCenter, 0\);[\s\S]*?addCandidate\(predictedFrame, PREDICTED_FRAME_PRIORITY\)/,
    "the current frame must be queued before a distant prediction",
  );
  assert.match(
    sequenceSource,
    /PREDICTED_FRAME_PRIORITY \+ 4 \+ distance/,
    "predicted follow-up frames should remain lower priority than nearby frames",
  );
});

test("throttles hot-window scheduling during fast scroll", () => {
  assert.match(portfolioSource, /const FAST_WINDOW_SCHEDULE_INTERVAL_MS = 64/);
  assert.match(
    sequenceSource,
    /const scheduleHotWindowIfNeeded = \(center: number, now: number\) =>/,
    "fast scroll should not rebuild the decode window on every scroll event",
  );
  assert.match(
    sequenceSource,
    /scheduleHotWindowIfNeeded\(desiredFrameRef\.current, now\)/,
  );
});

test("uses the overview as a fast-scroll fallback until the target frame is ready", () => {
  assert.match(
    sequenceSource,
    /if \(bestFrame !== null && \(bestFrame === target \|\| scrollVelocity < FAST_SCROLL_FRAME_VELOCITY\)\)/,
    "fast scroll should not paint a distant stale frame while the target decodes",
  );
  assert.match(sequenceSource, /drawFrame\(target, true\)/);
  assert.doesNotMatch(
    sequenceSource,
    /!allowOverview \|\| hasPaintedHighResolution \|\| !drawOverviewFrame/,
    "the overview fallback must remain available after the first high-resolution frame",
  );
});

test("does not run an all-frame image-bitmap warmup", () => {
  assert.doesNotMatch(sequenceSource, /prefetchAllFrames/);
  assert.doesNotMatch(sequenceSource, /BACKGROUND_PREFETCH_WORKERS/);
  assert.doesNotMatch(sequenceSource, /PREFETCH_AFTER_MS/);
});

test("closes stale and evicted decoded frames and releases the overview", () => {
  assert.match(sequenceSource, /source\?\.close\?\.\(\)/);
  assert.match(sequenceSource, /frame\.close\?\.\(\)/);
  assert.match(sequenceSource, /const releaseOverview = \(\) =>/);
  assert.match(sequenceSource, /releaseOverview\(\)/);
});

test("cleans the capture-phase wheel listener symmetrically", () => {
  assert.match(snapSource, /addEventListener\("wheel",\s*onWheel,\s*\{\s*passive:\s*false,\s*capture:\s*true\s*\}\)/);
  assert.match(snapSource, /removeEventListener\("wheel",\s*onWheel,\s*\{\s*capture:\s*true\s*\}\)/);
});

test("releases every WebGL resource created by InteractivePortrait", () => {
  assert.match(portraitSource, /let positionBuffer: WebGLBuffer \| null = null/);
  assert.match(portraitSource, /positionBuffer = gl\.createBuffer\(\)/);
  assert.match(portraitSource, /gl\.deleteBuffer\(positionBuffer\)/);
  assert.match(portraitSource, /gl\.deleteTexture\(portraitTexture\)/);
  assert.match(portraitSource, /gl\.deleteTexture\(spiderTexture\)/);
  assert.match(portraitSource, /gl\.deleteProgram\(program\)/);
});

test("pauses frame scheduling when the document is hidden", () => {
  assert.match(sequenceSource, /document\.addEventListener\("visibilitychange"/);
  assert.match(sequenceSource, /document\.removeEventListener\("visibilitychange"/);
});

test("keeps the gallery source images full quality while opting out of eager loading", () => {
  assert.match(gallerySource, /loading="lazy"/);
  assert.match(gallerySource, /fetchPriority="high"/);
  assert.match(gallerySource, /item\.image/);
});

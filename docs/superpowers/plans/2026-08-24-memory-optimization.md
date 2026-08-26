# Personal Website Memory Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce controllable page memory toward 300MB while preserving the existing 1920×1080 sequence, 815 frames, 29.97fps draw target, scroll relationship, scene snap, InteractivePortrait, and NoteSyncGallery behavior.

**Architecture:** Keep the single full-screen Canvas 2D renderer, but replace the symmetric 120-frame resident cache and all-frame decode warmup with a bounded direction-aware scheduler. The scheduler will use velocity/prediction, latest-frame-wins queue invalidation, deduplicated decode jobs, explicit stale bitmap closure, visibility pausing, and a shared memory budget. Preserve the overview only until the first stable high-resolution paint, and keep gallery source quality while avoiding eager decoding of every full-size PNG.

**Tech Stack:** React 19, TypeScript, Canvas 2D, `createImageBitmap`, WebGL, Framer Motion, Node test runner, Vinext/Vite.

**Spec:** `/Users/xuanyumacbook/.codex/attachments/653b0e2c-2120-4bf1-b7d3-bda471606cf7/pasted-text-1.txt`

## Global Constraints

- Do not lower 1920×1080 frame resolution, image quality, frame count, or the 29.97fps draw target.
- Do not remove the background animation or change scroll/video linkage, scene snapping, UI, InteractivePortrait, or NoteSyncGallery visuals/interactions.
- Do not use reduced fast-scroll smoothness as the primary memory solution.
- Keep Blob URLs revoked, stale/evicted ImageBitmaps closed, and every WebGL resource explicitly released.
- Each core stage must leave `npm run build` passing.
- Memory claims require real browser/runtime measurements; raw decoded-size arithmetic is not a measurement.

### Task 1: Establish baseline and resource-lifecycle regression tests

**Files:**
- Create: `tests/memory-architecture.test.mjs`
- Create: `docs/superpowers/plans/2026-08-24-memory-baseline.md` only if measurement tooling produces a reproducible baseline artifact.
- Modify: none initially.

**Interfaces:**
- Tests consume source-level invariants and current build output; they must not change production behavior.
- Tests produce a repeatable guard for listener symmetry, WebGL cleanup, cache bounds, no all-frame prefetch, and unchanged frame constants.

- [ ] Write failing tests for the required invariants before production edits.
- [ ] Run the focused test and confirm it fails for the current implementation, especially on the capture mismatch, missing `deleteBuffer`, 120-frame budget, and `prefetchAllFrames`.
- [ ] Record the current baseline build/test status without changing source behavior.

### Task 2: Fix lifecycle leaks

**Files:**
- Modify: `components/Portfolio.tsx:132-355` for the WebGL buffer handle and cleanup.
- Modify: `components/Portfolio.tsx:1582-1861` for symmetric wheel listener options and timer/RAF cleanup.

**Interfaces:**
- `InteractivePortrait` must retain its existing WebGL rendering behavior while deleting buffer, textures, program, and any other created resource during cleanup.
- `SceneSnapController` must use the same capture value during add/remove and cancel all owned timers/RAF handles.

- [ ] Make the lifecycle regression tests fail for the current code.
- [ ] Implement only the minimal cleanup changes.
- [ ] Run focused tests and `npm run build`.

### Task 3: Introduce a bounded frame budget and scheduler state

**Files:**
- Modify: `components/Portfolio.tsx:21-51,366-733`.
- Modify: `tests/memory-architecture.test.mjs` if test-facing constants/invariants need to be made explicit.

**Interfaces:**
- Add one centralized budget containing `MAX_HOT_FRAMES` (target 16–20, never above 24), `MAX_ACTIVE_DECODES` (start at 3), and window/prediction thresholds.
- Preserve `FRAME_COUNT = 815`, `FRAME_WIDTH = 1920`, `FRAME_HEIGHT = 1080`, and `DRAW_INTERVAL = 1000 / (30000 / 1001)`.
- Keep `hotFrames`, `activeDecodes`, and `decodeQueue` as distinct deduplicated layers.

- [ ] Add failing tests for the new budget bounds and preserved visual constants.
- [ ] Replace the default 120-frame budget with a centralized bounded budget.
- [ ] Remove the all-815 `prefetchAllFrames` decode warmup and its timer.
- [ ] Run focused tests and build.

### Task 4: Implement velocity-aware latest-frame-wins scheduling

**Files:**
- Modify: `components/Portfolio.tsx:366-733`.
- Modify: `tests/memory-architecture.test.mjs`.

**Interfaces:**
- Track `lastScrollY`, `lastScrollAt`, `scrollVelocity`, `direction`, and a predicted frame.
- `scheduleHotWindow` must reserve most budget ahead of the current direction, retain a small reverse window, and prioritize predicted/current targets.
- Queue invalidation must remove or deprioritize stale queued jobs; active fetches may finish but stale decoded bitmaps must close immediately.
- No frame may be queued if it is already hot, active, or queued.

- [ ] Add failing tests for direction windows, velocity bands, stale queue invalidation, and three-layer deduplication.
- [ ] Implement scheduler and queue changes without changing Canvas draw cadence.
- [ ] Run focused tests and build.

### Task 5: Add explicit stale/eviction/visibility lifecycle

**Files:**
- Modify: `components/Portfolio.tsx:366-733`.
- Modify: `tests/memory-architecture.test.mjs`.

**Interfaces:**
- Every decoded frame must either enter the bounded cache or call `close()` immediately when stale/aborted/destroyed.
- Eviction must prefer distance, reverse direction, and non-predicted frames before recent forward frames.
- `document.visibilitychange` pauses new preload/decode work in the background and rebuilds the current window on foreground without restarting from frame zero.
- Overview must be released after the first stable high-resolution paint while preserving the initial fallback.

- [ ] Add failing tests for stale bitmap closure, visibility pause/resume, eviction priority, and overview release.
- [ ] Implement cleanup and visibility behavior.
- [ ] Run focused tests and build.

### Task 6: Reduce eager gallery image decoding without changing source quality

**Files:**
- Modify: `components/NoteSyncGallery.tsx:245-505`.
- Modify: `app/globals.css` only if loading attributes require no visual CSS change.
- Modify: `tests/memory-architecture.test.mjs`.

**Interfaces:**
- Keep the current image URLs and full-resolution lightbox quality.
- Avoid intentionally eager-loading every full-size PNG where browser loading semantics allow it; current/adjacent images remain available for the existing visual layout.
- Lightbox remains portal-based and visually unchanged.

- [ ] Add failing source-level tests for preserved image URLs and non-eager loading policy.
- [ ] Implement the smallest loading-lifecycle change.
- [ ] Run focused tests and build.

### Task 7: Browser measurement and acceptance verification

**Files:**
- Create: `scripts/measure-frame-runtime.mjs` only if a local browser automation path is available and the script can report real metrics.
- Modify: `components/Portfolio.tsx` only for development-only `window.__FRAME_DEBUG__` metrics if needed.
- Modify: `tests/memory-architecture.test.mjs` for debug metric shape if added.

**Interfaces:**
- Development metrics may expose current/desired/rendered frame, cache size, active decodes, queue length, direction, velocity, and predicted frame; production must not render UI or incur material work.
- Measurement must record initial, 25%, 50%, 75%, bottom, fast reverse, five round trips, and 30–60s idle states, separating JS heap, renderer/page, image/canvas, and GPU where the browser exposes them.

- [ ] Run `npm run build` and the full existing test suite.
- [ ] Run browser measurements against the local app if browser automation is available.
- [ ] Compare visual/interaction behavior for slow scroll, fast down, fast reversal, repeated traversal, and idle.
- [ ] Report actual measurements, limitations, and whether the controllable page memory reaches 300MB; do not substitute estimates for missing browser data.

# WeiClaw Flipbook Layer Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing WeiClaw book appearance while making page turns behave like a single curved soft leaf and eliminating the fallback-layer duplication seen during texture refreshes.

**Architecture:** Preserve the current WebGL renderer, page textures, shell image, and settled geometry. Add two small pure contracts: one for the reference flip pose envelope and one for the paper-layer lifecycle. Apply the pose only inside `createPaperMesh`'s turning branch, and let `WeiClawPaperMesh` keep the DOM fallback hidden once WebGL has rendered successfully.

**Tech Stack:** React/TypeScript, WebGL 1 renderer, Node `node:test`, Vite preview.

**Spec:** `docs/superpowers/specs/2026-09-06-weiclaw-flipbook-layer-fix.md`

## Global Constraints

- Keep the current book shell, paper material, page artwork, typography, static spread layout, and surrounding portfolio styling unchanged.
- Do not add `quick_flipbook`, Three.js, new artwork, or hosting/deployment changes.
- Work in the existing `codex/weiclaw-webgl-paper` workspace and preserve unrelated dirty files.
- Follow red-green-refactor: every production behavior below starts with a focused failing test.
- Keep the retained local development server running through validation.

### Task 1: Lock the reference flip pose and fallback-layer behavior with failing tests

**Files:**
- Create: `tests/weiclaw-paper-turn.test.mjs`
- Test existing: `components/weiclaw/paperTurnPose.ts`
- Test existing: `components/weiclaw/paperLayerState.ts`

**Interfaces:**
- `resolvePaperTurnPose(progress: number, direction: "next" | "previous", curveIntensity?: number): { rotation: number; bend: number; twist: number; curveIntensity: number }`
- `reducePaperLayerState(state: "fallback" | "webgl", event: "frame-rendered" | "texture-refresh" | "renderer-error" | "context-lost" | "texture-error"): "fallback" | "webgl"`

- [x] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";

import { reducePaperLayerState } from "../components/weiclaw/paperLayerState.ts";
import { resolvePaperTurnPose } from "../components/weiclaw/paperTurnPose.ts";

test("matches the reference flip envelope at the page-turn endpoints and midpoint", () => {
  const start = resolvePaperTurnPose(0, "next");
  const middle = resolvePaperTurnPose(0.5, "next");
  const end = resolvePaperTurnPose(1, "next");

  assert.equal(start.rotation, 0);
  assert.equal(end.rotation, Math.PI);
  assert.ok(Math.abs(middle.rotation - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(middle.bend + 0.5) < 1e-9);
  assert.ok(Math.abs(middle.twist - 0.1) < 1e-9);
  assert.equal(start.curveIntensity, -1);
  assert.equal(end.curveIntensity, 1);
});

test("keeps the WebGL layer active while adjacent textures refresh", () => {
  let state = "fallback";
  state = reducePaperLayerState(state, "frame-rendered");
  state = reducePaperLayerState(state, "texture-refresh");
  state = reducePaperLayerState(state, "texture-error");
  assert.equal(state, "webgl");
  assert.equal(reducePaperLayerState(state, "context-lost"), "fallback");
  assert.equal(reducePaperLayerState("fallback", "renderer-error"), "fallback");
});
```

- [x] **Step 2: Run the focused test to verify it fails for the intended reason**

Run: `node --test tests/weiclaw-paper-turn.test.mjs`

Expected: FAIL because the two new production modules do not exist yet.

### Task 2: Implement the pure reference pose and layer-state contracts

**Files:**
- Create: `components/weiclaw/paperTurnPose.ts`
- Create: `components/weiclaw/paperLayerState.ts`
- Test: `tests/weiclaw-paper-turn.test.mjs`

**Interfaces:**
- `resolvePaperTurnPose` clamps progress to `[0, 1]`, uses `rotation = Math.PI * progress`, `bend = Math.min(-Math.sin(rotation) / 2, -0.0001) * directionSign`, `twist = Math.sin(rotation) / 10`, and `curveIntensity = (-1 + 2 * progress) * (-Math.sin(rotation) + 1) * clampedCurveIntensity`.
- `reducePaperLayerState` maps `frame-rendered` to `webgl`, `context-lost`/`renderer-error` to `fallback`, and leaves the state unchanged for `texture-refresh`/`texture-error`.

- [x] **Step 1: Implement only the minimum formulas and reducer**
- [x] **Step 2: Run `node --test tests/weiclaw-paper-turn.test.mjs` and verify PASS**

### Task 3: Apply the reference pose to the moving sheet without changing settled styling

**Files:**
- Modify: `components/weiclaw/paperGeometry.ts`
- Test: `tests/weiclaw-paper-geometry.test.mjs`

**Interfaces:**
- Extend `PaperMeshOptions` with optional `curveIntensity?: number` defaulting to `1`.
- Import `resolvePaperTurnPose` only for `mode === "turning"`.

- [x] **Step 1: Add a failing geometry test**

```js
test("carries a reference-like vertical twist into the moving sheet", () => {
  const settled = createPaperMesh({ ...options, side: "right", mode: "settled", progress: 0 });
  const turning = createPaperMesh({
    ...options,
    side: "right",
    mode: "turning",
    direction: "next",
    progress: 0.5,
  });
  const settledSilhouette = position(settled, 40, 0)[1] - position(settled, 40, 16)[1];
  const turningSilhouette = position(turning, 40, 0)[1] - position(turning, 40, 16)[1];
  assert.ok(Math.abs(turningSilhouette - settledSilhouette) > 0.004);
});
```

- [x] **Step 2: Run `node --test tests/weiclaw-paper-geometry.test.mjs` and verify the new test fails before the geometry uses the pose**
- [x] **Step 3: In the turning branch, use the pose's bend/twist/curve terms only for the moving sheet**

Keep the existing settled branch byte-for-byte in behavior. Preserve the spine anchor, page-end continuity, UV mapping, edge mesh, shadow mesh, and corner-lift behavior. Add the reference terms to the existing tangent/height calculation with endpoint-safe sine weighting so progress `0` and `1` still match the settled meshes.

- [x] **Step 4: Run `node --test tests/weiclaw-paper-geometry.test.mjs` and verify all geometry tests pass**

### Task 4: Stop the fallback DOM layer from reappearing during normal updates

**Files:**
- Modify: `components/weiclaw/WeiClawPaperMesh.tsx`
- Modify: `app/globals.css`
- Test: `tests/weiclaw-paper-lifecycle.test.mjs`

**Interfaces:**
- Replace the current readiness reset on every texture-request effect with `reducePaperLayerState` transitions.
- A successful WebGL frame sets the parent `meshReady` state to `true`; texture refresh/error preserves the last rendered WebGL state; renderer errors and context loss restore the fallback state.

- [x] **Step 1: Wire the reducer into renderer success/error, context loss, and texture refresh paths**
- [x] **Step 2: Keep `.weiclaw-book.is-mesh-ready .weiclaw-book__spread` visually hidden and add `pointer-events: none` only in that state**
- [x] **Step 3: Run `node --test tests/weiclaw-paper-lifecycle.test.mjs` and `node --test tests/weiclaw-paper-turn.test.mjs`**

Expected: PASS with no source-level readiness reset during normal texture refresh.

### Task 5: Run project validation and browser verification

**Files:**
- No planned source changes; only fix actual compile/test failures.

- [x] **Step 1: Run `npm run test:weiclaw`**
- [x] **Step 2: Run the production build with the project's macOS-compatible direct Vinext command if the wrapper requires unavailable GNU tools**
- [x] **Step 3: Run `bash scripts/copy-fonts.sh`, `bash scripts/validate-artifact.sh`, `node --test tests/rendered-html.test.mjs`, and `git diff --check`**
- [x] **Step 4: Verify `curl -fsS -o /dev/null -w 'HTTP %{http_code}\\n' http://localhost:5173/` returns HTTP 200**
- [x] **Step 5: Reuse the existing localhost browser tab, verify no console errors, capture settled and mid-turn states, and complete next/previous turns**
- [x] **Step 6: Confirm the DOM spread remains hidden during texture refresh and no unrelated content appears inside the book**

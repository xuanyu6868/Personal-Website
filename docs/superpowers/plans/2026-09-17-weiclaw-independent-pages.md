# WeiClaw Independent Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 24-page independent WeiClaw Blender book and connect per-spread page-turn sequences to the existing React book.

**Architecture:** Keep the current prerendered sequence player, but make the sequence directory depend on the active spread. Blender owns the physical page stack and turning sheet; React owns editorial content and interaction state.

**Tech Stack:** Blender 5.2 Python (`bpy`), Next.js React, TypeScript, Node test runner, Python render script.

---

### Task 1: Per-spread sequence selection

**Files:**
- Modify: `components/weiclaw/sequenceTurn.ts`
- Modify: `components/weiclaw/WeiClawBookSequence.tsx`
- Modify: `components/WeiClawBook.tsx`
- Test: `tests/weiclaw-book.test.mjs`

- [ ] Update sequence resolution so `next` uses the current spread sequence and `previous` uses the target spread sequence in reverse.
- [ ] Pass `spreadStart` from `WeiClawBook` into `WeiClawBookSequence`.
- [ ] Load sequence frames from `/sequence/weiclaw-turn/spread-XXXX/frame-XXXX.webp`.
- [ ] Add test assertions for `spreadStart`, reverse previous turns, and per-spread frame URLs.
- [ ] Run `node --test tests/weiclaw-book.test.mjs`.

### Task 2: Render script page stack

**Files:**
- Modify: `scripts/render-weiclaw-book-turn.py`
- Test: `tests/weiclaw-book.test.mjs`

- [ ] Add CLI args for spread/page-stack configuration and output root.
- [ ] Create lightweight independent page-stack objects around the existing turning sheet math.
- [ ] Write frames to `public/sequence/weiclaw-turn/spread-XXXX/frame-XXXX.webp`.
- [ ] Update test assertions for the new arguments and output layout.
- [ ] Run `node --test tests/weiclaw-book.test.mjs`.

### Task 3: Live Blender scene update

**Files:**
- Modify: `public/models/weiclaw-book.blend` via Blender MCP/headless Blender
- Create: `scripts/build-weiclaw-book-pages.py`

- [ ] Save a backup copy of the current book scene.
- [ ] Build `BookRig`, `Pages`, 24 independent page objects, and a high-resolution `TurningPage`.
- [ ] Delete `PageBlock` from the working scene after the new page stack exists.
- [ ] Verify with Blender MCP scene info and viewport screenshot.

### Task 4: End-to-end smoke check

**Files:**
- Modify: generated sequence files under `public/sequence/weiclaw-turn/`
- Test: `tests/weiclaw-book.test.mjs`

- [ ] Render a small test sequence for one spread.
- [ ] Run `node --test tests/weiclaw-book.test.mjs`.
- [ ] Inspect one rendered frame or Blender viewport screenshot for a mid-turn page pose.

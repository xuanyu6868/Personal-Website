# WeiClaw Independent Pages Design

**Goal:** Turn the WeiClaw Blender book from a single solid `PageBlock` into many independent page objects with a controllable page-turn pose, then feed that structure back into the website's prerendered page-turn sequence.

**Approved approach:** Independent thin page stack plus one reusable high-resolution turning sheet.

## Blender model

- Delete the scene object `PageBlock` from `public/models/weiclaw-book.blend` after saving a file-level backup copy.
- Add a `BookRig` empty and parent `Cover` plus page objects to it without changing their world transforms.
- Add a `Pages` collection containing 24 independent page objects named `Page_001` through `Page_024`.
- Normal pages use a lightweight open-book paper mesh. The active turning page uses a higher-resolution mesh built from the same paper math as `scripts/render-weiclaw-book-turn.py`.
- `BookRig` stores `page_count`, `active_page`, `turn_progress`, and `turn_direction` so a user can choose which page is turning and scrub the pose in Blender.

## Rendering and web

- Extend `scripts/render-weiclaw-book-turn.py` so each website spread transition renders into its own sequence directory under `public/sequence/weiclaw-turn/`.
- Keep editorial text and screenshots in the existing React DOM overlay. Blender only supplies the physical page stack and turning sheet.
- Update `components/weiclaw/sequenceTurn.ts` and `components/weiclaw/WeiClawBookSequence.tsx` so the frame index depends on spread position and turn direction; previous turns reuse the target spread sequence in reverse.
- Update `components/WeiClawBook.tsx` to pass the current spread position into the sequence player.

## Verification

- Blender: `PageBlock` is gone, `Pages` contains 24 independent page objects, and a mid-turn pose is visible in the viewport.
- Script: the render script accepts spread/page arguments and writes per-spread frame sequences.
- Web: `node --test tests/weiclaw-book.test.mjs` passes, with new assertions for per-spread sequence selection.

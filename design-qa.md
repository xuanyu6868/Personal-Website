# Design QA — Note Sync Case Study Gallery

## Comparison target

- Source visual truth: `/var/folders/9j/_8nq6sh97tbf3k2rgt35gg7c0000gn/T/codex-clipboard-208ce0e8-5ee0-47a5-ab0d-5ef4ee7c8c6f.png`
- Implementation screenshot: `/Users/xuanyumacbook/Personal-Website/design-qa-note-sync-gallery.png`
- Route: `http://127.0.0.1:5173/#project-wechat-obsidian`
- Viewport: 1536 × 1024 CSS px
- Source pixels: 1536 × 1024
- Implementation pixels: 1536 × 1024
- Device scale factor: 1; no density normalization required
- State: 04 project scene, gallery item 03 selected, lightbox closed

## Full-view comparison evidence

The implementation preserves the site's dark video-backed scene and matches the reference's major composition: project title at upper left, centered image title/page block, large central image, exposed previous/next images, circular navigation controls, ten thumbnails, and the progress rail. The secondary footer copy and right-bottom operation panel are removed so the central image and page-bottom thumbnails have more room.

## Focused-region comparison evidence

- Header/intro: the red `PROJECT CASE STUDY` label, large Chinese title, tagline, and four capability rows are aligned as the left information column.
- Gallery frame: the active image is centered with perspective/scale motion, visible side peeks, editorial annotations, and image-based navigation.
- 3D stack: the previous/next images sit behind the active image with an 1800px perspective stage, `translate3d` depth, ±40deg Y-axis rotation, reduced scale, directional masks, opacity, brightness, and blur; only roughly a quarter to a third of each adjacent image is exposed.
- Navigation footer: all ten thumbnails and numbered progress controls are present; the thumbnail row sits at the bottom of the available scene height.
- Layout cleanup: the secondary footer copy and operation panel are intentionally absent; the title/page block remains part of the current layout.

## Findings

- No actionable P0/P1/P2 differences remain after the final comparison pass.
- [P3] The reference uses bespoke line icons for the four capability rows; the implementation uses restrained numbered markers so the page does not introduce an unconfigured icon library. This is an intentional low-risk visual variation.
- [P3] The latest implementation omits the secondary footer copy and operation panel by request; the core caption and navigation controls remain available.
- [P3] The exact composition of the main screenshot differs from the mock because the gallery renders the user's ten real local case-study images. This is intentional content fidelity for the requested asset set.

## Comparison history

1. Initial implementation: the gallery interaction worked, but the design reference's left project information, right operation panel, annotation labels, and footer copy were missing.
2. Fix: added the project intro/capability column, central case-study heading, annotations, operation hints, bottom copy, and responsive workspace layout.
3. First visual comparison: the left column was too wide and the main stage had excess vertical whitespace, making the image feel undersized.
4. Fix: tightened the three-column proportions, set a stable main-stage height, centered the title/counter, aligned the scene padding to the reference, and darkened the scene wash.
5. Final visual comparison: added visible side peeks and circular arrow controls; the 1536 × 1024 capture above shows the intended 03 state with no horizontal overflow.
6. Layout refinement: removed the secondary footer copy, expanded the central stage, and pushed thumbnails to the bottom of the scene while retaining the caption.
7. Gallery refinement: moved adjacent previews behind the main image with a 1800px perspective stage, directional masks, depth-aware ±40deg rotation, pointer parallax, restrained transitions, and clickable preview regions; removed the circular navigation buttons.
8. Annotation refinement: replaced UI-like arrow labels with warm editorial handwritten notes, updated the copy, and kept three distinct SVG Bezier curves aimed at the photo edges.

## Interaction checks

- Thumbnail jump: verified item 05 changes the active thumbnail and image.
- Adjacent previews: verified clicking the left preview moves 01 → 10 and clicking the right preview moves 10 → 01.
- Lightbox: verified opening item 05, correct image source, close action, and body overflow restoration.
- Existing keyboard and drag behavior retained from the prior gallery verification.
- Responsive check: at 390 × 844, all 13 gallery images load and the page has no horizontal overflow.
- Browser console: no new gallery errors observed during the final browser checks.

## Implementation checklist

- [x] Data-driven ten-item gallery array
- [x] Centered case-study composition with side peeks
- [x] Editorial SVG annotations and navigation controls
- [x] Thumbnail and progress navigation
- [x] Lightbox and responsive layout
- [x] 1536 × 1024 visual comparison

final result: passed

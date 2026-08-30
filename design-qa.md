# Design QA — WeiClaw Exposed Page Stack v5

## Comparison target

- Source visual truth: `/var/folders/9j/_8nq6sh97tbf3k2rgt35gg7c0000gn/T/codex-clipboard-9283f247-4574-430b-8317-8b0f4440584b.png`
- Previous implementation: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-curvature-v4-01-final.png`
- Revised implementation: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-page-stack-final.png`
- Revised secondary spread: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-page-stack-after-turn.png`
- Side-by-side evidence: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-page-stack-comparison.png`
- Route: `http://127.0.0.1:4173/?audit=verified#project-weiclaw`
- Viewport: 1536 × 1024 CSS px
- Source and implementation pixels: 1536 × 1024 each
- Device scale factor: 1; no density normalization required
- States: settled spreads `01 / 05` and `03 / 05`, pointer outside the book

## Findings

- No actionable P0/P1/P2 issue remains for the requested page-edge correction.
- [P3] The live spread remains intentionally smaller than the original concept image so more of the moving mountain scene stays visible.
- [P3] The source mock shows a default curled page; the current settled state remains flat by the user's later direction, while page curl is reserved for hover and turn interaction.

## Required fidelity surfaces

- Fonts and typography: no typography, wrapping, page-copy, or print-resolution changes were introduced.
- Spacing and layout rhythm: book size and placement are unchanged. The exposed side stacks now occupy the existing shell margin instead of shrinking the editorial content.
- Colors and visual tokens: the new layer inherits the photographed shell's warm gray paper edges, dark cover contact tones, and directional lighting without synthetic page-line gradients.
- Image quality and asset fidelity: a 1536 × 1024 transparent raster derived from the existing photographic shell preserves the real left, right, and bottom page stacks while clearing the complete central paper surface.
- Copy and content: all five pages and the current editorial layouts remain unchanged.

## Comparison history

1. Previous capture: the WebGL paper canvas covered most of the photographic shell's outer page stack, leaving only a narrow bottom line and almost no visible side layering.
2. Fix: extracted the real side and bottom stacks from `book-shell.png` into a transparent foreground raster and layered it above the deformable paper canvas. The mesh, layout, book scale, and turn model were not changed.
3. Post-fix evidence: both settled captures show multiple photographed paper layers at the left and right fore edges, a continuous stacked bottom edge, the central binding point, and the hard cover beneath.
4. Turn-completion evidence: `01 / 05` advances to `03 / 05` and the physical edge stack remains registered to the shell without covering the printed page body.

## Primary interactions tested

- Next-page transition completes `01 / 05` → `03 / 05`; previous-page transition restores `01 / 05`.
- Both edge controls remain enabled/disabled in their correct boundary states.
- Browser console warnings/errors during the visual pass: none.

## Verification

- WeiClaw regression suite: 63/63 tests passed.
- The page-stack asset regression checks both side edges, the bottom stack, transparent paper center, dimensions, and alpha channel.
- Final build, lint, TypeScript, artifact, and diff verification are recorded at handoff.

final result: passed

---

# Design QA — WeiClaw Balanced Curvature and Editorial Spread v4

## Comparison target

- Original visual direction: `/var/folders/9j/_8nq6sh97tbf3k2rgt35gg7c0000gn/T/codex-clipboard-9283f247-4574-430b-8317-8b0f4440584b.png`
- Immediate source state for this correction: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-rigidity-after-01-final.png`
- Revised settled implementation: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-curvature-v4-01-final.png`
- Revised secondary spread: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-curvature-v4-03.png`
- Route: `http://127.0.0.1:4173/?audit=verified#project-weiclaw`
- Viewport: 1536 × 1024 CSS px
- Source and implementation pixels: 1536 × 1024 each
- Device scale factor: 1; no density normalization required
- Settled state: WeiClaw spread `01 / 05`, pointer outside the book, no hover curl
- Secondary settled state: WeiClaw spread `03 / 05` after a forward turn

## Evidence

- Full-view previous/current comparison: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-curvature-v4-comparison.png`
- Focused revised `01 / 02` evidence: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-curvature-v4-01-final.png`
- Secondary-spread and turn-completion evidence: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-curvature-v4-03.png`

## Findings

- No actionable P0/P1/P2 visual or interaction differences remain for the four requested corrections.
- [P3] The photographic shell retains slightly richer micro-detail than the live WebGL top leaves; the material boundary remains coherent at the target size.
- [P3] The mountain video frame changes between captures, so QA judged book scale, placement, visible background area, and contrast independently of the exact frame.

## Required fidelity surfaces

- Fonts and typography: editorial serif titles, condensed page labels, Chinese project copy, and handwritten annotations retain the intended hierarchy, optical contrast, wrapping, and restrained spacing.
- Spacing and layout rhythm: the book now measures 1025px wide at the 1536px viewport, down from 1165px, while retaining the left intro, right-shifted placement, visible top/side mountain field, and bottom status.
- Colors and visual tokens: warm ivory paper, preserved charcoal/black UI detail, blue rules, dark cover, broad soft gutter shading, and non-glowing contact shadows form one material system.
- Image quality and asset fidelity: 1536 × 1980 page textures and the existing white-only paper tint remain unchanged. Dashboard uses a 106%-wide lower-page bleed; Chat uses a tightly focused, aspect-matched crop of the central exchange without reducing screenshot opacity.
- Copy and content: the first spread preserves `01 DASHBOARD`, `02 CHAT`, 数据总览, 企业微信真实聊天, and `01 / 05`; later spreads and all existing copy remain unchanged.

## Comparison history

1. The v3 settled mesh was a P2 visual regression for this brief: its total centerline depth range was only about `0.035`, so the spread approached two flat boards when shader shading was ignored.
2. Fix: deepened and widened the geometric binding valley, restored a controlled inner crest and tiny outer lift, and increased only the broad top/bottom binding arcs. New tests require a visible `> 0.052` full range while capping it below `0.08` and keeping the page-body range below `0.026`.
3. The v3 gutter depended too strongly on a gray shader/CSS band. Fix: reduced settled WebGL spine AO from `0.07` to `0.035`, halved the CSS gutter tones, widened their blur, and let mesh normals carry the primary transition.
4. The v3 first spread was P2 repetitive: both pages used the same title/blank-space/rectangular-screen rhythm. Fix: Dashboard now bleeds horizontally beyond the page field, while Chat removes navigation/profile columns and enlarges the central message exchange as a tall portrait crop.
5. The v3 book dominated the scene at 1165px. Fix: reduced the desktop shell to 1025px (12%), softened its vertical scale, and re-centered it to expose more lake and mountain background.
6. Post-fix evidence: the comparison shows visibly increased paper curvature without large body waves, a quieter gutter, substantially different left/right editorial rhythms, and a smaller scene-scale object.

## Primary interactions tested

- Hovering the lower-right page edge lifts the fore-corner without changing spreads.
- Next/previous transitions complete `01 / 05` → `03 / 05` → `01 / 05` and restore the stiff settled mesh.
- Turning-geometry regression tests cover `p = 0.2 / 0.5 / 0.8`; their dynamic depth ranges remain substantially larger than the settled limits, preserving the C-shaped sheet only while turning.
- At 820 × 900 the book resolves to 760px wide, the page has no horizontal overflow (`scrollWidth = innerWidth = 820`), and the next-page control remains enabled.
- Browser console warnings/errors during the final visual pass: none.

## Verification

- WeiClaw regression suite: 62/62 tests passed.
- Scoped WeiClaw ESLint: zero warnings/errors.
- Strict targeted TypeScript check: passed.
- Direct Vinext production build, font copy, artifact validation, rendered-HTML test, and `git diff --check`: passed.
- The repository-wide TypeScript check still reports pre-existing Cloudflare worker-environment declarations; the strict targeted WeiClaw check is clean.

final result: passed

---

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

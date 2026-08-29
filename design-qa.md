# Design QA — WeiClaw Settled Paper Rigidity and Print Clarity v3

## Comparison target

- Source visual truth: `/var/folders/9j/_8nq6sh97tbf3k2rgt35gg7c0000gn/T/codex-clipboard-9283f247-4574-430b-8317-8b0f4440584b.png`
- Settled implementation screenshot: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-rigidity-after-01-final.png`
- Editorial crop implementation screenshot: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-rigidity-after-03-final.png`
- Route: `http://127.0.0.1:4173/?audit=verified#project-weiclaw`
- Viewport: 1536 × 1024 CSS px
- Source and implementation pixels: 1536 × 1024 each
- Device scale factor: 1; no density normalization required
- Settled state: WeiClaw spread `01 / 05`, pointer outside the book, no hover curl
- Secondary settled state: WeiClaw spread `03 / 05`, showing the customer-management and AI-agent crop system

## Evidence

- Full-view source/implementation comparison: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-rigidity-reference-comparison.png`
- Previous/current implementation comparison: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-rigidity-before-after-comparison.png`
- Focused `03 / 05` print and crop evidence: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-rigidity-after-03-final-crop.png`

## Findings

- No actionable P0/P1/P2 visual or interaction differences remain for this correction scope.
- [P3] The reference shell and page stack are photographic and therefore retain slightly richer edge micro-detail than the live top leaves.
- [P3] The reference uses a different mountain-video frame; composition, scale, spread position, and contrast were judged independently of that frame difference.
- [P3] The reference shows a dramatic lifted sheet in its static state. The settled implementation deliberately keeps stiff leaves and reserves the C-shaped curl for interaction, following the user's latest direction.

## Required fidelity surfaces

- Fonts and typography: editorial serif titles, condensed page labels, Chinese project copy, and handwritten annotations retain the intended hierarchy, optical contrast, wrapping, and restrained spacing.
- Spacing and layout rhythm: left project copy, right-shifted book, visible mountain background, centered gutter, book scale, and bottom status align with the reference composition at 1536 × 1024.
- Colors and visual tokens: warm ivory paper, preserved charcoal/black UI detail, blue rules, dark cover, broad soft gutter shading, and non-glowing contact shadows form one material system.
- Image quality and asset fidelity: every page texture renders at 1536 × 1980, caches decoded artwork, applies paper tint only to near-white UI surfaces, and keeps text, chart lines, borders, and black values intact under shared grain and curvature lighting.
- Copy and content: the first spread preserves `01 DASHBOARD`, `02 CHAT`, 数据总览, 企业微信真实聊天, and `01 / 05`; `03 / 05` uses an intentional customer list/detail crop and an enlarged AI status/workflow crop rather than a faded full-dashboard panel.

## Comparison history

1. Prior v2 had P2 over-deformation: settled pages carried large body and bottom-edge waves that read as cloth rather than stiff book paper.
2. Fix: reduced settled depth outside the gutter, concentrated curvature into a broad continuous valley, reduced edge ripple and corner droop, and retained only a tiny outer lift. Automated geometry limits now keep the full settled depth range below `0.055` and the body range below `0.018`.
3. Prior v2 had P2 washed printing: the print treatment reduced the whole screenshot's contrast and made the AI-agent page approach a translucent background.
4. Fix: switched to source-over artwork, preserved dark/midtone pixels, tinted near-white UI surfaces only, raised print contrast, and applied subtle shared grain without a full-page opacity reduction.
5. Prior v2 had P2 generic framing: customer and AI pages still resembled full screenshots placed into a repeated template.
6. Fix: `03` now pairs a deliberate customer-list crop with an overlapping detail region; `04` isolates the agent status ring and enlarges the audited workflow core.
7. High-resolution texture generation initially added avoidable transition latency. Fix: cached decoded images and restricted pixel sampling to artwork layers instead of processing the complete 1536 × 1980 page.
8. Post-fix evidence: the settled comparison shows a firm page body, wide soft gutter, readable print blacks, clear top-leaf/page-stack separation, and focused asymmetric editorial crops.

## Primary interactions tested

- Hovering the lower-right page edge lifts the fore-corner without changing spreads.
- Next/previous transitions complete `01 / 05` → `03 / 05` → `01 / 05` and restore the stiff settled mesh.
- Turning-geometry regression tests cover `p = 0.2 / 0.5 / 0.8`; their dynamic depth ranges remain substantially larger than the settled limits, preserving the C-shaped sheet only while turning.
- The `03 / 05` spread uses asymmetric customer and AI workflow fragments instead of duplicating the first template.
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

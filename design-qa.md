# Design QA — WeiClaw Paper Material and Page Curl v2

## Comparison target

- Source visual truth: `/var/folders/9j/_8nq6sh97tbf3k2rgt35gg7c0000gn/T/codex-clipboard-9283f247-4574-430b-8317-8b0f4440584b.png`
- Settled implementation screenshot: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-paper-v2-final-1536x1024.png`
- Mid-turn implementation screenshot: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-paper-v2-final-turn.png`
- Route: `http://127.0.0.1:4173/?audit=verified#project-weiclaw`
- Viewport: 1536 × 1024 CSS px
- Source and implementation pixels: 1536 × 1024 each
- Device scale factor: 1; no density normalization required
- Settled state: WeiClaw spread `01 / 05`, pointer outside the book, no hover curl
- Interaction state: forward click turn at approximately 190 ms, while the sheet is crossing the gutter

## Evidence

- Full-view settled comparison: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-paper-v2-final-comparison.png`
- Focused interaction comparison: `/Users/xuanyumacbook/Personal-Website/design-qa-weiclaw-paper-v2-turn-comparison.png`
- A separate crop was not needed because the 1536 × 1024 full-view capture keeps the book, page edges, spine, printed screenshots, and turn silhouette large enough to judge. The dedicated mid-turn comparison supplies the additional close interaction state.

## Findings

- No actionable P0/P1/P2 visual or interaction differences remain at the target viewport.
- [P3] The reference has thicker photographed page stacks along the top and outer edges; the implementation relies on the WebGL page silhouette plus the existing CSS shell, so the top stack is intentionally subtler.
- [P3] Product screenshots are slightly lighter than the reference after the print-tone pass. This keeps them integrated with the warm paper instead of reading as emissive UI panels.
- [P3] Handwritten notes are smaller and more restrained than the reference. Their hierarchy remains secondary to the project screens and page titles.
- [P3] The reference shows a dramatic lifted sheet in its static state. The implementation deliberately keeps the settled spread normal and reveals the full C-shaped curl only during interaction, following the user's later correction.

## Required fidelity surfaces

- Fonts and typography: editorial serif titles, condensed page labels, Chinese project copy, and handwritten annotations retain the intended hierarchy, optical contrast, wrapping, and restrained spacing.
- Spacing and layout rhythm: left project copy, right-shifted book, visible mountain background, centered gutter, book scale, and bottom status align with the reference composition at 1536 × 1024.
- Colors and visual tokens: warm ivory paper, charcoal ink, blue rules, dark cover, broad soft gutter shading, and non-glowing contact shadows form one material system.
- Image quality and asset fidelity: product screens are composited into page textures with edge feathering, multiply blending, paper grain, curvature lighting, and shared shadowing. The generated 1254 × 1254 archival-paper texture is high enough resolution for the displayed page size.
- Copy and content: the first spread preserves `01 DASHBOARD`, `02 CHAT`, 数据总览, 企业微信真实聊天, and `01 / 05`; later spreads retain customer, AI employee, and automation content with asymmetric editorial crops.

## Comparison history

1. Earlier pass had P2 flatness: page centers behaved like two planar design boards, the gutter read as a narrow black seam, screenshots had crisp rectangular boundaries, and the top rear page looked like a single cut-paper silhouette.
2. Fix: rebuilt the settled mesh profile as spine dip → inner crest → middle fall → outer lift; added vertical bow, edge ripple, corner insets, broader low-opacity spine AO, softer top/bottom contours, and a bounded feathered cast shadow.
3. Earlier pass had P2 material separation: paper was warm and textured while product screenshots remained bright, clean digital rectangles.
4. Fix: generated a real archival-paper texture, baked it into every page texture, applied warm print-tone remapping, multiply compositing, edge feathering, and page-wide curvature lighting so screenshots inherit the paper's light and grain.
5. Earlier pass had P2 turn behavior: the click animation accelerated too quickly and read as a rigid sheet rotation; the moving shadow exposed polygon blocks.
6. Fix: changed completion timing to cosine ease-in-out, strengthened delayed curl propagation and corner lag, preserved a late-turn C curve, and vertically feathered/capped the moving cast shadow.
7. Post-fix evidence: the settled comparison shows continuous page curvature and a soft gutter; the mid-turn comparison shows a content-bearing C-shaped sheet, visible back face, next-page reveal, and moving shadow without hard blocks.

## Primary interactions tested

- Hovering the lower-right page edge lifts the fore-corner without changing spreads.
- Clicking next produces a gradual C-shaped turn and completes `01 / 05` → `03 / 05`.
- Previous returns to `01 / 05` and leaves the book in a stable settled state.
- The `03 / 05` spread uses asymmetric customer/agent image fragments instead of duplicating the first template.
- The final page preserves the intentional blank opposite leaf.
- Browser console warnings/errors during the final interaction pass: none.

## Verification

- WeiClaw regression suite: 57/57 tests passed.
- Scoped WeiClaw ESLint: zero warnings/errors.
- Strict targeted TypeScript check: passed.
- Direct Vinext production build, font copy, artifact validation, and rendered-HTML test: passed.
- Repository-wide lint still contains the pre-existing `react-hooks/set-state-in-effect` issue in `components/Portfolio.tsx`; no new WeiClaw lint issue is present.

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

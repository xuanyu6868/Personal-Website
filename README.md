# XUANYU — AI-Native Full Stack Engineer

Personal portfolio website for XUANYU, an AI Product Engineer and Full Stack Engineer.

## Stack

- React + TypeScript + Vinext
- Framer Motion
- Canvas-based scroll-scrub background
- 1920×1080 frame-sequence playback

## Run locally

```bash
npm install
npm run dev
```

## Video assets

The production site uses a generated 815-frame 1080p sequence in `public/frames-1080/`. Those generated media assets are intentionally excluded from this repository to keep source control practical. The app retains its poster and visual fallback when the sequence is absent.

## WeiClaw book model

The WeiClaw portfolio scene renders its book body in Blender from `public/models/weiclaw-book.blend`: a cover plus 24 independent curved page sheets and a reusable high-resolution turning sheet. The `BookRig` empty drives the book through custom properties — `active_page` (pages resting on the left), `turn_progress` (0..1 flip of one page), `turn_direction` (`next` / `previous`). The embedded `weiclaw_book_rig.py` text block (source: `scripts/weiclaw-rig-runtime.py`) re-registers on file load and makes the rig scrubbable in the viewport: drag `turn_progress` to flip a page, drop it at 1.0 to settle.

The page-turn animation on the site is a prerendered per-spread frame sequence in `public/sequence/weiclaw-turn/spread-XXXX/` (blank paper; the DOM overlay prints the page content). To rebuild the rig or re-render the sequences:

```bash
# Rebuild the multi-page rig inside the .blend (idempotent)
blender -b public/models/weiclaw-book.blend -P scripts/build-weiclaw-book-pages.py

# Render one spread's turn sequence (repeat for each spread start: 0 2 4)
blender -b public/models/weiclaw-book.blend -P scripts/render-weiclaw-book-turn.py -- --spread-start 0
```

The flying page carries the same content the DOM overlay prints: `public/images/weiclaw/prints/page-XX.png` are transparent captures of each DOM page, composited onto the turning sheet's front (right page of the spread) and back (left page of the next spread, mirrored on U so the verso reads correctly). Pass them per spread:

```bash
blender -b public/models/weiclaw-book.blend -P scripts/render-weiclaw-book-turn.py -- \
    --spread-start 0 \
    --front-page public/images/weiclaw/prints/page-02.png \
    --back-page public/images/weiclaw/prints/page-03.png
```

Recapture the prints after changing page content or page CSS: hide the background layers and the book canvas in devtools, then screenshot each `.weiclaw-book__leaf` at 2x with a transparent background.

## Hosting configuration

`.openai/hosting.json` contains a safe placeholder instead of the production site identifier. Replace it only when connecting this source to a new Sites project.

## Live site

https://xuanyu-ai-portfolio.xuanyu686866.chatgpt.site

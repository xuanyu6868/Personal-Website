# WeiClaw Flipbook Layer Fix

## Approved scope

- Keep the current book shell, paper material, page artwork, typography, static spread layout, and surrounding portfolio styling unchanged.
- Replace only the turn pose with a reference-inspired soft-leaf flip: one subdivided sheet carries the front/back page textures, rotates around the spine, bends through the middle of the turn, and preserves page-edge/shadow ordering.
- Prevent the hidden DOM fallback spread from reappearing during normal texture refreshes or page turns. It may remain available before the first successful WebGL frame and after a genuine renderer/context failure.
- The change stays local to the existing React/WebGL implementation. Do not add `quick_flipbook`, Three.js, new artwork, or hosting/deployment changes.

## Reference behavior

The approved external reference is `https://github.com/HaichaoLihc/create-photo-flipbook-ui`, specifically its `examples/v3-book` use of a subdivided `FlipBook` sheet. The useful behavior to reproduce is the page pose envelope: rotation `π * progress`, a sine-weighted bend, a mid-turn twist, and a curve-intensity envelope that is quiet at the endpoints.

## Acceptance criteria

1. A page turn still starts and ends on the existing settled meshes with identical settled styling and texture orientation.
2. The moving sheet remains one front/back surface; the printed UI follows its curved geometry and receives the existing material/shadow treatment.
3. Texture refreshes do not reveal the DOM spread over the WebGL canvas, and the hidden fallback layer does not intercept pointer input.
4. Existing WeiClaw unit tests remain green, and the browser preview at `http://localhost:5173/` has no runtime errors while next/previous turns complete.

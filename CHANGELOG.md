# Changelog

## 0.2.1

### Patch Changes

- [`866bc08`](https://github.com/jakub-gawlik/lenslite/commit/866bc08d42eba3dc56d8b9d12ed6a85ca89b56f1) Thanks [@jakub-gawlik](https://github.com/jakub-gawlik)! - Trigger the v0.2.0 release

## 0.2.0

### Minor Changes

- [#1](https://github.com/jakub-gawlik/lenslite/pull/1) [`cdaf8a9`](https://github.com/jakub-gawlik/lenslite/commit/cdaf8a91458d1e0a390751ff7eb4e7cfd284afeb) Thanks [@jakub-gawlik](https://github.com/jakub-gawlik)! - Ship bundled builds: `dist/index.js` is now a single minified ESM file
  (stylesheet included, minified), `dist/lenslite.min.js` is an IIFE exposing a
  `lenslite` global for `<script>` tags and CDNs (unpkg / jsDelivr), and the
  stylesheet is published as `lenslite/lenslite.css`.

- [#1](https://github.com/jakub-gawlik/lenslite/pull/1) [`0a6c05c`](https://github.com/jakub-gawlik/lenslite/commit/0a6c05c407b30099afb82fa289dad4eb55f902cf) Thanks [@jakub-gawlik](https://github.com/jakub-gawlik)! - Viewer fixes and behavior changes:
  
  - `LensLite.from` handles clicks with one delegated listener that `destroy()`
    removes (it used to leak one listener per element), and re-reads the
    matching elements on every click, so thumbnails added later join the gallery.
  - Reopening the viewer right after closing it no longer gets closed again by
    the late `popstate` from the close's `history.back()`.
  - The body's original `overflow` and `padding-right` are restored on close, and
    the body is padded by the scrollbar width while open so the page doesn't
    shift on desktop.
  - Pan bounds come from the image's fitted box instead of the stage, so a
    letterboxed image no longer pans into empty space and stays centered on its
    short axis.
  - `Escape` while zoomed zooms back out; a second press closes.
  - Only a vertically locked drag can flick-dismiss.
  - The rest of the page is `inert` while the viewer is open.
  - The slide transition duration is derived from the same constant as the
    animation timer.
  - `engines` now declares Node.js 22 or later (Node 20 is end-of-life).

## 0.1.0

Initial release.

- Gestures: drag/swipe navigation with finger-following, rubber-banding and
  flick detection; swipe or drag to dismiss with preview; double-tap and
  pinch zoom towards the gesture point; pan while zoomed with momentum.
- Keyboard navigation, focus trapping, and focus restore on close.
- Screen-reader announcements via a polite live region.
- Browser back button closes the viewer (`history` option to opt out).
- Captions, `srcset`/`sizes` support, per-slide loading spinner, inline
  error state, and neighbor preloading.
- Viewport resize / rotation re-clamps the zoomed pan.
- `prefers-reduced-motion` disables transitions and momentum.
- Frosted-glass overlay and controls with graceful fallback.
- `LensLite.from(selector)` to build a gallery from existing markup.
- Zero dependencies, ESM + type declarations, 100% test coverage.

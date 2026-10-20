---
"lenslite": minor
---

Viewer fixes and behavior changes:

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

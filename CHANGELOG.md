# Changelog

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

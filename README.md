# LensLite

A mobile-first, dependency-free lightbox gallery in TypeScript. All gestures
supported from day one, 100% typed, 100% tested.

## Gestures

| Gesture | Action |
| --- | --- |
| Drag left / right | Slide to the next / previous image, following the finger; snaps back below a quarter of the screen width (unless flicked), rubber-bands at the ends |
| Swipe or drag up / down | Dismiss (with drag preview and snap-back) |
| Double-tap | Zoom in towards the tapped point / zoom back out |
| Pinch | Zoom in and out towards the fingers' midpoint (clamped between 1× and `maxZoom`) |
| Pan while zoomed | Move around the image, clamped to the frame, with momentum on release |
| Tap | Toggle the chrome (buttons and counter) |

Keyboard works too: `←` / `→` navigate, `Escape` closes, and `Tab` cycles the
controls without leaving the dialog. Focus moves into the dialog on open and
returns to the previously focused element on close. A polite live region
announces each image ("Image 2 of 9: …") to screen readers, and all
transitions are disabled under `prefers-reduced-motion`.

Opening pushes a history entry, so the browser (or hardware) back button
closes the viewer instead of leaving the page; closing it any other way pops
the entry again. Pass `history: false` to opt out.

Adjacent images are rendered on off-screen slides, so they are preloaded
before you navigate to them. On viewport resize or device rotation the zoom
pan is re-clamped to the new frame.

## Usage

```ts
import { LensLite } from 'lenslite'

const box = new LensLite({
  items: [
    { src: '/photos/one.jpg', alt: 'One', caption: 'Day one' },
    {
      src: '/photos/two.jpg',
      srcset: '/photos/two-800.jpg 800w, /photos/two-1600.jpg 1600w',
      sizes: '100vw',
    },
  ],
  loop: true,       // wrap around at the ends (default false)
  maxZoom: 4,       // pinch/zoom ceiling (default 4)
  doubleTapZoom: 2.5,
  dismissThreshold: 100, // px of vertical drag that dismisses
  history: true,    // back button closes the viewer (default true)
})

box.open(0)

box.on('change', (index) => console.log('now showing', index))
box.on('error', (index) => console.log('image failed to load', index))
box.on('close', () => console.log('closed'))
```

### Binding to existing markup

`LensLite.from(selector, options?)` builds a gallery from elements already
on the page and opens it at the clicked one. Each matched element contributes
one item: an anchor's `href`, an image's `src`, or the `src` of the first
image inside the element (alt text comes along the same way). Captions come
from a `data-caption` attribute or a `<figcaption>` inside the element.
Responsive candidates come from `data-srcset` / `data-sizes`, or from the
element's own `srcset` / `sizes` when the element itself is the image — an
inner thumbnail's `srcset` is never used, since it lists the wrong files.

```ts
import { LensLite } from 'lenslite'

// <a href="/photos/one.jpg" data-caption="Day one">
//   <img src="/thumbs/one.jpg" alt="One"></a> …
const box = LensLite.from('a[data-gallery]', { loop: true })
```

If an image fails to load, the viewer shows an inline "Image failed to load"
message on that slide and emits the `error` event with the failed item's
index (neighboring slides preload, so this can fire for an image you are not
looking at yet).

Styles are injected automatically on first open. The `GestureController`
(Pointer Events → tap / double-tap / pan / swipe / pinch) is exported on its
own if you want to build something else with it.

## Development

```sh
npm install
npm test               # run the suite
npm run test:coverage  # enforces 100% lines/branches/functions/statements
npm run typecheck
npm run build          # emits ESM + d.ts to dist/
```

To try the demo: `npm run build`, then serve the repo root (for example
`npx serve .`) and open `/demo/`.

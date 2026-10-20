---
"lenslite": minor
---

Ship bundled builds: `dist/index.js` is now a single minified ESM file
(stylesheet included, minified), `dist/lenslite.min.js` is an IIFE exposing a
`lenslite` global for `<script>` tags and CDNs (unpkg / jsDelivr), and the
stylesheet is published as `lenslite/lenslite.css`.

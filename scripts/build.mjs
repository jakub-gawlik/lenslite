// Bundles the library with esbuild. Type declarations come from tsc
// (`npm run build:types`); this script only emits JavaScript and CSS:
//
//   dist/index.js         minified ESM, the package entry point
//   dist/lenslite.min.js  minified IIFE exposing `window.lenslite`, for
//                         <script> tags and CDNs (unpkg, jsDelivr)
//   dist/lenslite.css     the stylesheet that injectStyles() would inject
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { build, transform } from 'esbuild'

const CSS_LITERAL = /export const CSS = `([^`]*)`/

const minifyCss = async (css) =>
  (await transform(css, { loader: 'css', minify: true })).code.trim()

/** esbuild leaves template literals alone; minify the stylesheet string too. */
const minifyStyles = {
  name: 'minify-styles',
  setup(b) {
    b.onLoad({ filter: /src[\\/]styles\.ts$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8')
      const match = CSS_LITERAL.exec(source)
      if (!match) throw new Error('minify-styles: CSS literal not found')
      const css = await minifyCss(match[1])
      return {
        contents: source.replace(match[0], `export const CSS = ${JSON.stringify(css)}`),
        loader: 'ts',
      }
    })
  },
}

const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'es2020',
  logLevel: 'info',
  plugins: [minifyStyles],
}

await Promise.all([
  build({ ...shared, format: 'esm', outfile: 'dist/index.js' }),
  build({
    ...shared,
    format: 'iife',
    globalName: 'lenslite',
    outfile: 'dist/lenslite.min.js',
  }),
])

// Importing the bundle is safe in Node: nothing touches the DOM at load time.
const { CSS } = await import(new URL('../dist/index.js', import.meta.url).href)
await mkdir('dist', { recursive: true })
await writeFile('dist/lenslite.css', CSS.trimStart())
console.log('\n  dist/lenslite.css')

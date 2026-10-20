// Minimal static file server for the e2e suite and local previews.
// Usage: node scripts/serve.mjs [root=.] [port=4173]
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const port = Number(process.argv[3] ?? 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = join(root, normalize(path))
  if (!file.startsWith(root)) {
    res.writeHead(403).end()
    return
  }
  try {
    if ((await stat(file)).isDirectory()) {
      // Relative URLs inside index.html need the trailing slash.
      if (!path.endsWith('/')) {
        res.writeHead(301, { location: `${path}/` }).end()
        return
      }
      file = join(file, 'index.html')
    }
    await stat(file)
  } catch {
    res.writeHead(404).end('Not found')
    return
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(file).pipe(res)
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`)
})

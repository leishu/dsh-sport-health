/**
 * Tiny static server for the development preview page.
 *
 * Serves the repository root so the page can reach `lib/client.js`,
 * `tests/fixtures/*`, and the React UMD builds in `node_modules`.
 * Run with `npm run preview` and open the printed URL.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const port = Number(process.env.PORT ?? 3100)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://preview.local')
  const requested = url.pathname === '/' ? '/preview/' : url.pathname
  const pathname = requested.endsWith('/') ? requested + 'index.html' : requested
  const target = resolve(join(root, normalize(decodeURIComponent(pathname))))
  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden')
    return
  }
  try {
    const info = await stat(target)
    if (!info.isFile()) throw new Error('not a file')
    response.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    createReadStream(target).pipe(response)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found: ' + pathname)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`dsh-sport-health preview: http://127.0.0.1:${port}/preview/`)
})

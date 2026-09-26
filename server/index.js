import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJobIngestHandler } from './job-ingest.js'

const defaultDistDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
}

function sendNotFound(response) {
  response.statusCode = 404
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.end('Not found')
}

export function createAppServer({
  distDirectory = defaultDistDirectory,
  environment = process.env,
  ingestHandler = createJobIngestHandler(),
} = {}) {
  const root = resolve(distDirectory)
  return createServer((request, response) => {
    setSecurityHeaders(response)
    let pathname
    try {
      pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname)
    } catch {
      return sendNotFound(response)
    }

    if (pathname === '/api/job-posting') return ingestHandler(request, response)
    if (pathname.startsWith('/api/')) return sendNotFound(response)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405
      response.setHeader('Allow', 'GET, HEAD')
      return response.end()
    }
    if (pathname === '/runtime-config.js') {
      response.statusCode = 200
      response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      const googleClientId = JSON.stringify(environment.VITE_GOOGLE_CLIENT_ID || '')
      return response.end(`window.__PIPEDIN_CONFIG__ = { googleClientId: ${googleClientId} }`)
    }

    const filePath = resolve(root, `.${pathname}`)
    const fileRelativeToRoot = relative(root, filePath)
    if (fileRelativeToRoot.startsWith(`..${sep}`) || fileRelativeToRoot === '..')
      return sendNotFound(response)
    let target = filePath
    try {
      if (existsSync(target) && statSync(target).isDirectory())
        target = resolve(target, 'index.html')
      if (!existsSync(target) || !statSync(target).isFile()) {
        if (extname(pathname)) return sendNotFound(response)
        target = resolve(root, 'index.html')
      }
      const metadata = statSync(target)
      response.statusCode = 200
      response.setHeader(
        'Content-Type',
        contentTypes[extname(target)] || 'application/octet-stream',
      )
      response.setHeader('Content-Length', metadata.size)
      response.setHeader(
        'Cache-Control',
        pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      )
      if (request.method === 'HEAD') return response.end()
      const stream = createReadStream(target)
      stream.on('error', () => {
        if (!response.headersSent) sendNotFound(response)
        else response.destroy()
      })
      stream.pipe(response)
    } catch {
      sendNotFound(response)
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080)
  const server = createAppServer()
  server.listen(port, '0.0.0.0', () => console.log(`pipedIn listening on port ${port}`))
  const shutdown = () => server.close(() => process.exit(0))
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

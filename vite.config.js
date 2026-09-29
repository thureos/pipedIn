import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { createJobIngestHandler } from './server/job-ingest.js'

const policyPages = { '/terms/': 'terms/index.html', '/privacy/': 'privacy/index.html' }

function versionRoutes(buildId) {
  const body = JSON.stringify({ id: buildId })
  function serveVersion(request, response, next) {
    if (request.url?.split('?')[0] !== '/version.json') return next()
    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store')
    response.end(body)
  }
  return {
    name: 'deployment-version',
    configureServer(server) {
      server.middlewares.use(serveVersion)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveVersion)
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body })
    },
  }
}

function policyRoutes() {
  function servePolicy(request, response, next) {
    const pathname = request.url?.split('?')[0]
    const page = policyPages[pathname]
    if (!page) return next()
    response.statusCode = 200
    response.setHeader('Content-Type', 'text/html')
    response.end(readFileSync(resolve(__dirname, 'public', page)))
  }
  return {
    name: 'policy-routes',
    configureServer(server) {
      server.middlewares.use(servePolicy)
    },
    configurePreviewServer(server) {
      server.middlewares.use(servePolicy)
    },
  }
}

function jobIngestRoutes() {
  const handler = createJobIngestHandler()
  return {
    name: 'job-ingest-routes',
    configureServer(server) {
      server.middlewares.use('/api/job-posting', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/job-posting', handler)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const buildId = env.VITE_BUILD_ID || env.GIT_COMMIT_SHA || randomUUID()
  return {
    plugins: [versionRoutes(buildId), policyRoutes(), jobIngestRoutes(), vue(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || ''),
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
    },
    server: { watch: { usePolling: true } },
  }
})

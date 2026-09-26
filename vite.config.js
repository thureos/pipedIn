import { defineConfig } from 'vite'
import { loadEnv } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { createJobIngestHandler } from './server/job-ingest.js'

const policyPages = { '/terms/': 'terms/index.html', '/privacy/': 'privacy/index.html' }

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
  return {
    plugins: [policyRoutes(), jobIngestRoutes(), vue(), tailwindcss()],
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || ''),
    },
    server: { watch: { usePolling: true } },
  }
})

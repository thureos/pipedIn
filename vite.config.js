import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

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
		configureServer(server) { server.middlewares.use(servePolicy) },
		configurePreviewServer(server) { server.middlewares.use(servePolicy) }
	}
}

export default defineConfig({ plugins: [policyRoutes(), vue(), tailwindcss()], server: { watch: { usePolling: true } } })

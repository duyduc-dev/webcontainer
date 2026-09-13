import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The React + Vite sandbox uses duckwc's synchronous filesystem and child
// process bridges. Those require SharedArrayBuffer, which the browser exposes
// only for a cross-origin-isolated page. This mirrors examples/playground.
function crossOriginIsolationHeaders(): Plugin {
  const middleware = (_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    next()
  }

  return {
    name: 'duckwc-cross-origin-isolation-headers',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// Deployed as a GitHub Pages *project* page (duyduc-dev.github.io/webcontainer/),
// not at the domain root - every built asset URL needs this prefix, or they
// 404 once served from that subpath. See .github/workflows/deploy-docs.yml.
export default defineConfig({
  base: '/webcontainer/',
  plugins: [tailwindcss(), react(), crossOriginIsolationHeaders()],
})

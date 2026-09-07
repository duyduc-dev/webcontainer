import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Deployed as a GitHub Pages *project* page (duyduc-dev.github.io/webcontainer/),
// not at the domain root - every built asset URL needs this prefix, or they
// 404 once served from that subpath. See .github/workflows/deploy-docs.yml.
export default defineConfig({
  base: '/webcontainer/',
  plugins: [tailwindcss(), react()],
})

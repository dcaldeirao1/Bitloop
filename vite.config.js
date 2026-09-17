import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Avoid browser CORS failures when GeckoTerminal returns 429 without ACAO
      '/api/geckoterminal': {
        target: 'https://api.geckoterminal.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/geckoterminal/, ''),
      },
    },
  },
})

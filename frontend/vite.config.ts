import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), tailwindcss()],
  build: { rollupOptions: { output: {
    manualChunks(id) {
      if (id.includes('/node_modules/three/')) return 'three-vendor'
      if (id.includes('/node_modules/recharts/')) return 'charts'
      if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-runtime'
    },
  } } },
  server: { port: 5173, allowedHosts: ["terminal.local"], proxy: {
    '/api': {
      target: loadEnv(mode, '.', 'DECISIONPILOT_').DECISIONPILOT_API_URL || (mode === 'container' ? 'http://backend:8000' : 'http://127.0.0.1:8000'),
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  } },
}))

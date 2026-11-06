import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/DecisionPilotAI/',
  plugins: [react()],
  server: {
    port: 5174,
  },
})


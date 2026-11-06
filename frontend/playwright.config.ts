import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

const python = process.env.E2E_PYTHON || resolve('..', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:5174', headless: true, reducedMotion: 'reduce',
    launchOptions: process.env.PLAYWRIGHT_EDGE_PATH ? { executablePath: process.env.PLAYWRIGHT_EDGE_PATH } : {},
    trace: 'retain-on-failure' },
  webServer: [
    { command: `"${python}" -m scripts.e2e_backend`,
      cwd: '..', url: 'http://127.0.0.1:8765/health', timeout: 180_000, reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      env: { DECISIONPILOT_API_URL: 'http://127.0.0.1:8765' },
      url: 'http://127.0.0.1:5174', timeout: 120_000, reuseExistingServer: false },
  ],
})

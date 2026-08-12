// Playwright config — E2E API testing (sem browser; APP_URL via env)
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false, // servidor tem estado — worker único serializado
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
  },
})
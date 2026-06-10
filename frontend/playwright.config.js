// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — corre el frontend en :5173 y el backend en :8000.
 * Asumimos que ambos ya están corriendo (el usuario los inicia antes con `npm run dev`
 * y `uvicorn`). Si querés que Playwright los levante automáticamente, configurá `webServer`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Descomentá esto para que Playwright levante los servers solo.
  // Requiere que el backend esté disponible en :8000 también.
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 60_000,
  // },
});

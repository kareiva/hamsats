import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  // Serialized rather than parallel: these run inside a single podman container with
  // limited CPU, and parallel workers competing for it were a real source of flakiness
  // (screenshots/assertions racing real async init that hadn't caught up yet).
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    cwd: '..',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});

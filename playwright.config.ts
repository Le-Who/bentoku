import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // GitHub's software-rendered WebGL is substantially slower than a desktop
  // GPU during the nine-move animated completion scenario.
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/mobile.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-landscape',
      testIgnore: '**/mobile.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 } },
    },
    {
      name: 'mobile-touch',
      testMatch: '**/mobile.spec.ts',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

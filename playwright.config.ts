import { defineConfig, devices } from '@playwright/test';

const CLIENT_URL = 'http://localhost:5173';
const SERVER_URL = 'http://localhost:4000';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,

  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list']],

  use: {
    baseURL: CLIENT_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-capture',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
            '--auto-accept-this-tab-capture',
            '--auto-select-desktop-capture-source=Entire screen',
          ],
        },
      },
    },
  ],

  webServer: [
    {
      command: 'npm run dev:server',
      url: `${SERVER_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:client',
      url: CLIENT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});

import path from 'path';
import { defineConfig, devices } from '@playwright/test';

// Two suites share this config:
//   smoke.spec.ts    — `npm run test:e2e`: starts the built app locally (mock mode) and drives it.
//   contract.spec.ts — `npm run test:contract`: runs against a deployed environment (TARGET_URL),
//                      used by the post-deploy verification jobs in staging.yml / production.yml.
// When TARGET_URL or BASE_URL is set, no local server is started.
const remoteTarget = process.env.TARGET_URL || process.env.BASE_URL;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: remoteTarget || 'http://localhost:3000',
    trace: 'on-first-retry',
    // Lets the contract suite reach Vercel deployments that have Deployment Protection on.
    extraHTTPHeaders: bypassSecret
      ? { 'x-vercel-protection-bypass': bypassSecret, 'x-vercel-set-bypass-cookie': 'true' }
      : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remoteTarget
    ? undefined
    : {
        command: 'npm run start',
        cwd: path.join(__dirname, '..'),
        url: 'http://localhost:3000/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});

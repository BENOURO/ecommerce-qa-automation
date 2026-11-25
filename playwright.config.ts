import { defineConfig, devices } from '@playwright/test';
import { env } from './utils/env';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',

  // Each test file's tests run in parallel. Safe because every test creates its own user
  // (see fixtures/test-fixtures.ts) instead of sharing state.
  fullyParallel: true,
  forbidOnly: isCI, // fail the CI build if someone leaves test.only in the code
  retries: isCI ? 2 : 0, // retries on CI only: a test that needs a retry is reported as "flaky"
  // Capped on purpose: on the Windows development machine, more parallel browsers made the shop's
  // Node process freeze for ~10 s at random (see docs/TROUBLESHOOTING.md), which looks like flaky tests.
  workers: 2,

  timeout: 30_000,
  expect: { timeout: 7_000 }, // how long web-first assertions keep retrying

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],
  outputDir: 'test-results', // screenshots, traces and videos of failures

  use: {
    baseURL: env.baseUrl,
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on-first-retry', // recording every test is slow; failures still keep a screenshot and a trace
  },

  // One "project" per layer, so you can run them separately: npm run test:ui / test:api / test:db
  projects: [
    { name: 'ui', testDir: './tests/ui', use: { ...devices['Desktop Chrome'] } },
    { name: 'api', testDir: './tests/api' },
    { name: 'database', testDir: './tests/database' },
    // Tests that measure exact stock numbers. They run last and alone: `dependencies` makes Playwright
    // finish the three projects above first, so no parallel test changes stock under them.
    { name: 'isolated', testDir: './tests/isolated', dependencies: ['ui', 'api', 'database'] },
  ],

  // Playwright starts the shop before the tests and stops it afterwards.
  webServer: {
    command: 'npm run app',
    url: `${env.baseUrl}/api/health`,
    // Normally always start our own server, so the test-only settings below are guaranteed.
    // Set REUSE_SERVER=true to point the tests at a server you started yourself (debugging).
    reuseExistingServer: process.env.REUSE_SERVER === 'true',
    timeout: 60_000,
    env: { ENABLE_TEST_ENDPOINTS: 'true' },
  },
});

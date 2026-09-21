import { defineConfig } from '@playwright/test';

const FIXTURE_PORT = 5177;

export default defineConfig({
  testDir: './src/tests/e2e',
  // The extension runs in a single persistent context; parallel workers would
  // fight over the same profile directory.
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { trace: 'off', screenshot: 'off', baseURL: `http://localhost:${FIXTURE_PORT}` },
  // Fixtures are served over http because Chrome will not inject content
  // scripts into file:// URLs without a user-set flag.
  webServer: {
    command: 'node scripts/fixture-server.mjs',
    port: FIXTURE_PORT,
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});

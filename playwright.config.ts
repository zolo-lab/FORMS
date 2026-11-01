import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 60_000,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // iPhone 13 viewport/touch emulation, on the Chromium that CI installs.
    ...devices["iPhone 13"],
    browserName: "chromium",
    locale: "he-IL",
    // Evidence for CI failures (uploaded as an artifact by the workflow).
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    // Test-only values; the repo is public so never put real secrets here.
    env: { ADMIN_PASSWORD: "e2e-password", SESSION_SECRET: "e2e-session-secret-not-real" },
  },
});

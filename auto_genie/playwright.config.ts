import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests require a running dev server against a configured Supabase
 * project with the seed data loaded (`pnpm seed`) — they are not run as part
 * of `pnpm test` (that's vitest, unit + integration only). Run manually with
 * `pnpm exec playwright install` once, then `pnpm e2e`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});

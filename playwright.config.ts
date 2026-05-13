import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,        // Compartilham banco; serial evita race
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace:        "on-first-retry",
    screenshot:   "only-on-failure",
    video:        "retain-on-failure",
    locale:       "pt-BR",
    actionTimeout: 8_000,
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

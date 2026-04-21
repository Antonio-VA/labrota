import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: (() => {
      const url = process.env.E2E_BASE_URL
      if (!url) throw new Error("E2E_BASE_URL is required. Set it to http://localhost:3000 for local runs.")
      return url
    })(),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
      dependencies: ["setup"],
    },
  ],
  outputDir: ".playwright-results",
})

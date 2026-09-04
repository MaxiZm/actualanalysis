import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/pages",
  workers: 1,
  timeout: 90000,
  reporter: "list",
  outputDir: "work/pages-test-results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL:
      process.env.PAGES_BASE_URL ?? "http://localhost:3016/actualanalysis/",
    trace: "retain-on-failure",
  },
});

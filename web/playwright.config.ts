import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/browser-results.json" }],
  ],
  use: {
    baseURL: process.env.BOTTOCKS_TEST_ORIGIN || "http://127.0.0.1:43215",
    channel: process.platform === "win32" ? "msedge" : undefined,
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: process.env.BOTTOCKS_TEST_ORIGIN
    ? undefined
    : {
        command: "node scripts/serve-export.mjs",
        url: "http://127.0.0.1:43215",
        reuseExistingServer: true,
        timeout: 15000,
      },
});

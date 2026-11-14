import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests", timeout: 30_000, expect: { timeout: 7000 }, workers: 2,
  reporter: "list", outputDir: "../.tmp/browser-results",
  use: { headless: true, acceptDownloads: true, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chrome-desktop", use: { channel: "chrome", viewport: { width: 1440, height: 1000 } } },
    { name: "edge-desktop", use: { channel: "msedge", viewport: { width: 1440, height: 1000 } } },
    { name: "chrome-narrow", use: { channel: "chrome", viewport: { width: 390, height: 844 } } },
    { name: "chrome-wide", use: { channel: "chrome", viewport: { width: 2560, height: 1440 } } }
  ]
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "test-ime-fix.spec.mjs",
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    video: "on",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  timeout: 60_000,
});

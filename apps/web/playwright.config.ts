import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running stack: `make dev` locally (default), or the kind/Helm
 * deployment in CI via E2E_BASE_URL=http://sitework.localhost:8080.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The suite runs against one small deployment; more workers only add contention.
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  // Against a deployed stack, other tests' writes trigger live refetches; allow for that latency.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: /@mobile/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});

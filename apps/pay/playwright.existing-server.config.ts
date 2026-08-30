import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

/** Run against shell (3000) + pay zone (3001) already running — skips webServer boot. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});

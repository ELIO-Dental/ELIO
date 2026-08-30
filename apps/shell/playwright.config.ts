import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  testDir: "./e2e",
  // Generous timeout: this environment has shown slow first-compile times
  // under Turbopack on a slow filesystem (observed 10s+ for a single fresh
  // route compile) — 30s was too tight and caused false-negative timeouts
  // on genuinely-passing flows during manual verification.
  // Raised further for signup.spec.ts (Step 2.1) — that suite touches 4+
  // distinct cold routes (/signup, /api/public/signup, /launcher, plus
  // Neon's own intermittent connection drops observed all session on this
  // machine/network) in a single run; matches the same generous-timeout +
  // retries pattern apps/plans/playwright.config.ts already established for
  // its own signup e2e suite, for the identical reason.
  timeout: 180_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  retries: 2,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3022",
    trace: "retain-on-failure",
  },
  webServer: {
    // NEXTAUTH_URL must match the actual port the test server runs on:
    // Auth.js deliberately ignores the request's Host header for building
    // redirect URLs unless `trustHost` is enabled (prevents host-header
    // injection) and falls back to NEXTAUTH_URL instead — so a mismatched
    // value here (e.g. still pointing at port 3000) sends test redirects to
    // the wrong origin, not a bug in the app itself.
    command: "npx cross-env NEXTAUTH_URL=http://localhost:3022 next dev -p 3022",
    url: "http://localhost:3022/login",
    reuseExistingServer: true,
    // Raised alongside the test/expect timeouts above, matching
    // apps/plans/playwright.config.ts's proven 240s value — this app's own
    // server start intermittently exceeded 60s on this machine's confirmed
    // slow filesystem (same root cause, not a new issue).
    timeout: 240_000,
  },
});

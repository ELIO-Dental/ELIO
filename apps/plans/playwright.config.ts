import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

// See apps/pay/playwright.config.ts for the established multi-zone pattern this
// mirrors. Ports are deliberately different from both the real dev ports
// (3000/3002) and apps/pay's own e2e ports (3030/3031) so this suite can run
// alongside either without a collision.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export const SHELL_PORT = 3040;
export const PLANS_PORT = 3041;
export const PLANS_ORIGIN = `http://localhost:${PLANS_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Generous: dev-mode Turbopack compiles routes on first hit, not ahead of
  // time, and this single test touches ~8 distinct routes cold each run.
  timeout: 180_000,
  // Generous: every route this suite hits compiles cold on first request in
  // dev-mode Turbopack (confirmed via [WebServer] compile-trace logs), and
  // which route is "first" varies run to run, producing flaky timeouts at
  // whichever assertion happens to land on an uncompiled route.
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  // This machine's filesystem is measurably slow (Next.js's own dev-server
  // warning: "Slow filesystem detected"), which makes dev-mode Turbopack's
  // lazy per-route cold compilation a genuine source of transient timeouts/
  // startup-order races distinct from application logic — confirmed by
  // reproducing and fixing 6 real bugs this session, after which the suite
  // still failed intermittently on different infra timing each run while
  // passing cleanly at least once with the exact same code. Retrying absorbs
  // that class of flake without masking a real, reproducible failure (a
  // genuine logic bug fails the same way on every retry, not intermittently).
  retries: 2,
  use: {
    baseURL: `http://localhost:${SHELL_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    // shell MUST start first — plans' own middleware validates the shared
    // session against NEXTAUTH_URL=localhost:3040 (shell) on every request,
    // same ordering rationale as apps/pay/playwright.config.ts.
    {
      command: `npx cross-env NEXTAUTH_URL=http://localhost:${SHELL_PORT} PLANS_APP_ORIGIN=${PLANS_ORIGIN} next dev -p ${SHELL_PORT}`,
      cwd: path.resolve(__dirname, "../shell"),
      url: `http://localhost:${SHELL_PORT}/login`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      // GOCARDLESS_MOCK_MODE="true" is read by packages/plans-engine's
      // getGoCardlessClient(): it swaps in an in-memory mock GoCardless client
      // instead of the real SDK, so this suite never calls the real (live,
      // not sandbox — see apps/plans/.env.local) GoCardless account while
      // still exercising the real createMandateFlow/recordMandate/
      // runReconciliation route and service code.
      command: `npx cross-env NEXTAUTH_URL=http://localhost:${SHELL_PORT} GOCARDLESS_MOCK_MODE=true next dev -p ${PLANS_PORT}`,
      cwd: __dirname,
      url: `${PLANS_ORIGIN}/plans/dashboard`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});

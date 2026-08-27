import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

// See apps/plans/playwright.config.ts for the established multi-zone pattern this
// mirrors. Ports are deliberately different from apps/plans' own e2e ports
// (3040/3041) and the real dev ports (3000/3003) so this suite can run alongside
// either without a collision.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export const SHELL_PORT = 3050;
export const FLOW_PORT = 3051;
export const FLOW_ORIGIN = `http://localhost:${FLOW_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Generous: dev-mode Turbopack compiles routes on first hit, not ahead of
  // time, and this suite touches several distinct routes cold each run.
  timeout: 180_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  // This machine's filesystem is measurably slow (Next.js's own dev-server
  // warning: "Slow filesystem detected"), which makes dev-mode Turbopack's
  // lazy per-route cold compilation a genuine source of transient timeouts
  // distinct from application logic — see apps/plans/playwright.config.ts's
  // identical rationale. Retrying absorbs that class of flake without
  // masking a real, reproducible failure.
  retries: 2,
  use: {
    baseURL: `http://localhost:${SHELL_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    // shell MUST start first — apps/flow's own session check validates the
    // shared session against NEXTAUTH_URL=localhost:3050 (shell) on every
    // request, same ordering rationale as apps/plans/playwright.config.ts.
    {
      command: `npx cross-env NEXTAUTH_URL=http://localhost:${SHELL_PORT} FLOW_APP_ORIGIN=${FLOW_ORIGIN} next dev -p ${SHELL_PORT}`,
      cwd: path.resolve(__dirname, "../shell"),
      url: `http://localhost:${SHELL_PORT}/login`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: `npx cross-env NEXTAUTH_URL=http://localhost:${SHELL_PORT} next dev -p ${FLOW_PORT}`,
      cwd: __dirname,
      url: `${FLOW_ORIGIN}/flow/pipeline`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});

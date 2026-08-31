import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

// Unlike apps/pay/plans/flow, apps/admin is NOT a shell zone — it's a fully
// standalone Next.js app with its own login, its own NextAuth instance
// (packages/auth/admin-config.ts), and its own session cookie
// ("admin-authjs.session-token", deliberately distinct from apps/shell's).
// So most of this suite only needs ONE server. The one exception is the
// impersonation flow (Step 2.3, APPLICATION_FLOW.md §11a): apps/admin's own
// POST /api/tenants/[id]/impersonate/[userId] 303-redirects to
// SHELL_APP_ORIGIN's /api/impersonate/start to actually mint the real
// apps/shell session — a genuine cross-app flow, so this config also boots
// apps/shell on its own dedicated e2e port. Ports 3060/3061 are unused by
// every other app/e2e config in this monorepo (checked: 3000-3004 real dev
// ports, 3030/3031 pay e2e, 3040/3041 plans e2e, 3050/3051 flow e2e).
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export const ADMIN_PORT = 3060;
export const ADMIN_ORIGIN = `http://localhost:${ADMIN_PORT}`;
export const SHELL_PORT = 3061;
export const SHELL_ORIGIN = `http://localhost:${SHELL_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  // See apps/plans/playwright.config.ts's identical rationale: this Next.js
  // 16.3.1 + Turbopack dev server intermittently drops an in-flight response
  // mid-stream ("The destination stream closed early") under this machine's
  // measurably slow filesystem — confirmed live (2026-08-29) via a debug run
  // whose failing attempt showed exactly that server-side error, then passed
  // cleanly on retry with identical code. Retrying absorbs that infra flake
  // without masking a real, reproducible logic bug (which fails the same way
  // every time, not intermittently).
  retries: 2,
  use: {
    baseURL: ADMIN_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      // Admin's own NEXTAUTH_URL/session must stay pinned to ITS port, and
      // its SHELL_APP_ORIGIN must point at the shell instance this same
      // config boots below — overriding apps/admin/.env.local's real
      // (localhost:3000) value for this suite only, exactly like apps/pay's
      // own playwright.config.ts overrides PAY_APP_ORIGIN for its shell.
      command: `npx cross-env NEXTAUTH_URL=${ADMIN_ORIGIN} SHELL_APP_ORIGIN=${SHELL_ORIGIN} next dev --webpack -p ${ADMIN_PORT}`,
      cwd: __dirname,
      url: `${ADMIN_ORIGIN}/login`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
    {
      // apps/shell needs its OWN NEXTAUTH_URL matching its own port so the
      // JWT minted by /api/impersonate/start (encode()'d there, decoded by
      // this same app's auth() on the next request) is valid.
      command: `npx cross-env NEXTAUTH_URL=${SHELL_ORIGIN} next dev --webpack -p ${SHELL_PORT}`,
      cwd: path.resolve(__dirname, "../shell"),
      url: `${SHELL_ORIGIN}/login`,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});

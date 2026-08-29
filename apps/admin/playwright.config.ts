import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

// Unlike apps/pay/plans/flow, apps/admin is NOT a shell zone — it's a fully
// standalone Next.js app with its own login, its own NextAuth instance
// (packages/auth/admin-config.ts), and its own session cookie
// ("admin-authjs.session-token", deliberately distinct from apps/shell's).
// So this suite only ever needs to boot ONE server, unlike every other
// app's e2e config. Port 3060 is unused by every other app/e2e config in
// this monorepo (checked: 3000-3004 real dev ports, 3030/3031 pay e2e,
// 3040/3041 plans e2e, 3050/3051 flow e2e).
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export const ADMIN_PORT = 3060;
export const ADMIN_ORIGIN = `http://localhost:${ADMIN_PORT}`;

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
  webServer: {
    command: `npx cross-env NEXTAUTH_URL=${ADMIN_ORIGIN} next dev -p ${ADMIN_PORT}`,
    cwd: __dirname,
    url: `${ADMIN_ORIGIN}/login`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});

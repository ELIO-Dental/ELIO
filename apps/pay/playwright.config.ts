import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

// The Playwright test runner process (which runs beforeAll/afterAll's direct `prisma`
// calls) does NOT get Next.js's automatic .env.local loading — only the webServer
// child processes do. Load it explicitly so DATABASE_URL etc. are available here too.
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// Multi-zone (next.config.ts): apps/pay renders "inside" apps/shell's origin — the
// shell (port 3000) rewrites /pay/* to this app's own server (port 3001). A browser
// never visits port 3001 directly in the real flow, and NEXTAUTH_URL/SECRET below
// must match the shell's so the shared session cookie is valid across both. So this
// suite boots BOTH servers and drives the browser against the shell's origin, exactly
// like apps/shell/e2e's pattern but with a second webServer for this app's own port.
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3030",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    // shell MUST start first: pay's own middleware validates the session
    // against NEXTAUTH_URL=localhost:3030 (shell) on every request, including
    // Playwright's readiness probe of /pay/dentists — if pay is checked for
    // availability before shell is listening, that probe hangs forever
    // (ECONNREFUSED against 3030) and Playwright times out waiting on pay,
    // which never gets the chance to start shell (array order = start order).
    {
      command: "npx cross-env NEXTAUTH_URL=http://localhost:3030 PAY_APP_ORIGIN=http://localhost:3031 next dev -p 3030",
      cwd: require("path").resolve(__dirname, "../shell"),
      url: "http://localhost:3030/login",
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: "npx cross-env NEXTAUTH_URL=http://localhost:3030 next dev -p 3031",
      cwd: __dirname,
      url: "http://localhost:3031/pay/dentists",
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});

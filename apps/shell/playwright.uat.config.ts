import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "@playwright/test";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export const SHELL_PORT = 3060;
export const PAY_PORT = 3061;
export const PLANS_PORT = 3062;
export const FLOW_PORT = 3063;
export const SHELL_ORIGIN = `http://localhost:${SHELL_PORT}`;
export const PAY_ORIGIN = `http://localhost:${PAY_PORT}`;
export const PLANS_ORIGIN = `http://localhost:${PLANS_PORT}`;
export const FLOW_ORIGIN = `http://localhost:${FLOW_PORT}`;

/** Part 6 Portal UAT — boots shell + all three licensed modules (multi-zone). */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "uat.spec.ts",
  timeout: 180_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  retries: 2,
  use: {
    baseURL: SHELL_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `npx cross-env NEXTAUTH_URL=${SHELL_ORIGIN} PAY_APP_ORIGIN=${PAY_ORIGIN} PLANS_APP_ORIGIN=${PLANS_ORIGIN} FLOW_APP_ORIGIN=${FLOW_ORIGIN} next dev -p ${SHELL_PORT}`,
      cwd: __dirname,
      url: `${SHELL_ORIGIN}/login`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: `npx cross-env NEXTAUTH_URL=${SHELL_ORIGIN} next dev -p ${PAY_PORT}`,
      cwd: path.resolve(__dirname, "../pay"),
      url: `${PAY_ORIGIN}/pay/settings`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: `npx cross-env NEXTAUTH_URL=${SHELL_ORIGIN} GOCARDLESS_MOCK_MODE=true next dev -p ${PLANS_PORT}`,
      cwd: path.resolve(__dirname, "../plans"),
      url: `${PLANS_ORIGIN}/plans/dashboard`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: `npx cross-env NEXTAUTH_URL=${SHELL_ORIGIN} next dev -p ${FLOW_PORT}`,
      cwd: path.resolve(__dirname, "../flow"),
      url: `${FLOW_ORIGIN}/flow/dashboard`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});

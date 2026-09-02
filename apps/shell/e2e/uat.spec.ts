import path from "path";
import dotenv from "dotenv";
import { test, expect, request as pwRequest, type Browser, type Cookie } from "@playwright/test";
import { prisma } from "@elio/db";
import { SHELL_ORIGIN, PAY_ORIGIN, PLANS_ORIGIN, FLOW_ORIGIN } from "../playwright.uat.config";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

let sessionCookies: Cookie[] = [];
let practiceId: string;

async function signInAndGetCookies(browser: Browser) {
  const authContext = await browser.newContext();
  const csrfRes = await authContext.request.get(`${SHELL_ORIGIN}/api/auth/csrf`);
  expect(csrfRes.ok(), await csrfRes.text()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const loginRes = await authContext.request.post(`${SHELL_ORIGIN}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      redirect: "false",
      json: "true",
    },
  });
  expect(loginRes.ok(), await loginRes.text()).toBeTruthy();

  const cookies = await authContext.cookies();
  await authContext.close();
  return cookies;
}

/** Part 6 Portal UAT — one login, integrations, cross-module Dentally sync visibility. */
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const api = await pwRequest.newContext();
  await api.get(`${SHELL_ORIGIN}/login`).catch(() => {});
  await api.get(`${PAY_ORIGIN}/pay/settings`).catch(() => {});
  await api.get(`${PLANS_ORIGIN}/plans/dashboard`).catch(() => {});
  await api.get(`${FLOW_ORIGIN}/flow/dashboard`).catch(() => {});
  await api.get(`${SHELL_ORIGIN}/flow/dashboard`).catch(() => {});
  await api.dispose();

  sessionCookies = await signInAndGetCookies(browser);

  const owner = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
  if (!owner.practiceId) throw new Error("Seeded OWNER has no practiceId");
  practiceId = owner.practiceId;
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(sessionCookies);
});

test.afterAll(async () => {
  if (practiceId) {
    await prisma.dentallySyncRun.deleteMany({ where: { practiceId } });
    await prisma.practice
      .update({
        where: { id: practiceId },
        data: { dentallyApiKey: null, dentallyConnectionStatus: "NOT_CONNECTED" },
      })
      .catch(() => {});
  }
  await prisma.$disconnect();
});

test.describe("Portal verification (P5 / Part 6)", () => {
  test("one login opens Pay, Plans, and Flow modules", async ({ page }) => {
    await page.goto("/launcher");
    await expect(page.getByTestId("launcher-grid")).toBeVisible();
    await expect(page.getByTestId("launcher-tile-pay")).toBeVisible();
    await expect(page.getByTestId("launcher-tile-plans")).toBeVisible();
    await expect(page.getByTestId("launcher-tile-flow")).toBeVisible();

    await Promise.all([page.waitForURL(/\/pay/, { timeout: 90_000 }), page.getByTestId("launcher-tile-pay").click()]);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

    await page.goto("/plans/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/plans/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

    await expect(async () => {
      await page.goto("/flow/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/flow/);
    }).toPass({ timeout: 90_000 });
    await expect(page.getByTestId("flow-import-consults")).toBeVisible({ timeout: 60_000 });
  });

  test("integrations shows Dentally connection, last sync, and Sync now", async ({ page }) => {
    await prisma.practice.update({
      where: { id: practiceId },
      data: { dentallyApiKey: "uat-portal-test-key", dentallyConnectionStatus: "CONNECTED" },
    });
    await prisma.dentallySyncRun.create({
      data: {
        practiceId,
        trigger: "MANUAL",
        status: "SUCCESS",
        finishedAt: new Date(),
        counts: { patients: 12, appointments: 34, invoices: 5 },
      },
    });

    await page.goto("/settings/integrations");
    await expect(page.getByTestId("dentally-integrations")).toBeVisible();
    await expect(page.getByText("CONNECTED")).toBeVisible();
    await expect(page.getByText("Last sync", { exact: true })).toBeVisible();
    await expect(page.getByText("Last sync result")).toBeVisible();
    await expect(page.getByTestId("dentally-integrations").getByText("SUCCESS")).toBeVisible();
    await expect(page.getByTestId("dentally-sync-now")).toBeEnabled();
  });

  test("Dentally sync status is visible across portal and all modules", async ({ page }) => {
    await prisma.practice.update({
      where: { id: practiceId },
      data: { dentallyApiKey: "uat-portal-test-key", dentallyConnectionStatus: "CONNECTED" },
    });

    await page.route("**/api/dentally/sync", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await prisma.dentallySyncRun.create({
        data: {
          practiceId,
          trigger: "MANUAL",
          status: "SUCCESS",
          finishedAt: new Date(),
          counts: { patients: 3, appointments: 7, invoices: 2 },
        },
      });
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, message: "Mock sync started" }),
      });
    });

    await page.goto("/settings/integrations");
    await expect(page.getByTestId("dentally-sync-now")).toBeEnabled();
    await page.getByTestId("dentally-sync-now").click();

    await expect
      .poll(async () => {
        const res = await page.request.get("/api/dentally/status");
        if (!res.ok()) return null;
        const status = (await res.json()) as { latestRun?: { status?: string } };
        return status.latestRun?.status ?? null;
      }, { timeout: 30_000 })
      .toBe("SUCCESS");

    for (const modulePath of ["/pay/dentists", "/plans/dashboard", "/flow/dashboard"]) {
      const res = await page.request.get(modulePath);
      expect(res.ok(), `${modulePath}: ${await res.text()}`).toBeTruthy();
    }

    await page.goto("/launcher");
    await expect(page.getByTestId("dentally-connected-pay")).toBeVisible();
    await expect(page.getByTestId("dentally-connected-plans")).toBeVisible();
    await expect(page.getByTestId("dentally-connected-flow")).toBeVisible();
  });
});

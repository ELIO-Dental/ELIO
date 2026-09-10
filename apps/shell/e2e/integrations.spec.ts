import { test, expect, type Browser, type Cookie } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";

const SHELL_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3022";
const TEST_EMAIL = "e2e-integrations@elio.dev";
const TEST_PASSWORD = "correct-horse-battery-staple";
const TEST_PRACTICE_ID = "e2e-integrations-practice";

let sessionCookies: Cookie[] = [];

/** API sign-in avoids flaky native GET /login?email=… when React has not hydrated yet. */
async function signInAndGetCookies(browser: Browser) {
  const authContext = await browser.newContext();
  const csrfRes = await authContext.request.get(`${SHELL_ORIGIN}/api/auth/csrf`);
  expect(csrfRes.ok(), await csrfRes.text()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const loginRes = await authContext.request.post(`${SHELL_ORIGIN}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      redirect: "false",
      json: "true",
    },
  });
  expect(loginRes.ok(), await loginRes.text()).toBeTruthy();

  const cookies = await authContext.cookies();
  await authContext.close();
  return cookies;
}

test.beforeAll(async ({ browser }) => {
  await prisma.practice.upsert({
    where: { id: TEST_PRACTICE_ID },
    update: { suspendedAt: null },
    create: { id: TEST_PRACTICE_ID, name: "E2E Integrations Practice", dentallyConnectionStatus: "NOT_CONNECTED" },
  });
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { hashedPassword, practiceId: TEST_PRACTICE_ID, active: true, role: "OWNER" },
    create: { email: TEST_EMAIL, hashedPassword, role: "OWNER", practiceId: TEST_PRACTICE_ID },
  });
  for (const moduleId of ["PAY", "PLANS", "FLOW"] as const) {
    await prisma.licence.upsert({
      where: { practiceId_moduleId: { practiceId: TEST_PRACTICE_ID, moduleId } },
      update: { active: true },
      create: { practiceId: TEST_PRACTICE_ID, moduleId, active: true },
    });
  }

  // Warm cold Turbopack compiles before CSRF/credentials (avoids HTML error pages).
  const warm = await browser.newContext();
  await warm.request.get(`${SHELL_ORIGIN}/login`).catch(() => {});
  await warm.request.get(`${SHELL_ORIGIN}/api/auth/csrf`).catch(() => {});
  await warm.close();

  sessionCookies = await signInAndGetCookies(browser);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(sessionCookies);
});

test.afterAll(async () => {
  await prisma.dentallySyncRun.deleteMany({ where: { practiceId: TEST_PRACTICE_ID } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.licence.deleteMany({ where: { practiceId: TEST_PRACTICE_ID } });
  await prisma.practice.deleteMany({ where: { id: TEST_PRACTICE_ID } });
  await prisma.$disconnect();
});

test("integrations page shows Dentally status and sync API responds for owner", async ({ page }) => {
  // Isolate from Inngest/network — assert UI + status, and that Sync posts and is accepted.
  await page.route("**/api/dentally/sync", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, mode: "inline", message: "E2E mock sync started", eventId: null }),
    });
  });

  await page.goto("/settings/integrations");
  await expect(page.getByRole("heading", { level: 1, name: "Integrations" })).toBeVisible();
  await expect(page.getByTestId("dentally-integrations")).toBeVisible();

  const statusRes = await page.request.get("/api/dentally/status");
  expect(statusRes.ok()).toBeTruthy();
  const status = await statusRes.json();
  expect(status).toHaveProperty("configured");
  expect(status).toHaveProperty("connectionStatus");

  const syncButton = page.getByTestId("dentally-sync-now");
  if (status.configured) {
    await expect(syncButton).toBeEnabled();
    const [syncRes] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/dentally/sync") && res.request().method() === "POST"),
      syncButton.click(),
    ]);
    expect(syncRes.status()).toBe(202);
  } else {
    await expect(syncButton).toBeDisabled();
  }
});

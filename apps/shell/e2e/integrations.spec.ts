import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";

const TEST_EMAIL = "e2e-integrations@elio.dev";
const TEST_PASSWORD = "correct-horse-battery-staple";
const TEST_PRACTICE_ID = "e2e-integrations-practice";

test.beforeAll(async () => {
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
});

test.afterAll(async () => {
  await prisma.dentallySyncRun.deleteMany({ where: { practiceId: TEST_PRACTICE_ID } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.licence.deleteMany({ where: { practiceId: TEST_PRACTICE_ID } });
  await prisma.practice.deleteMany({ where: { id: TEST_PRACTICE_ID } });
  await prisma.$disconnect();
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  const form = page.getByTestId("login-form");
  await expect(form).toBeVisible();
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/launcher$/, { timeout: 120_000 }),
    form.evaluate((el) => (el as HTMLFormElement).requestSubmit()),
  ]);
}

test("integrations page shows Dentally status and sync API responds for owner", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: "Integrations" }).click();
  await expect(page).toHaveURL(/\/settings\/integrations$/);
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

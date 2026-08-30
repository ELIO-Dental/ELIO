import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";

const TEST_EMAIL = "e2e-pay-sidebar@elio.dev";
const TEST_PASSWORD = "correct-horse-battery-staple";
const TEST_PRACTICE_ID = "e2e-pay-sidebar-practice";

test.beforeAll(async () => {
  await prisma.practice.upsert({
    where: { id: TEST_PRACTICE_ID },
    update: {},
    create: { id: TEST_PRACTICE_ID, name: "E2E Pay Sidebar Practice" },
  });
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { hashedPassword, practiceId: TEST_PRACTICE_ID, active: true, role: "OWNER" },
    create: { email: TEST_EMAIL, hashedPassword, role: "OWNER", practiceId: TEST_PRACTICE_ID },
  });
  await prisma.licence.upsert({
    where: { practiceId_moduleId: { practiceId: TEST_PRACTICE_ID, moduleId: "PAY" } },
    update: { active: true, revokedAt: null },
    create: { practiceId: TEST_PRACTICE_ID, moduleId: "PAY", active: true, grantedAt: new Date() },
  });
});

test.afterAll(async () => {
  await prisma.licence.deleteMany({ where: { practiceId: TEST_PRACTICE_ID } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.practice.deleteMany({ where: { id: TEST_PRACTICE_ID } });
  await prisma.$disconnect();
});

test("pay module sidebar tabs and back-to-portal link", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 60_000 });

  await page.getByTestId("launcher-tile-pay").click();
  await page.waitForURL(/\/pay$/, { timeout: 60_000 });
  await expect(page.getByTestId("module-brand")).toHaveText("ELIO PAY");

  await page.getByRole("link", { name: "Dentists" }).click();
  await expect(page).toHaveURL(/\/pay\/dentists$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dentists" })).toBeVisible();
  await expect(page.getByTestId("table-refresh")).toBeVisible();

  await page.getByRole("link", { name: "Pay Periods" }).click();
  await expect(page).toHaveURL(/\/pay\/pay-periods$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pay periods" })).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/pay$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  await page.getByTestId("back-to-portal").click();
  await page.waitForURL(/\/launcher$/, { timeout: 60_000 });
  await expect(page.getByTestId("portal-brand")).toHaveText("ELIO PORTAL");
});

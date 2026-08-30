import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";

const TEST_EMAIL = "e2e-portal-nav@elio.dev";
const TEST_PASSWORD = "correct-horse-battery-staple";
const TEST_PRACTICE_ID = "e2e-portal-nav-practice";

test.beforeAll(async () => {
  await prisma.practice.upsert({
    where: { id: TEST_PRACTICE_ID },
    update: {},
    create: { id: TEST_PRACTICE_ID, name: "E2E Portal Nav Practice" },
  });
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { hashedPassword, practiceId: TEST_PRACTICE_ID, active: true, role: "OWNER" },
    create: { email: TEST_EMAIL, hashedPassword, role: "OWNER", practiceId: TEST_PRACTICE_ID },
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.practice.deleteMany({ where: { id: TEST_PRACTICE_ID } });
  await prisma.$disconnect();
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 60_000 });
}

test("portal sidebar navigates between settings routes", async ({ page }) => {
  await login(page);

  await expect(page.getByTestId("portal-brand")).toHaveText("ELIO PORTAL");
  await expect(page.getByTestId("launcher-grid")).toBeVisible();

  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();

  await page.getByRole("link", { name: "Team" }).click();
  await expect(page).toHaveURL(/\/settings\/team$/);
  await expect(page.getByTestId("table-refresh")).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.getByTestId("theme-option-dark").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/launcher$/);
  await expect(page.getByTestId("launcher-grid")).toBeVisible();
});

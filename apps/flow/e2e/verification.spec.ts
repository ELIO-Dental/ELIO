import { test, expect } from "@playwright/test";

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });
}

/** F4.3 — dashboard sync controls + CSV export smoke test. */
test("dashboard sync buttons and CSV export are available", async ({ page }) => {
  await login(page);
  await page.goto("/flow/dashboard");

  await expect(page.getByTestId("flow-import-consults")).toBeVisible();
  await expect(page.getByTestId("flow-sync-payments")).toBeVisible();
  await expect(page.getByTestId("flow-export-csv")).toBeVisible();

  const dashboardRes = await page.request.get("/flow/api/dashboard");
  expect(dashboardRes.ok()).toBeTruthy();
  const data = await dashboardRes.json();
  expect(data.stats).toMatchObject({
    totalConsultations: expect.any(Number),
    attended: expect.any(Number),
    converted: expect.any(Number),
    stuck: expect.any(Number),
    conversionRate: expect.any(Number),
  });
});

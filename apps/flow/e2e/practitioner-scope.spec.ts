import { test, expect } from "@playwright/test";

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

async function loginAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });
}

test("owner sees dentist filter and view-all practitioner scope", async ({ page }) => {
  await loginAsOwner(page);
  await page.goto("/flow/dashboard");
  await expect(page.getByTestId("dentist-filter")).toBeVisible();

  const res = await page.request.get("/flow/api/dashboard");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.practitionerScope).toEqual({ viewAll: true, dentistId: null });
});

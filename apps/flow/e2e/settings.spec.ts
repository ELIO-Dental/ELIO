import { test, expect } from "@playwright/test";

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

test("flow settings page loads and shows defaults", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });

  await page.goto("/flow/settings");
  await expect(page.getByTestId("flow-settings-form")).toBeVisible();
  await expect(page.getByLabel("Plan display name")).toHaveValue("AuraCare");
  await expect(page.getByLabel("Cosmetic consult reason filter")).toHaveValue("cosmetic consultation");
});

test("flow settings save roundtrip", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });

  await page.goto("/flow/settings");
  const planInput = page.getByLabel("Plan display name");
  await planInput.fill("AuraCare Test");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  await page.reload();
  await expect(planInput).toHaveValue("AuraCare Test");

  await planInput.fill("AuraCare");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
});

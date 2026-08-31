import { expect, type Page } from "@playwright/test";

export const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
export const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

/** Waits for client hydration before submitting — avoids native GET /login?email=… */
export async function loginAsOwner(page: Page) {
  await page.goto("/login");
  const form = page.getByTestId("login-form");
  await expect(form).toBeVisible();
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/launcher$/, { timeout: 120_000 }),
    form.evaluate((el) => (el as HTMLFormElement).requestSubmit()),
  ]);
}

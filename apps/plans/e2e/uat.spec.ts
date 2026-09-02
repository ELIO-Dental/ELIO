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

/** Part 6 Plans UAT — automated smoke (P5 verification follow-up). */
test.describe("Plans verification (P5 / Part 6)", () => {
  test("dashboard shows legacy stat cards", async ({ page }) => {
    await login(page);
    await page.goto("/plans/dashboard");
    await expect(page.getByText("Active members")).toBeVisible();
    await expect(page.getByText("Monthly revenue")).toBeVisible();
    await expect(page.getByText("Failed payments")).toBeVisible();
    await expect(page.getByText("New signups")).toBeVisible();
  });

  test("patients page has PENDING_DD filter and sync API", async ({ page }) => {
    await login(page);
    await page.goto("/plans/patients");
    await expect(page.getByRole("button", { name: "PENDING_DD" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync from Dentally" })).toBeVisible();

    const syncRes = await page.request.post("/plans/api/dentally/sync");
    expect([200, 400, 403]).toContain(syncRes.status());
    if (syncRes.ok()) {
      const body = await syncRes.json();
      expect(typeof body.imported).toBe("number");
    }
  });

  test("dentally mappings page loads", async ({ page }) => {
    await login(page);
    await page.goto("/plans/dentally");
    await expect(page.getByRole("heading", { name: /Dentally/i })).toBeVisible();
  });
});

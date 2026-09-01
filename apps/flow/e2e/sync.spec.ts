import { test, expect } from "@playwright/test";

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

test.describe.configure({ mode: "serial" });

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });
}

/** F1.7 — Flow manual Dentally sync API (payments + full modes). */
test("payment sync API returns counts for existing consults", async ({ page }) => {
  await login(page);

  const res = await page.request.post("/flow/api/sync/dentally", {
    data: { mode: "payments" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.mode).toBe("payments");
  expect(typeof body.total).toBe("number");
  expect(typeof body.updated).toBe("number");
});

test("full sync API starts background job or returns configuration error", async ({ page }) => {
  await login(page);

  const res = await page.request.post("/flow/api/sync/dentally", {
    data: { mode: "full" },
  });
  const body = await res.json();
  expect([202, 400]).toContain(res.status());
  if (res.status() === 202) {
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("full");
  } else {
    expect(body.error).toBeTruthy();
  }
});

test("dashboard exposes sync action buttons", async ({ page }) => {
  await login(page);
  await page.goto("/flow/dashboard");
  await expect(page.getByTestId("flow-sync-payments")).toBeVisible();
  await expect(page.getByTestId("flow-sync-full")).toBeVisible();
  await expect(page.getByTestId("flow-import-consults")).toBeVisible();
});

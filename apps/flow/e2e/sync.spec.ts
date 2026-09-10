import { test, expect, type Cookie } from "@playwright/test";
import { signInAndGetCookies } from "./auth-helper";

test.describe.configure({ mode: "serial" });

let sessionCookies: Cookie[] = [];

test.beforeAll(async ({ browser }) => {
  sessionCookies = await signInAndGetCookies(browser);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(sessionCookies);
});

/** F1.7 — Flow manual Dentally sync API (payments + full modes). */
test("payment sync API returns 202 for existing consults", async ({ page }) => {
  await page.goto("/flow/dashboard");

  const res = await page.request.post("/flow/api/sync/dentally", {
    data: { mode: "payments" },
  });
  expect(res.status(), await res.text()).toBe(202);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.mode).toBe("payments");
});

test("full sync API starts background job or returns configuration error", async ({ page }) => {
  await page.goto("/flow/dashboard");

  const res = await page.request.post("/flow/api/sync/dentally", {
    data: { mode: "full" },
  });
  const body = await res.json();
  expect([202, 400, 409]).toContain(res.status());
  if (res.status() === 202) {
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("full");
  } else {
    expect(body.error).toBeTruthy();
  }
});

test("dashboard exposes Sync Dentally action", async ({ page }) => {
  await page.goto("/flow/dashboard");
  await expect(page.getByTestId("flow-sync-dentally")).toBeVisible();
  await expect(page.getByTestId("flow-refresh")).toBeVisible();
});

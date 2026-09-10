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
test("payment sync API runs synchronously and returns real counts", async ({ page }) => {
  await page.goto("/flow/dashboard");

  // No Dentally API calls (re-derives from already-synced Postgres rows), so this
  // is awaited directly and returns 200 with the real result — NOT backgrounded
  // like the full sync below. A prior version backgrounded this with 202 and wrote
  // the real {total, updated, errors} only to the audit log, invisible to the user.
  const res = await page.request.post("/flow/api/sync/dentally", {
    data: { mode: "payments" },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.mode).toBe("payments");
  expect(typeof body.total).toBe("number");
  expect(typeof body.updated).toBe("number");
  expect(typeof body.errors).toBe("number");
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

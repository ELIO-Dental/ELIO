import { test, expect, type Cookie } from "@playwright/test";
import { signInAndGetCookies } from "./auth-helper";

let sessionCookies: Cookie[] = [];

test.beforeAll(async ({ browser }) => {
  sessionCookies = await signInAndGetCookies(browser);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(sessionCookies);
});

test("owner sees dentist filter and view-all practitioner scope", async ({ page }) => {
  await page.goto("/flow/dashboard");
  await expect(page.getByTestId("dentist-filter")).toBeVisible();

  const res = await page.request.get("/flow/api/dashboard");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.practitionerScope).toEqual({ viewAll: true, dentistId: null });
});

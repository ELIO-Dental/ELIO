import { test, expect } from "@playwright/test";
import { prisma } from "@elio/db";

/** Step 2.1 (MASTER_BUILD_GUIDE.md §2.1) — Testing (2.1) checklist's required
 * e2e test: a full signup with a fresh, throwaway test practice. */

const TEST_EMAIL = "e2e-signup-flow@elio.dev";
const TEST_PRACTICE_NAME = "E2E Signup Test Practice";

test.beforeAll(async () => {
  // Clean slate in case a prior run failed mid-test and left rows behind.
  const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (existing) {
    await prisma.licence.deleteMany({ where: { practiceId: existing.practiceId } });
    await prisma.user.deleteMany({ where: { practiceId: existing.practiceId } });
    await prisma.practice.deleteMany({ where: { id: existing.practiceId } });
  }
});

test.afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (user) {
    await prisma.licence.deleteMany({ where: { practiceId: user.practiceId } });
    await prisma.user.deleteMany({ where: { practiceId: user.practiceId } });
    await prisma.practice.deleteMany({ where: { id: user.practiceId } });
  }
  await prisma.$disconnect();
});

test("full signup completes end-to-end with a throwaway test practice, no manual DB edits required", async ({ page }) => {
  await page.goto("/signup");

  // Step 1 — practice + admin credentials.
  await expect(page.getByTestId("signup-step-practice")).toBeVisible();
  await page.getByLabel("Practice name").fill(TEST_PRACTICE_NAME);
  await page.getByLabel("Admin email").fill(TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByTestId("signup-next").click();

  // Step 2 — Dentally connect (optional, skip it — Testing checklist doesn't
  // require this to be filled in).
  await expect(page.getByTestId("signup-step-dentally")).toBeVisible();
  await page.getByTestId("signup-next").click();

  // Step 3 — select exactly 2 of the 3 modules.
  await expect(page.getByTestId("signup-step-modules")).toBeVisible();
  await page.getByTestId("signup-module-pay").click();
  await page.getByTestId("signup-module-plans").click();
  await page.getByTestId("signup-submit").click();

  // Signup redirects into the app (signed in immediately) — lands on the launcher.
  // No explicit timeout here — inherits playwright.config.ts's generous 45s
  // `expect` default (this exact call flaked at a hardcoded 30s on a cold
  // Turbopack compile of /launcher, passing clean on retry — the fix is a
  // longer wait, not a hope that the retry always saves it).
  await page.waitForURL(/\/launcher$/, { timeout: 60_000 });
  await expect(page.getByTestId("launcher-grid")).toBeVisible();
  await expect(page.getByTestId("portal-brand")).toBeVisible();
  await expect(page.getByTestId("portal-brand")).toContainText("ELIO Portal");
  await expect(page.getByTestId("portal-brand").locator('img[src*="/brand/elio-portal"]')).toBeVisible();

  // Real DB assertions — not just "the page navigated somewhere."
  const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_EMAIL }, include: { practice: true } });
  expect(user.role).toBe("OWNER");
  expect(user.practice.name).toBe(TEST_PRACTICE_NAME);

  const licences = await prisma.licence.findMany({ where: { practiceId: user.practiceId }, orderBy: { moduleId: "asc" } });
  expect(licences.map((l) => l.moduleId).sort()).toEqual(["PAY", "PLANS"]);
  for (const licence of licences) {
    expect(licence.active).toBe(true);
    expect(licence.trialEndsAt).toBeTruthy();
    // Each module's trial is its own independent 7-day window, not shared —
    // Hisham's confirmed answer (00_SCOPE.md §12 item 6), the one thing this
    // test must never let silently regress into a whole-practice trial.
    const daysUntilExpiry = (licence.trialEndsAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntilExpiry).toBeGreaterThan(6.9);
    expect(daysUntilExpiry).toBeLessThan(7.1);
  }

  // FLOW was never selected — confirm it genuinely has no Licence row at all,
  // not an inactive one (a whole-practice trial bug would create all 3).
  const flowLicence = await prisma.licence.findUnique({ where: { practiceId_moduleId: { practiceId: user.practiceId, moduleId: "FLOW" } } });
  expect(flowLicence).toBeNull();
});

test("signup step 2 can test Dentally connection before continuing", async ({ page }) => {
  await page.route("**/api/public/dentally/test", async (route) => {
    const body = route.request().postDataJSON() as { apiKey?: string };
    if (body.apiKey === "valid-dentally-key") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "Invalid API key" }),
    });
  });

  await page.goto("/signup");
  await page.getByLabel("Practice name").fill("Dentally Test Practice");
  await page.getByLabel("Admin email").fill("e2e-signup-dentally-test@elio.dev");
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByTestId("signup-next").click();

  await expect(page.getByTestId("signup-step-dentally")).toBeVisible();
  await page.getByLabel("Dentally API key").fill("bad");
  await page.getByTestId("signup-dentally-test").click();
  await expect(page.getByTestId("signup-dentally-test-error")).toContainText("too short");

  await page.getByLabel("Dentally API key").fill("valid-dentally-key");
  await page.getByTestId("signup-dentally-test").click();
  await expect(page.getByTestId("signup-dentally-test-ok")).toBeVisible();
});

test("selecting zero modules is rejected with a clear error, no Practice row created", async ({ page }) => {
  const email = "e2e-signup-nomodule@elio.dev";
  await page.goto("/signup");
  await page.getByLabel("Practice name").fill("No Module Test Practice");
  await page.getByLabel("Admin email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByTestId("signup-next").click();
  await page.getByTestId("signup-next").click(); // skip Dentally
  await page.getByTestId("signup-submit").click();

  await expect(page.getByText("Select at least one module to trial.")).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);

  const created = await prisma.user.findUnique({ where: { email } });
  expect(created).toBeNull();
});

test("signing up with an email that's already registered shows a duplicate-email error", async ({ page }) => {
  // Reuses the first test's now-existing user (relies on test order — Playwright
  // config here runs serially, workers: 1, matching the rest of this suite).
  await page.goto("/signup");
  await page.getByLabel("Practice name").fill("Duplicate Email Test Practice");
  await page.getByLabel("Admin email").fill(TEST_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-staple");
  await page.getByTestId("signup-next").click();
  await page.getByTestId("signup-next").click();
  await page.getByTestId("signup-module-pay").click();
  await page.getByTestId("signup-submit").click();

  await expect(page.getByText(/already registered/i).first()).toBeVisible();

  // Confirm no second practice was created under the same email.
  const practiceCount = await prisma.practice.count({ where: { name: "Duplicate Email Test Practice" } });
  expect(practiceCount).toBe(0);
});

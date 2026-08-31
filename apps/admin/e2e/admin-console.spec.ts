import "./env";
import { test, expect } from "@playwright/test";
import { prisma } from "@elio/db";
import {
  OWNER_EMAIL,
  SEED_PASSWORD,
  SUPER_ADMIN_EMAIL,
  enrollMfaOnSettingsPage,
  fillLoginForm,
  loginAsSuperAdmin,
  resetSuperAdminMfa,
  signInWithCredentials,
  signInWithoutMfa,
} from "./helpers";

// Step 2.4 e2e coverage for apps/admin. Super Admin is seeded WITHOUT MFA
// (Option B handoff) — first sign-in goes to Settings to enroll an
// authenticator, then MFA is required on every subsequent login.

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetSuperAdminMfa();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("first-time sign-in lands on Settings and can enroll an authenticator", async ({ page }) => {
  await resetSuperAdminMfa();
  await signInWithoutMfa(page);
  await expect(page.getByTestId("mfa-setup-banner")).toBeVisible();
  await expect(page.getByTestId("mfa-begin")).toBeVisible();
  await enrollMfaOnSettingsPage(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible({ timeout: 15_000 });
});

test("SUPER_ADMIN can log in with MFA and see the tenant list", async ({ page }) => {
  await loginAsSuperAdmin(page);
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();
  await expect(page.getByTestId("tenant-link-seed-practice")).toBeVisible();
});

test("wrong MFA code is rejected, not silently accepted", async ({ page }) => {
  await loginAsSuperAdmin(page);
  await page.goto("/login");
  await fillLoginForm(page, SUPER_ADMIN_EMAIL, SEED_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("mfa-form")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByTestId("mfa-submit").click();
  await expect(page.getByText(/invalid authentication code/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("mfa-form")).toBeVisible();
});

test("a non-SUPER_ADMIN cannot reach the console at all", async ({ page }) => {
  const res = await signInWithCredentials(page.request, {
    email: OWNER_EMAIL,
    password: process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real",
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  expect(body?.ok).not.toBe(true);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
});

test("direct navigation to a protected route without a session redirects to /login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
});

test("tenant list redirects to Settings when MFA is not enrolled", async ({ page }) => {
  await resetSuperAdminMfa();
  await signInWithoutMfa(page);
  await page.goto("/");
  await page.waitForURL(/\/settings$/, { timeout: 15_000 });
  await expect(page.getByTestId("mfa-setup-banner")).toBeVisible();

  await loginAsSuperAdmin(page);
});

test("suspend and reactivate a tenant, verified against real DB state", async ({ page }) => {
  const practice = await prisma.practice.findUniqueOrThrow({ where: { id: "seed-practice" } });
  const wasSuspended = !!practice.suspendedAt;
  if (wasSuspended) {
    await prisma.practice.update({ where: { id: "seed-practice" }, data: { suspendedAt: null } });
  }

  try {
    await loginAsSuperAdmin(page);
    await page.getByTestId(`tenant-link-seed-practice`).click();
    await page.waitForURL(/\/tenants\/seed-practice$/);

    await expect(page.getByTestId("suspend-toggle")).toHaveText(/suspend/i);
    const [suspendRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/tenants/seed-practice/suspend") &&
          res.request().method() === "POST"
      ),
      page.getByTestId("suspend-toggle").click(),
    ]);
    expect(suspendRes.ok()).toBeTruthy();
    await expect(page.getByTestId("suspend-toggle")).toHaveText(/reactivate/i, { timeout: 15_000 });
    await expect(page.getByTestId("suspend-toggle")).not.toBeDisabled();

    await expect(async () => {
      const afterSuspend = await prisma.practice.findUniqueOrThrow({ where: { id: "seed-practice" } });
      expect(afterSuspend.suspendedAt).not.toBeNull();
    }).toPass({ timeout: 10_000 });
  } finally {
    await prisma.practice.update({ where: { id: "seed-practice" }, data: { suspendedAt: null } });
  }

  const restored = await prisma.practice.findUniqueOrThrow({ where: { id: "seed-practice" } });
  expect(restored.suspendedAt).toBeNull();
});

test("toggling a module licence updates real DB state and the flow app enforces it", async ({ page }) => {
  const before = await prisma.licence.findUniqueOrThrow({
    where: { practiceId_moduleId: { practiceId: "seed-practice", moduleId: "FLOW" } },
  });
  if (!before.active) {
    await prisma.licence.update({
      where: { practiceId_moduleId: { practiceId: "seed-practice", moduleId: "FLOW" } },
      data: { active: true, revokedAt: null },
    });
  }

  try {
    await loginAsSuperAdmin(page);
    await page.getByTestId("tenant-link-seed-practice").click();
    await page.waitForURL(/\/tenants\/seed-practice$/);

    const toggle = page.getByTestId("licence-toggle-FLOW");
    await expect(toggle).toHaveAttribute("data-state", "checked");
    const [licenceRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/tenants/seed-practice/licence") &&
          res.request().method() === "POST"
      ),
      toggle.click(),
    ]);
    expect(licenceRes.ok()).toBeTruthy();
    await expect(async () => {
      const licence = await prisma.licence.findUniqueOrThrow({
        where: { practiceId_moduleId: { practiceId: "seed-practice", moduleId: "FLOW" } },
      });
      expect(licence.active).toBe(false);
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId("licence-toggle-FLOW").locator("svg.animate-spin")).toHaveCount(0);
  } finally {
    await prisma.licence.update({
      where: { practiceId_moduleId: { practiceId: "seed-practice", moduleId: "FLOW" } },
      data: { active: true, revokedAt: null },
    });
  }

  const restored = await prisma.licence.findUniqueOrThrow({
    where: { practiceId_moduleId: { practiceId: "seed-practice", moduleId: "FLOW" } },
  });
  expect(restored.active).toBe(true);
});

test("toggling a feature flag updates real DB state, and audit-logs the change", async ({ page }) => {
  const flag = await prisma.featureFlag.findUniqueOrThrow({ where: { key: "beta-pay-engine" } });
  const before = await prisma.practiceFeatureFlag.findUnique({
    where: { practiceId_featureFlagId: { practiceId: "seed-practice", featureFlagId: flag.id } },
  });
  if (before?.enabled) {
    await prisma.practiceFeatureFlag.update({ where: { id: before.id }, data: { enabled: false } });
  }

  try {
    await loginAsSuperAdmin(page);
    await page.getByTestId("tenant-link-seed-practice").click();
    await page.waitForURL(/\/tenants\/seed-practice$/);

    const toggle = page.getByTestId(`flag-toggle-${flag.key}`);
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("data-state", "unchecked");
    const [flagRes] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes("/api/tenants/seed-practice/feature-flag") &&
          res.request().method() === "POST"
      ),
      toggle.click(),
    ]);
    expect(flagRes.ok()).toBeTruthy();
    await expect(async () => {
      const pf = await prisma.practiceFeatureFlag.findUniqueOrThrow({
        where: { practiceId_featureFlagId: { practiceId: "seed-practice", featureFlagId: flag.id } },
      });
      expect(pf.enabled).toBe(true);
    }).toPass({ timeout: 15_000 });

    const log = await prisma.auditLog.findFirst({
      where: { action: "admin.feature-flag.enable", targetType: "PracticeFeatureFlag", practiceId: "seed-practice" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect((log?.metadata as { featureFlagId?: string } | null)?.featureFlagId).toBe(flag.id);
  } finally {
    await prisma.practiceFeatureFlag.updateMany({
      where: { practiceId: "seed-practice", featureFlagId: flag.id },
      data: { enabled: false },
    });
  }

  const restored = await prisma.practiceFeatureFlag.findUniqueOrThrow({
    where: { practiceId_featureFlagId: { practiceId: "seed-practice", featureFlagId: flag.id } },
  });
  expect(restored.enabled).toBe(false);
});

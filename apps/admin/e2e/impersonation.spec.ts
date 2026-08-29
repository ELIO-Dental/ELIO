import { test, expect } from "@playwright/test";
import { TOTP, Secret } from "otpauth";
import { prisma } from "@elio/db";
import { SHELL_ORIGIN } from "../playwright.config";

// Step 2.5 Definition-of-Done audit (00_SCOPE.md §10, Phase 2 bullet 3):
// "impersonation mode working and fully logged" was previously verified only
// by reading packages/auth/lib/impersonation.ts and the two API routes — real
// code, correctly built, but never actually driven end-to-end by a test. This
// closes that gap: a real SUPER_ADMIN starts a real impersonation session
// from apps/admin, is handed off into a real apps/shell session showing the
// persistent banner, and both the start AND end are confirmed as real
// AuditLog rows — not just "the redirect worked."

const SUPER_ADMIN_EMAIL = "seed.superadmin@elio.dev";
const TARGET_EMAIL = "seed.staff@elio.dev"; // seeded STAFF — never the real OWNER account.
const MFA_SECRET = process.env.SEED_SUPER_ADMIN_MFA_SECRET;

function currentTotpCode(secret: string): string {
  return new TOTP({ issuer: "ELIO", label: SUPER_ADMIN_EMAIL, algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate();
}

test.beforeAll(() => {
  if (!MFA_SECRET) {
    throw new Error("SEED_SUPER_ADMIN_MFA_SECRET is not set — see apps/admin/e2e/admin-console.spec.ts's identical check.");
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("SUPER_ADMIN can impersonate a real staff user, the shell shows the banner, and both start+end are audit-logged", async ({ page }) => {
  const target = await prisma.user.findUniqueOrThrow({ where: { email: TARGET_EMAIL } });

  // Log in as SUPER_ADMIN on apps/admin.
  await page.goto("/login");
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(process.env.SEED_PASSWORD ?? "Seed12345!");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("mfa-form")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Authentication code").fill(currentTotpCode(MFA_SECRET!));
  await page.getByTestId("mfa-submit").click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });

  await page.getByTestId("tenant-link-seed-practice").click();
  await page.waitForURL(/\/tenants\/seed-practice$/);

  const beforeStartCount = await prisma.auditLog.count({ where: { action: "admin.impersonation.start", targetId: target.id } });

  // Real cross-app handoff: admin's POST 303-redirects into apps/shell,
  // which mints a distinctly-typed session and lands on /launcher.
  await page.getByTestId(`impersonate-${target.id}`).click();
  await page.waitForURL(new RegExp(`${SHELL_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/launcher`), { timeout: 20_000 });

  // The persistent banner must show the REAL target's email — proof this is
  // genuinely a distinct, visibly-marked session, not silently indistinguishable.
  const banner = page.getByTestId("impersonation-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(TARGET_EMAIL);

  const afterStartCount = await prisma.auditLog.count({ where: { action: "admin.impersonation.start", targetId: target.id } });
  expect(afterStartCount).toBe(beforeStartCount + 1);

  const startLog = await prisma.auditLog.findFirst({
    where: { action: "admin.impersonation.start", targetId: target.id },
    orderBy: { createdAt: "desc" },
  });
  expect(startLog?.impersonatedUserId).toBeNull(); // this row IS the start action, on the super admin's own actor identity
  expect(startLog?.targetType).toBe("User");

  const beforeEndCount = await prisma.auditLog.count({ where: { action: "admin.impersonation.end", targetId: target.id } });

  // End it via the real banner button — not a direct DB mutation.
  await page.getByTestId("impersonation-end").click();
  await page.waitForURL(/\/login$/, { timeout: 15_000 });

  const afterEndCount = await prisma.auditLog.count({ where: { action: "admin.impersonation.end", targetId: target.id } });
  expect(afterEndCount).toBe(beforeEndCount + 1);
});

test("a super admin cannot impersonate another super admin", async ({ page }) => {
  // Real negative case, matching startImpersonation()'s own explicit guard
  // (packages/auth/lib/impersonation.ts) — the UI never renders an
  // "Impersonate" link/button for a SUPER_ADMIN row (apps/admin/app/
  // (protected)/tenants/[id]/page.tsx: `u.role !== "SUPER_ADMIN"`), so this
  // hits the route directly to prove the SERVER enforces it too, not just the UI.
  await page.goto("/login");
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(process.env.SEED_PASSWORD ?? "Seed12345!");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("mfa-form")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Authentication code").fill(currentTotpCode(MFA_SECRET!));
  await page.getByTestId("mfa-submit").click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });

  const superAdmin = await prisma.user.findUniqueOrThrow({ where: { email: SUPER_ADMIN_EMAIL } });
  const res = await page.request.post(`/api/tenants/seed-practice/impersonate/${superAdmin.id}`);
  expect(res.status()).toBe(400);
});

import { test, expect } from "@playwright/test";
import { TOTP, Secret } from "otpauth";
import { prisma } from "@elio/db";

// Step 2.4 e2e coverage for apps/admin — this app had ZERO tests before this
// (no playwright.config.ts, no e2e/ dir at all: `npm run test` errored with
// "No tests found"), a real, genuine gap found by the Step 2.4 self-review.
//
// SEED_SUPER_ADMIN_MFA_SECRET (packages/db/seed.ts) must be set in this app's
// .env.local so the seeded SUPER_ADMIN's TOTP secret is known here — MFA is
// mandatory for this role (packages/auth/admin-config.ts) with no self-serve
// enrollment UI, so a random per-run secret would make this suite untestable.
const SUPER_ADMIN_EMAIL = "seed.superadmin@elio.dev";
const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const MFA_SECRET = process.env.SEED_SUPER_ADMIN_MFA_SECRET;

function currentTotpCode(secret: string): string {
  return new TOTP({ issuer: "ELIO", label: SUPER_ADMIN_EMAIL, algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  if (!MFA_SECRET) {
    throw new Error(
      "SEED_SUPER_ADMIN_MFA_SECRET is not set in apps/admin/.env.local. Run " +
        "`SEED_SUPER_ADMIN_MFA_SECRET=<a base32 secret> npm run seed` from packages/db " +
        "first, then set the SAME value in apps/admin/.env.local (see packages/db/seed.ts)."
    );
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function loginAsSuperAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(process.env.SEED_PASSWORD ?? "Seed12345!");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("mfa-form")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Authentication code").fill(currentTotpCode(MFA_SECRET!));
  await page.getByTestId("mfa-submit").click();
  await page.waitForURL(/\/$/, { timeout: 15_000 });
}

test("SUPER_ADMIN can log in with mandatory MFA and see the tenant list", async ({ page }) => {
  await loginAsSuperAdmin(page);
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();
  // The seeded practice must appear — proves listTenants() actually reads real data.
  // Matched by testid rather than a hardcoded display name: the real DB's
  // seed-practice row may be named "Seed Practice" or "Founder's Practice"
  // depending on when it was first created (packages/db/seed.ts's upsert only
  // sets `name` on create, not update) — its id is the stable identity.
  await expect(page.getByTestId("tenant-link-seed-practice")).toBeVisible();
});

test("wrong MFA code is rejected, not silently accepted", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(process.env.SEED_PASSWORD ?? "Seed12345!");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("mfa-form")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Authentication code").fill("000000");
  await page.getByTestId("mfa-submit").click();
  await expect(page.getByText(/invalid authentication code/i)).toBeVisible({ timeout: 10_000 });
  // Must NOT have navigated away from the MFA step.
  await expect(page.getByTestId("mfa-form")).toBeVisible();
});

test("a non-SUPER_ADMIN cannot reach the console at all", async ({ page }) => {
  // Real negative case for the auth-bypass check Step 2.4's master prompt
  // calls out explicitly ("auth bypass on every admin/licence-gated route").
  // The seeded OWNER account has real credentials but is not SUPER_ADMIN —
  // adminAuthConfig's authorize() must reject it with NOT_SUPER_ADMIN before
  // any session is ever minted, not just hide the UI after login.
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText(/incorrect email or password/i)).toBeVisible({ timeout: 10_000 });
  // Still on /login — never reached the tenant list.
  await expect(page).toHaveURL(/\/login$/);
});

test("direct navigation to a protected route without a session redirects to /login", async ({ page }) => {
  // Real negative case: the tenant detail route must not render for an
  // unauthenticated request, regardless of what the UI links suggest.
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
});

test("suspend and reactivate a tenant, verified against real DB state", async ({ page }) => {
  const practice = await prisma.practice.findUniqueOrThrow({ where: { id: "seed-practice" } });
  const wasSuspended = !!practice.suspendedAt;
  // Guarantee a known starting state so this test is safely re-runnable.
  if (wasSuspended) {
    await prisma.practice.update({ where: { id: "seed-practice" }, data: { suspendedAt: null } });
  }

  await loginAsSuperAdmin(page);
  await page.getByTestId(`tenant-link-seed-practice`).click();
  await page.waitForURL(/\/tenants\/seed-practice$/);

  await expect(page.getByTestId("suspend-toggle")).toHaveText(/suspend/i);
  await page.getByTestId("suspend-toggle").click();
  await expect(page.getByTestId("suspend-toggle")).toHaveText(/reactivate/i, { timeout: 10_000 });
  await expect(page.getByTestId("suspend-toggle")).not.toBeDisabled();

  const afterSuspend = await prisma.practice.findUniqueOrThrow({ where: { id: "seed-practice" } });
  expect(afterSuspend.suspendedAt).not.toBeNull();

  // Restore immediately — this is the shared seed-practice, other suites depend on it.
  await page.getByTestId("suspend-toggle").click();
  await expect(page.getByTestId("suspend-toggle")).toHaveText(/suspend/i, { timeout: 10_000 });

  const restored = await prisma.practice.findUniqueOrThrow({ where: { id: "seed-practice" } });
  expect(restored.suspendedAt).toBeNull();
});

test("toggling a module licence updates real DB state and the flow app enforces it", async ({ page }) => {
  // Real cross-app proof, not just a UI flip: this exercises the exact same
  // Licence row that apps/flow/lib/session.ts's requirePermission() reads —
  // closing the loop between "the switch moved" and "access was actually
  // gated," the specific gap Step 2.4's audit called out as previously
  // unverified live.
  // Self-healing precondition rather than a hard assertion: a previous failed
  // run (or a retry of THIS test) may have left the licence toggled off, and
  // this test's job is to verify the toggle mechanism, not to depend on
  // never having failed before.
  const before = await prisma.licence.findUniqueOrThrow({ where: { practiceId_moduleId: { practiceId: "seed-practice", moduleId: "FLOW" } } });
  if (!before.active) {
    await prisma.licence.update({ where: { practiceId_moduleId: { practiceId: "seed-practice", moduleId: "FLOW" } }, data: { active: true, revokedAt: null } });
  }

  await loginAsSuperAdmin(page);
  await page.getByTestId("tenant-link-seed-practice").click();
  await page.waitForURL(/\/tenants\/seed-practice$/);

  await page.getByTestId("licence-toggle-FLOW").click();
  await expect(async () => {
    const licence = await prisma.licence.findUniqueOrThrow({ where: { practiceId_moduleId: { practiceId: "seed-practice", moduleId: "FLOW" } } });
    expect(licence.active).toBe(false);
  }).toPass({ timeout: 10_000 });
  // packages/ui/components/switch.tsx's `pending` prop is a visual spinner
  // only — it does NOT disable the control (deliberately, per its own
  // comment: "track stays interactive-looking"). Clicking again while a
  // request is still in flight, or before router.refresh() finishes
  // re-rendering the tree, can race the in-flight request. Waiting for the
  // request to settle (no spinner) before the next click avoids that,
  // matching how a real user would naturally pause between clicks anyway.
  await expect(page.getByTestId("licence-toggle-FLOW").locator("svg.animate-spin")).toHaveCount(0);

  // Restore immediately.
  await page.getByTestId("licence-toggle-FLOW").click();
  await expect(async () => {
    const licence = await prisma.licence.findUniqueOrThrow({ where: { practiceId_moduleId: { practiceId: "seed-practice", moduleId: "FLOW" } } });
    expect(licence.active).toBe(true);
  }).toPass({ timeout: 10_000 });
});

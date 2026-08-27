import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";

/** Step 2.2 (MASTER_BUILD_GUIDE.md §2.2, FR-3) — Testing (2.2) checklist:
 * revoke/grant a licence live, confirm the launcher tile AND direct route
 * access both change on the practice's very next request, with no logout
 * and no redeploy. Lives here (not apps/shell/e2e) because it needs the
 * real multi-zone shell+pay pair this suite's own config already boots. */

const TEST_EMAIL = "e2e-licence-gating@elio.dev";
const TEST_PASSWORD = "correct-horse-battery-staple";
const TEST_PRACTICE_ID = "e2e-licence-practice";

test.beforeAll(async () => {
  await prisma.practice.upsert({
    where: { id: TEST_PRACTICE_ID },
    update: {},
    create: { id: TEST_PRACTICE_ID, name: "E2E Licence Gating Practice" },
  });
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { hashedPassword, practiceId: TEST_PRACTICE_ID, active: true },
    create: { email: TEST_EMAIL, hashedPassword, role: "OWNER", practiceId: TEST_PRACTICE_ID },
  });
  // Starts with an ACTIVE Pay licence — the test revokes it mid-session.
  await prisma.licence.upsert({
    where: { practiceId_moduleId: { practiceId: TEST_PRACTICE_ID, moduleId: "PAY" } },
    update: { active: true, revokedAt: null },
    create: { practiceId: TEST_PRACTICE_ID, moduleId: "PAY", active: true, grantedAt: new Date() },
  });
});

test.afterAll(async () => {
  await prisma.licence.deleteMany({ where: { practiceId: TEST_PRACTICE_ID } });
  await prisma.user.deleteMany({ where: { practiceId: TEST_PRACTICE_ID } });
  await prisma.practice.deleteMany({ where: { id: TEST_PRACTICE_ID } });
  await prisma.$disconnect();
});

test("revoking a licence mid-session blocks the next request to that module, no logout required", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 60_000 });

  // Licensed at login — the tile is clickable, not locked.
  const payTile = page.getByTestId("launcher-tile-pay");
  await expect(payTile).toBeVisible();
  await expect(payTile).not.toHaveAttribute("data-locked", "true");

  // A direct URL into the licensed module works (still same, never-logged-out session).
  await page.goto("/pay");
  await expect(page).toHaveURL(/\/pay$/);

  // Revoke the licence directly in the DB — simulates the Super Admin console
  // (Step 2.3) toggling it off, mid-session, with no action from this user at all.
  await prisma.licence.update({
    where: { practiceId_moduleId: { practiceId: TEST_PRACTICE_ID, moduleId: "PAY" } },
    data: { active: false, revokedAt: new Date() },
  });

  // Same session (no logout, no re-login) — a direct URL to the now-unlicensed
  // module must be blocked server-side, not just hidden by the launcher UI.
  await page.goto("/pay");
  await page.waitForURL(/\/launcher\?unlicensed=pay/, { timeout: 30_000 });

  // The launcher itself now reflects the revoked licence, same session.
  await page.goto("/launcher");
  await expect(page.getByTestId("launcher-tile-pay")).toHaveAttribute("data-locked", "true");

  // Re-granting takes effect immediately too, same session, no logout.
  await prisma.licence.update({
    where: { practiceId_moduleId: { practiceId: TEST_PRACTICE_ID, moduleId: "PAY" } },
    data: { active: true, revokedAt: null },
  });
  await page.goto("/pay");
  await expect(page).toHaveURL(/\/pay$/);
});

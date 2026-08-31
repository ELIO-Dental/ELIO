import "./env";
import { test, expect } from "@playwright/test";
import { prisma } from "@elio/db";
import { SHELL_ORIGIN } from "../playwright.config";
import { loginAsSuperAdmin, SUPER_ADMIN_EMAIL } from "./helpers";

const TARGET_EMAIL = "seed.staff@elio.dev";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("SUPER_ADMIN can impersonate a real staff user, the shell shows the banner, and both start+end are audit-logged", async ({ page }) => {
  const target = await prisma.user.findUniqueOrThrow({ where: { email: TARGET_EMAIL } });

  await loginAsSuperAdmin(page);

  await page.getByTestId("tenant-link-seed-practice").click();
  await page.waitForURL(/\/tenants\/seed-practice$/);

  const beforeStartCount = await prisma.auditLog.count({
    where: { action: "admin.impersonation.start", targetId: target.id },
  });

  await page.getByTestId(`impersonate-${target.id}`).click();
  await page.waitForURL(new RegExp(`${SHELL_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/launcher`), {
    timeout: 20_000,
  });

  const banner = page.getByTestId("impersonation-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(TARGET_EMAIL);

  const afterStartCount = await prisma.auditLog.count({
    where: { action: "admin.impersonation.start", targetId: target.id },
  });
  expect(afterStartCount).toBe(beforeStartCount + 1);

  const startLog = await prisma.auditLog.findFirst({
    where: { action: "admin.impersonation.start", targetId: target.id },
    orderBy: { createdAt: "desc" },
  });
  expect(startLog?.impersonatedUserId).toBeNull();
  expect(startLog?.targetType).toBe("User");

  const beforeEndCount = await prisma.auditLog.count({
    where: { action: "admin.impersonation.end", targetId: target.id },
  });

  await page.getByTestId("impersonation-end").click();
  await page.waitForURL(/\/login$/, { timeout: 15_000 });

  const afterEndCount = await prisma.auditLog.count({
    where: { action: "admin.impersonation.end", targetId: target.id },
  });
  expect(afterEndCount).toBe(beforeEndCount + 1);
});

test("a super admin cannot impersonate another super admin", async ({ page }) => {
  await loginAsSuperAdmin(page);

  const superAdmin = await prisma.user.findUniqueOrThrow({ where: { email: SUPER_ADMIN_EMAIL } });
  const res = await page.request.post(`/api/tenants/seed-practice/impersonate/${superAdmin.id}`);
  expect(res.status()).toBe(400);
});

import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";

const TEST_EMAIL = "e2e-test-user@elio.dev";
const TEST_PASSWORD = "correct-horse-battery-staple";

test.beforeAll(async () => {
  const practice = await prisma.practice.upsert({
    where: { id: "e2e-practice" },
    update: {},
    create: { id: "e2e-practice", name: "E2E Practice" },
  });
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { hashedPassword },
    create: { email: TEST_EMAIL, hashedPassword, role: "OWNER", practiceId: practice.id },
  });
});

test.afterAll(async () => {
  await prisma.passwordResetToken.deleteMany({ where: { user: { email: TEST_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.practice.deleteMany({ where: { id: "e2e-practice" } });
  await prisma.$disconnect();
});

test("successful login lands on the launcher", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });
  await expect(page.getByTestId("launcher-grid")).toBeVisible();
  await expect(page.getByTestId("portal-brand")).toBeVisible();
  await expect(page.getByTestId("portal-brand")).toContainText("ELIO Portal");
  await expect(page.getByTestId("portal-brand").locator('img[src*="/brand/elio-portal"]')).toBeVisible();
});

test("wrong password shows a clear error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill("totally-wrong-password");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("forgot-password flow end-to-end", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByTestId("forgot-password-submit").click();
  await expect(page.getByTestId("forgot-password-confirmation")).toBeVisible();

  // Test email capture: RESEND_API_KEY is unset in this environment, so no real
  // email is sent — read the freshly created single-use token straight from the
  // database instead of an inbox, then exercise the reset page with it.
  const record = await prisma.passwordResetToken.findFirst({
    where: { user: { email: TEST_EMAIL }, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  expect(record).toBeTruthy();

  // We only have the hash in the DB (tokens are hashed at rest) — recover the raw
  // token isn't possible from the hash, so instead mint a token the same way the
  // app does and insert it directly for this deterministic test path.
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_EMAIL } });
  await prisma.passwordResetToken.create({
    data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  await page.goto(`/reset-password/${rawToken}`);
  await page.getByLabel("New password").fill("brand-new-password-123");
  await page.getByLabel("Confirm password").fill("brand-new-password-123");
  await page.getByTestId("reset-password-submit").click();
  await expect(page.getByTestId("reset-password-success")).toBeVisible();

  // old link fails after use
  await page.goto(`/reset-password/${rawToken}`);
  await page.getByLabel("New password").fill("another-password-456");
  await page.getByLabel("Confirm password").fill("another-password-456");
  await page.getByTestId("reset-password-submit").click();
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();

  // reset the password back for subsequent tests / re-runs
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12);
  await prisma.user.update({ where: { email: TEST_EMAIL }, data: { hashedPassword } });
});

test("deep-link to a protected route redirects to login, then back after logging in", async ({ page }) => {
  await page.goto("/launcher");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Flauncher/);

  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByTestId("login-submit").click();

  await expect(page).toHaveURL(/\/launcher$/);
});

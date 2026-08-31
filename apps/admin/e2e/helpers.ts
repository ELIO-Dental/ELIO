import "./env";
import { expect, type Page, type APIRequestContext } from "@playwright/test";
import { TOTP, Secret } from "otpauth";
import { prisma } from "@elio/db";

export const SUPER_ADMIN_EMAIL = "seed.superadmin@elio.dev";
export const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Seed12345!";

export function currentTotpCode(secret: string, email = SUPER_ADMIN_EMAIL): string {
  return new TOTP({
    issuer: "ELIO",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate();
}

/** Option B handoff — super admin starts with no MFA until Settings enrollment. */
export async function resetSuperAdminMfa() {
  await prisma.user.update({
    where: { email: SUPER_ADMIN_EMAIL },
    data: { mfaEnabled: false, mfaSecret: null },
  });
}

export async function signInWithCredentials(
  request: APIRequestContext,
  opts: { email: string; password: string; mfaCode?: string }
) {
  const csrfRes = await request.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  return request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email: opts.email,
      password: opts.password,
      ...(opts.mfaCode ? { mfaCode: opts.mfaCode } : {}),
      redirect: "false",
      json: "true",
    },
  });
}

export async function fillLoginForm(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const emailInput = page.locator("#email");
  const passwordInput = page.locator("#password");
  await emailInput.click();
  await emailInput.fill(email);
  await passwordInput.click();
  await passwordInput.fill(password);
  await expect(emailInput).toHaveValue(email);
  await expect(passwordInput).toHaveValue(password);
}

export async function enrollMfaViaApi(page: Page) {
  const beginRes = await page.request.post("/api/settings/mfa/begin");
  expect(beginRes.ok()).toBeTruthy();
  const { secret } = (await beginRes.json()) as { secret: string };
  const confirmRes = await page.request.post("/api/settings/mfa/confirm", {
    data: { secret, code: currentTotpCode(secret) },
  });
  expect(confirmRes.ok()).toBeTruthy();
  return secret;
}

export async function enrollMfaOnSettingsPage(page: Page) {
  const banner = page.getByTestId("mfa-setup-banner");
  if (!(await banner.isVisible().catch(() => false))) {
    return;
  }
  const [beginRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/settings/mfa/begin") && res.request().method() === "POST",
      { timeout: 60_000 }
    ),
    page.getByTestId("mfa-begin").click(),
  ]);
  expect(beginRes.ok()).toBeTruthy();
  const { secret } = (await beginRes.json()) as { secret: string };
  await expect(page.getByTestId("mfa-secret")).toHaveText(secret, { timeout: 10_000 });
  await page.getByLabel("6-digit code from your app").fill(currentTotpCode(secret));
  const [confirmRes] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/settings/mfa/confirm") && res.request().method() === "POST",
      { timeout: 60_000 }
    ),
    page.getByTestId("mfa-confirm").click(),
  ]);
  expect(confirmRes.ok()).toBeTruthy();
  await expect(page.getByTestId("mfa-enroll-success")).toBeVisible({ timeout: 15_000 });
}

/** Password-only sign-in when MFA is not enrolled yet (Option B first login). */
export async function signInWithoutMfa(page: Page) {
  const res = await signInWithCredentials(page.request, {
    email: SUPER_ADMIN_EMAIL,
    password: SEED_PASSWORD,
  });
  expect(res.ok()).toBeTruthy();
  await page.goto("/settings");
  await page.waitForURL(/\/settings$/, { timeout: 15_000 });
}

export async function loginAsSuperAdmin(page: Page) {
  const user = await prisma.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
    select: { mfaEnabled: true, mfaSecret: true },
  });

  if (!user?.mfaEnabled || !user.mfaSecret) {
    await signInWithoutMfa(page);
    await enrollMfaViaApi(page);
    await page.goto("/");
    await page.waitForURL(/\/$/, { timeout: 15_000 });
    return;
  }

  const res = await signInWithCredentials(page.request, {
    email: SUPER_ADMIN_EMAIL,
    password: SEED_PASSWORD,
    mfaCode: currentTotpCode(user.mfaSecret),
  });
  expect(res.ok()).toBeTruthy();
  await page.goto("/");
  await page.waitForURL(/\/$/, { timeout: 15_000 });
}

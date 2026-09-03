import path from "path";
import dotenv from "dotenv";
import { test, expect, request as pwRequest, type Browser, type Cookie } from "@playwright/test";
import { prisma } from "@elio/db";
import { activeMemberEnrolmentWhere } from "@elio/plans-engine";
import { PLANS_ORIGIN, SHELL_PORT } from "../playwright.config";

const SHELL_ORIGIN = `http://localhost:${SHELL_PORT}`;

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

const PATIENT_TABS = ["Overview", "Payments", "Appointments", "Redeems", "Documents", "Notes", "Correspondence"] as const;

type UatFixture = {
  planPatientId: string;
  planId: string;
  patientId: string;
  documentId: string;
};

/** API sign-in avoids flaky native GET /login?email=… when React has not hydrated yet. */
async function signInAndGetCookies(browser: Browser) {
  const authContext = await browser.newContext();
  const csrfRes = await authContext.request.get(`${SHELL_ORIGIN}/api/auth/csrf`);
  expect(csrfRes.ok(), await csrfRes.text()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const loginRes = await authContext.request.post(`${SHELL_ORIGIN}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      redirect: "false",
      json: "true",
    },
  });
  expect(loginRes.ok(), await loginRes.text()).toBeTruthy();

  const cookies = await authContext.cookies();
  await authContext.close();
  return cookies;
}

/** Part 6 Plans UAT — full automated coverage (P5 verification follow-up). */
test.describe.configure({ mode: "serial" });

let fixture: UatFixture | null = null;
let sessionCookies: Cookie[] = [];

test.beforeAll(async ({ browser }) => {
  const api = await pwRequest.newContext();
  await api.get(`${SHELL_ORIGIN}/login`).catch(() => {});
  await api.get(`${PLANS_ORIGIN}/plans/dashboard`).catch(() => {});
  await api.dispose();

  sessionCookies = await signInAndGetCookies(browser);

  const owner = await prisma.user.findFirst({
    where: { email: OWNER_EMAIL.toLowerCase() },
    select: { practiceId: true },
  });
  if (!owner?.practiceId) throw new Error(`No practice for ${OWNER_EMAIL}`);

  const seedApi = await pwRequest.newContext();
  const seedRes = await seedApi.post(`${PLANS_ORIGIN}/plans/api/test/e2e-signup`, {
    data: { practiceId: owner.practiceId },
  });
  if (seedRes.ok()) {
    const body = await seedRes.json();
    fixture = {
      planPatientId: body.planPatientId,
      planId: body.planId,
      patientId: body.patientId,
      documentId: body.documentId,
    };
  }
  await seedApi.dispose();
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(sessionCookies);
});

test.afterAll(async () => {
  if (!fixture) return;
  const api = await pwRequest.newContext();
  await api.post(`${PLANS_ORIGIN}/plans/api/test/e2e-cleanup`, {
    data: {
      patientId: fixture.patientId,
      planPatientId: fixture.planPatientId,
      planId: fixture.planId,
      documentId: fixture.documentId,
    },
  });
  await api.dispose();
});

test.describe("Plans verification (P5 / Part 6)", () => {
  test("dashboard active members matches mandate-aware count", async ({ page }) => {
    const owner = await prisma.user.findFirst({
      where: { email: OWNER_EMAIL.toLowerCase() },
      select: { practiceId: true },
    });
    if (!owner?.practiceId) throw new Error(`No practice for ${OWNER_EMAIL}`);

    const expected = await prisma.patientPlanEnrolment.count({
      where: activeMemberEnrolmentWhere(owner.practiceId),
    });

    await page.goto("/plans/dashboard");
    const activeValue = page.getByText("Active members", { exact: true }).locator("..").locator(".tabular-nums");
    await expect(activeValue).toHaveText(String(expected), { timeout: 60_000 });
  });

  test("free child plan requires parent patient selection", async ({ page }) => {
    const planName = `UAT Free Child ${Date.now()}`;
    const createRes = await page.request.post("/plans/api/plans", {
      data: {
        name: planName,
        monthlyPricePence: 0,
        inclusions: [],
        discounts: [],
        eligibilityRules: [],
      },
    });
    expect(createRes.ok(), await createRes.text()).toBeTruthy();
    const { plan } = (await createRes.json()) as { plan: { id: string } };
    const planId = plan.id;

    await page.goto("/plans/patients");
    const planTrigger = page.locator("#plan");
    if (await planTrigger.isVisible()) {
      await planTrigger.click();
      const planOption = page.getByRole("option", { name: new RegExp(planName) });
      await expect(planOption).toBeVisible({ timeout: 15_000 });
      await planOption.click();
      await expect(page.getByText("Link to parent/guardian")).toBeVisible();
      await expect(page.getByText(/children on a free plan must be linked/i)).toBeVisible();
    } else {
      // No unenrolled patients — validate API rejects missing parent on free plan.
      const owner = await prisma.user.findFirst({
        where: { email: OWNER_EMAIL.toLowerCase() },
        select: { practiceId: true },
      });
      const patient = await prisma.patient.findFirst({ where: { practiceId: owner?.practiceId } });
      test.skip(!patient, "No synced patient available for enrolment API check");
      const enrolRes = await page.request.post("/plans/api/enrolments", {
        data: { patientId: patient!.id, planId },
      });
      expect(enrolRes.status()).toBe(400);
      const body = await enrolRes.json();
      expect(body.error).toMatch(/parent/i);
    }

    await page.request.delete(`/plans/api/plans/${planId}`).catch(() => {});
  });

  test("dashboard shows legacy stat cards", async ({ page }) => {
    await page.goto("/plans/dashboard");
    await expect(page.getByText("Active members").first()).toBeVisible();
    await expect(page.getByText("Monthly revenue").first()).toBeVisible();
    await expect(page.getByText("Failed payments").first()).toBeVisible();
    await expect(page.getByText("New signups").first()).toBeVisible();
  });

  test("patients page has PENDING_DD filter and sync API", async ({ page }) => {
    await page.goto("/plans/patients");
    await expect(page.getByRole("button", { name: "PENDING_DD" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync from Dentally" })).toBeVisible();

    const syncRes = await page.request.post("/plans/api/dentally/sync");
    expect([200, 400, 403]).toContain(syncRes.status());
    if (syncRes.ok()) {
      const body = await syncRes.json();
      expect(typeof body.imported).toBe("number");
    }
  });

  test("dentally mappings page loads", async ({ page }) => {
    await page.goto("/plans/dentally");
    await expect(page.getByRole("heading", { name: /Dentally/i })).toBeVisible();
  });

  test("patient list includes row link to detail page", async ({ page }) => {
    test.skip(!fixture, "e2e-signup fixture unavailable (GOCARDLESS_MOCK_MODE required)");
    await page.goto("/plans/patients?q=E2E");
    await expect(page.locator(`a[href$="/patients/${fixture!.planPatientId}"]`).first()).toBeVisible();
  });

  test("patient detail page shows all legacy tabs", async ({ page }) => {
    test.skip(!fixture, "e2e-signup fixture unavailable (GOCARDLESS_MOCK_MODE required)");
    await page.goto(`/plans/patients/${fixture!.planPatientId}`);
    await expect(page.getByTestId("patient-detail-tabs")).toBeVisible();
    for (const tab of PATIENT_TABS) {
      await expect(page.getByRole("button", { name: tab })).toBeVisible();
    }
    await page.getByRole("button", { name: "Payments" }).click();
    await page.waitForResponse(
      (res) => res.url().includes("/payment-trail") && res.ok(),
      { timeout: 60_000 },
    );
    await expect(page.getByText("No payments", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Notes" }).click();
    await expect(page.getByText("Patient notes", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Correspondence" }).click();
    await page.waitForResponse((res) => res.url().includes("/correspondence") && res.ok());
    await expect(page.getByText("Email correspondence", { exact: true })).toBeVisible();
  });

  test("bulk Check GoCardless links mandates", async ({ page }) => {
    await page.goto("/plans/patients");
    await expect(page.getByTestId("plans-bulk-check-gc")).toBeVisible();

    const res = await page.request.post("/plans/api/admin/bulk-check-gc");
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.checked).toBe("number");
    expect(typeof body.linked).toBe("number");
  });

  test("export CSV patients downloads legacy columns", async ({ page }) => {
    await page.goto("/plans/patients");
    await expect(page.getByTestId("plans-export-csv")).toBeVisible();

    const res = await page.request.get("/plans/api/patients/export");
    expect(res.ok(), await res.text()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("text/csv");
    const csv = await res.text();
    for (const header of ["Name", "Email", "Plan", "Status", "T&Cs Signed", "Joined"]) {
      expect(csv).toContain(header);
    }
  });

  test("plan edit: inclusions, discounts, eligibility rules", async ({ page }) => {
    await page.goto("/plans/plans");
    const editButtons = page.getByRole("button", { name: /^Edit / });
    if ((await editButtons.count()) === 0) {
      const createRes = await page.request.post("/plans/api/plans", {
        data: {
          name: "UAT Test Plan",
          monthlyPricePence: 2500,
          inclusions: [{ name: "Hygiene visit", quantity: 2, period: "year", sortOrder: 0 }],
          discounts: [{ name: "10% off treatments", percentage: 10, sortOrder: 0 }],
          eligibilityRules: [{ ruleType: "dental_fit_required", active: true, sortOrder: 0 }],
        },
      });
      expect(createRes.ok(), await createRes.text()).toBeTruthy();
      await page.reload();
    }
    await page.getByRole("button", { name: /^Edit / }).first().click();
    const dialog = page.getByTestId("plans-edit-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Inclusions", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Discounts", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Eligibility rules", { exact: true })).toBeVisible();
  });
});

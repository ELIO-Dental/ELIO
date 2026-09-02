import path from "path";
import dotenv from "dotenv";
import { test, expect, request as pwRequest, type Page, type Cookie } from "@playwright/test";
import { prisma } from "@elio/db";
import { PLANS_ORIGIN } from "../playwright.config";

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

/** Waits for client hydration before submitting — avoids native GET /login?email=… */
async function login(page: Page) {
  await page.goto("/login");
  const form = page.getByTestId("login-form");
  await expect(form).toBeVisible();
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLFormElement>('[data-testid="login-form"]');
    if (!el) return false;
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    return Boolean(key && typeof (el as Record<string, unknown>)[key as string] === "object");
  });
  await page.getByLabel("Email").click();
  await page.getByLabel("Email").fill("");
  await page.getByLabel("Email").pressSequentially(OWNER_EMAIL, { delay: 5 });
  await page.getByLabel("Password").click();
  await page.getByLabel("Password").fill("");
  await page.getByLabel("Password").pressSequentially(OWNER_PASSWORD, { delay: 5 });
  await Promise.all([
    page.waitForURL(/\/launcher$/, { timeout: 120_000 }),
    form.evaluate((el) => (el as HTMLFormElement).requestSubmit()),
  ]);
}

/** Part 6 Plans UAT — full automated coverage (P5 verification follow-up). */
test.describe.configure({ mode: "serial" });

let fixture: UatFixture | null = null;
let sessionCookies: Cookie[] = [];

test.beforeAll(async ({ browser }) => {
  const authContext = await browser.newContext();
  const page = await authContext.newPage();
  await login(page);
  sessionCookies = await authContext.cookies();
  await authContext.close();

  const owner = await prisma.user.findFirst({
    where: { email: OWNER_EMAIL.toLowerCase() },
    select: { practiceId: true },
  });
  if (!owner?.practiceId) throw new Error(`No practice for ${OWNER_EMAIL}`);

  const api = await pwRequest.newContext();
  await api.get(`${PLANS_ORIGIN}/plans/dashboard`).catch(() => {});
  const seedRes = await api.post(`${PLANS_ORIGIN}/plans/api/test/e2e-signup`, {
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
  await api.dispose();
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
    await expect(page.getByText("No GoCardless payments yet", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Notes" }).click();
    await expect(page.getByText("Patient notes are planned", { exact: false })).toBeVisible();
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

import path from "path";
import dotenv from "dotenv";
import { test, expect, request as pwRequest, type Browser, type Cookie } from "@playwright/test";
import { prisma } from "@elio/db";

dotenv.config({ path: path.resolve(__dirname, "../../shell/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SHELL_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3030";
const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

const PRACTITIONER_ID = `uat-${Date.now()}`;

let sessionCookies: Cookie[] = [];
let practiceId: string;
let dentistId: string;
let payPeriodId: string;

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

/** Part 6 Pay UAT — automated smoke + Dentally fetch flow. */
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const api = await pwRequest.newContext();
  await api.get(`${SHELL_ORIGIN}/login`).catch(() => {});
  await api.get("http://localhost:3031/pay/settings").catch(() => {});
  await api.dispose();

  sessionCookies = await signInAndGetCookies(browser);
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(sessionCookies);
});

test.afterAll(async () => {
  if (payPeriodId) {
    await prisma.privateRevenueLineItem.deleteMany({ where: { payslipEntry: { payPeriodId } } });
    await prisma.payslipEntry.deleteMany({ where: { payPeriodId } });
    await prisma.payPeriod.deleteMany({ where: { id: payPeriodId } });
  }
  if (dentistId) {
    await prisma.dentist.deleteMany({ where: { id: dentistId } });
  }
  await prisma.$disconnect();
});

test.describe("Pay verification (P5 / Part 6)", () => {
  test("settings: therapy and finance rates configurable", async ({ page }) => {
    await page.goto("/pay/settings");
    await expect(page.getByText("Therapy calculator")).toBeVisible();
    await expect(page.getByText("Hourly rate (£)")).toBeVisible();
    await expect(page.getByText("Finance fee split")).toBeVisible();
    await expect(page.getByTestId("settings-save")).toBeVisible();
  });

  test("dentists: practitioner IDs map in UI", async ({ page }) => {
    await page.goto("/pay/dentists");
    await expect(page.getByText("Dentally ID")).toBeVisible();
    await expect(page.getByText(/Dentally practitioner/i).first()).toBeVisible();
  });

  test("lab bills page supports mark paid and invoice upload", async ({ page }) => {
    await page.goto("/pay/lab-bills");
    await expect(page.getByTestId("lab-bills-page")).toBeVisible();
    await expect(page.getByText("Add lab bill")).toBeVisible();
  });

  test("bulk payments: bank details API and Starling export UI", async ({ page }) => {
    await page.goto("/pay/bulk-payments");
    await expect(page.getByTestId("bulk-payments-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bank details" })).toBeVisible();

    const entitiesRes = await page.request.get("/pay/api/saved-entities");
    expect(entitiesRes.ok(), await entitiesRes.text()).toBeTruthy();
    const entities = await entitiesRes.json();
    expect(Array.isArray(entities.labs)).toBe(true);
    expect(Array.isArray(entities.suppliers)).toBe(true);

    const unpaidRes = await page.request.get("/pay/api/bulk-payment");
    expect(unpaidRes.ok(), await unpaidRes.text()).toBeTruthy();
  });

  test("draft pay period: fetch from Dentally populates patients and analytics", async ({ page }) => {
    test.setTimeout(300_000);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
    if (!owner.practiceId) throw new Error("Seeded OWNER has no practiceId");
    practiceId = owner.practiceId;

    const dentistName = `UAT Pay Dentist ${Date.now()}`;
    const dentist = await prisma.dentist.create({
      data: {
        practiceId,
        name: dentistName,
        payType: "PERCENTAGE_SPLIT",
        privateSplitPercent: 50,
        udaRatePence: 2810,
        dentallyPractitionerId: PRACTITIONER_ID,
      },
    });
    dentistId = dentist.id;

    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0));
    const period = await prisma.payPeriod.create({
      data: { practiceId, periodStart, periodEnd, status: "DRAFT", triggeredAt: new Date() },
    });
    payPeriodId = period.id;

    await page.route("**/fetch-dentally**", async (route) => {
      if (route.request().method() !== "POST" || !route.request().url().includes(payPeriodId)) {
        await route.continue();
        return;
      }

      const payslip = await prisma.payslipEntry.upsert({
        where: { payPeriodId_dentistId: { payPeriodId, dentistId } },
        create: {
          practiceId,
          payPeriodId,
          dentistId,
          payType: "PERCENTAGE_SPLIT",
          privateSplitPercent: 50,
        },
        update: {},
      });

      await prisma.privateRevenueLineItem.deleteMany({ where: { payslipEntryId: payslip.id } });
      await prisma.privateRevenueLineItem.create({
        data: {
          payslipEntryId: payslip.id,
          patientName: "UAT Patient",
          amountPence: 30000,
          amountPaidPence: 30000,
          paymentStatus: "paid",
          durationMins: 60,
          invoiceDate: period.periodStart.toISOString().slice(0, 10),
        },
      });

      await prisma.payslipEntry.update({
        where: { id: payslip.id },
        data: {
          dentallyAnalyticsJson: {
            totalChairMins: 120,
            totalPatients: 1,
            utilizationPercent: 62.5,
            grossPerHour: 300,
            netPerHour: 150,
            avgAppointmentMins: 60,
          },
        },
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          message: "Mock Dentally fetch complete",
          summary: { [dentistId]: { invoicedPence: 30000, paidPence: 30000, invoiceCount: 1 } },
        }),
      });
    });

    await page.goto(`/pay/pay-periods/${payPeriodId}`);
    await expect(page.getByTestId("header-fetch-dentally")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("header-fetch-dentally").click();

    await expect
      .poll(
        async () =>
          prisma.privateRevenueLineItem.count({ where: { payslipEntry: { payPeriodId, dentistId } } }),
        { timeout: 90_000 },
      )
      .toBe(1);

    const payslip = await prisma.payslipEntry.findFirstOrThrow({ where: { payPeriodId, dentistId } });
    await page.goto(`/pay/pay-periods/${payPeriodId}`);
    const accordionToggle = page.getByTestId(`payslip-accordion-toggle-${payslip.id}`);
    await accordionToggle.scrollIntoViewIfNeeded();
    await expect(accordionToggle).toBeVisible({ timeout: 60_000 });
    await accordionToggle.click();
    await expect(page.getByTestId("private-patients-table")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Private patients \(1\)/)).toBeVisible();
    await expect(page.locator('[data-testid="private-patients-table"] input').first()).toHaveValue("UAT Patient");
    await expect(page.getByTestId("dentist-fetch-details")).toBeVisible();
    await expect(page.getByText("Utilisation")).toBeVisible();
    await expect(page.getByText("Gross £/hour")).toBeVisible();

    const runCalc = page.getByRole("button", { name: "Run calculation" });
    await runCalc.scrollIntoViewIfNeeded();
    await runCalc.click();
    await expect(runCalc).toBeEnabled({ timeout: 180_000 });
    await expect
      .poll(async () => {
        const row = await prisma.payslipEntry.findFirst({ where: { payPeriodId, dentistId } });
        return row?.finalPayPence ?? 0;
      }, { timeout: 180_000 })
      .toBeGreaterThan(0);

    const updated = await prisma.payslipEntry.findFirstOrThrow({ where: { payPeriodId, dentistId } });

    const pdfRes = await page.request.get(`/pay/api/payslips/${updated.id}/pdf`);
    expect(pdfRes.ok(), await pdfRes.text()).toBeTruthy();
    const bytes = Buffer.from(await pdfRes.body());
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});

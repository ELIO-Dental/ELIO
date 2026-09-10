import { test, expect, type Browser, type Cookie } from "@playwright/test";
import { prisma } from "@elio/db";

const SHELL_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3030";
const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

const DENTIST_NAME = `[UAT] E2E Dentally ${Date.now()}`;
const PRACTITIONER_ID = `e2e-${Date.now()}`;

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

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
  if (!owner.practiceId) throw new Error("Seeded OWNER has no practiceId");
  practiceId = owner.practiceId;
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

/** Y4.3 — fetch Dentally (mocked) → calculate → download PDF. */
test("dentally fetch flow: create period, fetch, calculate, download PDF", async ({ page }) => {
  const dentist = await prisma.dentist.create({
    data: {
      practiceId,
      name: DENTIST_NAME,
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
    data: {
      practiceId,
      periodStart,
      periodEnd,
      status: "DRAFT",
      triggeredAt: new Date(),
    },
  });
  payPeriodId = period.id;

  await page.route(`**/pay/api/pay-periods/${payPeriodId}/fetch-dentally`, async (route) => {
    const method = route.request().method();
    const mockResult = {
      ok: true,
      message: "Mock Dentally fetch complete",
      summary: {
        [dentistId]: {
          invoicedPence: 25000,
          paidPence: 25000,
          invoiceCount: 1,
        },
      },
    };

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "SUCCESS",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          error: null,
          result: mockResult,
        }),
      });
      return;
    }

    if (method !== "POST") {
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
        patientName: "E2E Patient",
        amountPence: 25000,
        amountPaidPence: 25000,
        paymentStatus: "paid",
        invoiceDate: period.periodStart.toISOString().slice(0, 10),
      },
    });

    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        queued: true,
        status: "RUNNING",
        mode: "queued",
        message: "Dentally fetch started",
      }),
    });
  });

  await page.route(`**/pay/api/pay-periods/${payPeriodId}/calculate`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await prisma.payslipEntry.updateMany({
      where: { payPeriodId, dentistId },
      data: {
        grossPrivateRevenuePence: 25000,
        privateEarningsPence: 12500,
        finalPayPence: 12500,
      },
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto(`/pay/pay-periods/${payPeriodId}`);
  await expect(page.getByTestId("header-fetch-dentally")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("header-fetch-dentally").click();
  const fetchBanner = page.getByTestId("fetch-results-banner");
  await expect(fetchBanner).toBeVisible({ timeout: 15_000 });
  await expect(fetchBanner.getByText(/Mock Dentally fetch complete/i)).toBeVisible();

  const lineCount = await prisma.privateRevenueLineItem.count({
    where: { payslipEntry: { payPeriodId, dentistId } },
  });
  expect(lineCount).toBe(1);

  const runCalcButton = page.getByRole("button", { name: /Run calculation/i });
  await runCalcButton.click();
  await expect(runCalcButton).toBeEnabled({ timeout: 30_000 });

  const payslip = await prisma.payslipEntry.findFirstOrThrow({ where: { payPeriodId, dentistId } });
  expect(payslip.finalPayPence).not.toBeNull();
  expect(payslip.finalPayPence).toBeGreaterThan(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(`a[href="/pay/api/payslips/${payslip.id}/pdf"]`).click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const fs = await import("fs");
  const bytes = fs.readFileSync(downloadPath!);
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
});

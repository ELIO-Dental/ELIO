import { test, expect } from "@playwright/test";
import { prisma } from "@elio/db";

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

const DENTIST_NAME = `E2E Dentally ${Date.now()}`;
const PRACTITIONER_ID = `e2e-${Date.now()}`;

let practiceId: string;
let dentistId: string;
let payPeriodId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
  if (!owner.practiceId) throw new Error("Seeded OWNER has no practiceId");
  practiceId = owner.practiceId;
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

/** Y4.3 — create period → fetch Dentally (mocked) → calculate → PDF. */
test("dentally fetch flow: create period, fetch, calculate, download PDF", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });

  await page.goto("/pay/dentists");
  await page.getByLabel("Name").fill(DENTIST_NAME);
  await page.getByLabel("Private split %").fill("50");
  await page.getByLabel("UDA rate (£)").fill("28.10");
  await page.getByRole("button", { name: "Add dentist" }).click();
  await expect(page.getByText(DENTIST_NAME)).toBeVisible();

  const dentist = await prisma.dentist.findFirstOrThrow({
    where: { practiceId, name: DENTIST_NAME },
  });
  dentistId = dentist.id;
  await prisma.dentist.update({
    where: { id: dentistId },
    data: { dentallyPractitionerId: PRACTITIONER_ID },
  });

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  await page.goto("/pay/pay-periods");
  await page.getByLabel("Month").fill(String(month));
  await page.getByLabel("Year").fill(String(year));
  await page.getByRole("button", { name: "Create pay period" }).click();
  await expect(page.getByRole("table")).toBeVisible();

  const period = await prisma.payPeriod.findFirstOrThrow({
    where: { practiceId },
    orderBy: { createdAt: "desc" },
  });
  payPeriodId = period.id;

  await page.route(`**/pay/api/pay-periods/${payPeriodId}/fetch-dentally`, async (route) => {
    if (route.request().method() !== "POST") {
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
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        message: "Mock Dentally fetch complete",
        summary: {
          [dentistId]: {
            invoicedPence: 25000,
            paidPence: 25000,
            invoiceCount: 1,
          },
        },
      }),
    });
  });

  await page.goto(`/pay/pay-periods/${payPeriodId}`);
  await page.getByTestId("header-fetch-dentally").click();
  await expect(page.getByTestId("fetch-results-banner")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Mock Dentally fetch complete/i)).toBeVisible();

  const lineCount = await prisma.privateRevenueLineItem.count({
    where: { payslipEntry: { payPeriodId, dentistId } },
  });
  expect(lineCount).toBe(1);

  const runCalcButton = page.getByRole("button", { name: "Run calculation" });
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

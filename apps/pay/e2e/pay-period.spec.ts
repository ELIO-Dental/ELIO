import path from "path";
import { test, expect } from "@playwright/test";
import { prisma } from "@elio/db";

// Real seeded OWNER credentials (packages/db/seed.ts) — logging in through the shell's
// real /login page, per the multi-zone setup, since apps/pay never has its own login.
// Matches packages/db/seed.ts's own env-var-first pattern — this test logs
// in as whatever account `npm run seed` actually created, real or fallback.
const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

// packages/pay-engine/src/compass-parser.test.ts's own assertions confirm these two
// performer numbers really appear in the fixture PDF: 112376 (KAPOOR) — we seed a
// matching Dentist for this one so it auto-matches CONFIDENT — and 780995, which we
// deliberately do NOT seed a Dentist for, so it lands in Manual Review as NEEDS_REVIEW.
const MATCHED_PERFORMER_NUMBER = "112376";
const UNMATCHED_PERFORMER_NUMBER = "780995";
const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../../packages/pay-engine/test-fixtures/JuneJuly Compass Statement.pdf",
);

const DENTIST_NAME = `E2E Kapoor ${Date.now()}`;

let practiceId: string;
let dentistId: string;
let payPeriodId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: OWNER_EMAIL } });
  if (!owner.practiceId) throw new Error("Seeded OWNER has no practiceId");
  practiceId = owner.practiceId;

  // Pick a trigger month/pay period that doesn't already exist for this practice, so the
  // test is safely re-runnable without colliding with a previous run's leftover period.
  const now = new Date();
  const existing = await prisma.payPeriod.findMany({ where: { practiceId } });
  const usedMonths = new Set(existing.map((p) => `${p.periodStart.getUTCFullYear()}-${p.periodStart.getUTCMonth()}`));
  let month = now.getMonth() + 1; // triggerDate month; period = previous calendar month
  let year = now.getFullYear();
  for (let i = 0; i < 36; i++) {
    const periodMonth = month === 1 ? 12 : month - 1;
    const periodYear = month === 1 ? year - 1 : year;
    if (!usedMonths.has(`${periodYear}-${periodMonth - 1}`)) break;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  test.info().annotations.push({ type: "trigger-month", description: `${year}-${month}` });
  (globalThis as unknown as { __triggerMonth: number; __triggerYear: number }).__triggerMonth = month;
  (globalThis as unknown as { __triggerMonth: number; __triggerYear: number }).__triggerYear = year;
});

test.afterAll(async () => {
  // Clean up everything this test created, in FK-safe order, so the shared DB is left
  // exactly as it was found. Nothing here touches any other practice's data.
  if (payPeriodId) {
    await prisma.privateRevenueLineItem.deleteMany({ where: { payslipEntry: { payPeriodId } } });
    await prisma.payslipEntry.deleteMany({ where: { payPeriodId } });
    await prisma.payLine.deleteMany({ where: { compassStatement: { payPeriodId } } });
    await prisma.compassStatement.deleteMany({ where: { payPeriodId } });
    await prisma.payPeriod.deleteMany({ where: { id: payPeriodId } });
  }
  if (dentistId) {
    await prisma.auditLog.deleteMany({ where: { targetType: "PayLine", metadata: { path: ["newDentistId"], equals: dentistId } } });
    await prisma.dentist.deleteMany({ where: { id: dentistId } });
  }
  await prisma.$disconnect();
});

test("full pay-period flow: create dentist, run period, review, calculate, lock, download payslip", async ({ page }) => {
  // 1. Log in as the seeded OWNER through the shell's real credentials flow.
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });

  // 2. Create a real Dentist whose NHS performer number matches a real line in the
  // Compass fixture (112376 / KAPOOR) so it auto-matches CONFIDENT on upload.
  await page.goto("/pay/dentists");
  await page.getByLabel("Name").fill(DENTIST_NAME);
  await page.getByLabel("NHS performer number").fill(MATCHED_PERFORMER_NUMBER);
  await page.getByLabel("Private split %").fill("50");
  await page.getByLabel("UDA rate (£)").fill("28.10");
  await page.getByRole("button", { name: "Add dentist" }).click();
  await expect(page.getByText(DENTIST_NAME)).toBeVisible();

  const dentist = await prisma.dentist.findFirstOrThrow({
    where: { practiceId, nhsPerformerNumber: MATCHED_PERFORMER_NUMBER, name: DENTIST_NAME },
  });
  dentistId = dentist.id;

  // 3. Create a real PayPeriod via the real form (month/year not already used).
  const g = globalThis as unknown as { __triggerMonth: number; __triggerYear: number };
  await page.goto("/pay/pay-periods");
  await page.getByLabel("Month").fill(String(g.__triggerMonth));
  await page.getByLabel("Year").fill(String(g.__triggerYear));
  await page.getByRole("button", { name: "Create pay period" }).click();
  await expect(page.getByRole("table")).toBeVisible();

  const period = await prisma.payPeriod.findFirstOrThrow({
    where: { practiceId },
    orderBy: { createdAt: "desc" },
  });
  payPeriodId = period.id;

  // 4. Upload the real Compass PDF fixture through the actual upload UI/route.
  await page.goto(`/pay/pay-periods/${payPeriodId}`);
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(FIXTURE_PATH);
  await expect(page.getByText(/Parsed \d+ line\(s\)/)).toBeVisible({ timeout: 30_000 });

  // 5. Confirm the Manual Review UI shows the deliberately-unmatched line.
  await expect(page.getByText("Needs review")).toBeVisible();
  const reviewLine = page.locator("li", { hasText: `#${UNMATCHED_PERFORMER_NUMBER}` }).first();
  await expect(reviewLine).toBeVisible();

  const unmatchedLineBefore = await prisma.payLine.findFirstOrThrow({
    where: { compassStatement: { payPeriodId }, performerNumber: UNMATCHED_PERFORMER_NUMBER },
  });
  expect(unmatchedLineBefore.matchConfidence).toBe("NEEDS_REVIEW");

  // 6. Manually match the unmatched line to our seeded dentist through the UI, and
  // confirm an AuditLog row gets written server-side for the correction.
  await reviewLine.getByRole("combobox").click();
  await page.getByRole("option", { name: DENTIST_NAME }).click();
  await reviewLine.getByRole("button", { name: "Confirm" }).click();
  await expect(reviewLine).not.toBeVisible({ timeout: 15_000 });

  const auditLog = await prisma.auditLog.findFirst({
    where: { practiceId, action: "pay.compass_line.manual_review", targetId: unmatchedLineBefore.id },
    orderBy: { createdAt: "desc" },
  });
  expect(auditLog).toBeTruthy();
  expect((auditLog?.metadata as Record<string, unknown> | null)?.newDentistId).toBe(dentistId);

  // 7. Run the final calculation for the matched dentist (KAPOOR/112376's CONFIDENT line).
  // The endpoint calculates every dentist in the practice sequentially in one request, so
  // wait for the button to report done (not just for the payslips section to start filling
  // in with other dentists' entries) before asserting on our own dentist's row.
  // Button uses the shared loading spinner convention (disabled + spinner, same
  // as Settings/Login), not a text swap — assert on disabled state, not text.
  const runCalcButton = page.getByRole("button", { name: "Run calculation" });
  await runCalcButton.click();
  await expect(runCalcButton).toBeDisabled();
  await expect(runCalcButton).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByText(DENTIST_NAME).last()).toBeVisible();

  const payslip = await prisma.payslipEntry.findFirstOrThrow({ where: { payPeriodId, dentistId } });
  expect(payslip.finalPayPence).not.toBeNull();

  // 7b. Per-dentist accordion expands to show figures (Y2.3).
  await page.getByTestId(`payslip-accordion-toggle-${payslip.id}`).click();
  await expect(page.getByRole("cell", { name: "Final pay" })).toBeVisible();

  // 8. Finalize the pay period from the header (Y2.1).
  await page.getByTestId("finalize-period").click();
  await expect(page.getByText("This period is locked")).toBeVisible({ timeout: 15_000 });

  const lockedPeriod = await prisma.payPeriod.findUniqueOrThrow({ where: { id: payPeriodId } });
  expect(lockedPeriod.status).toBe("LOCKED");

  const fs = await import("fs");

  // 9. Download all PDFs from header while locked.
  const [zipDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-all-pdfs").click(),
  ]);
  const zipPath = await zipDownload.path();
  expect(zipPath).toBeTruthy();
  const zipStat = fs.statSync(zipPath!);
  expect(zipStat.size).toBeGreaterThan(500);

  // 10. Download a single PDF payslip and confirm it's a real, non-empty file.
  // this shared practice also got payslips this run, so target our own payslip's exact href
  // (known from the DB row above) rather than a name-based locator that would match several.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(`a[href="/pay/api/payslips/${payslip.id}/pdf"]`).click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const stat = fs.statSync(downloadPath!);
  expect(stat.size).toBeGreaterThan(500);
  const bytes = fs.readFileSync(downloadPath!);
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
});

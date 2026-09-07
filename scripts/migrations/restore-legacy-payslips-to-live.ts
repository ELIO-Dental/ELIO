/**
 * Restore live PayslipEntry rows from LegacyPayslipArchive (AuraPay data).
 * Migration originally archived payslips without creating live entries — so
 * months like August look empty in ElioPay while old AuraPay is full.
 *
 * Dry-run by default. Pass --execute to write.
 * Optional: --month=8 --year=2026 to limit scope.
 */
import { prisma } from "@elio/db";
import { calculateFinalPay } from "@elio/pay-engine";
import dotenv from "dotenv";
import path from "node:path";
import {
  legacyPayslipAdjustments,
  legacyPayslipLabBills,
  legacyPayslipPatients,
  parseLegacyPayslipRow,
} from "../../apps/pay/lib/legacy-payslip-archive";
import { calculateLegacyAuraPayNetPayPence } from "../../apps/pay/lib/pay-period-parity";
import { parsePayslipAdjustments, parsePayslipLabBills } from "../../apps/pay/lib/payslip-editable-fields";

dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio-deploy-env/pay.env") });
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || "";

const EXECUTE = process.argv.includes("--execute");
const monthArg = process.argv.find((a) => a.startsWith("--month="));
const yearArg = process.argv.find((a) => a.startsWith("--year="));
const ONLY_MONTH = monthArg ? Number(monthArg.split("=")[1]) : null;
const ONLY_YEAR = yearArg ? Number(yearArg.split("=")[1]) : null;

function poundsToPence(n: number): number {
  return Math.round(n * 100);
}

async function main() {
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("No practice");

  const archives = await prisma.legacyPayslipArchive.findMany({
    where: {
      practiceId: practice.id,
      ...(ONLY_MONTH != null ? { periodMonth: ONLY_MONTH } : {}),
      ...(ONLY_YEAR != null ? { periodYear: ONLY_YEAR } : {}),
    },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }, { dentistName: "asc" }],
  });

  const byPeriod = new Map<string, typeof archives>();
  for (const a of archives) {
    const key = `${a.periodYear}-${a.periodMonth}`;
    const list = byPeriod.get(key) ?? [];
    list.push(a);
    byPeriod.set(key, list);
  }

  console.log(EXECUTE ? "EXECUTE" : "DRY RUN");
  console.log(`Archive rows: ${archives.length}; periods: ${byPeriod.size}`);

  const dentists = await prisma.dentist.findMany({ where: { practiceId: practice.id } });
  const dentistByName = new Map(dentists.map((d) => [d.name.toLowerCase(), d]));

  let periodsTouched = 0;
  let payslipsCreated = 0;
  let payslipsUpdated = 0;
  let linesCreated = 0;
  let skipped = 0;

  for (const [key, rows] of byPeriod) {
    const year = rows[0]!.periodYear;
    const month = rows[0]!.periodMonth;
    if (!year || !month) continue;

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));

    let period = await prisma.payPeriod.findFirst({
      where: {
        practiceId: practice.id,
        periodStart: { gte: periodStart, lt: periodEnd },
      },
      include: { _count: { select: { payslipEntries: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (!period) {
      console.log(`${key}: no PayPeriod — would create`);
      if (EXECUTE) {
        period = await prisma.payPeriod.create({
          data: {
            practiceId: practice.id,
            periodStart,
            periodEnd,
            status: "DRAFT",
          },
          include: { _count: { select: { payslipEntries: true } } },
        });
      } else {
        skipped++;
        continue;
      }
    }

    // Skip months that already have substantial live payslip data (unless forcing single month).
    if (ONLY_MONTH == null && period._count.payslipEntries >= rows.length) {
      const withMoney = await prisma.payslipEntry.count({
        where: {
          payPeriodId: period.id,
          OR: [
            { finalPayPence: { not: null } },
            { grossPrivateRevenuePence: { gt: 0 } },
            { privateRevenueLineItems: { some: {} } },
          ],
        },
      });
      if (withMoney > 0) {
        console.log(`${key}: skip — already has ${withMoney} live payslips with data`);
        skipped++;
        continue;
      }
    }

    console.log(`${key}: restore ${rows.length} dentists → period ${period.id.slice(0, 8)}…`);
    periodsTouched++;

    for (const arch of rows) {
      const dentist = dentistByName.get(arch.dentistName.toLowerCase());
      if (!dentist) {
        console.warn(`  skip ${arch.dentistName}: no matching dentist`);
        continue;
      }

      const parsed = parseLegacyPayslipRow(arch.rawRowJson);
      const patients = legacyPayslipPatients(parsed);
      const labBills = legacyPayslipLabBills(parsed);
      const adjustments = legacyPayslipAdjustments(parsed);

      const grossPrivate =
        patients.length > 0
          ? patients.reduce((s, p) => s + (Number(p.amount) || 0), 0)
          : Number(parsed.gross_private) || 0;
      const financeFees = Number(parsed.finance_fees) || 0;
      const therapyMinutes = Number(parsed.therapy_minutes) || 0;
      const therapyRate = Number(parsed.therapy_rate) > 0 ? Number(parsed.therapy_rate) : 0.5833;
      const superannuation = Number(parsed.superannuation_deduction) || 0;
      const nhsUdas = Number(parsed.nhs_udas) || 0;
      const splitPercent =
        dentist.privateSplitPercent != null ? Number(dentist.privateSplitPercent) : 50;
      const udaRatePounds = dentist.udaRatePence != null ? dentist.udaRatePence / 100 : 0;
      const isNhs = Boolean(dentist.nhsPerformerNumber);

      const labBillsJson = parsePayslipLabBills(labBills);
      const adjustmentsJson = parsePayslipAdjustments(
        adjustments.map((a) => ({
          description: a.description ?? "",
          amount: Number(a.amount) || 0,
          type: a.type === "addition" ? "addition" : "deduction",
        }))
      );

      const labTotal = labBillsJson.reduce((s, b) => s + (b.amount || 0), 0);
      const labDeductionPence = poundsToPence(labTotal * 0.5);
      const financeDeductionPence = poundsToPence(financeFees * 0.5);
      const therapyDeductionPence = poundsToPence(therapyMinutes * therapyRate);
      const grossPence = poundsToPence(grossPrivate);
      const privateEarningsPence = poundsToPence(grossPrivate * (splitPercent / 100));
      const nhsEarningsPence = isNhs ? poundsToPence(nhsUdas * udaRatePounds) : 0;
      const udaRatePence = dentist.udaRatePence ?? poundsToPence(udaRatePounds);

      let adjPence = 0;
      for (const a of adjustmentsJson) {
        adjPence += a.type === "deduction" ? -a.amountPence : a.amountPence;
      }

      const finalPayPence = calculateLegacyAuraPayNetPayPence({
        grossPrivatePounds: grossPrivate,
        splitPercent,
        isNhs,
        nhsUdas,
        udaRatePounds,
        labBillsJson: JSON.stringify(labBills),
        financeFeesPounds: financeFees,
        therapyMinutes,
        therapyRatePerMinute: therapyRate,
        superannuationPounds: superannuation,
        adjustmentsJson: JSON.stringify(adjustments),
      });

      // Cross-check with pay-engine (should be close).
      const enginePay = calculateFinalPay({
        payType: "PERCENTAGE_SPLIT",
        udas: nhsUdas,
        udaRatePence,
        grossPrivateRevenuePence: grossPence,
        privateSplitPercent: splitPercent,
        privateEarningsPence,
        consultationExclusionsPence: 0,
        labDeductionPence,
        superannuationPence: poundsToPence(superannuation),
        therapyDeductionPence,
        financeFeesDeductionPence: financeDeductionPence,
        manualAdjustmentsPence: adjPence,
      });

      console.log(
        `  ${arch.dentistName}: gross £${grossPrivate.toFixed(2)} patients=${patients.length} legacyNet=£${(finalPayPence / 100).toFixed(2)} engine=£${(enginePay / 100).toFixed(2)}`
      );

      if (!EXECUTE) continue;

      let payslip = await prisma.payslipEntry.findFirst({
        where: { payPeriodId: period.id, dentistId: dentist.id },
      });

      const payload = {
        payType: dentist.payType,
        privateSplitPercent: dentist.privateSplitPercent,
        udaRatePence,
        udas: nhsUdas,
        nhsEarningsPence,
        grossPrivateRevenuePence: grossPence,
        privateEarningsPence,
        labDeductionPence,
        superannuationPence: poundsToPence(superannuation),
        therapyMinutes,
        therapyRatePerMinute: therapyRate,
        manualAdjustmentsPence: adjPence,
        finalPayPence, // AuraPay-matching net
        labBillsJson: labBillsJson as object,
        adjustmentsJson: adjustmentsJson as object,
        dentallyPatientsJson: patients as object,
        dentallyDiscrepanciesJson: parsed.discrepancies_json
          ? (JSON.parse(parsed.discrepancies_json) as object)
          : undefined,
        dentallyDentistLogJson: parsed.dentist_log_json
          ? (JSON.parse(parsed.dentist_log_json) as object)
          : undefined,
        adjustmentReason: parsed.notes || null,
        provisional: false,
      };

      if (!payslip) {
        payslip = await prisma.payslipEntry.create({
          data: {
            practiceId: practice.id,
            payPeriodId: period.id,
            dentistId: dentist.id,
            ...payload,
          },
        });
        payslipsCreated++;
      } else {
        // Only overwrite if empty / no lines (avoid clobbering Sep work).
        const lineCount = await prisma.privateRevenueLineItem.count({
          where: { payslipEntryId: payslip.id },
        });
        if (lineCount > 0 && (payslip.finalPayPence ?? 0) !== 0) {
          console.log(`    skip update — already has ${lineCount} lines`);
          continue;
        }
        payslip = await prisma.payslipEntry.update({
          where: { id: payslip.id },
          data: payload,
        });
        payslipsUpdated++;
      }

      // Replace private lines from archive patients.
      await prisma.privateRevenueLineItem.deleteMany({ where: { payslipEntryId: payslip.id } });
      for (const p of patients) {
        const amountPence = poundsToPence(Number(p.amount) || 0);
        if (amountPence <= 0) continue;
        const status = (p.status || "paid").toLowerCase();
        const paid =
          status === "unpaid" ? 0 : status === "partial" ? Math.round(amountPence / 2) : amountPence;
        await prisma.privateRevenueLineItem.create({
          data: {
            payslipEntryId: payslip.id,
            patientName: p.name || p.patientName || "Patient",
            invoiceDate: p.date || `${year}-${String(month).padStart(2, "0")}-01`,
            amountPence,
            amountPaidPence: paid,
            amountOutstandingPence: amountPence - paid,
            paymentStatus: status === "unpaid" ? "unpaid" : status === "partial" ? "partial" : "paid",
            isFinance: false,
            flagged: status !== "paid",
            flagReason: status !== "paid" ? "Restored from AuraPay" : null,
            sourceType: "MANUAL",
            manualCreatedByUserId: "legacy-restore",
            manualNote: "Restored from AuraPay legacy archive",
            dentallyLineKey: `legacy:${arch.sourceId}:${p.name || p.patientName}:${amountPence}`,
            treatmentDescription: p.treatment || null,
          },
        });
        linesCreated++;
      }
    }
  }

  console.log(
    JSON.stringify(
      { periodsTouched, payslipsCreated, payslipsUpdated, linesCreated, skipped, execute: EXECUTE },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});

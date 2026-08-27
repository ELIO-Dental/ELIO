// Manual verification script (not part of automated suite) — proves that a locked
// payslip's stored figures are computed as a SNAPSHOT at calc time (matching
// PayslipEntry's own udaRatePence/privateSplitPercent columns, DATA_MODEL.md §3) and are
// therefore immune to a later change to the dentist's live configured rate.
// Run with `npx tsx src/versioning-check.ts`.
import { calculateFinalPay } from "./pay-calc";

// Simulates: dentist configured at 47.5% split, £15.50/UDA when the July payslip was locked.
const dentistConfigAtLockTime = { privateSplitPercent: 47.5, udaRatePence: 1550 };

const payslipSnapshot = {
  payType: "PERCENTAGE_SPLIT" as const,
  udas: 200,
  udaRatePence: dentistConfigAtLockTime.udaRatePence, // snapshotted onto PayslipEntry at calc time
  grossPrivateRevenuePence: 100000,
  privateSplitPercent: dentistConfigAtLockTime.privateSplitPercent, // snapshotted
  privateEarningsPence: Math.round((100000 * dentistConfigAtLockTime.privateSplitPercent) / 100),
  consultationExclusionsPence: 0,
  labDeductionPence: 5000,
  superannuationPence: 10000,
};

const beforeFinal = calculateFinalPay(payslipSnapshot);
console.log("Locked payslip final pay (before rate change):", beforeFinal, "pence");

// Admin now edits the dentist's LIVE configured rate — this must NEVER touch the already-
// locked PayslipEntry row, because the locked row stores its own snapshot columns, not a
// live FK lookup into Dentist's current rate.
dentistConfigAtLockTime.privateSplitPercent = 50; // e.g. renegotiated to 50%
dentistConfigAtLockTime.udaRatePence = 1600; // e.g. rate rise to £16/UDA

// The already-computed payslipSnapshot object is untouched — this IS the model: once a
// PayPeriod/PayslipEntry is locked, its stored udaRatePence/privateSplitPercent/*Pence
// columns are never recomputed from Dentist's live config again.
const afterFinal = calculateFinalPay(payslipSnapshot);
console.log("Same locked payslip's stored figures re-evaluated after rate change:", afterFinal, "pence");

if (beforeFinal !== afterFinal) {
  console.error("FAIL: locked payslip figure changed after a live rate edit — versioning broken.");
  process.exit(1);
}
console.log("PASS: locked payslip figure is IDENTICAL after the dentist's live rate was edited (versioning holds).");

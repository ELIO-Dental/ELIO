/**
 * Y1.1 — Pay-period Dentally fetch (ported from ElioPay/aurapay/src/app/api/dentally/route.ts).
 * Live invoice pull for a pay period date range; attributes revenue to dentists via dentallyPractitionerId.
 */

import { scopedDb } from "@elio/db";
import { getDentallyClientForPractice, type DentallyInvoiceRaw } from "@elio/dentally";
import { isDateInPeriod } from "@elio/pay-engine";

const NHS_KEYWORDS = [
  "band 1",
  "band 2",
  "band 3",
  "nhs exam",
  "nhs scale",
  "nhs polish",
  "nhs fluoride",
  "nhs fissure",
  "urgent dental",
  "nhs extraction",
  "nhs filling",
  "nhs root",
  "nhs crown",
  "nhs denture",
  "nhs bridge",
];

function parseAmount(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

function parsePence(amount: number): number {
  return Math.round(amount * 100);
}

function isNhsItem(item: { name?: string; amount?: unknown; nhs_charge?: boolean }): boolean {
  if (item.nhs_charge) return true;
  const lower = (item.name || "").toLowerCase();
  return NHS_KEYWORDS.some((k) => lower.includes(k));
}

function invoicePractitionerId(inv: DentallyInvoiceRaw & { user_id?: number | string | null }): string {
  const raw = inv.user_id ?? inv.invoice_items?.[0]?.practitioner_id;
  return raw != null ? String(raw) : "";
}

function isInvoiceInPeriod(inv: DentallyInvoiceRaw, startDate: string, endDate: string): boolean {
  const dated = inv.dated_on ?? inv.updated_at?.substring(0, 10);
  return isDateInPeriod(dated, startDate, endDate);
}

function apiEndBuffer(endDate: string): string {
  const parts = endDate.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const bufferMonth = m === 12 ? 1 : m + 1;
  const bufferYear = m === 12 ? y + 1 : y;
  return `${bufferYear}-${String(bufferMonth).padStart(2, "0")}-01`;
}

function privateAmountFromInvoice(inv: DentallyInvoiceRaw): number {
  const items = inv.invoice_items ?? [];
  if (items.length === 0) {
    const total = parseAmount(inv.amount);
    return total > 0 ? total : 0;
  }
  let privateAmount = 0;
  for (const item of items) {
    const itemAmount = parseAmount(item.amount);
    if (itemAmount <= 0) continue;
    if (isNhsItem(item)) continue;
    privateAmount += itemAmount;
  }
  return privateAmount;
}

export class DentallyFetchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DentallyFetchConfigError";
  }
}

export interface DentallyFetchDebug {
  totalInvoicesFromApi: number;
  invoicesInDateRange: number;
  processedInvoices: number;
  skippedZeroAmount: number;
  skippedNhs: number;
  unmatchedClinicianIds: string[];
  dateRange: { start: string; end: string };
}

export interface DentallyFetchSummaryEntry {
  invoicedPence: number;
  invoiceCount: number;
}

export interface DentallyFetchResult {
  ok: true;
  message: string;
  debug: DentallyFetchDebug;
  summary: Record<string, DentallyFetchSummaryEntry>;
  dentistsUpdated: number;
}

export async function fetchDentallyForPayPeriod(
  practiceId: string,
  payPeriodId: string
): Promise<DentallyFetchResult> {
  const siteId = process.env.DENTALLY_SITE_ID?.trim();
  if (!siteId) {
    throw new DentallyFetchConfigError(
      "DENTALLY_SITE_ID is not configured. Set it on the Pay Vercel project (see docs/deploy-checklist.md)."
    );
  }

  const db = scopedDb(practiceId);
  const payPeriod = await db.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found");
  if (payPeriod.status === "LOCKED") throw new Error("Pay period is locked");

  const startDate = payPeriod.periodStart.toISOString().slice(0, 10);
  const endDate = payPeriod.periodEnd.toISOString().slice(0, 10);
  const apiEndDate = apiEndBuffer(endDate);

  const dentists = await db.dentist.findMany({
    where: { practiceId },
    select: { id: true, name: true, dentallyPractitionerId: true, payType: true },
  });

  const dentistByPractitioner = new Map<string, (typeof dentists)[number]>();
  for (const d of dentists) {
    if (d.dentallyPractitionerId) {
      dentistByPractitioner.set(String(d.dentallyPractitionerId), d);
    }
  }

  const client = await getDentallyClientForPractice(practiceId);
  const allInvoices: DentallyInvoiceRaw[] = [];

  await client.paginate<DentallyInvoiceRaw>(
    "/invoices",
    "invoices",
    {
      site_id: siteId,
      dated_on_from: startDate,
      dated_on_to: apiEndDate,
    },
    (page) => {
      allInvoices.push(...page);
    }
  );

  const invoices = allInvoices.filter((inv) => isInvoiceInPeriod(inv, startDate, endDate));

  const totalsByDentist = new Map<string, { invoicedPence: number; lineItems: { amountPence: number; invoiceId: number }[] }>();
  const unmatched = new Set<string>();
  let skippedZero = 0;
  let skippedNhs = 0;
  let processed = 0;

  for (const inv of invoices) {
    const totalAmount = parseAmount(inv.amount);
    if (totalAmount <= 0) {
      skippedZero++;
      continue;
    }

    const practitionerId = invoicePractitionerId(inv);
    if (!practitionerId) continue;

    const dentist = dentistByPractitioner.get(practitionerId);
    if (!dentist) {
      unmatched.add(practitionerId);
      continue;
    }

    const privateAmount = privateAmountFromInvoice(inv);
    if (privateAmount <= 0) {
      skippedNhs++;
      continue;
    }

    const amountPence = parsePence(privateAmount);
    if (!totalsByDentist.has(dentist.id)) {
      totalsByDentist.set(dentist.id, { invoicedPence: 0, lineItems: [] });
    }
    const bucket = totalsByDentist.get(dentist.id)!;
    bucket.invoicedPence += amountPence;
    bucket.lineItems.push({ amountPence, invoiceId: inv.id });
    processed++;
  }

  let dentistsUpdated = 0;
  const summary: Record<string, DentallyFetchSummaryEntry> = {};

  for (const [dentistId, data] of totalsByDentist) {
    const dentist = dentists.find((d) => d.id === dentistId);
    if (!dentist || dentist.payType === "HOURLY") continue;

    const payslip = await db.payslipEntry.upsert({
      where: { payPeriodId_dentistId: { payPeriodId, dentistId } },
      create: {
        practiceId,
        payPeriodId,
        dentistId,
        payType: "PERCENTAGE_SPLIT",
        grossPrivateRevenuePence: data.invoicedPence,
      },
      update: {
        grossPrivateRevenuePence: data.invoicedPence,
      },
    });

    await db.privateRevenueLineItem.deleteMany({ where: { payslipEntryId: payslip.id } });
    for (const line of data.lineItems) {
      await db.privateRevenueLineItem.create({
        data: {
          payslipEntryId: payslip.id,
          amountPence: line.amountPence,
          excludedAsConsultation: false,
        },
      });
    }

    summary[dentist.name] = {
      invoicedPence: data.invoicedPence,
      invoiceCount: data.lineItems.length,
    };
    dentistsUpdated++;
  }

  return {
    ok: true,
    message: `Fetched ${invoices.length} invoices in range; updated ${dentistsUpdated} dentist(s).`,
    debug: {
      totalInvoicesFromApi: allInvoices.length,
      invoicesInDateRange: invoices.length,
      processedInvoices: processed,
      skippedZeroAmount: skippedZero,
      skippedNhs,
      unmatchedClinicianIds: Array.from(unmatched),
      dateRange: { start: startDate, end: endDate },
    },
    summary,
    dentistsUpdated,
  };
}

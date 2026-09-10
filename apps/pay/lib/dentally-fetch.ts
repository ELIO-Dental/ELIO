/**
 * Y1 — Pay-period Dentally fetch (ported from ElioPay/aurapay/src/app/api/dentally/route.ts).
 * Invoices + appointments → private patient rows, analytics, finance flags.
 * Step 18: therapy minutes are NEVER auto-filled from Dentally — ops enters manually.
 */

import { Prisma, scopedDb } from "@elio/db";
import {
  getDentallyClientForPractice,
  requireDentallySiteId,
  resolveInvoicePractitionerUserId,
  fetchPractitionerUserIdMap,
  expandDentistByPractitionerIds,
  expandIdSetWithPractitionerLinks,
  type DentallyAppointmentRaw,
  type DentallyClient,
  type DentallyInvoiceRaw,
  type DentallyPatientRaw,
  type DentallyPaymentRaw,
} from "@elio/dentally";
import { getPayPeriodBoundaries } from "@elio/pay-engine";
import {
  buildInvoiceListQueryParamsForPayPeriod,
  isInvoiceEligibleForGrossInPeriod,
  isInvoiceRelevantForPayPeriod,
  parseInvoiceAmount,
  resolveInvoicePaymentStatus,
  shouldDiscardInvoiceAmount,
  toPracticeDateString,
} from "./dentally-fetch-invoices";
import {
  buildInvoicePaymentMethodMap,
  buildPatientFinanceSet,
  buildPaymentsListQueryParams,
  invoiceIsFinanceFromPayments,
  paymentWindowBounds,
} from "./dentally-fetch-payments";
import { hydrateInvoiceItems } from "./dentally-fetch-lines";
import { dentallyLineSourceFields } from "./line-source";
import { buildPriorFinanceOpsLookup, mergeFinanceOpsOntoFetchedLine } from "./month-pipeline";
import {
  dentallyPriorLinesWhere,
  dentallyReplaceLineWhere,
  percentageDentistsNeedingEmptyClear,
} from "./dentally-fetch-replace";
import { attributeEmptyInvoicePractitioner } from "./dentally-fetch-empty-items";
import {
  classifyPrivateLine,
  defaultClassifyContext,
  type LineExcludeReason,
} from "./dentally-line-filters";
import {
  buildPaymentFlagsFromLines,
  paymentFlagsToDiscrepancies,
} from "./payment-flags";
import {
  recordUnmappedPractitioner,
  unmappedHitsToList,
  type UnmappedPractitionerHit,
} from "./unmapped-practitioners";
import { uniquePatientIdsForFetch, mapWithConcurrency } from "./dentally-fetch-cache";
import { payslipIsProvisional } from "./finance-fee";

const CBCT_KEYWORDS = ["cbct", "ct scan", "cone beam"];
const CLINICIAN_ROLES = ["dentist", "clinician", "associate", "principal"];
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
const DEFAULT_THERAPY_RATE_PER_MINUTE = 0.5833; // £35/hr

export class DentallyFetchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DentallyFetchConfigError";
  }
}

export interface DentallyPatientRow {
  name: string;
  date: string;
  time?: string;
  amount: number;
  amountPaid: number;
  amountOutstanding: number;
  status: "paid" | "partial" | "unpaid";
  finance: boolean;
  invoiceId: string;
  patientId: string;
  flagged?: boolean;
  flagReason?: string;
  durationMins?: number;
  treatment?: string;
  hourlyRate?: number;
  /** Same invoice + amount occurrence (0 = first) for stable line keys. */
  amountOccurrence?: number;
  /** Dentally invoice_item id when present — preferred line key. */
  dentallyItemId?: string;
}

export type { DentallyAnalytics } from "./dentally-analytics";
import { calculateDentistAnalytics } from "./dentally-analytics";
import {
  resolveDentallySiteId as resolveDentallySiteIdFromSettings,
  resolveNhsAmountSet as resolveNhsAmountsFromSettings,
  resolveExcludedTreatmentPhrases as resolveExcludedTreatmentsFromSettings,
  resolveTherapistIdSet as resolveTherapistIdsFromSettings,
} from "./pay-settings";

export interface DentallyFetchDebug {
  totalInvoicesFromApi: number;
  invoicesInDateRange: number;
  processedInvoices: number;
  skippedZeroAmount: number;
  skippedNhs: number;
  skippedNonClinician: number;
  financePayments: number;
  flaggedForReview: number;
  appointmentsFetched: number;
  paymentsFetched: number;
  paymentWindow: { datedAfter: string; datedBefore: string };
  excludeReasonCounts: Partial<Record<string, number>>;
  unmatchedClinicianIds: string[];
  unmappedPractitioners: UnmappedPractitionerHit[];
  dateRange: { start: string; end: string };
}

export interface DentallyFetchSummaryEntry {
  invoicedPence: number;
  paidPence: number;
  outstandingPence: number;
  invoiceCount: number;
  financeCount: number;
  flaggedCount: number;
  chairMins: number;
  grossPerHour: number;
  netPerHour: number;
  utilizationPercent: number;
}

export interface DentallyFetchResult {
  ok: true;
  message: string;
  debug: DentallyFetchDebug;
  summary: Record<string, DentallyFetchSummaryEntry>;
  dentistsUpdated: number;
}

function isClinicianRole(role?: string): boolean {
  if (!role) return false;
  const lower = role.toLowerCase();
  return CLINICIAN_ROLES.some((r) => lower.includes(r));
}

function parseAmount(val: unknown): number {
  return parseInvoiceAmount(val);
}

function parsePence(amount: number): number {
  return Math.round(amount * 100);
}

function isNhsAmount(amountGbp: number, nhsAmountsGbp: Set<number>): boolean {
  const amountPence = Math.round(amountGbp * 100);
  for (const nhsAmt of nhsAmountsGbp) {
    if (Math.abs(amountPence - Math.round(nhsAmt * 100)) <= 1) return true;
  }
  return false;
}

function isNhsItem(
  item: { name?: string; amount?: unknown; nhs_charge?: boolean },
  nhsAmounts: Set<number>
): boolean {
  if (item.nhs_charge) return true;
  const lower = (item.name || "").toLowerCase();
  if (NHS_KEYWORDS.some((k) => lower.includes(k))) return true;
  return isNhsAmount(parseAmount(item.amount), nhsAmounts);
}

function isCbctItem(item: { name?: string }): boolean {
  const lower = (item.name || "").toLowerCase();
  return CBCT_KEYWORDS.some((k) => lower.includes(k));
}

function isFinancePayment(inv: DentallyInvoiceRaw): boolean {
  // Step 5 — Finance/Tabeo from payment method / flags only.
  // Do NOT treat bare payment_plan_id as Finance (Denplan/membership false positives).
  if (inv.finance === true) return true;
  const method = (inv.payment_method || "").toLowerCase();
  if (method.includes("finance") || method.includes("tabeo")) {
    return true;
  }
  for (const item of inv.invoice_items ?? []) {
    const name = (item.name || "").toLowerCase();
    if (name.includes("tabeo") || /\bfinance fee\b/.test(name)) {
      return true;
    }
  }
  return false;
}

function invoicePractitionerId(inv: DentallyInvoiceRaw): string {
  // May be practitioner resource id or user.id — dentist map is expanded for both.
  return resolveInvoicePractitionerUserId(inv);
}

function getPaymentStatus(
  inv: DentallyInvoiceRaw,
  privateAmount: number
): { status: "paid" | "partial" | "unpaid"; amountPaid: number; amountOutstanding: number } {
  return resolveInvoicePaymentStatus(inv, privateAmount);
}

function privateAmountFromInvoice(inv: DentallyInvoiceRaw, nhsAmounts: Set<number>): number {
  const items = inv.invoice_items ?? [];
  if (items.length === 0) {
    const total = parseAmount(inv.amount);
    if (total <= 0 || isNhsAmount(total, nhsAmounts)) return 0;
    return total;
  }
  let privateAmount = 0;
  for (const item of items) {
    const itemAmount = parseAmount(item.amount);
    if (itemAmount <= 0) continue;
    if (isNhsItem(item, nhsAmounts)) continue;
    if (isCbctItem(item)) continue;
    privateAmount += itemAmount;
  }
  return privateAmount;
}

function getAppointmentDuration(apt: DentallyAppointmentRaw): number {
  if (apt.duration && apt.duration > 0) return apt.duration;
  const startStr = apt.starts_at || apt.start_time;
  const endStr = apt.finish_at || apt.finish_time;
  if (startStr && endStr) {
    const mins = Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 60000);
    if (mins > 0 && mins < 480) return mins;
  }
  return 0;
}

function buildAppointmentMap(appointments: DentallyAppointmentRaw[]): Map<string, DentallyAppointmentRaw[]> {
  const map = new Map<string, DentallyAppointmentRaw[]>();
  for (const apt of appointments) {
    const patientId = String(apt.patient_id ?? "");
    const dateStr = (apt.starts_at || apt.start_time || "").substring(0, 10);
    if (!patientId || !dateStr) continue;
    const key = `${patientId}_${dateStr}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(apt);
  }
  return map;
}

async function loadClinicianUsers(
  client: DentallyClient,
  siteId: string
): Promise<Map<string, { name: string; isClinician: boolean }>> {
  const map = new Map<string, { name: string; isClinician: boolean }>();
  try {
    await client.paginate<{
      id: number | string;
      first_name?: string;
      last_name?: string;
      role?: string;
      user_type?: string;
      job_title?: string;
    }>("/users", "users", { site_id: siteId }, (users) => {
      for (const user of users) {
        const role = user.role ?? user.user_type ?? user.job_title;
        const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || `User ${user.id}`;
        map.set(String(user.id), { name, isClinician: isClinicianRole(role) });
      }
    });
  } catch {
    // non-fatal
  }
  return map;
}

/** Default concurrent Dentally patient GETs (Step 6b — avoid rate limit without dropping names). */
const PATIENT_NAME_FETCH_CONCURRENCY = 8;

async function fetchPatientNames(
  client: DentallyClient,
  patientIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  // Once per distinct patient_id per run (PDF §2 / Step 3 + 6b) — no silent 500 cap.
  const unique = uniquePatientIdsForFetch(patientIds);
  await mapWithConcurrency(unique, PATIENT_NAME_FETCH_CONCURRENCY, async (id) => {
    try {
      const data = await client.get<{ patient?: DentallyPatientRaw }>(`/patients/${id}`);
      const p = data.patient;
      if (p) {
        names.set(id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || `Patient ${id}`);
      } else {
        names.set(id, `Patient ${id}`);
      }
    } catch {
      names.set(id, `Patient ${id}`);
    }
  });
  return names;
}

export async function fetchDentallyForPayPeriod(
  practiceId: string,
  payPeriodId: string,
  /** Called at coarse checkpoints so the UI can show live phase progress instead
   *  of a bare spinner, and so a stalled fetch can be told apart from a slow one. */
  onProgress?: (phase: string) => void | Promise<void>
): Promise<DentallyFetchResult> {
  const reportProgress = async (phase: string) => {
    try {
      await onProgress?.(phase);
    } catch {
      // Progress reporting must never fail the fetch itself.
    }
  };

  const { getPaySettings } = await import("./pay-settings-service");
  const paySettings = await getPaySettings(practiceId);

  const siteId = resolveDentallySiteIdFromSettings(paySettings);
  if (!siteId) {
    throw new DentallyFetchConfigError(
      "Dentally Site ID is not configured. Set it in Pay Settings or DENTALLY_SITE_ID env."
    );
  }

  const therapistIdsRaw = resolveTherapistIdsFromSettings(paySettings);
  const nhsAmounts = resolveNhsAmountsFromSettings(paySettings);
  const excludedTreatments = resolveExcludedTreatmentsFromSettings(paySettings);

  const db = scopedDb(practiceId);
  const payPeriod = await db.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found");
  if (payPeriod.status === "LOCKED") throw new Error("Pay period is locked");

  const { loadPaidLogLookup } = await import("./paid-invoice-line-log-db");
  const { isAlreadyPaidInOtherPeriod } = await import("./paid-invoice-line-log");
  const paidLogLookup = await loadPaidLogLookup(db, practiceId);

  const startDate = toPracticeDateString(payPeriod.periodStart);
  // Half-open [start, endExclusive) — derive from period month, not inclusive periodEnd day.
  const periodMonth = Number(startDate.slice(5, 7));
  const periodYear = Number(startDate.slice(0, 4));
  const { endDate } = getPayPeriodBoundaries(periodMonth, periodYear);
  // Appointments use the exclusive period end as API upper bound (same half-open month).
  const apiEndDate = endDate;

  const dentists = await db.dentist.findMany({
    where: { practiceId },
    select: { id: true, name: true, dentallyPractitionerId: true, payType: true, privateSplitPercent: true },
  });

  const client = await getDentallyClientForPractice(practiceId);
  let practitionerToUser = new Map<string, string>();
  try {
    practitionerToUser = await fetchPractitionerUserIdMap(client, siteId);
  } catch (err) {
    // Dentists storing invoice-line practitioner ids still match without the map.
    console.warn(
      `[pay-dentally-fetch] practitioner→user map unavailable; matching stored dentallyPractitionerId only`,
      err instanceof Error ? err.message : err
    );
  }
  const therapistIds = expandIdSetWithPractitionerLinks(therapistIdsRaw, practitionerToUser);
  const dentistByPractitioner = expandDentistByPractitionerIds(dentists, practitionerToUser);
  const clinicianUsers = await loadClinicianUsers(client, siteId);

  // Step 22 — look back 180d on dated_on so March-dated / May-paid invoices are fetched in May.
  const invoiceListParams = buildInvoiceListQueryParamsForPayPeriod(siteId, startDate, endDate);
  requireDentallySiteId(invoiceListParams);

  await reportProgress("invoices");
  const allInvoices: DentallyInvoiceRaw[] = [];
  await client.paginate<DentallyInvoiceRaw>(
    "/invoices",
    "invoices",
    invoiceListParams,
    (page) => {
      allInvoices.push(...page);
    }
  );

  await reportProgress("appointments");
  const appointments: DentallyAppointmentRaw[] = [];
  try {
    await client.paginate<DentallyAppointmentRaw>(
      "/appointments",
      "appointments",
      { site_id: siteId, start_date: startDate, end_date: apiEndDate },
      (page) => {
        appointments.push(...page);
      }
    );
  } catch {
    // Appointments optional for gross revenue; analytics/therapy degrade gracefully.
  }

  const appointmentMap = buildAppointmentMap(appointments);
  // Step 22 — paid_on month for gross; dated open invoices for §4.3 flags.
  const invoices = allInvoices.filter((inv) => isInvoiceRelevantForPayPeriod(inv, startDate, endDate));

  // Step 5 — wide payments window for Finance (Tabeo) method detection.
  await reportProgress("payments");
  const { datedAfter, datedBefore } = paymentWindowBounds(startDate, endDate);
  const paymentListParams = buildPaymentsListQueryParams(siteId, datedAfter, datedBefore);
  const allPayments: DentallyPaymentRaw[] = [];
  try {
    await client.paginate<DentallyPaymentRaw>(
      "/payments",
      "payments",
      paymentListParams,
      (page) => {
        allPayments.push(...page);
      }
    );
  } catch {
    // Finance detection degrades to invoice-level heuristics if payments fail.
  }
  const invoicePaymentMethodMap = buildInvoicePaymentMethodMap(allPayments);
  const patientFinanceSet = buildPatientFinanceSet(allPayments);

  await reportProgress("matching invoices to dentists");

  type Bucket = {
    patients: DentallyPatientRow[];
    invoiced: number;
    paid: number;
    outstanding: number;
    financeCount: number;
  };

  const totalsByDentist = new Map<string, Bucket>();
  const unmatchedHits = new Map<string, UnmappedPractitionerHit>();
  const allPatientIds = new Set<string>();
  let skippedZero = 0;
  let skippedNhs = 0;
  let skippedNonClinician = 0;
  let processed = 0;
  let financePayments = 0;
  let flaggedForReview = 0;

  const pendingByDentist = new Map<
    string,
    Array<{
      inv: DentallyInvoiceRaw;
      privateAmount: number;
      patientId: string;
      treatmentDescription?: string;
      forceFlagged?: boolean;
      flagReason?: string;
      dentallyItemId?: string;
    }>
  >();

  const excludeReasonCounts: Partial<Record<LineExcludeReason, number>> = {};

  // Therapists must never receive associate private gross even if mis-seeded as dentists.
  const dentistIdByUserId = new Map<string, string>();
  const dentistIdByPractitioner = new Map<string, string>();
  for (const [userId, dentist] of dentistByPractitioner) {
    dentistIdByPractitioner.set(userId, dentist.id);
    if (therapistIds.has(userId)) continue;
    dentistIdByUserId.set(userId, dentist.id);
  }
  const classifyCtx = defaultClassifyContext({
    dentistIdByUserId,
    therapistIds,
    nhsBandAmountsGbp: Array.from(nhsAmounts),
    excludedTreatments,
  });

  // Step 6 — hydrate line items; Step 7 — ordered classify per line.
  const hydratedInvoices = await Promise.all(
    invoices.map((inv) => hydrateInvoiceItems(client, inv))
  );

  for (const inv of hydratedInvoices) {
    const totalAmount = parseAmount(inv.amount);
    if (shouldDiscardInvoiceAmount(totalAmount)) {
      skippedZero++;
      continue;
    }

    const patientId = String(inv.patient_id ?? "");
    if (patientId) allPatientIds.add(patientId);

    const items = inv.invoice_items ?? [];
    if (items.length === 0) {
      // Fallback: invoice-level private total when Dentally returns no items.
      const practitionerId = invoicePractitionerId(inv);
      const userInfo = clinicianUsers.get(practitionerId);
      const attr = attributeEmptyInvoicePractitioner({
        practitionerId,
        therapistIds,
        dentistIdByPractitioner,
        isNonClinician: Boolean(userInfo && !userInfo.isClinician),
      });
      if (attr.action === "skip") {
        if (attr.reason === "THERAPIST_LINE") {
          skippedNonClinician++;
          excludeReasonCounts.THERAPIST_LINE = (excludeReasonCounts.THERAPIST_LINE ?? 0) + 1;
        } else if (attr.reason === "NON_CLINICIAN") {
          skippedNonClinician++;
        }
        continue;
      }
      if (attr.action === "unmapped") {
        excludeReasonCounts.UNMAPPED_PRACTITIONER =
          (excludeReasonCounts.UNMAPPED_PRACTITIONER ?? 0) + 1;
        const privateAmount = privateAmountFromInvoice(inv, nhsAmounts);
        recordUnmappedPractitioner(unmatchedHits, {
          practitionerId: attr.practitionerId,
          amountPence: parsePence(privateAmount > 0 ? privateAmount : totalAmount),
          treatment: "",
          invoiceDate: inv.dated_on || "",
          invoiceId: String(inv.id),
          patientId: patientId || undefined,
        });
        continue;
      }
      const dentist = dentistByPractitioner.get(attr.practitionerId);
      if (!dentist) continue;
      const privateAmount = privateAmountFromInvoice(inv, nhsAmounts);
      if (privateAmount <= 0) {
        skippedNhs++;
        continue;
      }
      if (!pendingByDentist.has(dentist.id)) pendingByDentist.set(dentist.id, []);
      pendingByDentist.get(dentist.id)!.push({ inv, privateAmount, patientId });
      continue;
    }

    for (const item of items) {
      const classified = classifyPrivateLine(item, inv, classifyCtx);
      if (classified.action === "exclude") {
        excludeReasonCounts[classified.reason] = (excludeReasonCounts[classified.reason] ?? 0) + 1;
        if (
          classified.reason === "NHS_CHARGE" ||
          classified.reason === "NHS_KEYWORD" ||
          classified.reason === "NHS_BAND_PRICE" ||
          classified.reason === "NHS_PLAN" ||
          classified.reason === "EXCLUDED_TREATMENT" ||
          classified.reason === "ZERO_PRICE"
        ) {
          skippedNhs++;
        } else if (classified.reason === "THERAPIST_LINE") {
          skippedNonClinician++;
        } else if (
          classified.reason === "UNMAPPED_PRACTITIONER" ||
          classified.reason === "MISSING_PRACTITIONER"
        ) {
          const pid =
            classified.reason === "MISSING_PRACTITIONER"
              ? ""
              : item.practitioner_id != null
                ? String(item.practitioner_id)
                : "";
          if (pid) {
            const amt = Math.round(
              parseInvoiceAmount(item.total_price ?? item.amount) * 100
            );
            recordUnmappedPractitioner(unmatchedHits, {
              practitionerId: pid,
              amountPence: amt,
              treatment: item.name || "",
              invoiceDate: inv.dated_on || "",
              invoiceId: String(inv.id),
              patientId: patientId || undefined,
            });
          }
        }
        continue;
      }

      const dentist = dentistByPractitioner.get(classified.practitionerUserId);
      if (therapistIds.has(classified.practitionerUserId)) {
        skippedNonClinician++;
        excludeReasonCounts.THERAPIST_LINE = (excludeReasonCounts.THERAPIST_LINE ?? 0) + 1;
        continue;
      }
      if (!dentist) {
        recordUnmappedPractitioner(unmatchedHits, {
          practitionerId: classified.practitionerUserId,
          amountPence: classified.amountPence,
          treatment: classified.name,
          invoiceDate: inv.dated_on || "",
          invoiceId: String(inv.id),
          patientId: patientId || undefined,
        });
        continue;
      }
      if (!pendingByDentist.has(dentist.id)) pendingByDentist.set(dentist.id, []);
      pendingByDentist.get(dentist.id)!.push({
        inv,
        privateAmount: classified.amountPence / 100,
        patientId,
        treatmentDescription: classified.name || undefined,
        forceFlagged: classified.action === "flag",
        flagReason: classified.action === "flag" ? classified.reason : undefined,
        dentallyItemId: item.id != null ? String(item.id) : undefined,
      });
    }
  }

  const patientNames = await fetchPatientNames(client, Array.from(allPatientIds));
  for (const hit of unmatchedHits.values()) {
    if (hit.patientId && !hit.patientName) {
      hit.patientName = patientNames.get(hit.patientId);
    }
  }
  const unmappedPractitioners = unmappedHitsToList(unmatchedHits);

  for (const [dentistId, rows] of pendingByDentist) {
    const bucket: Bucket = {
      patients: [],
      invoiced: 0,
      paid: 0,
      outstanding: 0,
      financeCount: 0,
    };
    /** Same invoice + amount → occurrence suffix so paid-log / finance keys do not collide. */
    const amountOccByInvoice = new Map<string, number>();

    for (const {
      inv,
      privateAmount,
      patientId,
      treatmentDescription,
      forceFlagged,
      flagReason,
      dentallyItemId,
    } of rows) {
      const payment = getPaymentStatus(inv, privateAmount);
      const invoiceDate = inv.dated_on || "";
      const isFinance =
        invoiceIsFinanceFromPayments(
          String(inv.id),
          patientId,
          invoicePaymentMethodMap,
          patientFinanceSet
        ) || isFinancePayment(inv);
      if (isFinance) {
        financePayments++;
        bucket.financeCount++;
      }

      const aptKey = `${patientId}_${invoiceDate}`;
      const patientAppointments = appointmentMap.get(aptKey) || [];
      let durationMins = 0;
      let treatment = treatmentDescription || "";
      let appointmentTime: string | undefined;
      for (const apt of patientAppointments) {
        durationMins += getAppointmentDuration(apt);
        if (!treatment && (apt.treatment_description || apt.reason)) {
          treatment = apt.treatment_description || apt.reason || "";
        }
        const start = apt.starts_at || apt.start_time;
        if (start && start.length >= 16) {
          appointmentTime = start.substring(11, 16);
        }
      }

      const hourlyRate = durationMins > 0 ? privateAmount / (durationMins / 60) : undefined;
      const amountPence = parsePence(privateAmount);
      const occKey = dentallyItemId
        ? `item:${dentallyItemId}`
        : `${String(inv.id)}:${amountPence}`;
      const amountOccurrence = amountOccByInvoice.get(occKey) ?? 0;
      amountOccByInvoice.set(occKey, amountOccurrence + 1);
      const alreadyPaid = isAlreadyPaidInOtherPeriod(
        {
          dentallyInvoiceId: String(inv.id),
          dentallyPatientId: patientId || undefined,
          treatmentDescription: treatment || undefined,
          amountPence,
          amountOccurrence,
          dentallyItemId,
        },
        paidLogLookup,
        payPeriodId,
        dentistId
      );
      const status = alreadyPaid && !forceFlagged ? payment.status : forceFlagged ? payment.status : payment.status;
      // Keep real paid/outstanding even when flagged for review (partial must not become unpaid/0).
      const amountPaid = payment.amountPaid;
      const amountOutstanding = payment.amountOutstanding;
      const flagged =
        forceFlagged === true ||
        Boolean(alreadyPaid) ||
        status === "unpaid" ||
        status === "partial" ||
        (isFinance && status !== "paid");
      if (flagged) flaggedForReview++;

      bucket.patients.push({
        name: patientNames.get(patientId) || `Patient ${patientId}`,
        date: invoiceDate,
        time: appointmentTime,
        amount: privateAmount,
        amountPaid,
        amountOutstanding,
        status,
        finance: isFinance,
        invoiceId: String(inv.id),
        patientId,
        flagged,
        flagReason: alreadyPaid
          ? `Already paid in prior period ${alreadyPaid.payPeriodId}`
          : flagReason
            ? flagReason
            : flagged
              ? status === "unpaid"
                ? "Unpaid invoice"
                : status === "partial"
                  ? "Partial payment"
                  : "Finance payment"
              : undefined,
        durationMins: durationMins || undefined,
        treatment: treatment || undefined,
        hourlyRate: hourlyRate ? Math.round(hourlyRate * 100) / 100 : undefined,
        amountOccurrence,
        dentallyItemId,
      });

      // §4.3 + Step 22 — gross only when fully paid with paid_on in this period (and not already logged).
      const eligibleGross =
        !forceFlagged &&
        !alreadyPaid &&
        status === "paid" &&
        isInvoiceEligibleForGrossInPeriod(inv, startDate, endDate);
      if (eligibleGross) {
        bucket.invoiced += privateAmount;
        bucket.paid += amountPaid;
        bucket.outstanding += amountOutstanding;
      } else {
        bucket.outstanding += amountOutstanding;
      }
      processed++;
    }

    bucket.patients.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });

    totalsByDentist.set(dentistId, bucket);
  }

  // Step 18 — therapy minutes are ops-manual only. Do not auto-fill from Dentally appointments.

  let dentistsUpdated = 0;
  const summary: Record<string, DentallyFetchSummaryEntry> = {};

  await reportProgress("saving payslips");

  // Step 3 — all dentist payslip + line writes in one transaction so a mid-loop
  // failure cannot leave a half-updated period (re-fetch resumes from clean prior state).
  // Replace semantics: wipe Dentally lines only (preserve MANUAL plugs); clear dentists
  // that dropped to zero invoices so stale Dentally rows cannot survive a re-fetch.
  await db.$transaction(
    async (tx) => {
      for (const [dentistId, data] of totalsByDentist) {
        const dentist = dentists.find((d) => d.id === dentistId);
        if (!dentist || dentist.payType === "HOURLY") continue;

        const split = Number(dentist.privateSplitPercent ?? 0);
        const analytics = calculateDentistAnalytics(
          data.patients.map((p) => ({
            name: p.name,
            amount: p.amount,
            durationMins: p.durationMins,
            treatment: p.treatment,
            hourlyRate: p.hourlyRate,
          })),
          split
        );

        const paymentFlags = buildPaymentFlagsFromLines(
          data.patients.map((p) => ({
            patientName: p.name,
            amountPence: parsePence(p.amount),
            treatmentDescription: p.treatment,
            invoiceDate: p.date,
            amountOutstandingPence: parsePence(p.amountOutstanding),
            paymentStatus: p.status,
            flagged: p.flagged,
            flagReason: p.flagReason,
            dentallyInvoiceId: p.invoiceId,
            dentallyPatientId: p.patientId,
          }))
        );
        const discrepancies = paymentFlagsToDiscrepancies(paymentFlags);

        const payslip = await tx.payslipEntry.upsert({
          where: { payPeriodId_dentistId: { payPeriodId, dentistId } },
          create: {
            practiceId,
            payPeriodId,
            dentistId,
            payType: "PERCENTAGE_SPLIT",
            grossPrivateRevenuePence: parsePence(data.invoiced),
            dentallyPatientsJson: data.patients as unknown as Prisma.InputJsonValue,
            dentallyAnalyticsJson: analytics as unknown as Prisma.InputJsonValue,
            dentallyDiscrepanciesJson: discrepancies as unknown as Prisma.InputJsonValue,
          },
          update: {
            grossPrivateRevenuePence: parsePence(data.invoiced),
            // Preserve ops-entered therapyMinutes / therapyRatePerMinute (Step 18).
            dentallyPatientsJson: data.patients as unknown as Prisma.InputJsonValue,
            dentallyAnalyticsJson: analytics as unknown as Prisma.InputJsonValue,
            dentallyDiscrepanciesJson: discrepancies as unknown as Prisma.InputJsonValue,
          },
        });

        const priorLines = await tx.privateRevenueLineItem.findMany({
          where: dentallyPriorLinesWhere(payslip.id),
          select: {
            dentallyInvoiceId: true,
            dentallyLineKey: true,
            amountPence: true,
            financeTermMonths: true,
            financeFeePence: true,
            financeFeeManual: true,
          },
        });
        const priorFinance = buildPriorFinanceOpsLookup(priorLines);

        await tx.privateRevenueLineItem.deleteMany({
          where: dentallyReplaceLineWhere(payslip.id),
        });
        const lineRowsForProvisional: Array<{
          isFinance: boolean;
          amountPence: number;
          financeFeePence: number | null;
          financeTermMonths: number | null;
        }> = [];
        const lineCreates: Prisma.PrivateRevenueLineItemCreateManyInput[] = [];
        for (const p of data.patients) {
          const amountPence = parsePence(p.amount);
          const source = dentallyLineSourceFields({
            dentallyInvoiceId: p.invoiceId,
            amountPence,
            amountOccurrence: p.amountOccurrence ?? 0,
            dentallyItemId: p.dentallyItemId,
          });
          const financeOps = mergeFinanceOpsOntoFetchedLine(
            {
              dentallyInvoiceId: source.dentallyInvoiceId,
              dentallyLineKey: source.dentallyLineKey,
              amountPence,
              isFinance: Boolean(p.finance),
            },
            priorFinance
          );
          lineCreates.push({
            payslipEntryId: payslip.id,
            amountPence,
            excludedAsConsultation: false,
            patientName: p.name,
            invoiceDate: p.date,
            dentallyInvoiceId: source.dentallyInvoiceId,
            dentallyLineKey: source.dentallyLineKey,
            sourceType: source.sourceType,
            dentallyPatientId: p.patientId,
            durationMins: p.durationMins ?? null,
            isFinance: p.finance,
            paymentStatus: p.status,
            amountPaidPence: parsePence(p.amountPaid),
            amountOutstandingPence: parsePence(p.amountOutstanding),
            treatmentDescription: p.treatment ?? null,
            hourlyRatePence: p.hourlyRate != null ? parsePence(p.hourlyRate) : null,
            flagged: Boolean(p.flagged),
            flagReason: p.flagReason ?? null,
            financeTermMonths: financeOps.financeTermMonths,
            financeFeePence: financeOps.financeFeePence,
            financeFeeManual: financeOps.financeFeeManual,
          });
          lineRowsForProvisional.push({
            isFinance: Boolean(p.finance),
            amountPence,
            financeFeePence: financeOps.financeFeePence,
            financeTermMonths: financeOps.financeTermMonths,
          });
        }
        if (lineCreates.length > 0) {
          await tx.privateRevenueLineItem.createMany({ data: lineCreates });
        }

        const manualRemaining = await tx.privateRevenueLineItem.findMany({
          where: { payslipEntryId: payslip.id, sourceType: "MANUAL" },
          select: {
            isFinance: true,
            amountPence: true,
            financeFeePence: true,
            financeTermMonths: true,
          },
        });
        for (const m of manualRemaining) {
          lineRowsForProvisional.push({
            isFinance: Boolean(m.isFinance),
            amountPence: m.amountPence,
            financeFeePence: m.financeFeePence,
            financeTermMonths: m.financeTermMonths,
          });
        }

        // Step 29 — provisional when finance lines still lack term/fee after merge.
        await tx.payslipEntry.update({
          where: { id: payslip.id },
          data: { provisional: payslipIsProvisional(lineRowsForProvisional) },
        });

        summary[dentist.name] = {
          invoicedPence: parsePence(data.invoiced),
          paidPence: parsePence(data.paid),
          outstandingPence: parsePence(data.outstanding),
          invoiceCount: data.patients.length,
          financeCount: data.financeCount,
          flaggedCount: data.patients.filter((p) => p.flagged).length,
          chairMins: analytics.totalChairMins,
          grossPerHour: analytics.grossPerHour,
          netPerHour: analytics.netPerHour,
          utilizationPercent: analytics.utilizationPercent,
        };
        dentistsUpdated++;
      }

      // Clear stale Dentally data for dentists with zero invoices this run.
      for (const dentistId of percentageDentistsNeedingEmptyClear(
        dentists,
        totalsByDentist.keys()
      )) {
        const dentist = dentists.find((d) => d.id === dentistId);
        if (!dentist) continue;

        const payslip = await tx.payslipEntry.findUnique({
          where: { payPeriodId_dentistId: { payPeriodId, dentistId } },
        });
        if (!payslip) continue;

        await tx.privateRevenueLineItem.deleteMany({
          where: dentallyReplaceLineWhere(payslip.id),
        });

        const remaining = await tx.privateRevenueLineItem.findMany({
          where: { payslipEntryId: payslip.id },
          select: {
            isFinance: true,
            amountPence: true,
            financeFeePence: true,
            financeTermMonths: true,
          },
        });

        const emptyAnalytics = calculateDentistAnalytics([], Number(dentist.privateSplitPercent ?? 0));
        await tx.payslipEntry.update({
          where: { id: payslip.id },
          data: {
            grossPrivateRevenuePence: 0,
            dentallyPatientsJson: [] as unknown as Prisma.InputJsonValue,
            dentallyAnalyticsJson: emptyAnalytics as unknown as Prisma.InputJsonValue,
            dentallyDiscrepanciesJson: [] as unknown as Prisma.InputJsonValue,
            provisional: payslipIsProvisional(remaining),
          },
        });

        summary[dentist.name] = {
          invoicedPence: 0,
          paidPence: 0,
          outstandingPence: 0,
          invoiceCount: 0,
          financeCount: 0,
          flaggedCount: 0,
          chairMins: 0,
          grossPerHour: 0,
          netPerHour: 0,
          utilizationPercent: 0,
        };
        dentistsUpdated++;
      }
    },
    { timeout: 120_000, maxWait: 30_000 }
  );

  return {
    ok: true,
    message: `Fetched ${invoices.length} invoices, ${allPayments.length} payments, ${appointments.length} appointments; updated ${dentistsUpdated} dentist(s).`,
    debug: {
      totalInvoicesFromApi: allInvoices.length,
      invoicesInDateRange: invoices.length,
      processedInvoices: processed,
      skippedZeroAmount: skippedZero,
      skippedNhs,
      skippedNonClinician,
      financePayments,
      flaggedForReview,
      appointmentsFetched: appointments.length,
      paymentsFetched: allPayments.length,
      paymentWindow: { datedAfter, datedBefore },
      excludeReasonCounts,
      unmatchedClinicianIds: unmappedPractitioners.map((h) => h.practitionerId),
      unmappedPractitioners,
      dateRange: { start: startDate, end: endDate },
    },
    summary,
    dentistsUpdated,
  };
}

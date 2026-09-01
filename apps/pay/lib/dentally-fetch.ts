/**
 * Y1 — Pay-period Dentally fetch (ported from ElioPay/aurapay/src/app/api/dentally/route.ts).
 * Invoices + appointments → private patient rows, analytics, therapy attribution, finance flags.
 */

import { Prisma, scopedDb } from "@elio/db";
import {
  getDentallyClientForPractice,
  type DentallyAppointmentRaw,
  type DentallyClient,
  type DentallyInvoiceRaw,
  type DentallyPatientRaw,
} from "@elio/dentally";
import { isDateInPeriod } from "@elio/pay-engine";

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
}

export interface DentallyAnalytics {
  totalChairMins: number;
  totalPatients: number;
  grossPerHour: number;
  netPerHour: number;
  avgAppointmentMins: number;
  utilizationPercent: number;
}

export interface TherapyBreakdownItem {
  patientName: string;
  patientId: string;
  date: string;
  minutes: number;
  treatment?: string;
  therapistName?: string;
  cost: number;
}

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
  unmatchedClinicianIds: string[];
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

function resolveSiteId(): string {
  return process.env.DENTALLY_SITE_ID?.trim() ?? "";
}

function resolveTherapistIds(): Set<string> {
  const raw = process.env.DENTALLY_THERAPIST_IDS?.trim() ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

function resolveTherapyRate(): number {
  const raw = process.env.DENTALLY_THERAPY_RATE?.trim();
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_THERAPY_RATE_PER_MINUTE;
}

function resolveNhsAmounts(): Set<number> {
  const raw = process.env.DENTALLY_NHS_AMOUNTS?.trim() ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
}

function isClinicianRole(role?: string): boolean {
  if (!role) return false;
  const lower = role.toLowerCase();
  return CLINICIAN_ROLES.some((r) => lower.includes(r));
}

function parseAmount(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

function parsePence(amount: number): number {
  return Math.round(amount * 100);
}

function isNhsAmount(amount: number, nhsAmounts: Set<number>): boolean {
  for (const nhsAmt of nhsAmounts) {
    if (Math.abs(amount - nhsAmt) < 0.01) return true;
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
  if (inv.payment_plan_id) return true;
  if (inv.finance === true) return true;
  const method = (inv.payment_method || "").toLowerCase();
  if (method.includes("finance") || method.includes("payment plan") || method.includes("tabeo")) {
    return true;
  }
  for (const item of inv.invoice_items ?? []) {
    const name = (item.name || "").toLowerCase();
    if (name.includes("finance") || name.includes("payment plan") || name.includes("tabeo")) {
      return true;
    }
  }
  return false;
}

function invoicePractitionerId(inv: DentallyInvoiceRaw): string {
  const raw = inv.user_id ?? inv.practitioner_id ?? inv.invoice_items?.[0]?.practitioner_id;
  return raw != null ? String(raw) : "";
}

function isInvoiceInPeriod(inv: DentallyInvoiceRaw, startDate: string, endDate: string): boolean {
  const dated = inv.dated_on ?? inv.created_at?.substring(0, 10) ?? "";
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

function getPaymentStatus(
  inv: DentallyInvoiceRaw,
  privateAmount: number
): { status: "paid" | "partial" | "unpaid"; amountPaid: number; amountOutstanding: number } {
  const outstanding = parseAmount(inv.amount_outstanding ?? inv.balance ?? 0);
  if (inv.paid === true || inv.state === "paid") {
    return { status: "paid", amountPaid: privateAmount, amountOutstanding: 0 };
  }
  if (outstanding <= 0.01) {
    return { status: "paid", amountPaid: privateAmount, amountOutstanding: 0 };
  }
  const total = parseAmount(inv.amount);
  const paid = Math.max(0, total - outstanding);
  const privatePaid = total > 0 ? (paid / total) * privateAmount : 0;
  const privateOutstanding = Math.max(0, privateAmount - privatePaid);
  if (privatePaid > 0.01 && privateOutstanding > 0.01) {
    return { status: "partial", amountPaid: privatePaid, amountOutstanding: privateOutstanding };
  }
  if (privatePaid > 0.01) {
    return { status: "paid", amountPaid: privateAmount, amountOutstanding: 0 };
  }
  return { status: "unpaid", amountPaid: 0, amountOutstanding: privateAmount };
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

function calculateDentistAnalytics(
  patients: DentallyPatientRow[],
  splitPercentage: number,
  weeklyHours = 40
): DentallyAnalytics {
  const withDuration = patients.filter((p) => p.durationMins && p.durationMins > 0);
  const totalChairMins = withDuration.reduce((sum, p) => sum + (p.durationMins || 0), 0);
  const totalAmount = patients.reduce((sum, p) => sum + p.amount, 0);
  const totalHours = totalChairMins / 60;
  const grossPerHour = totalHours > 0 ? totalAmount / totalHours : 0;
  const netPerHour = totalHours > 0 ? (totalAmount * (splitPercentage / 100)) / totalHours : 0;
  const avgAppointmentMins = withDuration.length > 0 ? totalChairMins / withDuration.length : 0;
  const monthlyAvailableHours = weeklyHours * 4.3;
  const utilizationPercent = monthlyAvailableHours > 0 ? (totalHours / monthlyAvailableHours) * 100 : 0;

  return {
    totalChairMins,
    totalPatients: patients.length,
    grossPerHour: Math.round(grossPerHour * 100) / 100,
    netPerHour: Math.round(netPerHour * 100) / 100,
    avgAppointmentMins: Math.round(avgAppointmentMins),
    utilizationPercent: Math.round(utilizationPercent * 10) / 10,
  };
}

async function loadClinicianUsers(
  client: DentallyClient,
  siteId: string
): Promise<Map<string, { name: string; isClinician: boolean }>> {
  const map = new Map<string, { name: string; isClinician: boolean }>();
  try {
    const data = await client.get<{
      users?: Array<{
        id: number | string;
        first_name?: string;
        last_name?: string;
        role?: string;
        user_type?: string;
        job_title?: string;
      }>;
    }>("/users", { site_id: siteId, per_page: 100 });
    for (const user of data.users ?? []) {
      const role = user.role ?? user.user_type ?? user.job_title;
      const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || `User ${user.id}`;
      map.set(String(user.id), { name, isClinician: isClinicianRole(role) });
    }
  } catch {
    // non-fatal
  }
  return map;
}

async function fetchPatientNames(
  client: DentallyClient,
  patientIds: string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  // Batch by fetching individually with concurrency via client queue — cap to avoid huge pulls.
  const unique = Array.from(new Set(patientIds)).slice(0, 500);
  await Promise.all(
    unique.map(async (id) => {
      try {
        const data = await client.get<{ patient?: DentallyPatientRaw }>(`/patients/${id}`);
        const p = data.patient;
        if (p) {
          names.set(id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || `Patient ${id}`);
        }
      } catch {
        names.set(id, `Patient ${id}`);
      }
    })
  );
  return names;
}

async function calculateTherapyBreakdown(
  client: DentallyClient,
  appointments: DentallyAppointmentRaw[],
  startDate: string,
  endDate: string,
  siteId: string,
  therapistIds: Set<string>,
  therapyRate: number,
  dentistByPractitioner: Map<string, { id: string; name: string }>,
  clinicianUsers: Map<string, { name: string; isClinician: boolean }>,
  patientNames: Map<string, string>
): Promise<Map<string, TherapyBreakdownItem[]>> {
  const therapyByDentist = new Map<string, TherapyBreakdownItem[]>();
  if (therapistIds.size === 0) return therapyByDentist;

  const therapistAppointments = appointments.filter((apt) => {
    const practId = String(apt.practitioner_id || apt.user_id || "");
    if (!therapistIds.has(practId)) return false;
    const aptDate = apt.starts_at || apt.start_time || "";
    return isDateInPeriod(aptDate, startDate, endDate);
  });

  for (const apt of therapistAppointments) {
    const patientId = String(apt.patient_id ?? "");
    const aptDate = (apt.starts_at || apt.start_time || "").substring(0, 10);
    const practId = String(apt.practitioner_id || apt.user_id || "");
    const minutes = getAppointmentDuration(apt);
    if (!patientId || !aptDate || minutes <= 0) continue;

    // Referring dentist: most recent non-therapist clinician appointment before therapy date.
    let referringId: string | null = null;
    try {
      const hist: DentallyAppointmentRaw[] = [];
      await client.paginate<DentallyAppointmentRaw>(
        "/appointments",
        "appointments",
        { site_id: siteId, patient_id: patientId, end_date: aptDate, per_page: 50 },
        (page) => {
          hist.push(...page);
        },
        { perPage: 50, maxPages: 2 }
      );
      hist.sort((a, b) => {
        const da = a.starts_at || a.start_time || "";
        const db = b.starts_at || b.start_time || "";
        return db.localeCompare(da);
      });
      for (const prior of hist) {
        const pid = String(prior.practitioner_id || prior.user_id || "");
        if (!pid || therapistIds.has(pid)) continue;
        if (dentistByPractitioner.has(pid)) {
          referringId = dentistByPractitioner.get(pid)!.id;
          break;
        }
        const user = clinicianUsers.get(pid);
        if (user?.isClinician) {
          // unmapped clinician — skip assignment
          break;
        }
      }
    } catch {
      // skip this therapy row
    }

    if (!referringId) continue;

    if (!therapyByDentist.has(referringId)) therapyByDentist.set(referringId, []);
    therapyByDentist.get(referringId)!.push({
      patientName: patientNames.get(patientId) || `Patient ${patientId}`,
      patientId,
      date: aptDate,
      minutes,
      treatment: apt.treatment_description || apt.reason || undefined,
      therapistName: clinicianUsers.get(practId)?.name,
      cost: Math.round(minutes * therapyRate * 100) / 100,
    });
  }

  return therapyByDentist;
}

export async function fetchDentallyForPayPeriod(
  practiceId: string,
  payPeriodId: string
): Promise<DentallyFetchResult> {
  const siteId = resolveSiteId();
  if (!siteId) {
    throw new DentallyFetchConfigError(
      "DENTALLY_SITE_ID is not configured. Set it on the Pay Vercel project (see docs/deploy-checklist.md)."
    );
  }

  const therapistIds = resolveTherapistIds();
  const therapyRate = resolveTherapyRate();
  const nhsAmounts = resolveNhsAmounts();

  const db = scopedDb(practiceId);
  const payPeriod = await db.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found");
  if (payPeriod.status === "LOCKED") throw new Error("Pay period is locked");

  const startDate = payPeriod.periodStart.toISOString().slice(0, 10);
  const endDate = payPeriod.periodEnd.toISOString().slice(0, 10);
  const apiEndDate = apiEndBuffer(endDate);

  const dentists = await db.dentist.findMany({
    where: { practiceId },
    select: { id: true, name: true, dentallyPractitionerId: true, payType: true, privateSplitPercent: true },
  });

  const dentistByPractitioner = new Map<string, (typeof dentists)[number]>();
  for (const d of dentists) {
    if (d.dentallyPractitionerId) dentistByPractitioner.set(String(d.dentallyPractitionerId), d);
  }

  const client = await getDentallyClientForPractice(practiceId);
  const clinicianUsers = await loadClinicianUsers(client, siteId);

  const allInvoices: DentallyInvoiceRaw[] = [];
  await client.paginate<DentallyInvoiceRaw>(
    "/invoices",
    "invoices",
    { site_id: siteId, dated_on_from: startDate, dated_on_to: apiEndDate },
    (page) => {
      allInvoices.push(...page);
    }
  );

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
  const invoices = allInvoices.filter((inv) => isInvoiceInPeriod(inv, startDate, endDate));

  type Bucket = {
    patients: DentallyPatientRow[];
    invoiced: number;
    paid: number;
    outstanding: number;
    financeCount: number;
  };

  const totalsByDentist = new Map<string, Bucket>();
  const unmatched = new Set<string>();
  const allPatientIds = new Set<string>();
  let skippedZero = 0;
  let skippedNhs = 0;
  let skippedNonClinician = 0;
  let processed = 0;
  let financePayments = 0;
  let flaggedForReview = 0;

  const pendingByDentist = new Map<
    string,
    Array<{ inv: DentallyInvoiceRaw; privateAmount: number; patientId: string }>
  >();

  for (const inv of invoices) {
    const totalAmount = parseAmount(inv.amount);
    if (totalAmount <= 0) {
      skippedZero++;
      continue;
    }

    const practitionerId = invoicePractitionerId(inv);
    if (!practitionerId) continue;

    const userInfo = clinicianUsers.get(practitionerId);
    if (userInfo && !userInfo.isClinician) {
      skippedNonClinician++;
      continue;
    }

    const dentist = dentistByPractitioner.get(practitionerId);
    if (!dentist) {
      unmatched.add(practitionerId);
      continue;
    }

    const privateAmount = privateAmountFromInvoice(inv, nhsAmounts);
    if (privateAmount <= 0) {
      skippedNhs++;
      continue;
    }

    const patientId = String(inv.patient_id ?? "");
    if (patientId) allPatientIds.add(patientId);

    if (!pendingByDentist.has(dentist.id)) pendingByDentist.set(dentist.id, []);
    pendingByDentist.get(dentist.id)!.push({ inv, privateAmount, patientId });
  }

  const patientNames = await fetchPatientNames(client, Array.from(allPatientIds));

  for (const [dentistId, rows] of pendingByDentist) {
    const bucket: Bucket = {
      patients: [],
      invoiced: 0,
      paid: 0,
      outstanding: 0,
      financeCount: 0,
    };

    for (const { inv, privateAmount, patientId } of rows) {
      const payment = getPaymentStatus(inv, privateAmount);
      const invoiceDate = inv.dated_on || inv.created_at?.substring(0, 10) || "";
      const isFinance = isFinancePayment(inv);
      if (isFinance) {
        financePayments++;
        bucket.financeCount++;
      }

      const aptKey = `${patientId}_${invoiceDate}`;
      const patientAppointments = appointmentMap.get(aptKey) || [];
      let durationMins = 0;
      let treatment = "";
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
      const flagged =
        payment.status === "unpaid" || payment.status === "partial" || (isFinance && payment.status !== "paid");
      if (flagged) flaggedForReview++;

      bucket.patients.push({
        name: patientNames.get(patientId) || `Patient ${patientId}`,
        date: invoiceDate,
        time: appointmentTime,
        amount: privateAmount,
        amountPaid: payment.amountPaid,
        amountOutstanding: payment.amountOutstanding,
        status: payment.status,
        finance: isFinance,
        invoiceId: String(inv.id),
        patientId,
        flagged,
        flagReason: flagged
          ? payment.status === "unpaid"
            ? "Unpaid invoice"
            : payment.status === "partial"
              ? "Partial payment"
              : "Finance payment"
          : undefined,
        durationMins: durationMins || undefined,
        treatment: treatment || undefined,
        hourlyRate: hourlyRate ? Math.round(hourlyRate * 100) / 100 : undefined,
      });

      bucket.invoiced += privateAmount;
      bucket.paid += payment.amountPaid;
      bucket.outstanding += payment.amountOutstanding;
      processed++;
    }

    bucket.patients.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });

    totalsByDentist.set(dentistId, bucket);
  }

  const therapyByDentist = await calculateTherapyBreakdown(
    client,
    appointments,
    startDate,
    endDate,
    siteId,
    therapistIds,
    therapyRate,
    new Map(
      Array.from(dentistByPractitioner.entries()).map(([k, v]) => [k, { id: v.id, name: v.name }])
    ),
    clinicianUsers,
    patientNames
  );

  let dentistsUpdated = 0;
  const summary: Record<string, DentallyFetchSummaryEntry> = {};

  for (const [dentistId, data] of totalsByDentist) {
    const dentist = dentists.find((d) => d.id === dentistId);
    if (!dentist || dentist.payType === "HOURLY") continue;

    const split = Number(dentist.privateSplitPercent ?? 0);
    const analytics = calculateDentistAnalytics(data.patients, split);
    const therapyItems = therapyByDentist.get(dentistId) || [];
    const totalTherapyMinutes = therapyItems.reduce((sum, t) => sum + t.minutes, 0);

    const discrepancies = data.patients
      .filter((p) => p.status === "unpaid" || p.status === "partial")
      .map((p) => ({
        type: p.status === "unpaid" ? "invoiced_not_paid" : "partial_payment",
        patientName: p.name,
        patientId: p.patientId,
        invoiceId: p.invoiceId,
        invoicedAmount: p.amount,
        paidAmount: p.amountPaid,
        date: p.date,
        notes: p.flagReason || "",
      }));

    const payslip = await db.payslipEntry.upsert({
      where: { payPeriodId_dentistId: { payPeriodId, dentistId } },
      create: {
        practiceId,
        payPeriodId,
        dentistId,
        payType: "PERCENTAGE_SPLIT",
        grossPrivateRevenuePence: parsePence(data.invoiced),
        therapyMinutes: totalTherapyMinutes,
        therapyRatePerMinute: therapyRate,
        dentallyPatientsJson: data.patients as unknown as Prisma.InputJsonValue,
        dentallyAnalyticsJson: analytics as unknown as Prisma.InputJsonValue,
        dentallyTherapyJson: therapyItems as unknown as Prisma.InputJsonValue,
        dentallyDiscrepanciesJson: discrepancies as unknown as Prisma.InputJsonValue,
      },
      update: {
        grossPrivateRevenuePence: parsePence(data.invoiced),
        therapyMinutes: totalTherapyMinutes,
        therapyRatePerMinute: therapyRate,
        dentallyPatientsJson: data.patients as unknown as Prisma.InputJsonValue,
        dentallyAnalyticsJson: analytics as unknown as Prisma.InputJsonValue,
        dentallyTherapyJson: therapyItems as unknown as Prisma.InputJsonValue,
        dentallyDiscrepanciesJson: discrepancies as unknown as Prisma.InputJsonValue,
      },
    });

    await db.privateRevenueLineItem.deleteMany({ where: { payslipEntryId: payslip.id } });
    for (const p of data.patients) {
      await db.privateRevenueLineItem.create({
        data: {
          payslipEntryId: payslip.id,
          amountPence: parsePence(p.amount),
          excludedAsConsultation: false,
          patientName: p.name,
          invoiceDate: p.date,
          dentallyInvoiceId: p.invoiceId,
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
        },
      });
    }

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

  return {
    ok: true,
    message: `Fetched ${invoices.length} invoices + ${appointments.length} appointments; updated ${dentistsUpdated} dentist(s).`,
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
      unmatchedClinicianIds: Array.from(unmatched),
      dateRange: { start: startDate, end: endDate },
    },
    summary,
    dentistsUpdated,
  };
}

// On-demand live Dentally reads for UI panels (ElioFlow patient detail modal).
// Unlike queries.ts (synced Postgres cache), this hits the Dentally API directly —
// acceptable for a single-patient drill-down, not for bulk reporting.

import { prisma } from "@elio/db";
import type { DentallyClient } from "./client";
import { getDentallyClientForPractice } from "./resolve-api-key";
import { appointmentSyncDateParams } from "./appointment-window";
import type {
  DentallyAccountRaw,
  DentallyAppointmentRaw,
  DentallyInvoiceRaw,
  DentallyPatientRaw,
  DentallyPaymentRaw,
} from "./types";

export interface LivePatientAppointment {
  id: string;
  startsAt: string | null;
  reason: string | null;
  state: string | null;
  durationMinutes: number | null;
}

export interface LivePatientInvoice {
  id: string;
  datedOn: string | null;
  amountPence: number;
  amountOutstandingPence: number;
  paid: boolean;
  state: string | null;
}

export interface LivePatientPayment {
  id: string;
  paidAt: string | null;
  amountPence: number;
  method: string | null;
}

export interface LivePatientAccount {
  id: string;
  currentBalancePence: number;
  plannedPrivateTreatmentValuePence: number | null;
}

export interface LivePatientPanel {
  patient: {
    elioPatientId: string;
    dentallyId: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  account: LivePatientAccount | null;
  appointments: LivePatientAppointment[];
  invoices: LivePatientInvoice[];
  payments: LivePatientPayment[];
  fetchedAt: string;
  /** Non-fatal: one resource type failed to fetch (empty, not "genuinely none") or
   *  hit its page cap (list may be truncated). Previously the patient-level lookup
   *  had a soft-fail fallback but these four did not — any one of them throwing
   *  (e.g. rate-limited) discarded results already successfully fetched from the
   *  others, and even on success there was no signal that a long history had been
   *  cut off at maxPages. Shared by apps/flow's and apps/plans' live patient panels. */
  warnings: string[];
}

function poundsToPence(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function patientName(p: DentallyPatientRaw): string {
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || `Patient ${p.id}`;
}

/**
 * Fetches appointments, invoices, and payments for one patient from the live
 * Dentally API. Requires the patient to exist in ELIO's synced-core (for
 * dentallyId lookup).
 */
export async function fetchLivePatientPanel(
  practiceId: string,
  elioPatientId: string,
  client?: DentallyClient,
): Promise<LivePatientPanel> {
  const patient = await prisma.patient.findFirst({
    where: { id: elioPatientId, practiceId },
    select: { id: true, dentallyId: true, firstName: true, lastName: true, email: true, phone: true },
  });
  if (!patient) throw new Error("Patient not found");

  const dentallyClient = client ?? (await getDentallyClientForPractice(practiceId));
  const dentallyId = patient.dentallyId;

  const warnings: string[] = [];

  let livePatient: DentallyPatientRaw | null = null;
  try {
    const data = await dentallyClient.get<{ patient?: DentallyPatientRaw }>(`/patients/${dentallyId}`);
    livePatient = data.patient ?? null;
  } catch {
    // Fall back to synced-core demographics when live fetch fails.
    warnings.push("Could not load live patient details from Dentally — showing last-known name/email/phone.");
  }

  /** Each resource type is fetched independently so one endpoint failing (rate
   *  limit, outage) doesn't discard results already fetched from the others. */
  async function fetchResource<T>(
    label: string,
    path: string,
    listKey: string,
    params: Record<string, string | number | undefined>,
    maxPages: number,
  ): Promise<T[]> {
    const items: T[] = [];
    try {
      const fetched = await dentallyClient.paginate<T>(path, listKey, params, (page) => {
        items.push(...page);
      }, { perPage: 50, maxPages });
      if (fetched >= maxPages * 50) {
        warnings.push(`${label} may be incomplete — this patient has more than ${maxPages * 50} records.`);
      }
    } catch (err) {
      warnings.push(`Could not load ${label.toLowerCase()} from Dentally: ${err instanceof Error ? err.message : String(err)}`);
    }
    return items;
  }

  // Dentally returns 0 appointment rows without after/before (confirmed live).
  const { after, before } = appointmentSyncDateParams();
  const appointments = await fetchResource<DentallyAppointmentRaw>(
    "Appointments",
    "/appointments",
    "appointments",
    { patient_id: dentallyId, after, before },
    3,
  );

  const invoices = await fetchResource<DentallyInvoiceRaw>(
    "Invoices",
    "/invoices",
    "invoices",
    { patient_id: dentallyId },
    3,
  );

  const payments = await fetchResource<DentallyPaymentRaw>(
    "Payments",
    "/payments",
    "payments",
    { patient_id: dentallyId },
    3,
  );

  const accounts = await fetchResource<DentallyAccountRaw>(
    "Account",
    "/accounts",
    "accounts",
    { patient_id: dentallyId },
    1,
  );

  const name = livePatient
    ? patientName(livePatient)
    : [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unnamed patient";

  appointments.sort((a, b) => {
    const da = a.starts_at || a.start_time || "";
    const db = b.starts_at || b.start_time || "";
    return db.localeCompare(da);
  });

  invoices.sort((a, b) => (b.dated_on ?? "").localeCompare(a.dated_on ?? ""));

  payments.sort((a, b) => (b.dated_on ?? b.created_at ?? "").localeCompare(a.dated_on ?? a.created_at ?? ""));

  const accountRaw = accounts[0];
  const account: LivePatientAccount | null = accountRaw
    ? {
        id: String(accountRaw.id),
        currentBalancePence: poundsToPence(accountRaw.current_balance),
        plannedPrivateTreatmentValuePence: accountRaw.planned_private_treatment_value
          ? poundsToPence(accountRaw.planned_private_treatment_value)
          : null,
      }
    : null;

  return {
    patient: {
      elioPatientId: patient.id,
      dentallyId: patient.dentallyId,
      name,
      email: livePatient?.email_address ?? patient.email,
      phone: livePatient?.mobile_phone ?? livePatient?.home_phone ?? patient.phone,
    },
    account,
    appointments: appointments.map((a) => ({
      id: String(a.id),
      startsAt: a.starts_at ?? a.start_time ?? null,
      reason: a.reason ?? a.treatment_description ?? null,
      state: a.state ?? null,
      durationMinutes: a.duration ?? null,
    })),
    invoices: invoices.map((inv) => ({
      id: String(inv.id),
      datedOn: inv.dated_on ?? inv.created_at?.slice(0, 10) ?? null,
      amountPence: poundsToPence(inv.amount),
      amountOutstandingPence: poundsToPence(inv.amount_outstanding ?? inv.balance),
      paid: Boolean(inv.paid),
      state: inv.state ?? null,
    })),
    payments: payments.map((p) => ({
      id: String(p.id),
      paidAt: p.dated_on ?? p.created_at ?? null,
      amountPence: poundsToPence(p.amount ?? p.total),
      method: null,
    })),
    fetchedAt: new Date().toISOString(),
    warnings,
  };
}

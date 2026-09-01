// On-demand live Dentally reads for UI panels (ElioFlow patient detail modal).
// Unlike queries.ts (synced Postgres cache), this hits the Dentally API directly —
// acceptable for a single-patient drill-down, not for bulk reporting.

import { prisma } from "@elio/db";
import { getDentallyClientForPractice } from "./resolve-api-key";
import type {
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

export interface LivePatientPanel {
  patient: {
    elioPatientId: string;
    dentallyId: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  appointments: LivePatientAppointment[];
  invoices: LivePatientInvoice[];
  payments: LivePatientPayment[];
  fetchedAt: string;
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
): Promise<LivePatientPanel> {
  const patient = await prisma.patient.findFirst({
    where: { id: elioPatientId, practiceId },
    select: { id: true, dentallyId: true, firstName: true, lastName: true, email: true, phone: true },
  });
  if (!patient) throw new Error("Patient not found");

  const client = await getDentallyClientForPractice(practiceId);
  const dentallyId = patient.dentallyId;

  let livePatient: DentallyPatientRaw | null = null;
  try {
    const data = await client.get<{ patient?: DentallyPatientRaw }>(`/patients/${dentallyId}`);
    livePatient = data.patient ?? null;
  } catch {
    // Fall back to synced-core demographics when live fetch fails.
  }

  const appointments: DentallyAppointmentRaw[] = [];
  await client.paginate<DentallyAppointmentRaw>(
    "/appointments",
    "appointments",
    { patient_id: dentallyId, per_page: 50 },
    (page) => {
      appointments.push(...page);
    },
    { perPage: 50, maxPages: 3 },
  );

  const invoices: DentallyInvoiceRaw[] = [];
  await client.paginate<DentallyInvoiceRaw>(
    "/invoices",
    "invoices",
    { patient_id: dentallyId, per_page: 50 },
    (page) => {
      invoices.push(...page);
    },
    { perPage: 50, maxPages: 3 },
  );

  const payments: DentallyPaymentRaw[] = [];
  await client.paginate<DentallyPaymentRaw>(
    "/payments",
    "payments",
    { patient_id: dentallyId, per_page: 50 },
    (page) => {
      payments.push(...page);
    },
    { perPage: 50, maxPages: 3 },
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

  return {
    patient: {
      elioPatientId: patient.id,
      dentallyId: patient.dentallyId,
      name,
      email: livePatient?.email_address ?? patient.email,
      phone: livePatient?.mobile_phone ?? livePatient?.home_phone ?? patient.phone,
    },
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
  };
}

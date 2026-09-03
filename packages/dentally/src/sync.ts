// The full-practice sync (FR-9). Pulls patients/appointments/invoices (and the
// treatments derived from invoice line items — see normalize.ts) from Dentally
// and upserts them into ELIO's own synced-core tables, keyed by
// `[practiceId, dentallyId]` (matches the @@unique constraint already on
// Patient/Appointment/Treatment/Invoice in packages/db/prisma/schema.prisma).
//
// MUST be invoked from a background job (Inngest, see inngest.ts), never
// inline in a request handler — project-docs/PERFORMANCE_SCALABILITY.md
// section 1 is explicit that a full sync can exceed a serverless function's
// execution limit.
//
// Phases are exported so Inngest can run each as its own `step.run` checkpoint
// (a single monolithic step was timing out ~16m on production).
//
// Partial-failure handling: one bad record must not corrupt the whole batch.
// Each page is upserted record-by-record inside a try/catch; failures are
// collected and returned, the sync continues.

import { prisma } from "@elio/db";
import type { DentallyClient } from "./client";
import { getDentallyClientForPractice } from "./resolve-api-key";
import {
  normalizeAppointment,
  normalizeInvoice,
  normalizePatient,
  normalizePayment,
  normalizeAccount,
  normalizePaymentPlan,
  normalizeTreatmentsFromInvoice,
} from "./normalize";
import type {
  DentallyAppointmentRaw,
  DentallyInvoiceRaw,
  DentallyPatientRaw,
  DentallyPaymentRaw,
  DentallyAccountRaw,
  DentallyPaymentPlanRaw,
} from "./types";

export interface SyncError {
  resource: "patient" | "appointment" | "invoice" | "treatment" | "payment" | "account" | "payment_plan";
  dentallyId: string;
  message: string;
}

export interface SyncCounts {
  patients: number;
  appointments: number;
  invoices: number;
  treatments: number;
  payments: number;
  accounts: number;
  paymentPlans: number;
}

export interface SyncResult {
  practiceId: string;
  startedAt: Date;
  finishedAt: Date;
  counts: SyncCounts;
  errors: SyncError[];
}

export interface SyncPhaseResult {
  counts: SyncCounts;
  errors: SyncError[];
}

export const EMPTY_SYNC_COUNTS: SyncCounts = {
  patients: 0,
  appointments: 0,
  invoices: 0,
  treatments: 0,
  payments: 0,
  accounts: 0,
  paymentPlans: 0,
};

export type DentallySyncPhase =
  | "patients"
  | "appointments"
  | "invoices"
  | "payments"
  | "accounts"
  | "payment_plans";

export const DENTALLY_SYNC_PHASES: DentallySyncPhase[] = [
  "patients",
  "appointments",
  "invoices",
  "payments",
  "accounts",
  "payment_plans",
];

export function mergeSyncCounts(...parts: SyncCounts[]): SyncCounts {
  return parts.reduce(
    (acc, part) => ({
      patients: acc.patients + part.patients,
      appointments: acc.appointments + part.appointments,
      invoices: acc.invoices + part.invoices,
      treatments: acc.treatments + part.treatments,
      payments: acc.payments + part.payments,
      accounts: acc.accounts + part.accounts,
      paymentPlans: acc.paymentPlans + part.paymentPlans,
    }),
    { ...EMPTY_SYNC_COUNTS }
  );
}

async function resolvePatientId(
  practiceId: string,
  dentallyPatientId: string | null
): Promise<string | null> {
  if (!dentallyPatientId) return null;
  const patient = await prisma.patient.findUnique({
    where: { practiceId_dentallyId: { practiceId, dentallyId: dentallyPatientId } },
    select: { id: true },
  });
  return patient?.id ?? null;
}

/**
 * Resolves a raw Dentally `practitioner_id` (from invoice_item.practitioner_id)
 * to ELIO's own Dentist row, matched on `Dentist.dentallyPractitionerId` for
 * this practice. Returns null (not an error) when unmatched — a practice may
 * not have linked every Dentally practitioner to an ELIO Dentist yet; this
 * only degrades attribution, it never blocks the sync.
 */
async function resolveDentistId(
  practiceId: string,
  dentallyPractitionerId: string | null
): Promise<string | null> {
  if (!dentallyPractitionerId) return null;
  const dentist = await prisma.dentist.findFirst({
    where: { practiceId, dentallyPractitionerId },
    select: { id: true },
  });
  return dentist?.id ?? null;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function syncPatientsPhase(practiceId: string, client: DentallyClient): Promise<SyncPhaseResult> {
  const counts = { ...EMPTY_SYNC_COUNTS };
  const errors: SyncError[] = [];
  await client.paginate<DentallyPatientRaw>("/patients", "patients", {}, async (patients) => {
    for (const raw of patients) {
      try {
        const data = normalizePatient(raw);
        await prisma.patient.upsert({
          where: { practiceId_dentallyId: { practiceId, dentallyId: data.dentallyId } },
          create: { practiceId, ...data },
          update: data,
        });
        counts.patients++;
      } catch (err) {
        errors.push({ resource: "patient", dentallyId: String(raw.id), message: errMsg(err) });
      }
    }
  });
  return { counts, errors };
}

async function syncAppointmentsPhase(practiceId: string, client: DentallyClient): Promise<SyncPhaseResult> {
  const counts = { ...EMPTY_SYNC_COUNTS };
  const errors: SyncError[] = [];
  await client.paginate<DentallyAppointmentRaw>("/appointments", "appointments", {}, async (appointments) => {
    for (const raw of appointments) {
      try {
        const { dentallyPatientId, ...data } = normalizeAppointment(raw);
        const patientId = await resolvePatientId(practiceId, dentallyPatientId);
        await prisma.appointment.upsert({
          where: { practiceId_dentallyId: { practiceId, dentallyId: data.dentallyId } },
          create: { practiceId, patientId, ...data },
          update: { patientId, ...data },
        });
        counts.appointments++;
      } catch (err) {
        errors.push({ resource: "appointment", dentallyId: String(raw.id), message: errMsg(err) });
      }
    }
  });
  return { counts, errors };
}

async function syncInvoicesPhase(practiceId: string, client: DentallyClient): Promise<SyncPhaseResult> {
  const counts = { ...EMPTY_SYNC_COUNTS };
  const errors: SyncError[] = [];
  await client.paginate<DentallyInvoiceRaw>("/invoices", "invoices", {}, async (invoices) => {
    for (const raw of invoices) {
      try {
        const { dentallyPatientId, ...data } = normalizeInvoice(raw);
        const patientId = await resolvePatientId(practiceId, dentallyPatientId);
        await prisma.invoice.upsert({
          where: { practiceId_dentallyId: { practiceId, dentallyId: data.dentallyId } },
          create: { practiceId, patientId, ...data },
          update: { patientId, ...data },
        });
        counts.invoices++;
      } catch (err) {
        errors.push({ resource: "invoice", dentallyId: String(raw.id), message: errMsg(err) });
        continue;
      }

      for (const t of normalizeTreatmentsFromInvoice(raw)) {
        try {
          const { dentallyPatientId: tPatientId, ...tData } = t;
          const patientId = await resolvePatientId(practiceId, tPatientId);
          const dentistId = await resolveDentistId(practiceId, tData.dentallyPractitionerId);
          await prisma.treatment.upsert({
            where: { practiceId_dentallyId: { practiceId, dentallyId: tData.dentallyId } },
            create: { practiceId, patientId, dentistId, ...tData },
            update: { patientId, dentistId, ...tData },
          });
          counts.treatments++;
        } catch (err) {
          errors.push({ resource: "treatment", dentallyId: t.dentallyId, message: errMsg(err) });
        }
      }
    }
  });
  return { counts, errors };
}

async function syncPaymentsPhase(practiceId: string, client: DentallyClient): Promise<SyncPhaseResult> {
  const counts = { ...EMPTY_SYNC_COUNTS };
  const errors: SyncError[] = [];
  await client.paginate<DentallyPaymentRaw>("/payments", "payments", {}, async (payments) => {
    for (const raw of payments) {
      try {
        const { dentallyPatientId, ...data } = normalizePayment(raw);
        const patientId = await resolvePatientId(practiceId, dentallyPatientId);
        await prisma.dentallyPayment.upsert({
          where: { practiceId_dentallyId: { practiceId, dentallyId: data.dentallyId } },
          create: { practiceId, patientId, ...data },
          update: { patientId, ...data },
        });
        counts.payments++;
      } catch (err) {
        errors.push({ resource: "payment", dentallyId: String(raw.id), message: errMsg(err) });
      }
    }
  });
  return { counts, errors };
}

async function syncAccountsPhase(practiceId: string, client: DentallyClient): Promise<SyncPhaseResult> {
  const counts = { ...EMPTY_SYNC_COUNTS };
  const errors: SyncError[] = [];
  await client.paginate<DentallyAccountRaw>("/accounts", "accounts", {}, async (accounts) => {
    for (const raw of accounts) {
      try {
        const { dentallyPatientId, ...data } = normalizeAccount(raw);
        const patientId = await resolvePatientId(practiceId, dentallyPatientId);
        await prisma.dentallyAccount.upsert({
          where: { practiceId_dentallyId: { practiceId, dentallyId: data.dentallyId } },
          create: { practiceId, patientId, ...data },
          update: { patientId, ...data },
        });
        counts.accounts++;
      } catch (err) {
        errors.push({ resource: "account", dentallyId: String(raw.id), message: errMsg(err) });
      }
    }
  });
  return { counts, errors };
}

async function syncPaymentPlansPhase(practiceId: string, client: DentallyClient): Promise<SyncPhaseResult> {
  const counts = { ...EMPTY_SYNC_COUNTS };
  const errors: SyncError[] = [];
  await client.paginate<DentallyPaymentPlanRaw>("/payment_plans", "payment_plans", {}, async (plans) => {
    for (const raw of plans) {
      try {
        const data = normalizePaymentPlan(raw);
        await prisma.dentallyPaymentPlan.upsert({
          where: { practiceId_dentallyId: { practiceId, dentallyId: data.dentallyId } },
          create: { practiceId, ...data },
          update: data,
        });
        counts.paymentPlans++;
      } catch (err) {
        errors.push({ resource: "payment_plan", dentallyId: String(raw.id), message: errMsg(err) });
      }
    }
  });
  return { counts, errors };
}

/** One resource phase — used as a single Inngest `step.run` unit of work. */
export async function syncPracticeDentallyPhase(
  practiceId: string,
  phase: DentallySyncPhase,
  client?: DentallyClient
): Promise<SyncPhaseResult> {
  const dentallyClient = client ?? (await getDentallyClientForPractice(practiceId));
  switch (phase) {
    case "patients":
      return syncPatientsPhase(practiceId, dentallyClient);
    case "appointments":
      return syncAppointmentsPhase(practiceId, dentallyClient);
    case "invoices":
      return syncInvoicesPhase(practiceId, dentallyClient);
    case "payments":
      return syncPaymentsPhase(practiceId, dentallyClient);
    case "accounts":
      return syncAccountsPhase(practiceId, dentallyClient);
    case "payment_plans":
      return syncPaymentPlansPhase(practiceId, dentallyClient);
    default: {
      const _exhaustive: never = phase;
      throw new Error(`Unknown Dentally sync phase: ${_exhaustive}`);
    }
  }
}

/**
 * Runs a full sync for one practice. Safe to call repeatedly (every write is
 * an upsert) — a scheduled full sync and a manual "sync now" both call this
 * same function, just from different triggers (see inngest.ts and the manual
 * trigger route in apps/shell).
 *
 * Prefer Inngest multi-step (`runDentallySyncJobWithSteps`) in production so
 * each phase can checkpoint before serverless time limits.
 */
export async function syncPracticeDentallyData(
  practiceId: string,
  client?: DentallyClient
): Promise<SyncResult> {
  const dentallyClient = client ?? (await getDentallyClientForPractice(practiceId));
  const startedAt = new Date();
  const parts: SyncPhaseResult[] = [];
  for (const phase of DENTALLY_SYNC_PHASES) {
    parts.push(await syncPracticeDentallyPhase(practiceId, phase, dentallyClient));
  }
  return {
    practiceId,
    startedAt,
    finishedAt: new Date(),
    counts: mergeSyncCounts(...parts.map((p) => p.counts)),
    errors: parts.flatMap((p) => p.errors),
  };
}

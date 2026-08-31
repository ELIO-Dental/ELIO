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
  normalizeTreatmentsFromInvoice,
} from "./normalize";
import type {
  DentallyAppointmentRaw,
  DentallyInvoiceRaw,
  DentallyPatientRaw,
} from "./types";

export interface SyncError {
  resource: "patient" | "appointment" | "invoice" | "treatment";
  dentallyId: string;
  message: string;
}

export interface SyncResult {
  practiceId: string;
  startedAt: Date;
  finishedAt: Date;
  counts: {
    patients: number;
    appointments: number;
    invoices: number;
    treatments: number;
  };
  errors: SyncError[];
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

/**
 * Runs a full sync for one practice. Safe to call repeatedly (every write is
 * an upsert) — a scheduled full sync and a manual "sync now" both call this
 * same function, just from different triggers (see inngest.ts and the manual
 * trigger route in apps/shell).
 */
export async function syncPracticeDentallyData(
  practiceId: string,
  client?: DentallyClient
): Promise<SyncResult> {
  const dentallyClient = client ?? (await getDentallyClientForPractice(practiceId));
  const startedAt = new Date();
  const errors: SyncError[] = [];
  const counts = { patients: 0, appointments: 0, invoices: 0, treatments: 0 };

  // --- Patients ---------------------------------------------------------
  await dentallyClient.paginate<DentallyPatientRaw>(
    "/patients",
    "patients",
    {},
    async (patients) => {
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
    }
  );

  // --- Appointments -------------------------------------------------------
  await dentallyClient.paginate<DentallyAppointmentRaw>(
    "/appointments",
    "appointments",
    {},
    async (appointments) => {
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
    }
  );

  // --- Invoices (+ derived Treatments) ------------------------------------
  await dentallyClient.paginate<DentallyInvoiceRaw>(
    "/invoices",
    "invoices",
    {},
    async (invoices) => {
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
          continue; // don't derive treatments off a record we failed to save
        }

        for (const t of normalizeTreatmentsFromInvoice(raw)) {
          try {
            const { dentallyPatientId: tPatientId, ...tData } = t;
            const patientId = await resolvePatientId(practiceId, tPatientId);
            const dentistId = await resolveDentistId(
              practiceId,
              tData.dentallyPractitionerId
            );
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
    }
  );

  return { practiceId, startedAt, finishedAt: new Date(), counts, errors };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

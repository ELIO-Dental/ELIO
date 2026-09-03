/**
 * Flow consult import + financial sync from Dentally-synced core (F1.1–F1.5, B.1–B.2).
 * Lives in @elio/dentally so shell post-sync hooks work on the shell deployment.
 */

import { scopedDb } from "@elio/db";
import { getAccounts, getAppointments, getAllPaymentsForPatient } from "./queries";
import { getFlowSettings } from "./flow-settings-service";
import { mergeConsultFinancialUpdate } from "./flow-financial-merge";

const CONSULT_IMPORT_MONTHS = 12;

export function resolveConsultBookedBy(bookedByName: string | null | undefined): string | null {
  const trimmed = bookedByName?.trim();
  return trimmed || null;
}

export function shouldUpdatePractitionerFromSync(
  consult: { practitionerDentistId: string | null; practitionerEdited: boolean },
  candidatePractitionerDentistId: string | null
): boolean {
  if (!candidatePractitionerDentistId) return false;
  if (consult.practitionerEdited) return false;
  return !consult.practitionerDentistId;
}

export function shouldMarkPractitionerEdited(
  currentPractitionerDentistId: string | null,
  nextPractitionerDentistId: string | null
): boolean {
  return nextPractitionerDentistId !== currentPractitionerDentistId;
}

export interface CosmeticConsultImportResult {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export async function syncConsultFinancialsFromSyncedCore(practiceId: string, consultId: string) {
  const db = scopedDb(practiceId);
  const settings = await getFlowSettings(practiceId);
  const consult = await db.consult.findUnique({
    where: { id: consultId },
    include: { enquiry: true, appointment: true },
  });
  if (!consult) throw new Error("Consult not found");
  if (!consult.enquiry.patientId) {
    throw new Error("Consult's enquiry has no linked patient — link a patient first");
  }

  const patientId = consult.enquiry.patientId;
  const [payments, accounts, futureAppointments, appointmentCount] = await Promise.all([
    getAllPaymentsForPatient(practiceId, patientId),
    getAccounts(practiceId, { patientId, take: 1 }),
    getAppointments(practiceId, { patientId, from: new Date(), take: 50 }),
    db.appointment.count({ where: { practiceId, patientId } }),
  ]);

  const totalPaidPence = payments.reduce((sum, p) => sum + (p.amountPence ?? 0), 0);
  const consultDate = consult.appointment?.startsAt ?? consult.createdAt;
  const hasDeposit = payments.some(
    (p) =>
      (p.amountPence ?? 0) >= settings.depositThresholdPence &&
      p.paidAt != null &&
      p.paidAt >= consultDate
  );

  const account = accounts[0];
  const treatmentBooked = futureAppointments.some((apt) => {
    const reason = (apt.reason ?? "").toLowerCase();
    const state = (apt.dentallyState ?? "").toLowerCase();
    return !reason.includes("consultation") && (state === "pending" || state === "confirmed");
  });

  const patch = mergeConsultFinancialUpdate(
    {
      totalPaidPence: consult.totalPaidPence,
      hasDeposit: consult.hasDeposit,
      treatmentBooked: consult.treatmentBooked,
      quotePence: consult.quotePence,
      quotePenceOverride: consult.quotePenceOverride,
    },
    {
      totalPaidPence,
      hasDeposit,
      treatmentBooked,
      quotePence: account?.plannedPrivateTreatmentValuePence ?? null,
    },
    {
      hasPaymentRows: payments.length > 0,
      hasAppointmentRows: appointmentCount > 0,
      hasAccountRow: Boolean(account),
    }
  );

  if (Object.keys(patch).length === 0) {
    return consult;
  }

  return db.consult.update({ where: { id: consultId }, data: patch });
}

export async function importCosmeticConsultsFromDentally(
  practiceId: string
): Promise<CosmeticConsultImportResult> {
  const db = scopedDb(practiceId);
  const settings = await getFlowSettings(practiceId);
  const since = new Date();
  since.setMonth(since.getMonth() - CONSULT_IMPORT_MONTHS);

  const appointments = await db.appointment.findMany({
    where: {
      practiceId,
      patientId: { not: null },
      startsAt: { gte: since },
      reason: { contains: settings.cosmeticConsultReason, mode: "insensitive" },
    },
    orderBy: { startsAt: "desc" },
  });

  const latestByPatient = new Map<string, (typeof appointments)[number]>();
  for (const apt of appointments) {
    if (!apt.patientId) continue;
    if (!latestByPatient.has(apt.patientId)) latestByPatient.set(apt.patientId, apt);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const apt of latestByPatient.values()) {
    try {
      const patientId = apt.patientId!;
      const derivedAttended =
        apt.dentallyState === "Completed" || apt.dentallyState === "In surgery" ? true : null;

      let practitionerDentistId: string | null = null;
      if (apt.practitionerId) {
        const dentist = await db.dentist.findFirst({
          where: { practiceId, dentallyPractitionerId: apt.practitionerId },
        });
        practitionerDentistId = dentist?.id ?? null;
      }

      const bookedBy = resolveConsultBookedBy(apt.bookedByName);

      const existing = await db.consult.findFirst({
        where: { practiceId, enquiry: { patientId } },
        include: { appointment: true },
        orderBy: { createdAt: "desc" },
      });

      if (!existing) {
        let enquiry = await db.enquiry.findFirst({ where: { practiceId, patientId } });
        if (!enquiry) {
          enquiry = await db.enquiry.create({
            data: { practiceId, patientId, source: "dentally" },
          });
        }

        const consult = await db.consult.create({
          data: {
            practiceId,
            enquiryId: enquiry.id,
            appointmentId: apt.id,
            attended: derivedAttended,
            practitionerDentistId,
            bookedBy,
          },
        });
        await syncConsultFinancialsFromSyncedCore(practiceId, consult.id);
        created++;
        continue;
      }

      const existingStart = existing.appointment?.startsAt;
      const shouldLinkAppointment =
        !existing.appointmentId ||
        (apt.startsAt && (!existingStart || apt.startsAt > existingStart));

      const patch: {
        appointmentId?: string;
        attended?: boolean | null;
        practitionerDentistId?: string | null;
        bookedBy?: string | null;
      } = {};

      if (shouldLinkAppointment) patch.appointmentId = apt.id;
      if (existing.attended == null && derivedAttended != null) patch.attended = derivedAttended;
      if (shouldUpdatePractitionerFromSync(existing, practitionerDentistId)) {
        patch.practitionerDentistId = practitionerDentistId;
      }
      if (bookedBy) patch.bookedBy = bookedBy;

      if (Object.keys(patch).length > 0) {
        await db.consult.update({ where: { id: existing.id }, data: patch });
        updated++;
      } else {
        skipped++;
      }

      await syncConsultFinancialsFromSyncedCore(practiceId, existing.id);
    } catch {
      errors++;
    }
  }

  return { scanned: latestByPatient.size, created, updated, skipped, errors };
}

export interface SyncAllConsultFinancialsResult {
  total: number;
  updated: number;
  errors: number;
}

/** Payment-only sync — refresh financial fields on every existing consult (legacy manual-sync). */
export async function syncAllConsultFinancialsFromSyncedCore(
  practiceId: string
): Promise<SyncAllConsultFinancialsResult> {
  const db = scopedDb(practiceId);
  const consults = await db.consult.findMany({
    where: { practiceId },
    select: { id: true },
  });

  let updated = 0;
  let errors = 0;
  for (const consult of consults) {
    try {
      await syncConsultFinancialsFromSyncedCore(practiceId, consult.id);
      updated++;
    } catch {
      errors++;
    }
  }

  return { total: consults.length, updated, errors };
}

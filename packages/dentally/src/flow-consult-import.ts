/**
 * Flow consult import + financial sync from Dentally-synced core (F1.1–F1.5, B.1–B.2).
 * Lives in @elio/dentally so shell post-sync hooks work on the shell deployment.
 */

import { scopedDb } from "@elio/db";
import { getAccounts, getAppointments, getPayments } from "./queries";

const DEPOSIT_THRESHOLD_PENCE = 5000;
const COSMETIC_CONSULT_REASON = "cosmetic consultation";
const CONSULT_IMPORT_MONTHS = 12;

export interface CosmeticConsultImportResult {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export async function syncConsultFinancialsFromSyncedCore(practiceId: string, consultId: string) {
  const db = scopedDb(practiceId);
  const consult = await db.consult.findUnique({
    where: { id: consultId },
    include: { enquiry: true, appointment: true },
  });
  if (!consult) throw new Error("Consult not found");
  if (!consult.enquiry.patientId) {
    throw new Error("Consult's enquiry has no linked patient — link a patient first");
  }

  const patientId = consult.enquiry.patientId;
  const [payments, accounts, futureAppointments] = await Promise.all([
    getPayments(practiceId, { patientId, take: 200 }),
    getAccounts(practiceId, { patientId, take: 1 }),
    getAppointments(practiceId, { patientId, from: new Date(), take: 50 }),
  ]);

  const totalPaidPence = payments.reduce((sum, p) => sum + (p.amountPence ?? 0), 0);
  const consultDate = consult.appointment?.startsAt ?? consult.createdAt;
  const hasDeposit = payments.some(
    (p) =>
      (p.amountPence ?? 0) >= DEPOSIT_THRESHOLD_PENCE &&
      p.paidAt != null &&
      p.paidAt >= consultDate
  );

  const account = accounts[0];
  const treatmentBooked = futureAppointments.some((apt) => {
    const reason = (apt.reason ?? "").toLowerCase();
    const state = (apt.dentallyState ?? "").toLowerCase();
    return !reason.includes("consultation") && (state === "pending" || state === "confirmed");
  });

  const data: {
    totalPaidPence: number;
    hasDeposit: boolean;
    treatmentBooked: boolean;
    quotePence?: number | null;
  } = { totalPaidPence, hasDeposit, treatmentBooked };

  if (consult.quotePenceOverride == null && account) {
    data.quotePence = account.plannedPrivateTreatmentValuePence;
  }

  return db.consult.update({ where: { id: consultId }, data });
}

export async function importCosmeticConsultsFromDentally(
  practiceId: string
): Promise<CosmeticConsultImportResult> {
  const db = scopedDb(practiceId);
  const since = new Date();
  since.setMonth(since.getMonth() - CONSULT_IMPORT_MONTHS);

  const appointments = await db.appointment.findMany({
    where: {
      practiceId,
      patientId: { not: null },
      startsAt: { gte: since },
      reason: { contains: COSMETIC_CONSULT_REASON, mode: "insensitive" },
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

      const bookedBy = apt.bookedByName?.trim() || null;

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
      if (!existing.practitionerDentistId && practitionerDentistId) {
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

/**
 * Plans Dentally patient sync (P1.1).
 *
 * Port of ElioPlans/src/lib/dentally-sync.ts — imports patients whose Dentally
 * payment plan maps to an ELIO PlanModel via DentallyPlanMapping.
 */

import { scopedDb } from "@elio/db";
import type { DentallyClient } from "./client";
import { getDentallyClientForPractice } from "./resolve-api-key";
import {
  findExistingPatient,
  isPlaceholderDentallyId,
  normalizeEmail,
} from "./patient-matching";
import { dedupePatientsByDentallyId, matchPaymentPlanIds } from "./plans-sync-helpers";
import type { SyncPatientShape } from "./plans-sync-helpers";
import { PlansDentallySyncConfigError } from "./plans-sync-errors";
import { fetchLiveDentallyPaymentPlansWithClient } from "./plans-payment-plans";
import { fetchDentallyPatientWithClient } from "./plans-patient-search-client";
import type { DentallyPatientRaw } from "./types";

export { matchPaymentPlanIds, dedupePatientsByDentallyId } from "./plans-sync-helpers";
export { PlansDentallySyncConfigError } from "./plans-sync-errors";

export type PlansDentallySyncResult = {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
  plansMatched: number;
  syncedPlanIds: number[];
  errors: string[];
  noEmailPatients: string[];
  /** Live enrolments ended because patient no longer on a mapped Dentally plan. */
  offPlanEnded: number;
};

type SyncPatient = SyncPatientShape;

type PlanMapping = {
  dentallyPlanName: string;
  planModelId: string;
};

function mapSyncPatient(raw: DentallyPatientRaw): SyncPatient {
  return {
    dentallyId: String(raw.id),
    firstName: raw.first_name ?? "",
    lastName: raw.last_name ?? "",
    email: raw.email_address ?? "",
    phone: raw.home_phone ?? null,
    mobile: raw.mobile_phone ?? null,
    paymentPlanId: raw.payment_plan_id != null ? Number(raw.payment_plan_id) : null,
    dateOfBirth: raw.date_of_birth ? new Date(raw.date_of_birth) : null,
  };
}

function mappingNameEquals(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function fetchPatientsByPlanId(client: DentallyClient, paymentPlanId: number): Promise<SyncPatient[]> {
  const patients: SyncPatient[] = [];
  await client.paginate<DentallyPatientRaw>(
    "/patients",
    "patients",
    { payment_plan_id: paymentPlanId },
    (page) => {
      for (const raw of page) {
        patients.push(mapSyncPatient(raw));
      }
    }
  );
  return patients;
}

/**
 * Upsert PlanPatient + live enrolment from Dentally plan mapping.
 * Preserves PAUSED; never demotes ACTIVE→PENDING from mandate flicker;
 * reopens CANCELLED when patient reappears on a mapped plan.
 */
export async function syncEnrolmentForPatient(
  practiceId: string,
  patientId: string,
  mapping: PlanMapping
): Promise<boolean> {
  const db = scopedDb(practiceId);

  let planPatient = await db.planPatient.findFirst({ where: { patientId } });

  if (planPatient?.status === "PAUSED") {
    let changed = false;
    if (planPatient.planModelId !== mapping.planModelId) {
      await db.planPatient.update({
        where: { id: planPatient.id },
        data: { planModelId: mapping.planModelId },
      });
      changed = true;
    }
    const pausedEnrolment = await db.patientPlanEnrolment.findFirst({
      where: { planPatientId: planPatient.id, status: "PAUSED" },
      orderBy: { createdAt: "asc" },
    });
    if (pausedEnrolment && pausedEnrolment.planId !== mapping.planModelId) {
      await db.patientPlanEnrolment.update({
        where: { id: pausedEnrolment.id },
        data: { planId: mapping.planModelId },
      });
      changed = true;
    }
    return changed;
  }

  if (planPatient?.status === "CANCELLED") {
    await db.planPatient.update({
      where: { id: planPatient.id },
      data: { status: "INVITED", planModelId: mapping.planModelId },
    });
    planPatient = { ...planPatient, status: "INVITED", planModelId: mapping.planModelId };
  }

  const mandateCount = planPatient
    ? await db.planMandate.count({ where: { planPatientId: planPatient.id, status: "ACTIVE" } })
    : 0;

  if (!planPatient) {
    planPatient = await db.planPatient.create({
      data: {
        practiceId,
        patientId,
        status: "INVITED",
        planModelId: mapping.planModelId,
      },
    });
    await db.patientPlanEnrolment.create({
      data: {
        practiceId,
        planPatientId: planPatient.id,
        planId: mapping.planModelId,
        status: mandateCount > 0 ? "ACTIVE" : "PENDING",
        startDate: mandateCount > 0 ? new Date() : null,
      },
    });
    return true;
  }

  let changed = false;

  if (planPatient.planModelId !== mapping.planModelId) {
    await db.planPatient.update({
      where: { id: planPatient.id },
      data: { planModelId: mapping.planModelId },
    });
    changed = true;
  }

  const liveEnrolment = await db.patientPlanEnrolment.findFirst({
    where: {
      planPatientId: planPatient.id,
      status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!liveEnrolment) {
    await db.patientPlanEnrolment.create({
      data: {
        practiceId,
        planPatientId: planPatient.id,
        planId: mapping.planModelId,
        status: mandateCount > 0 ? "ACTIVE" : "PENDING",
        startDate: mandateCount > 0 ? new Date() : null,
      },
    });
    changed = true;
  } else if (liveEnrolment.status === "PAUSED") {
    if (liveEnrolment.planId !== mapping.planModelId) {
      await db.patientPlanEnrolment.update({
        where: { id: liveEnrolment.id },
        data: { planId: mapping.planModelId },
      });
      changed = true;
    }
  } else if (liveEnrolment.status === "ACTIVE") {
    // Never demote ACTIVE → PENDING from sync (mandate API flicker).
    if (liveEnrolment.planId !== mapping.planModelId) {
      await db.patientPlanEnrolment.update({
        where: { id: liveEnrolment.id },
        data: { planId: mapping.planModelId },
      });
      changed = true;
    }
  } else {
    // PENDING — may promote to ACTIVE when mandate appears; update plan id.
    const nextStatus = mandateCount > 0 ? ("ACTIVE" as const) : ("PENDING" as const);
    if (liveEnrolment.planId !== mapping.planModelId || liveEnrolment.status !== nextStatus) {
      await db.patientPlanEnrolment.update({
        where: { id: liveEnrolment.id },
        data: {
          planId: mapping.planModelId,
          status: nextStatus,
          startDate:
            nextStatus === "ACTIVE" ? (liveEnrolment.startDate ?? new Date()) : liveEnrolment.startDate,
        },
      });
      changed = true;
    }
  }

  if (
    (planPatient.status === "INVITED" || planPatient.status === "SIGNED") &&
    mandateCount > 0
  ) {
    await db.planPatient.update({ where: { id: planPatient.id }, data: { status: "ACTIVE" } });
    changed = true;
  }

  return changed;
}

/** End PENDING/ACTIVE enrolments for Dentally-linked patients no longer on a mapped plan. */
export async function endOffPlanEnrolments(
  practiceId: string,
  syncedDentallyIds: Set<string>
): Promise<number> {
  const db = scopedDb(practiceId);
  const live = await db.patientPlanEnrolment.findMany({
    where: {
      practiceId,
      status: { in: ["PENDING", "ACTIVE"] },
    },
    include: {
      planPatient: {
        include: { patient: { select: { dentallyId: true } } },
      },
    },
  });

  let ended = 0;
  const now = new Date();
  for (const enrolment of live) {
    const dentallyId = enrolment.planPatient.patient.dentallyId;
    if (isPlaceholderDentallyId(dentallyId)) continue;
    if (syncedDentallyIds.has(String(dentallyId))) continue;
    await db.patientPlanEnrolment.update({
      where: { id: enrolment.id },
      data: { status: "CANCELLED", endDate: now },
    });
    ended++;
  }
  return ended;
}

/**
 * Import/refresh every Dentally patient whose payment plan maps to an ELIO plan.
 * Idempotent: re-running matches existing records rather than duplicating them.
 */
export async function runPlansDentallySync(practiceId: string): Promise<PlansDentallySyncResult> {
  const db = scopedDb(practiceId);
  const client = await getDentallyClientForPractice(practiceId);

  const planMappings = await db.dentallyPlanMapping.findMany({
    select: { dentallyPlanName: true, planModelId: true },
  });

  if (planMappings.length === 0) {
    throw new PlansDentallySyncConfigError(
      "No plan mappings configured. Map your Dentally payment plans to ELIO plans before syncing."
    );
  }

  const dentallyPaymentPlans = await fetchLiveDentallyPaymentPlansWithClient(client);
  const dentallyPlanIdToName = new Map<number, string>();
  for (const dp of dentallyPaymentPlans) {
    dentallyPlanIdToName.set(dp.id, dp.name);
  }

  const matchingDentallyPlanIds = matchPaymentPlanIds(planMappings, dentallyPaymentPlans);

  if (matchingDentallyPlanIds.length === 0) {
    throw new PlansDentallySyncConfigError(
      "No matching Dentally plans found. Check that your plan mapping names match the Dentally payment plan names.",
      {
        mappedNames: planMappings.map((m) => m.dentallyPlanName),
        dentallyNames: dentallyPaymentPlans.map((p) => p.name),
      }
    );
  }

  let dentallyPatients: SyncPatient[] = [];
  for (const id of matchingDentallyPlanIds) {
    const patients = await fetchPatientsByPlanId(client, id);
    dentallyPatients.push(...patients);
  }
  dentallyPatients = dedupePatientsByDentallyId(dentallyPatients);
  const syncedDentallyIds = new Set(dentallyPatients.map((p) => p.dentallyId));

  const existingPatients = await db.patient.findMany({
    select: {
      id: true,
      dentallyId: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
    },
  });

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const noEmailPatients: string[] = [];

  for (const dp of dentallyPatients) {
    let assignedMapping: PlanMapping | null = null;
    if (dp.paymentPlanId) {
      const dentallyPlanName = dentallyPlanIdToName.get(dp.paymentPlanId);
      if (dentallyPlanName) {
        assignedMapping =
          planMappings.find((m) => mappingNameEquals(m.dentallyPlanName, dentallyPlanName)) ?? null;
      }
    }

    const { match: existing, matchedBy } = findExistingPatient(
      { dentallyId: dp.dentallyId, email: dp.email },
      existingPatients
    );

    if (existing) {
      try {
        let patientUpdated = false;
        const contactUpdates: {
          dentallyId?: string;
          email?: string | null;
          phone?: string | null;
          firstName?: string | null;
          lastName?: string | null;
          dateOfBirth?: Date | null;
        } = {};

        if (matchedBy === "email" && dp.dentallyId && isPlaceholderDentallyId(existing.dentallyId)) {
          contactUpdates.dentallyId = dp.dentallyId;
        }

        const incomingEmail = normalizeEmail(dp.email);
        if (incomingEmail && incomingEmail !== normalizeEmail(existing.email)) {
          const emailOwner = await db.patient.findFirst({
            where: { email: incomingEmail, NOT: { id: existing.id } },
          });
          if (emailOwner) {
            errors.push(
              `${dp.firstName} ${dp.lastName}: email ${incomingEmail} already belongs to another patient (${emailOwner.firstName} ${emailOwner.lastName}). Consider merging these records.`
            );
          } else {
            contactUpdates.email = incomingEmail;
          }
        }

        const dentallyPhone = dp.mobile || dp.phone || null;
        if (dentallyPhone && dentallyPhone !== existing.phone) {
          contactUpdates.phone = dentallyPhone;
        }
        if (dp.firstName && dp.firstName !== existing.firstName) {
          contactUpdates.firstName = dp.firstName;
        }
        if (dp.lastName && dp.lastName !== existing.lastName) {
          contactUpdates.lastName = dp.lastName;
        }
        if (dp.dateOfBirth && dp.dateOfBirth.getTime() !== existing.dateOfBirth?.getTime()) {
          contactUpdates.dateOfBirth = dp.dateOfBirth;
        }

        if (Object.keys(contactUpdates).length > 0) {
          await db.patient.update({ where: { id: existing.id }, data: contactUpdates });
          if (contactUpdates.dentallyId) {
            existing.dentallyId = contactUpdates.dentallyId;
          }
          patientUpdated = true;
        }

        if (assignedMapping) {
          const enrolmentChanged = await syncEnrolmentForPatient(practiceId, existing.id, assignedMapping);
          if (enrolmentChanged) patientUpdated = true;
        }

        if (patientUpdated) {
          updated++;
        } else {
          skipped++;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${dp.firstName} ${dp.lastName} (update): ${message}`);
      }
      continue;
    }

    try {
      const patient = await db.patient.create({
        data: {
          practiceId,
          dentallyId: dp.dentallyId,
          firstName: dp.firstName || null,
          lastName: dp.lastName || null,
          email: normalizeEmail(dp.email),
          phone: dp.mobile || dp.phone || null,
          dateOfBirth: dp.dateOfBirth,
        },
      });

      if (assignedMapping) {
        const planPatient = await db.planPatient.create({
          data: {
            practiceId,
            patientId: patient.id,
            status: "INVITED",
            planModelId: assignedMapping.planModelId,
          },
        });
        await db.patientPlanEnrolment.create({
          data: {
            practiceId,
            planPatientId: planPatient.id,
            planId: assignedMapping.planModelId,
            status: "PENDING",
          },
        });
      }

      imported++;
      if (!dp.email) {
        noEmailPatients.push(`${dp.firstName} ${dp.lastName}`);
      }

      existingPatients.push({
        id: patient.id,
        dentallyId: dp.dentallyId,
        email: normalizeEmail(dp.email),
        phone: dp.mobile || dp.phone || null,
        firstName: dp.firstName || null,
        lastName: dp.lastName || null,
        dateOfBirth: dp.dateOfBirth,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${dp.firstName} ${dp.lastName}: ${message}`);
    }
  }

  let offPlanEnded = 0;
  try {
    offPlanEnded = await endOffPlanEnrolments(practiceId, syncedDentallyIds);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    errors.push(`Off-plan cleanup: ${message}`);
  }

  return {
    imported,
    updated,
    skipped,
    total: dentallyPatients.length,
    plansMatched: matchingDentallyPlanIds.length,
    syncedPlanIds: matchingDentallyPlanIds,
    errors,
    noEmailPatients,
    offPlanEnded,
  };
}

export type PlansDentallyReassignResult = {
  total: number;
  assigned: number;
  corrected: number;
  skipped: number;
  details: string[];
};

/**
 * For every patient linked to a real Dentally id, fetch their current payment plan and
 * ensure the correct ELIO plan mapping is applied (P1.9). Uses mandate-aware
 * enrolment sync — never marks ACTIVE without a live mandate; preserves PAUSED.
 */
export async function runPlansDentallyReassign(practiceId: string): Promise<PlansDentallyReassignResult> {
  const db = scopedDb(practiceId);
  const client = await getDentallyClientForPractice(practiceId);

  const planMappings = await db.dentallyPlanMapping.findMany({
    select: { dentallyPlanName: true, planModelId: true },
  });
  if (planMappings.length === 0) {
    throw new PlansDentallySyncConfigError(
      "No plan mappings configured. Map your Dentally payment plans to ELIO plans before reassigning."
    );
  }

  const dentallyPaymentPlans = await fetchLiveDentallyPaymentPlansWithClient(client);
  const planIdToName = new Map(dentallyPaymentPlans.map((p) => [p.id, p.name]));

  const allPatients = await db.patient.findMany({
    select: { id: true, firstName: true, lastName: true, dentallyId: true },
  });
  const linkedPatients = allPatients.filter((p) => !isPlaceholderDentallyId(p.dentallyId));

  let assigned = 0;
  let corrected = 0;
  let skipped = 0;
  const details: string[] = [];

  for (const patient of linkedPatients) {
    const label = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || patient.dentallyId;
    try {
      const live = await fetchDentallyPatientWithClient(client, patient.dentallyId!);
      if (!live?.paymentPlanId) {
        details.push(`${label}: no payment plan in Dentally`);
        skipped++;
        continue;
      }

      const planName = planIdToName.get(live.paymentPlanId);
      if (!planName) {
        details.push(`${label}: unknown Dentally plan ID ${live.paymentPlanId}`);
        skipped++;
        continue;
      }

      const mapping = planMappings.find((m) => mappingNameEquals(m.dentallyPlanName, planName));
      if (!mapping) {
        details.push(`${label}: no mapping for "${planName}"`);
        skipped++;
        continue;
      }

      const hadLiveEnrolment = await db.patientPlanEnrolment.findFirst({
        where: {
          planPatient: { patientId: patient.id },
          status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
        },
      });

      const changed = await syncEnrolmentForPatient(practiceId, patient.id, mapping);
      if (!changed) {
        skipped++;
        continue;
      }

      if (!hadLiveEnrolment) {
        details.push(`${label}: assigned to ${planName}`);
        assigned++;
      } else {
        details.push(`${label}: corrected to ${planName}`);
        corrected++;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      details.push(`${label}: error - ${message}`);
      skipped++;
    }
  }

  return { total: linkedPatients.length, assigned, corrected, skipped, details };
}

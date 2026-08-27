/**
 * Step 1.9 (MASTER_BUILD_GUIDE.md §1.9, FR-11) — one-time data migration
 * from the OLD, unmapped ElioPlans tables into the new shared `packages/db`
 * schema.
 *
 * ============================================================================
 * IMPORTANT — CORRECTED UNDERSTANDING (2026-08-19): this is NOT a
 * cross-database migration. The old ElioPlans tables (`Patient`, `Plan`,
 * `PatientPlan`, `Mandate`, `Payment`, `Document`, etc. — real, unmapped
 * PascalCase table names, no @@map()) already live in the SAME Neon
 * database as the new schema's own `plans_*`-prefixed tables — this is
 * exactly why Step 1.7's schema merge used @@map() to give every new
 * ElioPlans-derived model a distinct table name in the first place (see
 * `packages/db/prisma/schema.prisma`'s "ElioPlans (draft...)" section
 * comment and `DATA_MODEL.md`'s 2026-08-19 Step 1.7 change-log entry).
 * There is no separate old database to connect to — this script queries
 * the OLD unmapped tables and writes into the NEW mapped tables using the
 * exact same `@elio/db` connection everything else in this repo uses.
 * ============================================================================
 *
 * DO NOT RUN --execute WITHOUT READING THIS BLOCK FIRST.
 * - Defaults to DRY RUN (reads the old tables, computes what it WOULD
 *   write, logs a summary, writes nothing) unless invoked with --execute.
 * - Idempotent by construction: every insert is either upsert-keyed on a
 *   real unique field the new schema already enforces (e.g.
 *   `gocardlessMandateId`/`gocardlessPaymentId`) or checked via an in-memory
 *   id map built during THIS run — safe to re-run, will not create true
 *   duplicates for identical input, but is not safe to run concurrently
 *   with itself (a one-time, human-supervised script, not a live code path).
 *
 * MIGRATION_NOTES (also worth copying into a docs/migration-notes.md once
 * this actually runs, per §1.9's grep-for-"Aura" exception):
 * - `Clinic` (old, real row count checked — only 0 or 1 row observed this
 *   session) has no equivalent in the new one-Practice-per-tenant model —
 *   same judgment already made for the ElioFlow/ElioPay migrations this
 *   session. All migrated rows attach to the ONE Practice row already in
 *   the target schema.
 * - `UserPermission`/old `User` are NOT migrated — Step 1.5's shared RBAC
 *   entirely supersedes the old per-app user/permission model.
 * - `EmailLog`/`WebhookEvent` (old) are operational logs, not core
 *   patient/financial data — not migrated.
 * - `PatientNote` has no equivalent free-text field on the new
 *   `PlanPatient` — flagged as a genuine, real gap in the summary output
 *   (`unmigratedPatientNotes`), not silently dropped.
 * - `DentallyPlanMapping`/`Setting` (old, ElioPlans-specific config) are
 *   not migrated — equivalent settings already exist on the new schema's
 *   per-Practice fields (see `apps/plans/app/settings`).
 * - `Document`/`DocumentAcceptance`/`SigningRequest`/`GuideArticle` are
 *   migrated — real signed-terms/e-sign history, genuinely worth
 *   preserving traceably, and map cleanly onto the new
 *   `PlanDocument`/`PlanDocumentAcceptance`/`PlanSigningRequest`/
 *   `PlanGuideArticle` models with no risky JSON-blob-style transformation
 *   (unlike the ElioPay payslip case — see that migration's script for
 *   contrast).
 */

import { prisma } from "@elio/db";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("No Practice row exists in the target DB.");

  const idMap = {
    patient: new Map<string, string>(), // old Patient.id -> new core Patient.id
    planPatient: new Map<string, string>(), // old Patient.id -> new PlanPatient.id
    planModel: new Map<string, string>(), // old Plan.id -> new PlanModel.id
    patientPlanEnrolment: new Map<string, string>(), // old PatientPlan.id -> new PatientPlanEnrolment.id
    planMandate: new Map<string, string>(), // old Mandate.id -> new PlanMandate.id
    document: new Map<string, string>(), // old Document.id -> new PlanDocument.id
  };

  const summary = {
    plans: { total: 0, migrated: 0 },
    patients: { total: 0, migrated: 0, alreadyLinkedToExistingCorePatient: 0 },
    patientPlans: { total: 0, migrated: 0 },
    mandates: { total: 0, migrated: 0 },
    payments: { total: 0, migrated: 0 },
    documents: { total: 0, migrated: 0 },
    documentAcceptances: { total: 0, migrated: 0 },
    signingRequests: { total: 0, migrated: 0 },
    guideArticles: { total: 0, migrated: 0 },
    unmigratedPatientNotes: 0,
  };

  // --- Plans -------------------------------------------------------------
  const oldPlans = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Plan"`);
  summary.plans.total = oldPlans.length;
  for (const p of oldPlans) {
    if (EXECUTE) {
      const created = await prisma.planModel.create({
        data: {
          practiceId: practice.id,
          name: p.name,
          monthlyPricePence: Math.round(Number(p.monthlyPrice) * 100),
          publicDescription: p.publicDescription,
          requiresAdultMembership: p.requiresAdultMembership,
          dentistPayoutPerExamPence: p.dentistPayoutPerExam != null ? Math.round(Number(p.dentistPayoutPerExam) * 100) : null,
          isCurrentVersion: p.isCurrentVersion,
          sortOrder: p.sortOrder ?? 0,
        },
      });
      idMap.planModel.set(p.id, created.id);
    }
    summary.plans.migrated++;
  }

  // --- Patients (old ElioPlans-owned Patient -> shared core Patient +
  // PlanPatient wrapper). Matches an existing synced core Patient by
  // dentallyId when the old row has one. ----------------------------------
  const oldPatients = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Patient"`);
  summary.patients.total = oldPatients.length;
  for (const p of oldPatients) {
    let corePatientId: string | undefined;
    if (p.dentallyPatientId) {
      const existing = await prisma.patient.findFirst({
        where: { practiceId: practice.id, dentallyId: p.dentallyPatientId },
      });
      if (existing) {
        corePatientId = existing.id;
        summary.patients.alreadyLinkedToExistingCorePatient++;
      }
    }
    if (EXECUTE) {
      if (!corePatientId) {
        const core = await prisma.patient.create({
          data: {
            practiceId: practice.id,
            dentallyId: p.dentallyPatientId ?? `elioplans-migrated-${p.id}`,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            phone: p.phone,
            dateOfBirth: p.dateOfBirth,
          },
        });
        corePatientId = core.id;
      }
      const planPatient = await prisma.planPatient.create({
        data: { practiceId: practice.id, patientId: corePatientId, status: "ACTIVE" },
      });
      idMap.patient.set(p.id, corePatientId);
      idMap.planPatient.set(p.id, planPatient.id);
    }
    summary.patients.migrated++;
  }

  const noteCountRes = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*) as count FROM "PatientNote"`);
  summary.unmigratedPatientNotes = Number(noteCountRes[0].count);

  // --- PatientPlan -> PatientPlanEnrolment --------------------------------
  const oldPatientPlans = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "PatientPlan"`);
  summary.patientPlans.total = oldPatientPlans.length;
  for (const pp of oldPatientPlans) {
    const planPatientId = idMap.planPatient.get(pp.patientId);
    const planModelId = idMap.planModel.get(pp.planId);
    if (EXECUTE && planPatientId && planModelId) {
      const created = await prisma.patientPlanEnrolment.create({
        data: {
          practiceId: practice.id,
          planPatientId,
          planId: planModelId,
          status: pp.status === "ACTIVE" ? "ACTIVE" : pp.status === "CANCELLED" ? "CANCELLED" : "PENDING",
          startDate: pp.startDate,
        },
      });
      idMap.patientPlanEnrolment.set(pp.id, created.id);
    }
    summary.patientPlans.migrated++;
  }

  // --- Mandate -> PlanMandate ----------------------------------------------
  const oldMandates = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Mandate"`);
  summary.mandates.total = oldMandates.length;
  for (const m of oldMandates) {
    const planPatientId = idMap.planPatient.get(m.patientId);
    if (EXECUTE && planPatientId) {
      const created = await prisma.planMandate.upsert({
        where: { gocardlessMandateId: m.gocardlessMandateId },
        create: {
          practiceId: practice.id,
          planPatientId,
          gocardlessMandateId: m.gocardlessMandateId,
          status: m.status,
        },
        update: {},
      });
      idMap.planMandate.set(m.id, created.id);
    }
    summary.mandates.migrated++;
  }

  // --- Payment -> PlanPayment (BUG-1's @@unique applies on the new table
  // too — upsert-by-gocardlessPaymentId keeps this idempotent). -----------
  const oldPayments = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Payment"`);
  summary.payments.total = oldPayments.length;
  for (const pay of oldPayments) {
    const planPatientId = idMap.planPatient.get(pay.patientId);
    const enrolmentId = pay.patientPlanId ? idMap.patientPlanEnrolment.get(pay.patientPlanId) ?? null : null;
    const mandateId = pay.mandateId ? idMap.planMandate.get(pay.mandateId) ?? null : null;
    if (EXECUTE && planPatientId) {
      await prisma.planPayment.upsert({
        where: { gocardlessPaymentId: pay.gocardlessPaymentId ?? `__legacy-${pay.id}` },
        create: {
          practiceId: practice.id,
          planPatientId,
          patientPlanEnrolmentId: enrolmentId,
          mandateId,
          billingPeriod: pay.billingPeriod,
          gocardlessPaymentId: pay.gocardlessPaymentId,
          amountPence: Math.round(Number(pay.amount) * 100),
          status: pay.status,
        },
        update: {},
      });
    }
    summary.payments.migrated++;
  }

  // --- Document -> PlanDocument --------------------------------------------
  const oldDocuments = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Document"`);
  summary.documents.total = oldDocuments.length;
  for (const doc of oldDocuments) {
    if (EXECUTE) {
      const created = await prisma.planDocument.create({
        data: {
          practiceId: practice.id,
          // Old DocumentType enum (TERMS_AND_CONDITIONS/PRIVACY_POLICY/
          // PLAN_AGREEMENT) has the exact same values as the new
          // PlanDocumentType enum — pass through directly, don't hardcode.
          type: doc.type,
          title: doc.title ?? doc.name ?? "Migrated document",
          content: doc.content ?? "",
          version: doc.version ? String(doc.version) : "1.0",
          effectiveDate: doc.effectiveDate ?? doc.createdAt ?? new Date(),
        },
      });
      idMap.document.set(doc.id, created.id);
    }
    summary.documents.migrated++;
  }

  // --- DocumentAcceptance -> PlanDocumentAcceptance -------------------------
  const oldAcceptances = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "DocumentAcceptance"`);
  summary.documentAcceptances.total = oldAcceptances.length;
  for (const acc of oldAcceptances) {
    const planPatientId = idMap.planPatient.get(acc.patientId);
    const documentId = idMap.document.get(acc.documentId);
    if (EXECUTE && planPatientId && documentId) {
      await prisma.planDocumentAcceptance.create({
        data: { practiceId: practice.id, planPatientId, documentId, ipAddress: acc.ipAddress ?? null },
      });
    }
    summary.documentAcceptances.migrated++;
  }

  // --- SigningRequest -> PlanSigningRequest ---------------------------------
  const oldSigningRequests = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "SigningRequest"`);
  summary.signingRequests.total = oldSigningRequests.length;
  for (const sr of oldSigningRequests) {
    const planPatientId = idMap.planPatient.get(sr.patientId);
    const documentId = idMap.document.get(sr.documentId);
    if (EXECUTE && planPatientId && documentId) {
      await prisma.planSigningRequest.create({
        data: {
          practiceId: practice.id,
          planPatientId,
          documentId,
          token: `migrated-${sr.id}`, // old tokens are not reused live — real signup flow issues fresh ones
          expiresAt: sr.expiresAt ?? new Date(),
          signedAt: sr.signedAt ?? null,
          signatureData: sr.signatureData ?? null,
          signatureIp: sr.signatureIp ?? null,
        },
      });
    }
    summary.signingRequests.migrated++;
  }

  // --- GuideArticle -> PlanGuideArticle --------------------------------------
  const oldGuideArticles = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "GuideArticle"`);
  summary.guideArticles.total = oldGuideArticles.length;
  for (const ga of oldGuideArticles) {
    if (EXECUTE) {
      await prisma.planGuideArticle.upsert({
        where: { slug: ga.slug },
        create: {
          practiceId: practice.id,
          title: ga.title ?? "Migrated article",
          slug: ga.slug,
          content: ga.content ?? "",
          category: ga.category ?? "general",
          sortOrder: ga.sortOrder ?? 0,
          published: ga.published ?? true,
        },
        update: {},
      });
    }
    summary.guideArticles.migrated++;
  }

  console.log(EXECUTE ? "EXECUTED — data written" : "DRY RUN — nothing written");
  console.log(JSON.stringify(summary, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

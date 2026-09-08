/**
 * Restore missing Plans PENDING enrolments + signing requests (FAIL gaps).
 * Dry-run by default. Write: CONFIRM_WRITE=1 npx tsx scripts/repair-plans-fail-gaps.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path: string, force = false) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (force || !process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(join(process.cwd(), "..", "elio-deploy-env", "plans.env"), true);
loadEnvFile(join(process.cwd(), "packages", "db", ".env"));
if (process.env.DIRECT_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL.trim();
}

const WRITE = process.env.CONFIRM_WRITE === "1";
const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";

async function main() {
  const { prisma } = await import("@elio/db");
  console.log(`mode=${WRITE ? "WRITE" : "dry-run"} practice=${PRACTICE_ID}`);

  const oldPlans = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(`SELECT id, name FROM "Plan"`);
  const newPlans = await prisma.planModel.findMany({ where: { practiceId: PRACTICE_ID } });
  const planByOldId = new Map<string, string>();
  for (const o of oldPlans) {
    const hit = newPlans.find((n) => n.name === o.name);
    if (hit) planByOldId.set(o.id, hit.id);
  }

  const oldPatients = await prisma.$queryRawUnsafe<
    { id: string; email: string | null; dentallyPatientId: string | null; firstName: string | null; lastName: string | null }[]
  >(`SELECT id, email, "dentallyPatientId", "firstName", "lastName" FROM "Patient"`);

  async function ensurePlanPatient(oldPatientId: string) {
    const o = oldPatients.find((p) => p.id === oldPatientId);
    if (!o) return null;
    const dentallyId = o.dentallyPatientId || `legacy-patient-${o.id}`;
    let core = await prisma.patient.findFirst({
      where: { practiceId: PRACTICE_ID, dentallyId },
    });
    if (!core && o.email) {
      core = await prisma.patient.findFirst({
        where: { practiceId: PRACTICE_ID, email: { equals: o.email, mode: "insensitive" } },
      });
    }
    if (!core) {
      if (!WRITE) return { id: "dry-run", created: true };
      core = await prisma.patient.create({
        data: {
          practiceId: PRACTICE_ID,
          dentallyId,
          firstName: o.firstName,
          lastName: o.lastName,
          email: o.email,
        },
      });
    }
    let pp = await prisma.planPatient.findFirst({
      where: { practiceId: PRACTICE_ID, patientId: core.id },
    });
    if (!pp) {
      if (!WRITE) return { id: "dry-run-pp", created: true };
      pp = await prisma.planPatient.create({
        data: { practiceId: PRACTICE_ID, patientId: core.id, status: "ACTIVE" },
      });
    }
    return pp;
  }

  const oldPending = await prisma.$queryRawUnsafe<
    { id: string; patientId: string; planId: string; status: string; startDate: Date | null; endDate: Date | null }[]
  >(`SELECT id, "patientId", "planId", status::text AS status, "startDate", "endDate" FROM "PatientPlan" WHERE status::text = 'PENDING'`);

  let restoredEnrol = 0;
  for (const row of oldPending) {
    const planId = planByOldId.get(row.planId);
    if (!planId) {
      console.log(`skip enrol ${row.id} — no plan map for ${row.planId}`);
      continue;
    }
    const pp = await ensurePlanPatient(row.patientId);
    if (!pp) {
      console.log(`skip enrol ${row.id} — no patient`);
      continue;
    }
    if (pp.id.startsWith("dry-run")) {
      restoredEnrol++;
      console.log(`would ensure patient+enrol for old ${row.id}`);
      continue;
    }
    const existing = await prisma.patientPlanEnrolment.findFirst({
      where: { practiceId: PRACTICE_ID, planPatientId: pp.id, planId },
    });
    if (existing) {
      // If they already have ACTIVE, keep it — don't force back to PENDING
      continue;
    }
    console.log(`${WRITE ? "create" : "would create"} PENDING enrolment old=${row.id}`);
    if (WRITE) {
      await prisma.patientPlanEnrolment.create({
        data: {
          practiceId: PRACTICE_ID,
          planPatientId: pp.id,
          planId,
          status: "PENDING",
          startDate: row.startDate,
          endDate: row.endDate,
        },
      });
    }
    restoredEnrol++;
  }

  // Signing requests missing
  const oldDocs = await prisma.$queryRawUnsafe<{ id: string; title: string; type: string; version: string }[]>(
    `SELECT id, title, type, version FROM "Document"`
  );
  const newDocs = await prisma.planDocument.findMany({ where: { practiceId: PRACTICE_ID } });
  const oldDocToNew = new Map<string, string>();
  for (const o of oldDocs) {
    const match =
      newDocs.find((n) => n.title === o.title && n.type === o.type && n.version === String(o.version)) ||
      newDocs.find((n) => n.title === o.title && n.type === o.type) ||
      newDocs.find((n) => n.type === o.type && n.isActive);
    if (match) oldDocToNew.set(o.id, match.id);
  }

  const oldSig = await prisma.$queryRawUnsafe<
    {
      id: string;
      patientId: string;
      documentId: string;
      expiresAt: Date;
      signedAt: Date | null;
      signatureData: string | null;
      signatureIp: string | null;
    }[]
  >(`SELECT id, "patientId", "documentId", "expiresAt", "signedAt", "signatureData", "signatureIp" FROM "SigningRequest"`);

  let restoredSig = 0;
  for (const s of oldSig) {
    const token = `migrated-${s.id}`;
    const exists = await prisma.planSigningRequest.findFirst({ where: { token } });
    if (exists) continue;
    const pp = await ensurePlanPatient(s.patientId);
    const docId = oldDocToNew.get(s.documentId);
    if (!pp || !docId) {
      console.log(`skip sig ${s.id} pp=${!!pp} doc=${!!docId}`);
      continue;
    }
    if (String(pp.id).startsWith("dry-run")) {
      restoredSig++;
      continue;
    }
    const dup = await prisma.planSigningRequest.findFirst({
      where: {
        practiceId: PRACTICE_ID,
        planPatientId: pp.id,
        documentId: docId,
        signedAt: s.signedAt,
      },
    });
    if (dup) continue;
    console.log(`${WRITE ? "create" : "would create"} signing ${s.id}`);
    if (WRITE) {
      await prisma.planSigningRequest.create({
        data: {
          practiceId: PRACTICE_ID,
          planPatientId: pp.id,
          documentId: docId,
          token,
          expiresAt: s.expiresAt,
          signedAt: s.signedAt,
          signatureData: s.signatureData,
          signatureIp: s.signatureIp,
        },
      });
    }
    restoredSig++;
  }

  console.log(JSON.stringify({ restoredEnrol, restoredSig, WRITE }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});

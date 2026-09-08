/**
 * Diagnose Plans FAIL gaps: PENDING enrolments + signing requests.
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

const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";

async function main() {
  const { prisma } = await import("@elio/db");

  // Old PatientPlan PENDING rows
  const oldPending = await prisma.$queryRawUnsafe<
    {
      id: string;
      patientId: string;
      planId: string;
      status: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      planName: string | null;
    }[]
  >(`
    SELECT pp.id, pp."patientId", pp."planId", pp.status::text AS status,
           p.email, p."firstName", p."lastName", pl.name AS "planName"
    FROM "PatientPlan" pp
    JOIN "Patient" p ON p.id = pp."patientId"
    LEFT JOIN "Plan" pl ON pl.id = pp."planId"
    WHERE pp.status::text = 'PENDING'
  `);

  const newPending = await prisma.patientPlanEnrolment.findMany({
    where: { practiceId: PRACTICE_ID, status: "PENDING" },
    include: {
      planPatient: { include: { patient: { select: { email: true, firstName: true, lastName: true, dentallyId: true } } } },
      plan: { select: { name: true } },
    },
  });

  const newKeys = new Set(
    newPending.map((e) => {
      const email = e.planPatient.patient.email?.toLowerCase() ?? "";
      return `${email}::${e.plan.name}`;
    })
  );

  const missingPending = oldPending.filter((o) => {
    const email = o.email?.toLowerCase() ?? "";
    const key = `${email}::${o.planName ?? ""}`;
    return !newKeys.has(key);
  });

  // Signing requests
  const oldSig = await prisma.$queryRawUnsafe<
    { id: string; patientId: string | null; documentId: string | null; signedAt: Date | null; email: string | null }[]
  >(`
    SELECT sr.id, sr."patientId", sr."documentId", sr."signedAt", p.email
    FROM "SigningRequest" sr
    LEFT JOIN "Patient" p ON p.id = sr."patientId"
  `);

  const newSig = await prisma.planSigningRequest.findMany({
    where: { practiceId: PRACTICE_ID },
    select: { id: true, token: true, planPatientId: true, documentId: true, signedAt: true },
  });
  const newByToken = new Set(newSig.map((s) => s.token).filter(Boolean));
  const newByMigrated = new Set(
    oldSig.filter((o) => newByToken.has(`migrated-${o.id}`)).map((o) => o.id)
  );

  // Also map via patient+doc+signedAt
  const oldPatients = await prisma.$queryRawUnsafe<{ id: string; email: string | null; dentallyPatientId: string | null }[]>(
    `SELECT id, email, "dentallyPatientId" FROM "Patient"`
  );
  const freshPPs = await prisma.planPatient.findMany({
    where: { practiceId: PRACTICE_ID },
    include: { patient: { select: { dentallyId: true, email: true } } },
  });
  const oldToPp = new Map<string, string>();
  for (const o of oldPatients) {
    const hit = freshPPs.find(
      (n) =>
        (o.dentallyPatientId && n.patient.dentallyId === o.dentallyPatientId) ||
        (o.email && n.patient.email?.toLowerCase() === o.email.toLowerCase()) ||
        n.patient.dentallyId === `legacy-patient-${o.id}`
    );
    if (hit) oldToPp.set(o.id, hit.id);
  }
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

  const coveredSig = new Set<string>();
  for (const s of oldSig) {
    if (newByToken.has(`migrated-${s.id}`)) {
      coveredSig.add(s.id);
      continue;
    }
    const ppId = s.patientId ? oldToPp.get(s.patientId) : null;
    const docId = s.documentId ? oldDocToNew.get(s.documentId) : null;
    if (!ppId || !docId) continue;
    const hit = newSig.find(
      (n) =>
        n.planPatientId === ppId &&
        n.documentId === docId &&
        ((n.signedAt == null && s.signedAt == null) ||
          (n.signedAt && s.signedAt && n.signedAt.getTime() === new Date(s.signedAt).getTime()))
    );
    if (hit) coveredSig.add(s.id);
  }

  const missingSig = oldSig.filter((o) => !coveredSig.has(o.id));

  console.log(
    JSON.stringify(
      {
        pending: {
          old: oldPending.length,
          neu: newPending.length,
          missingCount: missingPending.length,
          missing: missingPending.slice(0, 20).map((m) => ({
            email: m.email,
            name: [m.firstName, m.lastName].filter(Boolean).join(" "),
            plan: m.planName,
            oldId: m.id,
            oldPatientId: m.patientId,
            oldPlanId: m.planId,
          })),
        },
        signing: {
          old: oldSig.length,
          neu: newSig.length,
          covered: coveredSig.size,
          missingCount: missingSig.length,
          missing: missingSig.slice(0, 20).map((m) => ({
            email: m.email,
            signedAt: m.signedAt,
            oldId: m.id,
            patientId: m.patientId,
            documentId: m.documentId,
            ppMapped: m.patientId ? oldToPp.has(m.patientId) : false,
            docMapped: m.documentId ? oldDocToNew.has(m.documentId) : false,
          })),
        },
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});

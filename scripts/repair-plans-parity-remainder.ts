/**
 * Repair remaining Plans parity FAILs after gap-fill:
 * - Delete UAT Free Child / leftover test catalog plans (no live enrolments)
 * - Restore any OLD patients not yet linked as PlanPatient
 * - Restore missing DocumentAcceptance / SigningRequest rows
 *
 *   npx tsx scripts/repair-plans-parity-remainder.ts
 *   CONFIRM_WRITE=1 npx tsx scripts/repair-plans-parity-remainder.ts
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
loadEnvFile(join(process.cwd(), "apps", "plans", ".env.local"));
if (process.env.DIRECT_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL.trim();
}

const WRITE = process.env.CONFIRM_WRITE === "1";
const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";

async function main() {
  const { prisma } = await import("@elio/db");
  console.log(`\n=== Repair Plans parity remainder ===`);
  console.log(`mode=${WRITE ? "WRITE" : "dry-run"}\n`);

  // --- UAT / test catalog junk ---
  const junkPlans = await prisma.planModel.findMany({
    where: {
      practiceId: PRACTICE_ID,
      OR: [
        { name: { startsWith: "UAT Free Child" } },
        { name: { startsWith: "UAT " } },
        { name: { startsWith: "E2E " } },
        { name: { contains: "Sandbox" } },
      ],
    },
    select: { id: true, name: true },
  });
  console.log(`Junk catalog plans: ${junkPlans.length}`);
  let deletedPlans = 0;
  for (const p of junkPlans) {
    const enrols = await prisma.patientPlanEnrolment.count({ where: { planId: p.id } });
    if (enrols > 0) {
      console.log(`  keep ${p.name} — ${enrols} enrolment(s)`);
      continue;
    }
    console.log(`  ${WRITE ? "delete" : "would delete"} ${p.name}`);
    if (WRITE) {
      await prisma.planInclusion.deleteMany({ where: { planId: p.id } });
      await prisma.planDiscount.deleteMany({ where: { planId: p.id } });
      await prisma.planEligibilityRule.deleteMany({ where: { planId: p.id } });
      await prisma.planRedeemRule.deleteMany({ where: { planId: p.id } });
      await prisma.dentallyPlanMapping.deleteMany({ where: { planModelId: p.id } });
      await prisma.planPatient.updateMany({ where: { planModelId: p.id }, data: { planModelId: null } });
      await prisma.planModel.delete({ where: { id: p.id } });
      deletedPlans++;
    }
  }

  // --- Unlinked old patients ---
  const oldPatients = await prisma.$queryRawUnsafe<
    {
      id: string;
      email: string | null;
      dentallyPatientId: string | null;
      firstName: string | null;
      lastName: string | null;
    }[]
  >(`SELECT id, email, "dentallyPatientId", "firstName", "lastName" FROM "Patient"`);

  const newPPs = await prisma.planPatient.findMany({
    where: { practiceId: PRACTICE_ID },
    include: { patient: { select: { dentallyId: true, email: true } } },
  });

  const linked = new Set<string>();
  for (const o of oldPatients) {
    const hit = newPPs.find(
      (n) =>
        (o.dentallyPatientId && n.patient.dentallyId === o.dentallyPatientId) ||
        (o.email && n.patient.email?.toLowerCase() === o.email.toLowerCase())
    );
    if (hit) linked.add(o.id);
  }
  const missing = oldPatients.filter((o) => !linked.has(o.id));
  console.log(`\nUnlinked old patients: ${missing.length}`);
  for (const o of missing) {
    console.log(`  - ${o.firstName} ${o.lastName} <${o.email}> dentally=${o.dentallyPatientId}`);
  }

  let restoredPatients = 0;
  for (const o of missing) {
    const dentallyId = o.dentallyPatientId || `legacy-patient-${o.id}`;
    let core = await prisma.patient.findFirst({
      where: { practiceId: PRACTICE_ID, dentallyId },
    });
    if (!core && o.email) {
      core = await prisma.patient.findFirst({
        where: { practiceId: PRACTICE_ID, email: { equals: o.email, mode: "insensitive" } },
      });
    }
    if (WRITE) {
      if (!core) {
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
      const existingPp = await prisma.planPatient.findFirst({
        where: { practiceId: PRACTICE_ID, patientId: core.id },
      });
      if (!existingPp) {
        await prisma.planPatient.create({
          data: { practiceId: PRACTICE_ID, patientId: core.id, status: "ACTIVE" },
        });
        restoredPatients++;
        console.log(`  restored PlanPatient for ${o.email || o.id}`);
      }
    } else {
      restoredPatients++;
    }
  }

  // Rebuild maps for docs
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

  // Document map by title+version (best effort) — prefer matching type
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
  console.log(`\nDocument map: ${oldDocToNew.size}/${oldDocs.length}`);

  // Acceptances
  const oldAcc = await prisma.$queryRawUnsafe<
    { id: string; patientId: string; documentId: string; ipAddress: string | null; acceptedAt: Date }[]
  >(`SELECT id, "patientId", "documentId", "ipAddress", "acceptedAt" FROM "DocumentAcceptance"`);
  const newAccCount = await prisma.planDocumentAcceptance.count({ where: { practiceId: PRACTICE_ID } });
  console.log(`Acceptances OLD=${oldAcc.length} NEW=${newAccCount}`);

  let restoredAcc = 0;
  for (const a of oldAcc) {
    const ppId = oldToPp.get(a.patientId);
    const docId = oldDocToNew.get(a.documentId);
    if (!ppId || !docId) continue;
    const exists = await prisma.planDocumentAcceptance.findFirst({
      where: { practiceId: PRACTICE_ID, planPatientId: ppId, documentId: docId },
    });
    if (exists) continue;
    if (WRITE) {
      await prisma.planDocumentAcceptance.create({
        data: {
          practiceId: PRACTICE_ID,
          planPatientId: ppId,
          documentId: docId,
          ipAddress: a.ipAddress,
          acceptedAt: a.acceptedAt,
        },
      });
    }
    restoredAcc++;
  }
  console.log(`${WRITE ? "restored" : "would restore"} acceptances: ${restoredAcc}`);

  // Signing requests — count by patient+document+signedAt presence
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
  const newSigCount = await prisma.planSigningRequest.count({ where: { practiceId: PRACTICE_ID } });
  console.log(`SigningRequests OLD=${oldSig.length} NEW=${newSigCount}`);

  let restoredSig = 0;
  for (const s of oldSig) {
    const ppId = oldToPp.get(s.patientId);
    const docId = oldDocToNew.get(s.documentId);
    if (!ppId || !docId) continue;
    const token = `migrated-${s.id}`;
    const exists = await prisma.planSigningRequest.findFirst({
      where: {
        OR: [{ token }, { practiceId: PRACTICE_ID, planPatientId: ppId, documentId: docId, signedAt: s.signedAt }],
      },
    });
    if (exists) continue;
    if (WRITE) {
      await prisma.planSigningRequest.create({
        data: {
          practiceId: PRACTICE_ID,
          planPatientId: ppId,
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
  console.log(`${WRITE ? "restored" : "would restore"} signing requests: ${restoredSig}`);

  // List leftover NEW-only active/current plans
  const legacyNames = new Set(
    (await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM "Plan"`)).map((r) => r.name)
  );
  const extras = await prisma.planModel.findMany({
    where: { practiceId: PRACTICE_ID, active: true, isCurrentVersion: true },
    select: { name: true },
  });
  const extraCurrent = extras.filter((e) => !legacyNames.has(e.name));
  console.log(`\nActive+current NEW-only plans remaining: ${extraCurrent.length}`);
  for (const e of extraCurrent.slice(0, 15)) console.log(`  - ${e.name}`);

  console.log(`\nSummary: deletedPlans=${deletedPlans} restoredPatients=${restoredPatients} acc=${restoredAcc} sig=${restoredSig}`);
  if (!WRITE) console.log("Re-run with CONFIRM_WRITE=1 to apply.\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});

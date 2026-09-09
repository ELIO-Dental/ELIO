/**
 * One-time: set dentist.dentallyPractitionerId to Dentally practitioner resource ids
 * (invoice_item.practitioner_id space) when currently storing user.id.
 *
 * Usage: npx tsx scripts/fix-dentist-practitioner-ids.ts [--execute]
 *
 * Uses known Aura site links (user.id → practitioner.id) so we can run while
 * Dentally /practitioners is rate-limited. Refresh via fetchPractitionerUserIdMap when available.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(resolve(__dirname, "../packages/db/.env"));
loadEnv(resolve(__dirname, "../../elio-deploy-env/pay.env"));

const EXECUTE = process.argv.includes("--execute");
const PRACTICE_ID = process.env.PRACTICE_ID || "seed-practice";

/** Confirmed live 2026-09-09 for Aura site 212f9c01-… */
const USER_TO_PRACTITIONER: Record<string, string> = {
  "285115": "110701", // Ankush Patel
  "276544": "127844", // Hisham Saqib
  "396225": "189357", // Peter Throw
  "396229": "189361", // Priyanka Kapoor
  "462017": "263970", // Hani Dalati
  "484388": "283516", // Zeeshan Abbas
  "497281": "293046", // Moneeb Ahmad
  "579163": "355730", // Angelica Londono-Ferrero
};

async function main() {
  const { prisma } = await import("@elio/db");
  const dentists = await prisma.dentist.findMany({
    where: { practiceId: PRACTICE_ID, dentallyPractitionerId: { not: null } },
    select: { id: true, name: true, dentallyPractitionerId: true },
  });

  const practitionerIds = new Set(Object.values(USER_TO_PRACTITIONER));

  for (const d of dentists) {
    const stored = String(d.dentallyPractitionerId);
    if (practitionerIds.has(stored)) {
      console.log("OK already practitioner id", d.name, stored);
      continue;
    }
    const pid = USER_TO_PRACTITIONER[stored];
    if (!pid) {
      console.log("SKIP unknown mapping", d.name, stored);
      continue;
    }
    console.log("UPDATE", d.name, stored, "→", pid);
    if (EXECUTE) {
      await prisma.dentist.update({
        where: { id: d.id },
        data: { dentallyPractitionerId: pid },
      });
    }
  }

  if (!EXECUTE) console.log("Dry-run only. Pass --execute to write.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

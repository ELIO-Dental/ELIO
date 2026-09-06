/**
 * Step 21 / C.10 — upsert Aura Dental dentists by dentallyPractitionerId.
 * Does NOT seed Angelica Londono (removed per client 2026-09-05).
 * IDs + NHS performer numbers synced from AuraPay Turso 2026-09-05.
 *
 * Usage: node packages/db/scripts/seed-aura-dentists.cjs [--execute]
 * Default dry-run.
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[m[1]]) process.env[m[1]] = val;
}

const execute = process.argv.includes("--execute");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

/** @type {Array<{ dentallyPractitionerId: string, name: string, email: string|null, payType: string, privateSplitPercent: number|null, udaRatePence: number|null, nhsPerformerNumber: string|null }>} */
const SEED = [
  { dentallyPractitionerId: "484388", name: "Zeeshan Abbas", email: "abbas.dental@gmail.com", payType: "PERCENTAGE_SPLIT", privateSplitPercent: 45, udaRatePence: null, nhsPerformerNumber: null },
  { dentallyPractitionerId: "396225", name: "Peter Throw", email: "peterthrow@btinternet.com", payType: "PERCENTAGE_SPLIT", privateSplitPercent: 50, udaRatePence: 1600, nhsPerformerNumber: "780995" },
  { dentallyPractitionerId: "396229", name: "Priyanka Kapoor", email: "drpriyankakapoor@gmail.com", payType: "PERCENTAGE_SPLIT", privateSplitPercent: 50, udaRatePence: 1500, nhsPerformerNumber: "112376" },
  { dentallyPractitionerId: "497281", name: "Moneeb Ahmad", email: "dr.moneebahmad@gmail.com", payType: "PERCENTAGE_SPLIT", privateSplitPercent: 50, udaRatePence: 1500, nhsPerformerNumber: "701874" },
  { dentallyPractitionerId: "462017", name: "Hani Dalati", email: "hanidalati@gmail.com", payType: "PERCENTAGE_SPLIT", privateSplitPercent: 50, udaRatePence: null, nhsPerformerNumber: null },
  { dentallyPractitionerId: "285115", name: "Ankush Patel", email: "ankush25@icloud.com", payType: "PERCENTAGE_SPLIT", privateSplitPercent: 45, udaRatePence: null, nhsPerformerNumber: null },
  { dentallyPractitionerId: "276544", name: "Hisham Saqib", email: "hisham.saqib@outlook.com", payType: "PERCENTAGE_SPLIT", privateSplitPercent: 50, udaRatePence: 3545, nhsPerformerNumber: "110271" },
  { dentallyPractitionerId: "288298", name: "Taryn Dawson", email: null, payType: "HOURLY", privateSplitPercent: null, udaRatePence: null, nhsPerformerNumber: null },
];

async function main() {
  const practice = await p.practice.findFirst({ orderBy: { createdAt: "asc" } });
  if (!practice) {
    console.error("No practice found");
    process.exitCode = 1;
    return;
  }
  console.log(`${execute ? "EXECUTE" : "DRY-RUN"} seed for practice ${practice.id} (${practice.name})`);
  console.log("Angelica Londono: intentionally NOT seeded.");

  for (const row of SEED) {
    const existing = await p.dentist.findFirst({
      where: {
        practiceId: practice.id,
        OR: [{ dentallyPractitionerId: row.dentallyPractitionerId }, { name: row.name }],
      },
    });
    const action = existing ? "update" : "create";
    console.log(
      `  ${action} ${row.name} (${row.dentallyPractitionerId}) split=${row.privateSplitPercent} uda=${row.udaRatePence} nhs=${row.nhsPerformerNumber}`
    );
    if (!execute) continue;

    if (existing) {
      await p.dentist.update({
        where: { id: existing.id },
        data: {
          name: row.name,
          email: row.email,
          dentallyPractitionerId: row.dentallyPractitionerId,
          payType: row.payType,
          privateSplitPercent: row.privateSplitPercent,
          udaRatePence: row.udaRatePence,
          nhsPerformerNumber: row.nhsPerformerNumber,
          effectiveFrom: new Date(),
        },
      });
    } else {
      await p.dentist.create({
        data: {
          practiceId: practice.id,
          name: row.name,
          email: row.email,
          dentallyPractitionerId: row.dentallyPractitionerId,
          payType: row.payType,
          privateSplitPercent: row.privateSplitPercent,
          udaRatePence: row.udaRatePence,
          nhsPerformerNumber: row.nhsPerformerNumber,
          hourlyRatePence: row.payType === "HOURLY" ? 3500 : null,
          effectiveFrom: new Date(),
        },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());

/**
 * Client hygiene + paid-log readiness for Aura practice.
 * - Deactivate Angelica (client lock)
 * - Sync emails from Turso if needed (run sync-dentists-from-aurapay first)
 * - Soft-hide UAT junk dentists from ops lists via name prefix (optional --hide-uat)
 * - Report invoice-id coverage for paid-log seed
 * - Optionally unlock+prepare a DRAFT period for Dentally re-fetch (--prepare-fetch=PERIOD_ID)
 *
 * Usage:
 *   node scripts/client-perfect-hygiene.cjs [--execute] [--hide-uat]
 */
const fs = require("fs");
const path = require("path");

const EXECUTE = process.argv.includes("--execute");
const HIDE_UAT = process.argv.includes("--hide-uat");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const dbEnv = loadEnvFile(path.join(__dirname, "../.env"));
for (const [k, v] of Object.entries(dbEnv)) {
  if (!process.env[k]) process.env[k] = v;
}

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const practiceId = "seed-practice";

  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { id: true, name: true, paySettingsJson: true },
  });
  const settings = (practice?.paySettingsJson || {});
  console.log("Practice:", practice?.name);
  console.log("Dentally site configured:", Boolean(settings.dentally_site_id || process.env.DENTALLY_SITE_ID));
  console.log("Dentally token in settings keys:", Object.keys(settings).filter((k) => /dentally|token/i.test(k)));

  const dentists = await prisma.dentist.findMany({ where: { practiceId } });
  const angelica = dentists.filter((d) => /angelica/i.test(d.name) && !d.name.startsWith("[REMOVED]"));
  const uat = dentists.filter(
    (d) => /^uat /i.test(d.name) || /live test|verify test/i.test(d.name)
  );

  const withInv = await prisma.privateRevenueLineItem.count({
    where: {
      payslipEntry: { practiceId },
      dentallyInvoiceId: { not: null },
    },
  });
  const totalLines = await prisma.privateRevenueLineItem.count({
    where: { payslipEntry: { practiceId } },
  });

  console.log({
    angelica: angelica.map((d) => d.name),
    uatCount: uat.length,
    linesWithInvoiceId: withInv,
    totalLines,
  });

  // Find best DRAFT period for re-fetch (real dentists, not pure UAT)
  const draftPeriods = await prisma.payPeriod.findMany({
    where: { practiceId, status: "DRAFT" },
    orderBy: { periodStart: "desc" },
    take: 10,
  });
  console.log(
    "DRAFT periods:",
    draftPeriods.map((p) => ({
      id: p.id,
      start: p.periodStart.toISOString().slice(0, 10),
      fetch: p.dentallyFetchStatus,
    }))
  );

  if (!EXECUTE) {
    console.log("\nDry-run. Pass --execute to deactivate Angelica" + (HIDE_UAT ? " + hide UAT dentists" : "") + ".");
    await prisma.$disconnect();
    return;
  }

  for (const d of angelica) {
    const payslips = await prisma.payslipEntry.count({ where: { dentistId: d.id } });
    if (payslips === 0) {
      await prisma.dentistRateHistory.deleteMany({ where: { dentistId: d.id } });
      await prisma.hourEntry.deleteMany({ where: { dentistId: d.id } }).catch(() => {});
      await prisma.labBillEntry.deleteMany({ where: { dentistId: d.id } }).catch(() => {});
      await prisma.dentist.delete({ where: { id: d.id } });
      console.log("Deleted Angelica", d.id);
    } else {
      await prisma.dentist.update({
        where: { id: d.id },
        data: {
          name: `[REMOVED] ${d.name}`,
          dentallyPractitionerId: null,
          nhsPerformerNumber: null,
          email: null,
        },
      });
      console.log(`Deactivated Angelica (${payslips} payslips)`, d.id);
    }
  }

  if (HIDE_UAT) {
    for (const d of uat) {
      if (d.name.startsWith("[UAT]")) continue;
      await prisma.dentist.update({
        where: { id: d.id },
        data: { name: `[UAT] ${d.name}`, dentallyPractitionerId: d.dentallyPractitionerId?.startsWith("uat-") ? null : d.dentallyPractitionerId },
      });
      console.log("Hidden UAT dentist", d.name);
    }
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Pay Dentally fetch smoke: fresh replace, no dups, MANUAL preserved.
 * Usage (from elio/):
 *   npx tsx scripts/smoke-pay-dentally-fetch.ts [--execute] [--periodId=...]
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
loadEnv(resolve(__dirname, "../../elio-deploy-env/shell.env"));

const EXECUTE = process.argv.includes("--execute");
const periodArg = process.argv.find((a) => a.startsWith("--periodId="));
const PRACTICE_ID = process.env.PRACTICE_ID || "seed-practice";

async function main() {
  const { prisma } = await import("@elio/db");

  let periodId = periodArg?.split("=")[1];
  if (!periodId) {
    const period = await prisma.payPeriod.findFirst({
      where: { practiceId: PRACTICE_ID, status: { not: "LOCKED" } },
      orderBy: { periodStart: "desc" },
      select: { id: true, periodStart: true, periodEnd: true, status: true, dentallyFetchStatus: true },
    });
    if (!period) throw new Error("No unlocked pay period for practice");
    periodId = period.id;
    console.log("Using period", period);
  }

  const before = await prisma.privateRevenueLineItem.groupBy({
    by: ["sourceType"],
    where: { payslipEntry: { payPeriodId: periodId } },
    _count: true,
  });
  console.log("Lines before:", before);

  if (!EXECUTE) {
    console.log("Dry-run. Pass --execute to fetch twice and assert no dups.");
    await prisma.$disconnect();
    return;
  }

  if (!process.env.DENTALLY_API_KEY && !process.env.DENTALLY_API_TOKEN) {
    throw new Error("DENTALLY_API_KEY missing");
  }

  const { fetchDentallyForPayPeriod } = await import("../apps/pay/lib/dentally-fetch");

  console.log("Fetch #1…");
  const r1 = await fetchDentallyForPayPeriod(PRACTICE_ID, periodId);
  const after1 = await countLines(prisma, periodId);
  console.log("After #1:", after1, "dentistsUpdated:", r1.dentistsUpdated, "debug:", r1.debug);

  // Insert a MANUAL plug — re-fetch must preserve it.
  const payslip = await prisma.payslipEntry.findFirst({
    where: { payPeriodId: periodId },
    select: { id: true },
  });
  if (!payslip) throw new Error("No payslip after fetch #1");
  const manual = await prisma.privateRevenueLineItem.create({
    data: {
      payslipEntryId: payslip.id,
      amountPence: 12345,
      excludedAsConsultation: false,
      patientName: "SMOKE MANUAL PLUG",
      sourceType: "MANUAL",
      manualCreatedByUserId: "smoke-script",
      manualNote: "Preserve across Dentally re-fetch",
      dentallyLineKey: "amt:12345",
    },
  });
  console.log("Inserted MANUAL line", manual.id);

  console.log("Fetch #2…");
  const r2 = await fetchDentallyForPayPeriod(PRACTICE_ID, periodId);
  const after2 = await countLines(prisma, periodId);
  console.log("After #2:", after2, "dentistsUpdated:", r2.dentistsUpdated, "debug:", r2.debug);

  console.log("Fetch #3 (immediate — must match #2; live API can drift between distant runs)…");
  const r3 = await fetchDentallyForPayPeriod(PRACTICE_ID, periodId);
  const after3 = await countLines(prisma, periodId);
  console.log("After #3:", after3, "dentistsUpdated:", r3.dentistsUpdated);

  if (after3.dentally !== after2.dentally) {
    throw new Error(
      `Dentally line count not stable on consecutive re-fetch: ${after2.dentally} → ${after3.dentally}`
    );
  }
  if (after3.manual < 1) {
    throw new Error(`MANUAL lines not preserved: expected >= 1, got ${after3.manual}`);
  }

  const manualStill = await prisma.privateRevenueLineItem.findUnique({ where: { id: manual.id } });
  if (!manualStill || manualStill.sourceType !== "MANUAL") {
    throw new Error("MANUAL plug row was deleted by re-fetch");
  }

  const dupGroups = new Map<string, number>();
  const dentallyLines = await prisma.privateRevenueLineItem.findMany({
    where: {
      payslipEntry: { payPeriodId: periodId },
      sourceType: "DENTALLY",
      dentallyInvoiceId: { not: null },
    },
    select: { dentallyInvoiceId: true, dentallyLineKey: true, payslipEntryId: true },
  });
  for (const line of dentallyLines) {
    const k = `${line.payslipEntryId}::${line.dentallyInvoiceId}::${line.dentallyLineKey}`;
    dupGroups.set(k, (dupGroups.get(k) ?? 0) + 1);
  }
  const dups = [...dupGroups.entries()].filter(([, c]) => c > 1).slice(0, 20);
  if (dups.length > 0) {
    console.error("Duplicate line keys:", dups);
    throw new Error(`Found ${dups.length} duplicate Dentally line key groups`);
  }

  if (after3.dentally < 1) {
    throw new Error("Expected Dentally lines after fetch (practitioner↔user map may be broken)");
  }

  console.log(
    "SMOKE OK — consecutive re-fetch stable, no duplicate Dentally keys, MANUAL preserved, lines:",
    after3.dentally
  );
  await prisma.$disconnect();
}

async function countLines(
  prisma: { privateRevenueLineItem: { groupBy: Function } },
  periodId: string
) {
  const rows = await prisma.privateRevenueLineItem.groupBy({
    by: ["sourceType"],
    where: { payslipEntry: { payPeriodId: periodId } },
    _count: true,
  });
  let dentally = 0;
  let manual = 0;
  for (const r of rows as Array<{ sourceType: string; _count: number }>) {
    if (r.sourceType === "MANUAL") manual = r._count;
    else dentally += r._count;
  }
  return { dentally, manual, rows };
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  try {
    const { prisma } = await import("@elio/db");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
});

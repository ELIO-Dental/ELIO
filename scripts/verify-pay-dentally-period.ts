/**
 * Fast post-smoke checks (no Dentally API): dups, MANUAL plugs, stuck RUNNING recovery.
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

const PERIOD_ID = process.argv.find((a) => a.startsWith("--periodId="))?.split("=")[1];
if (!PERIOD_ID) throw new Error("--periodId required");

async function main() {
  const { prisma } = await import("@elio/db");
  const { recoverStalePayPeriodDentallyFetch } = await import("../apps/pay/lib/dentally-fetch-job");

  const recovered = await recoverStalePayPeriodDentallyFetch("seed-practice", PERIOD_ID);
  console.log("stale recover attempted:", recovered);

  const dentally = await prisma.privateRevenueLineItem.findMany({
    where: {
      payslipEntry: { payPeriodId: PERIOD_ID },
      sourceType: "DENTALLY",
    },
    select: { payslipEntryId: true, dentallyInvoiceId: true, dentallyLineKey: true },
  });
  const manuals = await prisma.privateRevenueLineItem.count({
    where: { payslipEntry: { payPeriodId: PERIOD_ID }, sourceType: "MANUAL" },
  });

  const dupGroups = new Map<string, number>();
  for (const line of dentally) {
    const k = `${line.payslipEntryId}::${line.dentallyInvoiceId}::${line.dentallyLineKey}`;
    dupGroups.set(k, (dupGroups.get(k) ?? 0) + 1);
  }
  const dups = [...dupGroups.entries()].filter(([, c]) => c > 1);
  if (dups.length) throw new Error(`duplicate keys: ${dups.length}`);

  const period = await prisma.payPeriod.findUnique({
    where: { id: PERIOD_ID },
    select: { dentallyFetchStatus: true, dentallyFetchError: true },
  });

  console.log({
    dentallyLines: dentally.length,
    manuals,
    dups: 0,
    fetchStatus: period?.dentallyFetchStatus,
    fetchError: period?.dentallyFetchError,
  });
  if (dentally.length < 1) throw new Error("no dentally lines");
  console.log("VERIFY OK");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
});

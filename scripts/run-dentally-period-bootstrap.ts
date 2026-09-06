/**
 * Ensure practice Dentally site_id is set, then fetch + calculate for a DRAFT period.
 * Usage:
 *   node --import tsx ../../scripts/run-dentally-period-bootstrap.ts --periodId=... [--execute]
 *
 * Or from repo root with env loaded.
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
const periodArg = process.argv.find((a) => a.startsWith("--periodId="));
const PERIOD_ID = periodArg?.split("=")[1] || process.env.PAY_PERIOD_ID;
const PRACTICE_ID = process.env.PRACTICE_ID || "seed-practice";
const SITE_ID = process.env.DENTALLY_SITE_ID?.trim();

async function main() {
  if (!PERIOD_ID) throw new Error("Pass --periodId=...");
  if (!SITE_ID) throw new Error("DENTALLY_SITE_ID missing");
  if (!process.env.DENTALLY_API_KEY && !process.env.DENTALLY_API_TOKEN) {
    throw new Error("DENTALLY_API_KEY missing");
  }

  const { prisma } = await import("@elio/db");
  const practice = await prisma.practice.findUnique({ where: { id: PRACTICE_ID } });
  if (!practice) throw new Error("practice not found");

  const settings = (practice.paySettingsJson as Record<string, unknown>) || {};
  const nextSettings = { ...settings, dentally_site_id: SITE_ID };
  console.log("Will set dentally_site_id:", SITE_ID);
  console.log("Period:", PERIOD_ID, "execute:", EXECUTE);

  const period = await prisma.payPeriod.findUnique({ where: { id: PERIOD_ID } });
  if (!period) throw new Error("period not found");
  if (period.status === "LOCKED") throw new Error("Refuse to fetch into LOCKED period");
  console.log("Period range:", period.periodStart.toISOString().slice(0, 10), "–", period.periodEnd.toISOString().slice(0, 10));

  if (!EXECUTE) {
    console.log("Dry-run only.");
    await prisma.$disconnect();
    return;
  }

  await prisma.practice.update({
    where: { id: PRACTICE_ID },
    data: { paySettingsJson: nextSettings },
  });
  console.log("Practice settings updated with site_id");

  const { fetchDentallyForPayPeriod } = await import("../apps/pay/lib/dentally-fetch");
  console.log("Fetching Dentally…");
  const result = await fetchDentallyForPayPeriod(PRACTICE_ID, PERIOD_ID);
  console.log("Fetch done:", {
    invoices: result.debug?.invoiceCount ?? result,
    excludeReasonCounts: result.debug?.excludeReasonCounts,
    unmapped: result.debug?.unmappedPractitioners?.length,
  });

  // Stamp invoice coverage
  const withInv = await prisma.privateRevenueLineItem.count({
    where: {
      payslipEntry: { payPeriodId: PERIOD_ID },
      dentallyInvoiceId: { not: null },
    },
  });
  const total = await prisma.privateRevenueLineItem.count({
    where: { payslipEntry: { payPeriodId: PERIOD_ID } },
  });
  console.log("Lines after fetch:", { withInv, total });

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    const { prisma } = await import("@elio/db");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});

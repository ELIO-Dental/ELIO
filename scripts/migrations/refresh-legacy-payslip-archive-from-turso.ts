/**
 * Refresh LegacyPayslipArchive.rawRowJson from live AuraPay Turso.
 * migrate-elioay used upsert update:{} so later Turso edits never landed in Neon.
 *
 * Dry-run by default. Pass --execute to write.
 * Optional: --month=8 --year=2026
 */
import { createClient } from "@libsql/client";
import { prisma } from "@elio/db";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import {
  parseLegacyPayslipRow,
  legacyPayslipSummary,
} from "../../apps/pay/lib/legacy-payslip-archive";

dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio-deploy-env/pay.env") });
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || "";

const EXECUTE = process.argv.includes("--execute");
const monthArg = process.argv.find((a) => a.startsWith("--month="));
const yearArg = process.argv.find((a) => a.startsWith("--year="));
const ONLY_MONTH = monthArg ? Number(monthArg.split("=")[1]) : null;
const ONLY_YEAR = yearArg ? Number(yearArg.split("=")[1]) : null;

function readTursoFromAuraPayLocal(): { url: string; token: string } | null {
  const p = path.resolve("D:/WEB DEV/Hish/ElioPay/aurapay/.env.local");
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  const url = raw.match(/TURSO_DATABASE_URL="([^"]+)"/)?.[1];
  const token = raw.match(/TURSO_AUTH_TOKEN="([^"]+)"/)?.[1];
  if (!url || !token) return null;
  return { url, token };
}

async function main() {
  const fallback = readTursoFromAuraPayLocal();
  const url = process.env.OLD_ELIOPAY_TURSO_URL || fallback?.url;
  const authToken = process.env.OLD_ELIOPAY_TURSO_TOKEN || fallback?.token;
  if (!url || !authToken) throw new Error("Turso credentials missing");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");

  const turso = createClient({ url, authToken });
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("No practice");

  const periods = await turso.execute(
    "SELECT id, month, year FROM pay_periods ORDER BY year ASC, month ASC"
  );
  const dentists = await turso.execute("SELECT id, name FROM dentists");
  const dentistNameById = new Map(
    dentists.rows.map((d) => [String(d.id), String(d.name ?? "Unknown")])
  );

  let updated = 0;
  let created = 0;
  let unchanged = 0;
  let skippedPeriod = 0;

  for (const p of periods.rows) {
    const month = Number(p.month);
    const year = Number(p.year);
    if (ONLY_MONTH != null && month !== ONLY_MONTH) {
      skippedPeriod++;
      continue;
    }
    if (ONLY_YEAR != null && year !== ONLY_YEAR) {
      skippedPeriod++;
      continue;
    }

    const payslips = await turso.execute({
      sql: "SELECT * FROM payslip_entries WHERE period_id = ?",
      args: [p.id],
    });

    let periodGross = 0;
    let periodNet = 0;
    console.log(`\nTurso period ${year}-${month} id=${p.id} rows=${payslips.rows.length}`);

    for (const row of payslips.rows) {
      const sourceId = String(row.id);
      const dentistName = dentistNameById.get(String(row.dentist_id)) ?? "Unknown";
      const rawRowJson = JSON.stringify(row);
      const summary = legacyPayslipSummary(parseLegacyPayslipRow(rawRowJson));
      periodGross += summary.grossPrivate;
      periodNet += summary.netPay;

      const existing = await prisma.legacyPayslipArchive.findUnique({
        where: { practiceId_sourceId: { practiceId: practice.id, sourceId } },
      });

      if (!existing) {
        console.log(`  CREATE ${dentistName}: gross£${summary.grossPrivate.toFixed(2)} net£${summary.netPay.toFixed(2)}`);
        if (EXECUTE) {
          await prisma.legacyPayslipArchive.create({
            data: {
              practiceId: practice.id,
              sourceId,
              dentistName,
              periodMonth: month,
              periodYear: year,
              rawRowJson,
            },
          });
        }
        created++;
        continue;
      }

      if (existing.rawRowJson === rawRowJson) {
        unchanged++;
        continue;
      }

      const oldSummary = legacyPayslipSummary(parseLegacyPayslipRow(existing.rawRowJson));
      console.log(
        `  UPDATE ${dentistName}: archive gross£${oldSummary.grossPrivate.toFixed(2)} → turso £${summary.grossPrivate.toFixed(2)} (net £${summary.netPay.toFixed(2)})`
      );
      if (EXECUTE) {
        await prisma.legacyPayslipArchive.update({
          where: { id: existing.id },
          data: {
            dentistName,
            periodMonth: month,
            periodYear: year,
            rawRowJson,
          },
        });
      }
      updated++;
    }

    console.log(
      `  period totals: gross£${periodGross.toFixed(2)} estNet£${periodNet.toFixed(2)}`
    );
  }

  console.log(
    JSON.stringify({ execute: EXECUTE, updated, created, unchanged, skippedPeriod }, null, 2)
  );
  turso.close();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});

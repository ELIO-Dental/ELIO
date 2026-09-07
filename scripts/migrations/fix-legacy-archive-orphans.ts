import { createClient } from "@libsql/client";
import { prisma } from "@elio/db";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio-deploy-env/pay.env") });
dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio/scripts/migrations/.env.local") });
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || "";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const raw = fs.readFileSync("D:/WEB DEV/Hish/ElioPay/aurapay/.env.local", "utf8");
  const url = process.env.OLD_ELIOPAY_TURSO_URL || raw.match(/TURSO_DATABASE_URL="([^"]+)"/)?.[1];
  const authToken = process.env.OLD_ELIOPAY_TURSO_TOKEN || raw.match(/TURSO_AUTH_TOKEN="([^"]+)"/)?.[1];
  if (!url || !authToken) throw new Error("Turso missing");

  const turso = createClient({ url, authToken });
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("No practice");

  const t = await turso.execute("SELECT id FROM payslip_entries");
  const tursoIds = new Set(t.rows.map((r) => String(r.id)));
  const n = await prisma.legacyPayslipArchive.findMany({
    where: { practiceId: practice.id },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }, { dentistName: "asc" }],
  });

  console.log(`Turso payslips: ${tursoIds.size}  Neon archive: ${n.length}`);
  const orphans = n.filter((a) => !tursoIds.has(a.sourceId));
  console.log(`Neon orphans (not in Turso): ${orphans.length}`);
  for (const o of orphans) {
    console.log(`  ${o.sourceId}  ${o.dentistName}  ${o.periodMonth}/${o.periodYear}`);
  }
  const missing = [...tursoIds].filter((id) => !n.some((a) => a.sourceId === id));
  console.log(`Turso missing in Neon: ${missing.length}`, missing);

  if (EXECUTE && orphans.length > 0) {
    const del = await prisma.legacyPayslipArchive.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } },
    });
    console.log(`Deleted ${del.count} orphan archive rows`);
  } else if (orphans.length > 0) {
    console.log("Dry-run — pass --execute to delete orphans");
  }

  const after = await prisma.legacyPayslipArchive.count({ where: { practiceId: practice.id } });
  console.log(`Neon archive after: ${after} (expect ${tursoIds.size})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

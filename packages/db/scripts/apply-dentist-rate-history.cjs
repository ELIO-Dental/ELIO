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

const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const sql = fs.readFileSync(
  path.join(__dirname, "..", "prisma", "migrations", "20260905160000_pay_dentist_rate_history", "migration.sql"),
  "utf8"
);

async function main() {
  // Split on semicolons outside DO blocks roughly — run statements separately for IF NOT EXISTS parts
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_dentists" ADD COLUMN IF NOT EXISTS "labShareBp" INTEGER`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_dentists" ADD COLUMN IF NOT EXISTS "financeShareBp" INTEGER`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_dentists" ADD COLUMN IF NOT EXISTS "therapyHourlyPence" INTEGER`
  );
  await p.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "pay_dentist_rate_history" (
  "id" TEXT NOT NULL,
  "practiceId" TEXT NOT NULL,
  "dentistId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "privateSplitPercent" DECIMAL(5,2),
  "udaRatePence" INTEGER,
  "hourlyRatePence" INTEGER,
  "labShareBp" INTEGER,
  "financeShareBp" INTEGER,
  "therapyHourlyPence" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pay_dentist_rate_history_pkey" PRIMARY KEY ("id")
)`);
  await p.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "pay_dentist_rate_history_dentistId_effectiveFrom_idx" ON "pay_dentist_rate_history"("dentistId", "effectiveFrom")`
  );
  await p.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "pay_dentist_rate_history_practiceId_idx" ON "pay_dentist_rate_history"("practiceId")`
  );
  console.log("Applied dentist rate history columns.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());

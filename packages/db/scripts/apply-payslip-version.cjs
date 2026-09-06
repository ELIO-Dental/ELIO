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

async function main() {
  await p.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "pay_payslip_versions" (
  "id" TEXT NOT NULL,
  "practiceId" TEXT NOT NULL,
  "payslipEntryId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "pdfBase64" TEXT NOT NULL,
  "contentSha256" TEXT NOT NULL,
  "provisional" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pay_payslip_versions_pkey" PRIMARY KEY ("id")
)`);
  await p.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "pay_payslip_versions_payslipEntryId_version_key" ON "pay_payslip_versions"("payslipEntryId", "version")`
  );
  await p.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "pay_payslip_versions_practiceId_idx" ON "pay_payslip_versions"("practiceId")`
  );
  await p.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "pay_payslip_versions_payslipEntryId_idx" ON "pay_payslip_versions"("payslipEntryId")`
  );
  console.log("Applied pay_payslip_versions table.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());

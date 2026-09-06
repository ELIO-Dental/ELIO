const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const key = m[1];
  let val = m[2].trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  await p.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "pay_paid_invoice_line_logs" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pay_paid_invoice_line_logs_pkey" PRIMARY KEY ("id")
)`);

  await p.$executeRawUnsafe(`
CREATE UNIQUE INDEX IF NOT EXISTS "pay_paid_invoice_line_logs_practiceId_invoiceId_lineKey_key"
  ON "pay_paid_invoice_line_logs"("practiceId", "invoiceId", "lineKey")`);

  await p.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "pay_paid_invoice_line_logs_practiceId_idx"
  ON "pay_paid_invoice_line_logs"("practiceId")`);

  await p.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "pay_paid_invoice_line_logs_payPeriodId_idx"
  ON "pay_paid_invoice_line_logs"("payPeriodId")`);

  await p.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "pay_paid_invoice_line_logs_dentistId_idx"
  ON "pay_paid_invoice_line_logs"("dentistId")`);

  await p.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "pay_paid_invoice_line_logs"
    ADD CONSTRAINT "pay_paid_invoice_line_logs_practiceId_fkey"
    FOREIGN KEY ("practiceId") REFERENCES "practices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$`);

  await p.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "pay_paid_invoice_line_logs"
    ADD CONSTRAINT "pay_paid_invoice_line_logs_dentistId_fkey"
    FOREIGN KEY ("dentistId") REFERENCES "pay_dentists"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$`);

  await p.$executeRawUnsafe(`
DO $$ BEGIN
  ALTER TABLE "pay_paid_invoice_line_logs"
    ADD CONSTRAINT "pay_paid_invoice_line_logs_payPeriodId_fkey"
    FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$`);

  console.log("Applied pay_paid_invoice_line_logs migration.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());

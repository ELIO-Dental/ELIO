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
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "financeTermMonths" INTEGER`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "financeFeeManual" BOOLEAN NOT NULL DEFAULT false`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_payslip_entries" ADD COLUMN IF NOT EXISTS "provisional" BOOLEAN NOT NULL DEFAULT false`
  );
  console.log("Applied finance term / provisional columns.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());

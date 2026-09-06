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
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "dentallyLineKey" TEXT`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'DENTALLY'`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "manualCreatedByUserId" TEXT`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "manualNote" TEXT`
  );
  console.log("Applied pay_private_revenue_line_items Step 32 traceability columns.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());

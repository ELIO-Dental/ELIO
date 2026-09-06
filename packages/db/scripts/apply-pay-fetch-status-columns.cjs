const fs = require("fs");
const path = require("path");

// Load packages/db/.env before PrismaClient reads process.env.
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
DO $$ BEGIN
  CREATE TYPE "PayDentallyFetchStatus" AS ENUM ('IDLE', 'RUNNING', 'SUCCESS', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
`);
  await p.$executeRawUnsafe(
    `ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS "dentallyFetchStatus" "PayDentallyFetchStatus" NOT NULL DEFAULT 'IDLE'`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS "dentallyFetchStartedAt" TIMESTAMP(3)`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS "dentallyFetchFinishedAt" TIMESTAMP(3)`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS "dentallyFetchError" TEXT`
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE pay_periods ADD COLUMN IF NOT EXISTS "dentallyFetchResultJson" JSONB`
  );
  const cols = await p.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name='pay_periods' AND column_name LIKE 'dentallyFetch%'`
  );
  console.log(JSON.stringify(cols));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });

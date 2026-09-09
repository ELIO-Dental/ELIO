/**
 * Smoke: sync ONE appointments page with date window into seed-practice.
 * Proves appointments are no longer stuck at 0 after the date-filter fix.
 */
import { PrismaClient } from "@prisma/client";
import { syncPracticeDentallyPhasePage } from "../packages/dentally/src/sync";
import { DentallyClient } from "../packages/dentally/src/client";

const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";
const KEY = process.env.DENTALLY_API_KEY?.trim();
if (!KEY) {
  console.error("DENTALLY_API_KEY required");
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();
  const before = await prisma.appointment.count({ where: { practiceId: PRACTICE_ID } });
  const client = new DentallyClient({ apiKey: KEY });
  const page1 = await syncPracticeDentallyPhasePage(PRACTICE_ID, "appointments", 1, client);
  const after = await prisma.appointment.count({ where: { practiceId: PRACTICE_ID } });
  console.log(
    JSON.stringify(
      {
        before,
        after,
        upserted: page1.counts.appointments,
        errors: page1.errors.length,
        done: page1.done,
        nextPage: page1.nextPage,
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
  if (page1.counts.appointments <= 0) process.exit(2);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});

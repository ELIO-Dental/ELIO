import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(__dirname, "../../elio-deploy-env/shell.env") });
config({ path: resolve(__dirname, "../../elio-deploy-env/flow.env") });

const db = new PrismaClient();

async function main() {
  const practice = await db.practice.findFirst();
  if (!practice) throw new Error("no practice");

  const consults = await db.consult.findMany({
    where: { practiceId: practice.id },
    select: { quotePence: true, quotePenceOverride: true, totalPaidPence: true },
  });

  const planned = consults.reduce((s, c) => s + (c.quotePenceOverride ?? c.quotePence ?? 0), 0);
  const paid = consults.reduce((s, c) => s + (c.totalPaidPence ?? 0), 0);

  console.log(
    JSON.stringify(
      {
        count: consults.length,
        plannedPence: planned,
        plannedGBP: planned / 100,
        paidPence: paid,
        paidGBP: paid / 100,
        legacyPlanned: 4_263_121,
        legacyPaid: 1_971_138,
        plannedDiffGBP: planned / 100 - 4_263_121,
        paidDiffGBP: paid / 100 - 1_971_138,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

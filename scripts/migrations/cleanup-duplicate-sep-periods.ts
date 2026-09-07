/**
 * One-shot: collapse duplicate September 2026 pay periods.
 * KEEP: period with most payslips (canonical working period).
 * DELETE: empty period + UAT singleton periods (and their child payslips/lines).
 *
 * Dry-run by default. Pass --execute to write.
 */
import { prisma } from "@elio/db";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio-deploy-env/pay.env") });
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || "";

const EXECUTE = process.argv.includes("--execute");
const KEEP_ID = "cmtjywvu30003ul04urf4ro9w";

async function main() {
  const start = new Date(Date.UTC(2026, 8, 1));
  const end = new Date(Date.UTC(2026, 9, 1));
  const periods = await prisma.payPeriod.findMany({
    where: { periodStart: { gte: start, lt: end } },
    include: {
      _count: { select: { payslipEntries: true } },
      payslipEntries: {
        select: {
          id: true,
          dentistId: true,
          privateRevenueLineItems: { select: { id: true } },
          versions: { select: { id: true } },
        },
      },
    },
  });

  const keep = periods.find((p) => p.id === KEEP_ID);
  if (!keep) throw new Error(`Keep period ${KEEP_ID} not found`);

  const toRemove = periods.filter((p) => p.id !== KEEP_ID);
  console.log(EXECUTE ? "EXECUTE" : "DRY RUN");
  console.log(`Keep ${KEEP_ID} (${keep._count.payslipEntries} payslips)`);
  console.log(`Remove ${toRemove.length} periods`);

  for (const p of toRemove) {
    console.log(`- ${p.id} status=${p.status} payslips=${p._count.payslipEntries}`);
    if (!EXECUTE) continue;

    for (const entry of p.payslipEntries) {
      if (entry.privateRevenueLineItems.length) {
        await prisma.privateRevenueLineItem.deleteMany({
          where: { payslipEntryId: entry.id },
        });
      }
      if (entry.versions.length) {
        await prisma.payslipVersion.deleteMany({ where: { payslipEntryId: entry.id } });
      }
      await prisma.payslipEntry.delete({ where: { id: entry.id } });
    }
    await prisma.payPeriod.delete({ where: { id: p.id } });
    console.log(`  deleted ${p.id}`);
  }

  const after = await prisma.payPeriod.count({
    where: { periodStart: { gte: start, lt: end } },
  });
  console.log(`September periods remaining: ${after}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});

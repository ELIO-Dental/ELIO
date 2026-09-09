import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const practiceId = process.env.PRACTICE_ID?.trim() || "seed-practice";

async function main() {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { id: true, name: true, dentallyConnectionStatus: true },
  });

  const [patients, appointments, invoices, treatments, payments, accounts, plans] = await Promise.all([
    prisma.patient.count({ where: { practiceId } }),
    prisma.appointment.count({ where: { practiceId } }),
    prisma.invoice.count({ where: { practiceId } }),
    prisma.treatment.count({ where: { practiceId } }),
    prisma.dentallyPayment.count({ where: { practiceId } }),
    prisma.dentallyAccount.count({ where: { practiceId } }),
    prisma.dentallyPaymentPlan.count({ where: { practiceId } }),
  ]);

  const runs = await prisma.dentallySyncRun.findMany({
    where: { practiceId },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: {
      status: true,
      trigger: true,
      startedAt: true,
      finishedAt: true,
      errorMessage: true,
      counts: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        practice,
        counts: { patients, appointments, invoices, treatments, payments, accounts, plans },
        recentRuns: runs,
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
  .finally(() => prisma.$disconnect());

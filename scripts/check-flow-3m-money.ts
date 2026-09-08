import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(__dirname, "../../elio-deploy-env/shell.env") });
config({ path: resolve(__dirname, "../../elio-deploy-env/flow.env") });

const db = new PrismaClient();

function consultDate(c: {
  createdAt: Date;
  appointment?: { startsAt: Date } | null;
  enquiry?: { capturedAt: Date } | null;
}) {
  return c.appointment?.startsAt ?? c.enquiry?.capturedAt ?? c.createdAt;
}

function planValuePence(c: { quotePence: number | null; quotePenceOverride: number | null }) {
  return c.quotePenceOverride ?? c.quotePence ?? 0;
}

/** Legacy-style local calendar range (ElioFlow getDateRange 3-months). */
function legacyThreeMonths() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  start.setMonth(today.getMonth() - 3);
  return { start, end: now };
}

async function main() {
  const practice = await db.practice.findFirst();
  if (!practice) throw new Error("no practice");

  const all = await db.consult.findMany({
    where: { practiceId: practice.id },
    include: { appointment: true, enquiry: true },
  });

  const { start, end } = legacyThreeMonths();
  const filtered = all.filter((c) => {
    const d = consultDate(c);
    return d >= start && d <= end;
  });

  const planned = filtered.reduce((s, c) => s + planValuePence(c), 0) / 100;
  const paid = filtered.reduce((s, c) => s + (c.totalPaidPence ?? 0), 0) / 100;

  // Also: filter by consultationDate string like old UI (YYYY-MM-DD only)
  const byDateStr = all.filter((c) => {
    const d = consultDate(c);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return day >= start && day <= end;
  });

  console.log(
    JSON.stringify(
      {
        range: { start: start.toISOString(), end: end.toISOString() },
        filteredCount: filtered.length,
        plannedGBP: Math.round(planned),
        paidGBP: Math.round(paid),
        byDateStrCount: byDateStr.length,
        byDateStrPlanned: Math.round(byDateStr.reduce((s, c) => s + planValuePence(c), 0) / 100),
        byDateStrPaid: Math.round(byDateStr.reduce((s, c) => s + (c.totalPaidPence ?? 0), 0) / 100),
        allTimePlanned: Math.round(all.reduce((s, c) => s + planValuePence(c), 0) / 100),
        allTimePaid: Math.round(all.reduce((s, c) => s + (c.totalPaidPence ?? 0), 0) / 100),
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

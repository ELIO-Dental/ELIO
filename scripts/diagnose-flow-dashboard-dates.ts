/**
 * Diagnose Flow dashboard date / money mismatches that would show "wrong" UI.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(__dirname, "../../elio-deploy-env/shell.env") });
config({ path: resolve(__dirname, "../../elio-deploy-env/flow.env") });

const db = new PrismaClient();

function planValuePence(c: { quotePenceOverride: number | null; quotePence: number | null }) {
  return c.quotePenceOverride ?? c.quotePence ?? 0;
}

function consultDateCurrent(c: {
  appointment: { startsAt: Date | null } | null;
  enquiry: { capturedAt: Date } | null;
  createdAt: Date;
}) {
  return c.appointment?.startsAt ?? c.enquiry?.capturedAt ?? c.createdAt;
}

/** Prefer sheet capture date when present — migration truth for legacy rows. */
function consultDatePreferred(c: {
  appointment: { startsAt: Date | null } | null;
  enquiry: { capturedAt: Date } | null;
  createdAt: Date;
}) {
  return c.enquiry?.capturedAt ?? c.appointment?.startsAt ?? c.createdAt;
}

async function main() {
  const practice = await db.practice.findFirst({ orderBy: { createdAt: "asc" } });
  if (!practice) throw new Error("no practice");

  const t0 = Date.now();
  const consults = await db.consult.findMany({
    where: { practiceId: practice.id },
    include: {
      enquiry: { select: { capturedAt: true } },
      appointment: { select: { startsAt: true } },
    },
  });
  const queryMs = Date.now() - t0;

  let both = 0;
  let disagree = 0;
  let disagreeDaysGt1 = 0;
  const samples: Array<{ id: string; startsAt: string; capturedAt: string; days: number }> = [];

  for (const c of consults) {
    const starts = c.appointment?.startsAt;
    const captured = c.enquiry?.capturedAt;
    if (starts && captured) {
      both += 1;
      const days = Math.abs(starts.getTime() - captured.getTime()) / 86_400_000;
      if (days > 0.5) {
        disagree += 1;
        if (days > 1) {
          disagreeDaysGt1 += 1;
          if (samples.length < 8) {
            samples.push({
              id: c.id,
              startsAt: starts.toISOString(),
              capturedAt: captured.toISOString(),
              days: Math.round(days),
            });
          }
        }
      }
    }
  }

  const sum = (fn: (c: (typeof consults)[0]) => Date) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setMonth(start.getMonth() - 3);
    const filtered = consults.filter((c) => {
      const d = fn(c);
      return d >= start && d <= now;
    });
    return {
      count: filtered.length,
      planned: Math.round(filtered.reduce((s, c) => s + planValuePence(c), 0) / 100),
      paid: Math.round(filtered.reduce((s, c) => s + (c.totalPaidPence ?? 0), 0) / 100),
    };
  };

  const allCurrent = {
    count: consults.length,
    planned: Math.round(consults.reduce((s, c) => s + planValuePence(c), 0) / 100),
    paid: Math.round(consults.reduce((s, c) => s + (c.totalPaidPence ?? 0), 0) / 100),
  };

  const withAppt = consults.filter((c) => c.appointment?.startsAt).length;
  const withCaptured = consults.filter((c) => c.enquiry?.capturedAt).length;
  const neither = consults.filter((c) => !c.appointment?.startsAt && !c.enquiry?.capturedAt).length;

  console.log(
    JSON.stringify(
      {
        practiceId: practice.id,
        queryMs,
        total: consults.length,
        withAppt,
        withCaptured,
        neither,
        bothDates: both,
        disagreeAny: disagree,
        disagreeGt1Day: disagreeDaysGt1,
        samples,
        allTime: allCurrent,
        threeMonthCurrentDate: sum(consultDateCurrent),
        threeMonthPreferCaptured: sum(consultDatePreferred),
        legacyAllTime: { count: 819, planned: 4263121, paid: 1971138 },
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

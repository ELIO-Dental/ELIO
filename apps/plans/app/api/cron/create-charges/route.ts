// F.5 Final QA (2026-08-29) — REAL, SIGNIFICANT GAP FOUND AND FIXED:
// APPLICATION_FLOW.md §7c documents "Daily scheduled job: for each
// PatientPlan with an active mandate + active plan, due on today's date →
// create Payment via GoCardless API" as the literal, primary mechanism for
// BUG-1's fix — "this is the most important flow in the whole system," per
// the doc's own words. Traced through the real code and confirmed this job
// GENUINELY DID NOT EXIST: createCharge() (plans-service.ts) was fully
// built, correctly idempotent, and covered by e2e tests — but had ZERO real
// callers anywhere in the application, only test invocations. A separate
// createSubscription()/ensureSubscription() helper (which would delegate
// recurring billing to GoCardless's own native Subscriptions feature
// instead) was ALSO built but never called either. Net effect: a real
// patient completing signup today would get an ACTIVE mandate and a
// confirmation email, but literally nothing would ever charge them, ever —
// no cron, no subscription, nothing. This route closes that gap by
// implementing exactly what the doc specifies: a real daily job.
//
// Mirrors apps/shell/app/api/cron/dentally-sync/route.ts's real
// multi-practice iteration pattern (CRON_SECRET auth, loop every real
// practice, Promise.allSettled so one practice's failure doesn't block
// another's).
import { NextRequest, NextResponse } from "next/server";
import { prisma, scopedDb } from "@elio/db";
import { createCharge } from "@/lib/plans-service";

export const runtime = "nodejs";

/** An enrolment is "due today" when today's day-of-month matches the day its
 * billing anchor (startDate) was set on — the same "same date each month"
 * behavior a real GoCardless subscription would use, and the natural
 * interpretation of "billing schedule" given PatientPlanEnrolment has no
 * separate dedicated billing-day field of its own. Clamped for months
 * shorter than the anchor day (e.g. a 31st-anchored enrolment bills on the
 * 28th/30th in a shorter month) so no enrolment is silently skipped forever
 * in a month that doesn't have its exact anchor day. */
function isDueToday(startDate: Date, today: Date): boolean {
  const lastDayOfThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dueDay = Math.min(startDate.getDate(), lastDayOfThisMonth);
  return today.getDate() === dueDay;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();

  const practices = await prisma.practice.findMany({
    where: { suspendedAt: null },
    select: { id: true },
  });

  const results = await Promise.allSettled(
    practices.map(async (practice) => {
      const db = scopedDb(practice.id);
      const dueEnrolments = await db.patientPlanEnrolment.findMany({
        where: { status: "ACTIVE", startDate: { not: null } },
        include: {
          plan: { select: { monthlyPricePence: true } },
          planPatient: { include: { mandates: { where: { status: "ACTIVE" }, take: 1 } } },
        },
      });

      let charged = 0;
      let skipped = 0;
      for (const enrolment of dueEnrolments) {
        if (!enrolment.startDate || !isDueToday(enrolment.startDate, today)) continue;
        const mandate = enrolment.planPatient.mandates[0];
        if (!mandate || enrolment.plan.monthlyPricePence <= 0) {
          skipped++;
          continue;
        }
        // createCharge()'s own idempotentCreate() (packages/plans-engine/src/
        // billing.ts) is what actually prevents a double-charge if this job
        // ever runs twice for the same enrolment/period — this loop doesn't
        // need its own separate guard.
        await createCharge(practice.id, {
          planPatientId: enrolment.planPatientId,
          patientPlanEnrolmentId: enrolment.id,
          mandateId: mandate.id,
          gocardlessMandateId: mandate.gocardlessMandateId,
          amountPence: enrolment.plan.monthlyPricePence,
          chargeDate: today,
        });
        charged++;
      }
      return { practiceId: practice.id, charged, skipped };
    }),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<{ practiceId: string; charged: number; skipped: number }>).value);
  const failed = results.filter((r) => r.status === "rejected").length;
  const totalCharged = succeeded.reduce((sum, r) => sum + r.charged, 0);

  return NextResponse.json({ ok: true, practices: practices.length, totalCharged, failed, results: succeeded });
}

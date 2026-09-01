import { NextRequest, NextResponse } from "next/server";
import { auth, writeAuditLog } from "@elio/auth";
import { prisma } from "@elio/db";
import { syncPendingMandatesForPractice } from "@/lib/plans-service";
import { resolvePracticeAuditActor } from "@/lib/resolve-practice-audit-actor";

export const runtime = "nodejs";

/**
 * Daily poll of PENDING GoCardless mandates — legacy GET /api/cron/gc-sync (P1.8).
 * Complements webhooks when mandate.active events are missed.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasValidCronSecret = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let hasStaffSession = false;
  if (!hasValidCronSecret) {
    const session = await auth();
    const allowedRoles = ["SUPER_ADMIN", "OWNER", "ADMIN"];
    hasStaffSession = !!(session?.userId && session.practiceId && allowedRoles.includes(session.role ?? ""));
  }

  if (!hasValidCronSecret && !hasStaffSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const practices = await prisma.practice.findMany({
    where: {
      suspendedAt: null,
      licences: { some: { moduleId: "PLANS", active: true } },
    },
    select: { id: true },
  });

  const results = await Promise.allSettled(
    practices.map(async (practice) => {
      const result = await syncPendingMandatesForPractice(practice.id);
      const actor = await resolvePracticeAuditActor(practice.id);
      if (actor) {
        await writeAuditLog({
          ...actor,
          practiceId: practice.id,
          action: "plans.gocardless.mandate_sync",
          targetType: "Practice",
          targetId: practice.id,
          metadata: { trigger: "cron", ...result },
        });
      }
      return { practiceId: practice.id, ...result };
    }),
  );

  const aggregated = {
    checked: 0,
    activated: 0,
    failed: 0,
    cancelled: 0,
    unchanged: 0,
    errors: [] as string[],
  };

  for (const entry of results) {
    if (entry.status !== "fulfilled") continue;
    const r = entry.value;
    aggregated.checked += r.checked;
    aggregated.activated += r.activated;
    aggregated.failed += r.failed;
    aggregated.cancelled += r.cancelled;
    aggregated.unchanged += r.unchanged;
    aggregated.errors.push(...r.errors);
  }

  return NextResponse.json({
    ok: true,
    practices: practices.length,
    ...aggregated,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  });
}

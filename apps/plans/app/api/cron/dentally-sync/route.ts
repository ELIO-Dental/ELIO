import { NextRequest, NextResponse } from "next/server";
import { auth } from "@elio/auth";
import { prisma } from "@elio/db";
import { runPlansDentallySync, PlansDentallySyncConfigError, DentallySyncConfigError } from "@elio/dentally";

export const runtime = "nodejs";

/**
 * Nightly Plans Dentally patient sync — same runPlansDentallySync() as the
 * manual button so behaviour cannot drift (P1.3).
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
      try {
        const result = await runPlansDentallySync(practice.id);
        return { practiceId: practice.id, ...result };
      } catch (error) {
        if (error instanceof PlansDentallySyncConfigError) {
          return {
            practiceId: practice.id,
            skipped: true,
            reason: error.message,
            details: error.details,
          };
        }
        if (error instanceof DentallySyncConfigError) {
          return {
            practiceId: practice.id,
            skipped: true,
            reason: error.message,
            configured: false,
          };
        }
        throw error;
      }
    }),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({
    ok: true,
    practices: practices.length,
    succeeded,
    failed,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  });
}

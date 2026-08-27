import { NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { writeAuditLog, resolveAuditActor } from "@elio/auth";
import { requireOwnerSession } from "@/lib/require-owner";

// POST: toggle "Require MFA for all staff" for the caller's practice.
// Enforced server-side on next login (packages/auth/config.ts already reads
// `practice.requireMfaForAllStaff` fresh from the DB on every sign-in attempt).
export async function POST(req: Request) {
  const session = await requireOwnerSession();
  if (!session) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", details: [{ field: "enabled", message: "Required boolean." }] } }, { status: 400 });
  }

  const practice = await prisma.practice.update({
    where: { id: session.practiceId },
    data: { requireMfaForAllStaff: body.enabled },
  });

  await writeAuditLog({
    ...resolveAuditActor(session),
    practiceId: session.practiceId,
    action: "team.mfa_toggle.updated",
    targetType: "Practice",
    targetId: session.practiceId,
    metadata: { requireMfaForAllStaff: body.enabled },
  });

  return NextResponse.json({ ok: true, requireMfaForAllStaff: practice.requireMfaForAllStaff });
}

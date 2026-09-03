import { NextResponse } from "next/server";
import { prisma, type Role } from "@elio/db";
import { inviteUser, writeAuditLog, resolveAuditActor } from "@elio/auth";
import { requireOwnerSession, requireTeamViewSession } from "@/lib/require-owner";

const VALID_ROLES: Role[] = ["OWNER", "ADMIN", "FINANCE", "STAFF", "AUDITOR"];

// GET: list users in the caller's practice (OWNER or ADMIN view-only, per
// PERMISSIONS_MATRIX.md §2 — server-side enforced).
export async function GET() {
  const session = await requireTeamViewSession();
  if (!session) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { practiceId: session.practiceId, role: { not: "SUPER_ADMIN" } },
    select: {
      id: true,
      email: true,
      role: true,
      active: true,
      mfaEnabled: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users });
}

// POST: invite a new user into the caller's practice.
export async function POST(req: Request) {
  const session = await requireOwnerSession();
  if (!session) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const role = typeof body?.role === "string" ? (body.role as Role) : undefined;

  if (!email || !role || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", details: [{ field: !email ? "email" : "role", message: "Required and must be a valid value." }] } },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const result = await inviteUser({ email, role, practiceId: session.practiceId, appUrl });

    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: result.alreadyExisted ? "team.user.reinvited" : "team.user.invited",
      targetType: "User",
      targetId: result.userId,
      metadata: { email, role },
    });

    return NextResponse.json({ ok: true, userId: result.userId }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "EMAIL_IN_USE_OTHER_PRACTICE") {
      return NextResponse.json({ error: { code: "EMAIL_IN_USE" } }, { status: 409 });
    }
    console.error("[team.invite]", e);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma, type Role } from "@elio/db";
import { writeAuditLog, resolveAuditActor } from "@elio/auth";
import { requireOwnerSession } from "@/lib/require-owner";

const VALID_ROLES: Role[] = ["OWNER", "ADMIN", "FINANCE", "STAFF", "AUDITOR"];

// PATCH: change a user's role and/or active (deactivate/reactivate) state.
// Takes effect immediately — every request re-reads role/active from the DB
// (config.ts's authorize() and the JWT session both derive from the DB row at
// sign-in time; downstream module routes that call `can()` per-request also
// re-check the DB-backed session on each request, never a cached client value).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireOwnerSession();
  if (!session) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.practiceId !== session.practiceId) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: { role?: Role; active?: boolean } = {};
  const changes: Record<string, unknown> = {};

  if (typeof body?.role === "string") {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", details: [{ field: "role", message: "Invalid role." }] } }, { status: 400 });
    }
    if (body.role !== target.role) {
      data.role = body.role;
      changes.role = { from: target.role, to: body.role };
    }
  }

  if (typeof body?.active === "boolean") {
    if (target.id === session.userId && body.active === false) {
      return NextResponse.json({ error: { code: "CANNOT_DEACTIVATE_SELF" } }, { status: 400 });
    }
    if (body.active !== target.active) {
      data.active = body.active;
      changes.active = { from: target.active, to: body.active };
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, user: target });
  }

  const updated = await prisma.user.update({ where: { id }, data });

  await writeAuditLog({
    ...resolveAuditActor(session),
    practiceId: session.practiceId,
    action: "team.user.updated",
    targetType: "User",
    targetId: id,
    metadata: changes,
  });

  return NextResponse.json({ ok: true, user: updated });
}

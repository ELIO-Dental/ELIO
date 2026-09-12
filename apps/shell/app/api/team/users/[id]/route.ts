import { NextResponse } from "next/server";
import { prisma, type Role } from "@elio/db";
import { writeAuditLog, resolveAuditActor } from "@elio/auth";
import { requireOwnerSession } from "@/lib/require-owner";

const VALID_ROLES: Role[] = ["OWNER", "ADMIN", "FINANCE", "STAFF", "AUDITOR"];

// PATCH: change a user's role and/or active (deactivate/reactivate) state,
// and/or link them to a Dentist row via Dentist.userId.
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
  if (!target || target.practiceId !== session.practiceId || target.role === "SUPER_ADMIN") {
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

  // A practice with zero active OWNERs can no longer self-service its own
  // team/role management (team:manage is OWNER-only) — the self-deactivate
  // guard above only covers one path into that lockout; demoting or
  // deactivating the LAST active owner (including a non-self one, since
  // any OWNER can reach this route) hits the same dead end (found in a
  // security/stability review, 2026-09-12). Checked here, before any DB
  // write in this handler (including the dentist-link transaction below),
  // matching the fail-fast-before-writing convention every other guard in
  // this route already follows — an earlier version of this check ran
  // after the dentist-link transaction, so a request combining a dentist
  // link change with a last-owner-violating role change would commit the
  // link change and then still reject with 400, a genuine partial write.
  const wasActiveOwner = target.role === "OWNER" && target.active;
  const staysActiveOwner = (data.role ?? target.role) === "OWNER" && (data.active ?? target.active);
  if (wasActiveOwner && !staysActiveOwner) {
    const otherActiveOwners = await prisma.user.count({
      where: { practiceId: session.practiceId, role: "OWNER", active: true, id: { not: id } },
    });
    if (otherActiveOwners === 0) {
      return NextResponse.json({ error: { code: "LAST_OWNER" } }, { status: 400 });
    }
  }

  let dentistLinkChanged = false;
  if ("dentistId" in body) {
    const nextDentistId = body.dentistId === null || body.dentistId === "" ? null : String(body.dentistId);

    if (nextDentistId) {
      const dentist = await prisma.dentist.findFirst({
        where: { id: nextDentistId, practiceId: session.practiceId },
        select: { id: true, userId: true },
      });
      if (!dentist) {
        return NextResponse.json({ error: { code: "DENTIST_NOT_FOUND" } }, { status: 400 });
      }
      if (dentist.userId && dentist.userId !== id) {
        return NextResponse.json({ error: { code: "DENTIST_ALREADY_LINKED" } }, { status: 409 });
      }
    }

    const currentlyLinked = await prisma.dentist.findFirst({
      where: { practiceId: session.practiceId, userId: id },
      select: { id: true },
    });
    const fromId = currentlyLinked?.id ?? null;
    if (fromId !== nextDentistId) {
      dentistLinkChanged = true;
      changes.dentistId = { from: fromId, to: nextDentistId };

      await prisma.$transaction(async (tx) => {
        // Clear any existing link for this user.
        await tx.dentist.updateMany({
          where: { practiceId: session.practiceId, userId: id },
          data: { userId: null },
        });
        if (nextDentistId) {
          await tx.dentist.update({
            where: { id: nextDentistId },
            data: { userId: id },
          });
        }
      });
    }
  }

  if (Object.keys(data).length === 0 && !dentistLinkChanged) {
    return NextResponse.json({ ok: true, user: target });
  }

  const updated =
    Object.keys(data).length > 0 ? await prisma.user.update({ where: { id }, data }) : target;

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

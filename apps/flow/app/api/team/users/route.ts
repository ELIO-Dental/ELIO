import { NextResponse } from "next/server";
import { scopedDb, type Role } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

const VALID_ROLES: Role[] = ["OWNER", "ADMIN", "FINANCE", "STAFF", "AUDITOR"];

/** Practice roster — same shape as Plans/Portal Team (shell owns invites). */
export async function GET() {
  try {
    const session = await requirePermission("team:view");
    const db = scopedDb(session.practiceId);
    const users = await db.user.findMany({
      select: { id: true, email: true, role: true, active: true, mfaEnabled: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ users });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requirePermission("team:manage");
    const body = await req.json().catch(() => ({}));
    const { id, role, active } = body ?? {};
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (id === session.userId && active === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
    }
    const db = scopedDb(session.practiceId);
    const updated = await db.user.update({
      where: { id },
      data: {
        ...(role !== undefined ? { role } : {}),
        ...(active !== undefined ? { active } : {}),
      },
      select: { id: true, email: true, role: true, active: true, mfaEnabled: true, createdAt: true },
    });
    return NextResponse.json({ user: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

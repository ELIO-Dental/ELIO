import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { inviteUser, requestPasswordReset, writeAuditLog } from "@elio/auth";
import { requireSuperAdmin, UnauthorizedError } from "@/lib/require-super-admin";

/**
 * POST /api/tenants/[id]/users/[userId]/password-reset
 * Body: { mode?: "reset" | "reinvite" } — default "reset".
 * Uses shell origin for reset/invite links (SHELL_APP_ORIGIN).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const actorUserId = await requireSuperAdmin();
    const { id: practiceId, userId } = await params;
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === "reinvite" ? "reinvite" : "reset";

    const user = await prisma.user.findFirst({
      where: { id: userId, practiceId, role: { not: "SUPER_ADMIN" } },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const shellOrigin = process.env.SHELL_APP_ORIGIN ?? "http://localhost:3000";

    if (mode === "reinvite") {
      await inviteUser({
        email: user.email,
        role: user.role,
        practiceId,
        appUrl: shellOrigin,
      });
    } else {
      await requestPasswordReset(user.email, shellOrigin);
    }

    await writeAuditLog({
      actorUserId,
      practiceId,
      action: mode === "reinvite" ? "admin.user.reinvite" : "admin.user.password-reset",
      targetType: "User",
      targetId: user.id,
      metadata: { email: user.email, mode },
    });

    return NextResponse.json({ success: true, mode });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("[admin/password-reset] Error:", error);
    return NextResponse.json({ error: "Failed to send password reset" }, { status: 500 });
  }
}

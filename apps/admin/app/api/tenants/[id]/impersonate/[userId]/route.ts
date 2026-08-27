import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, UnauthorizedError } from "@/lib/require-super-admin";
import { startImpersonation, ImpersonationError } from "@elio/auth";

/**
 * POST /api/tenants/[id]/impersonate/[userId] — Step 2.3, APPLICATION_FLOW.md
 * §11a. Creates the real ImpersonationSession + start AuditLog row (using the
 * Super Admin's OWN real apps/admin session — requireSuperAdmin() below),
 * then 303-redirects the browser straight into apps/shell to actually
 * redeem it into a real (impersonated) session there. A plain HTML form
 * POST follows a 303 exactly like a link click, no client JS needed for
 * the handoff itself.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const actorUserId = await requireSuperAdmin();
    const { userId } = await params;

    const result = await startImpersonation({ superAdminUserId: actorUserId, targetUserId: userId });

    const shellOrigin = process.env.SHELL_APP_ORIGIN ?? "http://localhost:3000";
    return NextResponse.redirect(`${shellOrigin}/api/impersonate/start?token=${result.impersonationSessionId}`, { status: 303 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ImpersonationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[admin/impersonate] Error:", error);
    return NextResponse.json({ error: "Failed to start impersonation" }, { status: 500 });
  }
}

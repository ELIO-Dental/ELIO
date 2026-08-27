import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { updateRedeemRuleApproval } from "@/lib/plans-service";
import { resolveAuditActor } from "@elio/auth";

// PATCH: toggle a redeem rule's approval requirement
// (PERMISSIONS_MATRIX.md §4 "Edit practice settings" -> plans:edit-settings).
export async function PATCH(req: Request) {
  try {
    const session = await requirePermission("plans:edit-settings");
    const body = await req.json().catch(() => ({}));
    const { redeemRuleId, requiresApproval } = body ?? {};
    if (typeof redeemRuleId !== "string" || !redeemRuleId || typeof requiresApproval !== "boolean") {
      return NextResponse.json({ error: "redeemRuleId and requiresApproval are required" }, { status: 400 });
    }
    const rule = await updateRedeemRuleApproval(session.practiceId, resolveAuditActor(session), redeemRuleId, requiresApproval);
    return NextResponse.json({ rule });
  } catch (e) {
    return errorResponse(e);
  }
}

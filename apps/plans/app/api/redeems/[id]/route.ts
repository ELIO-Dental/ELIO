import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { approveRedeem, getRedeem, rejectRedeem } from "@/lib/plans-service";
import { resolveAuditActor } from "@elio/auth";

/** Single-redeem detail — legacy parity (OLD had this, NEW never did). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("plans:resolve-mismatch");
    const { id } = await params;
    const redeem = await getRedeem(session.practiceId, id);
    if (!redeem) return NextResponse.json({ error: "Redeem not found" }, { status: 404 });
    return NextResponse.json({ redeem });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Approve (optionally partial) or reject a PENDING_APPROVAL redeem
 * (PERMISSIONS_MATRIX.md §4 — "Resolve reconciliation mismatches, issue redeems"
 * -> plans:resolve-mismatch). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("plans:resolve-mismatch");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const decision = body?.decision;
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
    }
    const redeem =
      decision === "approve"
        ? await approveRedeem(
            session.practiceId,
            resolveAuditActor(session),
            id,
            body?.isPartial
              ? {
                  isPartial: true,
                  earnedPercentage: typeof body.earnedPercentage === "number" ? body.earnedPercentage : null,
                  partialReason: typeof body.partialReason === "string" ? body.partialReason : null,
                }
              : undefined,
          )
        : await rejectRedeem(session.practiceId, resolveAuditActor(session), id, body?.rejectionReason);
    return NextResponse.json({ redeem });
  } catch (e) {
    return errorResponse(e);
  }
}

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { recordOutcome } from "@/lib/flow-service";
import { resolveAuditActor } from "@elio/auth";

const VALID_OUTCOMES = ["ACCEPTED", "THINKING", "DECLINED"] as const;
const VALID_STUCK_REASONS = ["FAILED_FINANCE", "PRICE_SHOPPING", "BAD_EXPERIENCE", "OUT_OF_BUDGET"] as const;

/** Record a Consult's outcome (Accepted / Thinking+stuckReason /
 * Declined+stuckReason) from the consult detail screen's outcome control. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { outcome, stuckReason } = body ?? {};
    if (!VALID_OUTCOMES.includes(outcome)) {
      return NextResponse.json({ error: "A valid outcome is required" }, { status: 400 });
    }
    if (stuckReason !== undefined && stuckReason !== null && !VALID_STUCK_REASONS.includes(stuckReason)) {
      return NextResponse.json({ error: "Invalid stuckReason" }, { status: 400 });
    }
    const result = await recordOutcome(session.practiceId, resolveAuditActor(session), {
      consultId: id,
      outcome,
      stuckReason: stuckReason ?? undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

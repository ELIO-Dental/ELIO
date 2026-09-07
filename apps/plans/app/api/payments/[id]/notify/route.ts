import { NextResponse } from "next/server";
import { resolveAuditActor, writeAuditLog } from "@elio/auth";
import { requireViewPayments } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { resendPaymentFailedNotification } from "@/lib/plans-service";

type RouteParams = { params: Promise<{ id: string }> };

/** Ops Notify on FAILED payment — legacy payments page Mail CTA. */
export async function POST(_req: Request, { params }: RouteParams) {
  try {
    const session = await requireViewPayments();
    const { id } = await params;
    const result = await resendPaymentFailedNotification(session.practiceId, id);
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "plans.payment.notify_failed",
      targetType: "PlanPayment",
      targetId: id,
      metadata: { success: result.success !== false },
    });
    if (result && "success" in result && result.success === false) {
      return NextResponse.json({ error: result.error ?? "Notify failed" }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}

import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { reviewPayLine } from "@/lib/pay-service";
import { resolveAuditActor } from "@elio/auth";

/** Manual Review screen action — corrects an unmatched PayLine to a real
 * Dentist and writes an AuditLog row (§6.2 / PERMISSIONS_MATRIX §3). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:review-nhs-figure");
    const { payLineId, dentistId } = await req.json();
    if (typeof payLineId !== "string" || typeof dentistId !== "string") {
      return NextResponse.json({ error: "payLineId and dentistId are required" }, { status: 400 });
    }
    const updated = await reviewPayLine(session.practiceId, resolveAuditActor(session), payLineId, dentistId);
    return NextResponse.json({ payLine: updated });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}

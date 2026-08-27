import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { runReconciliation } from "@/lib/plans-service";

/** Trigger a reconciliation run for a billing period (PERMISSIONS_MATRIX.md
 * §4 — "Resolve reconciliation mismatches" -> plans:resolve-mismatch). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:resolve-mismatch");
    const body = await req.json().catch(() => ({}));
    const period = typeof body?.period === "string" ? body.period : undefined;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ error: "period is required, format YYYY-MM" }, { status: 400 });
    }
    const result = await runReconciliation(session.practiceId, period);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

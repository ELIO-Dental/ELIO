import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { syncConsultFinancials } from "@/lib/flow-service";

/** Sync `Consult.totalPaidPence` and `hasDeposit` from the linked patient's
 * Dentally-synced payments (legacy manual-sync parity). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const { id } = await params;
    const result = await syncConsultFinancials(session.practiceId, id);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

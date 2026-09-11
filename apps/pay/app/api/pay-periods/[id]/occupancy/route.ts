import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { loadPeriodOccupancy } from "@/lib/dentally-occupancy-service";

/** Diary occupancy / white-space report for a pay period (AuraPay parity). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAnyPermission("pay:view", "pay:view:readonly");
    const { id } = await params;
    const data = await loadPeriodOccupancy(session.practiceId, id);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

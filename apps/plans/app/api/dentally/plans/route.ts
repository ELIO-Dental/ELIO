import { NextResponse } from "next/server";
import {
  DentallySyncConfigError,
  fetchLiveDentallyPaymentPlans,
} from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Live Dentally payment plans for the mappings UI (legacy GET /api/dentally/plans). */
export async function GET() {
  try {
    const session = await requirePermission("plans:edit-settings");
    const plans = await fetchLiveDentallyPaymentPlans(session.practiceId);
    return NextResponse.json({ plans, configured: true });
  } catch (e) {
    if (e instanceof DentallySyncConfigError) {
      return NextResponse.json(
        {
          error: "Dentally is not configured. Add your API key in Settings.",
          configured: false,
        },
        { status: 400 },
      );
    }
    return errorResponse(e);
  }
}

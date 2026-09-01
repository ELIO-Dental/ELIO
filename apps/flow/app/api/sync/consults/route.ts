import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { importCosmeticConsultsFromDentally } from "@/lib/flow-service";

/** F1.1 — import cosmetic consults from Dentally-synced appointments. */
export async function POST() {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const result = await importCosmeticConsultsFromDentally(session.practiceId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}

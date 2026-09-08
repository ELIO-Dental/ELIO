import { NextResponse } from "next/server";
import { requirePermission, resolveFlowScope } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getFlowDashboard } from "@/lib/flow-service";
import { parseLocalDateEnd, parseLocalDateStart } from "@/lib/flow-date-range";

/** F2 — dashboard stats + table rows with optional ?from=&to=&dentistId= filters. */
export async function GET(req: Request) {
  try {
    const session = await requirePermission("flow:view");
    const scope = await resolveFlowScope(session);
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const dentistId = searchParams.get("dentistId");

    let from: Date | undefined;
    let to: Date | undefined;
    if (fromParam && toParam) {
      // Local calendar days — same basis as classic ElioFlow date filtering.
      from = parseLocalDateStart(fromParam);
      to = parseLocalDateEnd(toParam);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
      }
    }

    const data = await getFlowDashboard(session.practiceId, {
      from,
      to,
      dentistId: dentistId && dentistId !== "all" ? dentistId : null,
      scope,
    });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

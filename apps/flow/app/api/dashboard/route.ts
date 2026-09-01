import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getFlowDashboard } from "@/lib/flow-service";

/** F2 — dashboard stats + table rows with optional ?from=&to=&dentistId= filters. */
export async function GET(req: Request) {
  try {
    const session = await requirePermission("flow:view");
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const dentistId = searchParams.get("dentistId");

    let from: Date | undefined;
    let to: Date | undefined;
    if (fromParam && toParam) {
      from = new Date(fromParam);
      to = new Date(toParam);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
      }
      to.setHours(23, 59, 59, 999);
    }

    const data = await getFlowDashboard(session.practiceId, {
      from,
      to,
      dentistId: dentistId && dentistId !== "all" ? dentistId : null,
    });
    return NextResponse.json(data);
  } catch (e) {
    return errorResponse(e);
  }
}

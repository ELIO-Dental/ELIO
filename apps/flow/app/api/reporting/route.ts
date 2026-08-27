import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { UnauthorizedError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getConversionReport } from "@/lib/flow-service";

/** Conversion report, optionally filtered by ?from=&to= (ISO dates) — powers
 * the reporting screen's date-range filter. Defaults to all-time when unset. */
export async function GET(req: Request) {
  try {
    const session = await requireSession();
    if (!session) throw new UnauthorizedError("Not signed in");

    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    let dateRange: { from: Date; to: Date } | undefined;
    if (fromParam && toParam) {
      const from = new Date(fromParam);
      const to = new Date(toParam);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
      }
      dateRange = { from, to };
    }

    const result = await getConversionReport(session.practiceId, dateRange);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

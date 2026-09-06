import { NextResponse } from "next/server";
import { DentallyFetchConfigError } from "@/lib/dentally-fetch";
import {
  enqueuePayPeriodDentallyFetch,
  getPayPeriodDentallyFetchStatus,
} from "@/lib/dentally-fetch-job";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/**
 * Y1.2 + revision1 Step 3 — enqueue Dentally fetch in the background.
 * Returns 202 immediately; poll GET for status / result. Period pages never call Dentally.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id: payPeriodId } = await params;

    const queued = await enqueuePayPeriodDentallyFetch(session.practiceId, payPeriodId);
    return NextResponse.json(
      {
        ok: true,
        queued: true,
        status: queued.status,
        mode: queued.mode,
        message:
          queued.mode === "already_running"
            ? "Dentally fetch already in progress"
            : "Dentally fetch started",
      },
      { status: 202 }
    );
  } catch (err) {
    if (err instanceof DentallyFetchConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.message === "Pay period is locked") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Error && err.message === "Pay period not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}

/** Poll fetch job status from DB only (no Dentally). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id: payPeriodId } = await params;
    const status = await getPayPeriodDentallyFetchStatus(session.practiceId, payPeriodId);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof Error && err.message === "Pay period not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}

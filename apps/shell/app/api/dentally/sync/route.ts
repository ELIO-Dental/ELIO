// Manual "sync now" trigger — preserves the UX pattern from ElioPay aurapay's
// synchronous /api/dentally route, but per project-docs/PERFORMANCE_SCALABILITY.md
// section 1 this must NOT run the sync inline: it enqueues the background job
// and returns immediately (202-style), letting the UI poll for completion
// rather than blocking the request on a full-practice sync.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requestDentallySync } from "@elio/dentally";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids } = await requestDentallySync(session.practiceId, "manual");

  return NextResponse.json(
    {
      ok: true,
      message: "Dentally sync started — this runs in the background and may take a few minutes for a large practice.",
      eventId: ids[0] ?? null,
    },
    { status: 202 }
  );
}

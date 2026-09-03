// Manual "sync now" trigger — preserves the UX pattern from ElioPay aurapay's
// synchronous /api/dentally route, but per project-docs/PERFORMANCE_SCALABILITY.md
// section 1 this must NOT run the sync inline: it enqueues the background job
// and returns immediately (202-style), letting the UI poll for completion
// rather than blocking the request on a full-practice sync.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@elio/auth";
import type { Role } from "@elio/db";
import {
  DentallySyncConfigError,
  hasActiveDentallySyncRun,
  requestDentallySync,
  resolvePracticeDentallyApiKey,
} from "@elio/dentally";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session as { role?: Role }).role;
  if (!role || !can({ role }, "integrations:manage")) {
    return NextResponse.json(
      { error: "Only practice owners and admins can trigger Dentally sync" },
      { status: 403 }
    );
  }

  try {
    await resolvePracticeDentallyApiKey(session.practiceId);
  } catch (err) {
    const message =
      err instanceof DentallySyncConfigError
        ? err.message
        : "Dentally is not configured. Add your API key in Settings → Integrations.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (await hasActiveDentallySyncRun(session.practiceId)) {
    return NextResponse.json(
      { error: "A Dentally sync is already running. Wait for it to finish, then try again." },
      { status: 409 }
    );
  }

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

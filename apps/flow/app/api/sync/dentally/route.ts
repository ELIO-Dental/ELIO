import { NextResponse, after } from "next/server";
import { writeAuditLog, resolveAuditActor } from "@elio/auth";
import {
  DentallySyncConfigError,
  hasActiveDentallySyncRun,
  requestDentallySync,
  resolvePracticeDentallyApiKey,
  syncAllConsultFinancialsFromSyncedCore,
} from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { parseFlowDentallySyncMode } from "@/lib/flow-sync";

/**
 * F1.7 — Flow manual Dentally sync: full (background, pulls from Dentally) or
 * payments-only (synchronous, re-derives from already-synced Postgres rows).
 */
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const body = await req.json().catch(() => ({}));
    const mode = parseFlowDentallySyncMode(body?.mode);

    if (mode === "payments") {
      // Reads/writes already-synced Postgres rows only — no Dentally API calls, so
      // no realistic timeout risk. Previously backgrounded via after() with the real
      // {total, updated, errors} result written ONLY to the audit log — the caller
      // got a generic "started" message and never learned the outcome, so per-consult
      // failures were reported nowhere the user could see (console.error only).
      // Awaiting it directly and returning the real counts is both simpler and more
      // honest than a background job whose result nobody could read.
      const practiceId = session.practiceId;
      const result = await syncAllConsultFinancialsFromSyncedCore(practiceId);
      await writeAuditLog({
        ...resolveAuditActor(session),
        practiceId,
        action: "flow.sync.payments",
        targetType: "Practice",
        targetId: practiceId,
        metadata: { ...result },
      });

      return NextResponse.json({
        ok: true,
        mode: "payments",
        ...result,
        message: `Payment sync complete — updated ${result.updated} of ${result.total} consult(s)${result.errors > 0 ? `, ${result.errors} failed` : ""}.`,
      });
    }

    try {
      await resolvePracticeDentallyApiKey(session.practiceId);
    } catch (err) {
      const message =
        err instanceof DentallySyncConfigError
          ? err.message
          : "Dentally is not configured. Add your API key in Portal Settings → Integrations.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (await hasActiveDentallySyncRun(session.practiceId)) {
      return NextResponse.json(
        { error: "A Dentally sync is already running. Wait for it to finish, then try again." },
        { status: 409 }
      );
    }

    const { ids, mode: syncMode } = await requestDentallySync(session.practiceId, "manual", {
      scheduleInline: (job) => after(job),
    });
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "flow.sync.full",
      targetType: "Practice",
      targetId: session.practiceId,
      metadata: { eventId: ids[0] ?? null, syncMode },
    });

    return NextResponse.json(
      {
        ok: true,
        mode: "full",
        syncMode,
        message:
          "Dentally sync started — this runs in the background. Cosmetic consult import runs automatically when sync completes.",
        eventId: ids[0] ?? null,
      },
      { status: 202 }
    );
  } catch (e) {
    return errorResponse(e);
  }
}

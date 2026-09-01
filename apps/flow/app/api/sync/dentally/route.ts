import { NextResponse } from "next/server";
import { writeAuditLog, resolveAuditActor } from "@elio/auth";
import {
  DentallySyncConfigError,
  requestDentallySync,
  resolvePracticeDentallyApiKey,
  syncAllConsultFinancialsFromSyncedCore,
} from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { parseFlowDentallySyncMode } from "@/lib/flow-sync";

/** F1.7 — Flow manual Dentally sync: full (background) or payments-only (existing consults). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("flow:capture-enquiry");
    const body = await req.json().catch(() => ({}));
    const mode = parseFlowDentallySyncMode(body?.mode);

    if (mode === "payments") {
      const result = await syncAllConsultFinancialsFromSyncedCore(session.practiceId);
      await writeAuditLog({
        ...resolveAuditActor(session),
        practiceId: session.practiceId,
        action: "flow.sync.payments",
        targetType: "Practice",
        targetId: session.practiceId,
        metadata: { ...result },
      });
      return NextResponse.json({ ok: true, mode: "payments", ...result });
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

    const { ids } = await requestDentallySync(session.practiceId, "manual");
    await writeAuditLog({
      ...resolveAuditActor(session),
      practiceId: session.practiceId,
      action: "flow.sync.full",
      targetType: "Practice",
      targetId: session.practiceId,
      metadata: { eventId: ids[0] ?? null },
    });

    return NextResponse.json(
      {
        ok: true,
        mode: "full",
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

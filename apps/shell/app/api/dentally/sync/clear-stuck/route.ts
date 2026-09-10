// Manual escape hatch: force-fail a wedged RUNNING sync without waiting for the
// automatic heartbeat/absolute staleness checks. Previously this required the ops
// CRON_SECRET route (apps/shell/app/api/cron/clear-stuck-dentally-sync) — practice
// owners/admins had no way to unblock their own stuck "Sync now" from the UI.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@elio/auth";
import type { Role } from "@elio/db";
import { failLatestRunningDentallySyncRun } from "@elio/dentally";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session as { role?: Role }).role;
  if (!role || !can({ role }, "integrations:manage")) {
    return NextResponse.json(
      { error: "Only practice owners and admins can manage the Dentally connection" },
      { status: 403 }
    );
  }

  const result = await failLatestRunningDentallySyncRun(
    session.practiceId,
    "Cleared manually from Integrations — a running sync was stuck with no visible progress. Click Sync now to retry."
  );

  return NextResponse.json({ ok: true, cleared: result.cleared });
}

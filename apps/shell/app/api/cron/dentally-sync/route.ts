// Scheduled full-practice Dentally sync — dispatched by Vercel Cron (see
// vercel.json), authenticated via CRON_SECRET. Enqueues Inngest jobs or
// schedules inline via Next `after()` when Inngest is not configured.
import { after, NextRequest, NextResponse } from "next/server";
import { hasActiveDentallySyncRun, requestDentallySync } from "@elio/dentally";
import { verifyCronSecret } from "@elio/auth";
import { listPracticesForScheduledSync } from "@/lib/dentally-cron";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const practices = await listPracticesForScheduledSync();
  let enqueued = 0;
  let skippedActive = 0;

  for (const p of practices) {
    if (await hasActiveDentallySyncRun(p.id)) {
      skippedActive++;
      continue;
    }
    await requestDentallySync(p.id, "scheduled", {
      scheduleInline: (job) => after(job),
    });
    enqueued++;
  }

  return NextResponse.json({
    ok: true,
    practices: practices.length,
    enqueued,
    skippedActive,
  });
}

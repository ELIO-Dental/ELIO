// Ops helper: mark abandoned Dentally sync runs FAILED so Sync now unlocks.
// Auth: Bearer CRON_SECRET (same as other shell crons).
//
// Scheduled daily via apps/shell/vercel.json (Vercel Hobby-tier crons only
// run once/day — see that file's comment) — found unscheduled entirely in a
// 2026-09-12 security/stability review despite being the only thing that can
// clear a genuinely-dead RUNNING row now that status reads are pure (no
// auto-fail-on-read, see sync-run.ts's own history note).
//
// GET  /api/cron/clear-stuck-dentally-sync          → fail RUNNING older than STALE_RUNNING_MS (currently 12.5h — see sync-run.ts)
// GET  /api/cron/clear-stuck-dentally-sync?force=1 → fail ALL RUNNING (any age)
import { NextRequest, NextResponse } from "next/server";
import { failStaleDentallySyncRuns, STALE_RUNNING_MS } from "@elio/dentally";
import { verifyCronSecret } from "@elio/auth";
import { prisma } from "@elio/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!verifyCronSecret(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";

  if (!force) {
    const result = await failStaleDentallySyncRuns();
    return NextResponse.json({
      ok: true,
      mode: "stale",
      staleAfterMs: STALE_RUNNING_MS,
      cleared: result.cleared,
    });
  }

  const stuck = await prisma.dentallySyncRun.findMany({
    where: { status: "RUNNING" },
    select: { id: true, practiceId: true, startedAt: true },
  });

  if (stuck.length === 0) {
    return NextResponse.json({ ok: true, mode: "force", cleared: 0, runs: [] });
  }

  const now = new Date();
  const message =
    "Marked failed manually: abandoned RUNNING sync cleared so Sync now can be retried after Inngest setup.";

  await prisma.dentallySyncRun.updateMany({
    where: { id: { in: stuck.map((r) => r.id) } },
    data: { status: "FAILED", finishedAt: now, errorMessage: message },
  });

  const practiceIds = [...new Set(stuck.map((r) => r.practiceId))];
  await Promise.all(
    practiceIds.map((id) =>
      prisma.practice.update({
        where: { id },
        data: { dentallyConnectionStatus: "ERROR" },
      })
    )
  );

  return NextResponse.json({
    ok: true,
    mode: "force",
    cleared: stuck.length,
    runs: stuck.map((r) => ({
      id: r.id,
      practiceId: r.practiceId,
      startedAt: r.startedAt.toISOString(),
    })),
  });
}

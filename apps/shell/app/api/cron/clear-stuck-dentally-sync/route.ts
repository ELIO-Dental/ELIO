// Ops helper: mark abandoned Dentally sync runs FAILED so Sync now unlocks.
// Auth: Bearer CRON_SECRET (same as other shell crons).
//
// GET  /api/cron/clear-stuck-dentally-sync          → fail RUNNING older than 30m
// GET  /api/cron/clear-stuck-dentally-sync?force=1 → fail ALL RUNNING (any age)
import { NextRequest, NextResponse } from "next/server";
import { failStaleDentallySyncRuns, STALE_RUNNING_MS } from "@elio/dentally";
import { prisma } from "@elio/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

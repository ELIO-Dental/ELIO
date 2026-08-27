// Scheduled full-practice Dentally sync — dispatched by Vercel Cron (see
// vercel.json), authenticated via CRON_SECRET (already scaffolded in
// apps/shell/.env.local). This route itself does no syncing work — it just
// enqueues one background job per connected practice and returns; the actual
// pull happens in packages/dentally's Inngest function
// (project-docs/PERFORMANCE_SCALABILITY.md section 1 — never sync inline).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { requestDentallySync } from "@elio/dentally";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const practices = await prisma.practice.findMany({
    where: { dentallyConnectionStatus: "CONNECTED", suspendedAt: null },
    select: { id: true },
  });

  const results = await Promise.allSettled(
    practices.map((p) => requestDentallySync(p.id, "scheduled"))
  );
  const enqueued = results.filter((r) => r.status === "fulfilled").length;

  return NextResponse.json({ ok: true, practices: practices.length, enqueued });
}

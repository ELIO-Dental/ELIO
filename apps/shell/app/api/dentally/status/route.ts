import { NextRequest, NextResponse } from "next/server";
import { can, getSession } from "@elio/auth";
import type { Role } from "@elio/db";
import { getDentallyIntegrationStatus } from "@/lib/dentally-integration";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const practiceId = (session as { practiceId?: string }).practiceId;
  if (!practiceId) return NextResponse.json({ error: "No practice context" }, { status: 400 });

  const role = (session as { role?: Role }).role;
  const testConnection = req.nextUrl.searchParams.get("test") === "1";
  if (testConnection && (!role || !can({ role }, "integrations:manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const status = await getDentallyIntegrationStatus(practiceId, { testConnection });
    return NextResponse.json(status);
  } catch (err) {
    console.error("[dentally/status] Error:", err);
    return NextResponse.json({ error: "Failed to load Dentally status" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, UnauthorizedError } from "@/lib/require-super-admin";
import { toggleLicence } from "@/lib/admin-service";
import type { ModuleId } from "@elio/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actorUserId = await requireSuperAdmin();
    const { id } = await params;
    const body = await request.json();
    const moduleId = String(body.moduleId) as ModuleId;
    const active = Boolean(body.active);
    if (!["PAY", "PLANS", "FLOW"].includes(moduleId)) {
      return NextResponse.json({ error: "Invalid moduleId" }, { status: 400 });
    }
    const licence = await toggleLicence(actorUserId, id, moduleId, active);
    return NextResponse.json({ success: true, licence });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("[admin/licence] Error:", error);
    return NextResponse.json({ error: "Failed to update licence" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, UnauthorizedError } from "@/lib/require-super-admin";
import { setPlanLabel } from "@/lib/admin-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actorUserId = await requireSuperAdmin();
    const { id } = await params;
    const body = await request.json();
    const plan = String(body.plan ?? "").trim();
    if (!plan) return NextResponse.json({ error: "Plan label required" }, { status: 400 });
    const practice = await setPlanLabel(actorUserId, id, plan);
    return NextResponse.json({ success: true, practice });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("[admin/plan] Error:", error);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
}

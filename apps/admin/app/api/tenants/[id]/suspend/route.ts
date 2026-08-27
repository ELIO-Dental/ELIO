import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, UnauthorizedError } from "@/lib/require-super-admin";
import { setSuspended } from "@/lib/admin-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actorUserId = await requireSuperAdmin();
    const { id } = await params;
    const body = await request.json();
    const suspended = Boolean(body.suspended);
    const practice = await setSuspended(actorUserId, id, suspended);
    return NextResponse.json({ success: true, practice });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("[admin/suspend] Error:", error);
    return NextResponse.json({ error: "Failed to update suspension" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin, UnauthorizedError } from "@/lib/require-super-admin";
import { toggleFeatureFlag } from "@/lib/admin-service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actorUserId = await requireSuperAdmin();
    const { id } = await params;
    const body = await request.json();
    const featureFlagId = String(body.featureFlagId ?? "");
    const enabled = Boolean(body.enabled);
    if (!featureFlagId) return NextResponse.json({ error: "featureFlagId required" }, { status: 400 });
    const flag = await toggleFeatureFlag(actorUserId, id, featureFlagId, enabled);
    return NextResponse.json({ success: true, flag });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("[admin/feature-flag] Error:", error);
    return NextResponse.json({ error: "Failed to update feature flag" }, { status: 500 });
  }
}

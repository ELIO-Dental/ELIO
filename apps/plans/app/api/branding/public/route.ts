import { NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { getBrandingSettings } from "@/lib/plans-settings";

/** Public branding for patient signup (legacy /api/branding/public, P4.7). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token query parameter is required" }, { status: 400 });
  }

  const signingRequest = await prisma.planSigningRequest.findUnique({
    where: { token },
    select: { practiceId: true, expiresAt: true },
  });
  if (!signingRequest || signingRequest.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
  }

  const branding = await getBrandingSettings(signingRequest.practiceId);
  return NextResponse.json(branding);
}

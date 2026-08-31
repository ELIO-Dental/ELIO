import { NextRequest, NextResponse } from "next/server";
import { can, encryptSecret, getSession } from "@elio/auth";
import { prisma } from "@elio/db";
import type { Role } from "@elio/db";

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const practiceId = (session as { practiceId?: string }).practiceId;
  if (!practiceId) return NextResponse.json({ error: "No practice context" }, { status: 400 });

  const role = (session as { role?: Role }).role;
  if (!role || !can({ role }, "integrations:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return NextResponse.json({ error: "Dentally API key is required" }, { status: 400 });
  }

  await prisma.practice.update({
    where: { id: practiceId },
    data: {
      dentallyApiKey: encryptSecret(apiKey),
      dentallyConnectionStatus: "NOT_CONNECTED",
    },
  });

  return NextResponse.json({ ok: true, configured: true });
}

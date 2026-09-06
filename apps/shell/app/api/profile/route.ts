import { NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      mfaEnabled: true,
      createdAt: true,
      practiceId: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const data: { email?: string; displayName?: string | null } = {};

  if ("displayName" in body) {
    const raw = typeof body.displayName === "string" ? body.displayName.trim() : "";
    data.displayName = raw.length > 0 ? raw.slice(0, 120) : null;
  }

  if ("email" in body) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: { code: "INVALID_EMAIL" } }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: { email, NOT: { id: session.userId } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: { code: "EMAIL_TAKEN" } }, { status: 409 });
    }
    data.email = email;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data,
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      mfaEnabled: true,
      createdAt: true,
      practiceId: true,
    },
  });

  return NextResponse.json({ ok: true, user });
}

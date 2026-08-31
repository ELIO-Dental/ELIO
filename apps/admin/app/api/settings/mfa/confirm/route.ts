import { NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { verifyMfaCode } from "@elio/auth";
import { requireSuperAdmin, UnauthorizedError } from "@/lib/require-super-admin";

/** Verify a TOTP code and save MFA on the Super Admin account. */
export async function POST(req: Request) {
  try {
    const userId = await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const secret = typeof body?.secret === "string" ? body.secret.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!secret || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }

    if (!verifyMfaCode(user.email, secret, code)) {
      return NextResponse.json({ error: { code: "MFA_INVALID" } }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaSecret: secret },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    throw e;
  }
}

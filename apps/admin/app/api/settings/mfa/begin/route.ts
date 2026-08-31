import { NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { generateMfaSecret, mfaOtpAuthUrl } from "@elio/auth";
import { requireSuperAdmin, UnauthorizedError } from "@/lib/require-super-admin";

/** Start MFA enrollment — returns a one-time secret for Google Authenticator / similar. */
export async function POST() {
  try {
    const userId = await requireSuperAdmin();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }

    const secret = generateMfaSecret();
    return NextResponse.json({
      secret,
      otpauthUrl: mfaOtpAuthUrl(user.email, secret),
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    throw e;
  }
}

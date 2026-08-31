import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";
import { requireSuperAdmin, UnauthorizedError } from "@/lib/require-super-admin";

export async function POST(req: Request) {
  try {
    const userId = await requireSuperAdmin();
    const body = await req.json().catch(() => ({}));
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || newPassword.length < 10) {
      return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }

    const currentOk = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!currentOk) {
      return NextResponse.json({ error: { code: "WRONG_PASSWORD" } }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { hashedPassword } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }
    throw e;
  }
}

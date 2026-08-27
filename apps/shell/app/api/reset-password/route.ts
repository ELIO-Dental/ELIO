import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { consumeResetToken, validateResetToken } from "@elio/auth";

export async function POST(req: Request) {
  const { token, password } = await req.json().catch(() => ({}));

  if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  const check = await validateResetToken(token);
  if (!check.valid) {
    return NextResponse.json({ ok: false, error: "TOKEN_INVALID" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const ok = await consumeResetToken(token, hashedPassword);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "TOKEN_INVALID" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

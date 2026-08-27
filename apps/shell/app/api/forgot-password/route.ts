import { NextResponse } from "next/server";
import { requestPasswordReset } from "@elio/auth";

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({ email: undefined }));

  if (typeof email === "string" && email.trim()) {
    const appUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    // Fire-and-forget-ish, but awaited so tests/dev logs can rely on it — errors are
    // swallowed so the response never reveals whether the email exists.
    await requestPasswordReset(email, appUrl).catch(() => {});
  }

  // Always the same response — do not reveal account existence.
  return NextResponse.json({ ok: true });
}

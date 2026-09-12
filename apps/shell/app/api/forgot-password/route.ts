import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, recordFailedAttempt, requestPasswordReset } from "@elio/auth";

export const runtime = "nodejs";

/**
 * POST /api/forgot-password — unauthenticated by definition. Previously had
 * NO rate limiting at all (flagged in a 2026-09-13 stability review):
 * anyone could hammer this to spam reset emails at arbitrary addresses, with
 * no cost. Rate limited by IP, not email — this route's whole point is never
 * revealing whether an email exists, so keying on IP (same convention as
 * apps/shell/app/api/public/signup/route.ts) avoids turning the limiter
 * itself into a side channel for that same enumeration.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const rateLimitKey = `forgot-password:${ip}`;

  if (isRateLimited(rateLimitKey)) {
    // Same "always ok" response as below — a 429 here would itself leak
    // whether this IP has been hammering the endpoint, but more importantly
    // just skipping the send is enough to bound the actual abuse (mail spam).
    return NextResponse.json({ ok: true });
  }
  recordFailedAttempt(rateLimitKey);

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

import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, recordFailedAttempt } from "@elio/auth";
import { testDentallyApiKey } from "@/lib/dentally-test-connection";

export const runtime = "nodejs";

/** POST /api/public/dentally/test — unauthenticated key check during signup. */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const rateLimitKey = `dentally-test:${ip}`;

  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const result = await testDentallyApiKey(String(body.apiKey ?? ""));
    if (!result.ok) {
      recordFailedAttempt(rateLimitKey);
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    recordFailedAttempt(rateLimitKey);
    return NextResponse.json({ ok: false, error: "Connection test failed." }, { status: 500 });
  }
}

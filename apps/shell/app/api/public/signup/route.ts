import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, recordFailedAttempt } from "@elio/auth";
import { signUpPractice, SignupValidationError } from "@/lib/signup-service";

export const runtime = "nodejs";

/**
 * POST /api/public/signup — the platform's ONLY unauthenticated,
 * practice-creating endpoint (Step 2.1). Rate limited by IP from day one per
 * the guide's explicit instruction — this is exactly the kind of route
 * Step 2.4's security review would otherwise flag as missing after the fact.
 *
 * IMPORTANT — deployment note: `x-forwarded-for`/`x-real-ip` are only
 * trustworthy when a proxy in front of this app (Vercel's edge, in the real
 * deployment) overwrites them rather than passing through client-supplied
 * values verbatim. If this route is ever reachable directly (bypassing that
 * proxy), the rate limit below is trivially bypassable by spoofing the
 * header on each request — this is a real, infrastructure-dependent
 * limitation, not something fixable from this code alone.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const rateLimitKey = `signup:${ip}`;

  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: "Too many signup attempts. Try again later." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const result = await signUpPractice({
      practiceName: String(body.practiceName ?? ""),
      adminEmail: String(body.adminEmail ?? ""),
      adminPassword: String(body.adminPassword ?? ""),
      dentallyApiKey: body.dentallyApiKey ? String(body.dentallyApiKey) : undefined,
      selectedModules: Array.isArray(body.selectedModules) ? body.selectedModules : [],
    });
    // A SUCCESSFUL signup still counts toward the bucket — this endpoint
    // creates a real tenant, so mass successful signups from one IP (spam
    // practices, disposable-email abuse) is the actual abuse vector to bound,
    // not just repeated failures. `recordFailedAttempt`'s name is login-era;
    // its behavior (increment this key's counter) is exactly what's needed here.
    recordFailedAttempt(rateLimitKey);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    recordFailedAttempt(rateLimitKey);
    if (error instanceof SignupValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[signup] Error:", error);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}

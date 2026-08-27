import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { endImpersonation } from "@elio/auth";

export const runtime = "nodejs";

const SESSION_COOKIE_NAME = "authjs.session-token";

/**
 * POST /api/impersonate/end — the persistent banner's "End" button
 * (APPLICATION_FLOW.md §11a: "can be ended explicitly at any time via the
 * banner"). Only meaningful on a real impersonation session; clearing the
 * cookie afterward is deliberate — a Super Admin is never meant to remain
 * "logged into apps/shell as themselves" once impersonation ends, since
 * SUPER_ADMIN accounts don't have a normal, non-impersonated reason to hold
 * a shell session at all.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.impersonating && session.impersonationSessionId) {
    await endImpersonation(session.impersonationSessionId);
  }

  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}

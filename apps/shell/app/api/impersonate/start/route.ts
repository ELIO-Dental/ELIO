import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { redeemImpersonationHandoff, ImpersonationError, permissionsForRole, IMPERSONATION_MAX_AGE_SECONDS } from "@elio/auth";

export const runtime = "nodejs";

const SESSION_COOKIE_NAME = "authjs.session-token";

/**
 * GET /api/impersonate/start?token=<impersonationSessionId> — Step 2.3,
 * APPLICATION_FLOW.md §11a. Reached only via apps/admin's 303 redirect after
 * a real SUPER_ADMIN created the ImpersonationSession there.
 *
 * Mints a REAL, valid apps/shell session — but a distinctly-typed one
 * (PERFORMANCE_SCALABILITY.md §8: "never generate a token indistinguishable
 * from the impersonated user's own session"). The `impersonating`/
 * `actualUserId` claims below are what every other part of this feature
 * (the persistent banner, the audit-log dual-attribution, the hard time-bound
 * re-check) actually keys off — this route is the only place they're ever
 * set.
 *
 * Uses next-auth/jwt's own `encode()` (NOT a hand-rolled JWT/jsonwebtoken
 * call) because this app's real session cookie is an ENCRYPTED JWE
 * (A256CBC-HS512), not a plain signed JWT — confirmed by inspecting a real
 * session cookie live before writing this. `salt` matches what @auth/core
 * itself uses to decode the normal login-issued cookie
 * (options.cookies.sessionToken.name — the cookie's own name), or a token
 * minted here would fail to decode on the very next request.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }

  try {
    const { session, superAdmin, target } = await redeemImpersonationHandoff(token);

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("NEXTAUTH_SECRET not set");

    const jwt = await encode({
      secret,
      salt: SESSION_COOKIE_NAME,
      maxAge: IMPERSONATION_MAX_AGE_SECONDS,
      token: {
        userId: target.id,
        practiceId: target.practiceId,
        role: target.role,
        permissions: permissionsForRole(target.role),
        impersonating: true,
        actualUserId: superAdmin.id,
        actualUserEmail: superAdmin.email,
        impersonatedUserEmail: target.email,
        impersonationSessionId: session.id,
      },
    });

    const response = NextResponse.redirect(new URL("/launcher", request.nextUrl.origin));
    response.cookies.set(SESSION_COOKIE_NAME, jwt, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: IMPERSONATION_MAX_AGE_SECONDS,
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  } catch (error) {
    if (error instanceof ImpersonationError) {
      console.error("[impersonate/start]", error.message);
    } else {
      console.error("[impersonate/start] Error:", error);
    }
    return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  }
}

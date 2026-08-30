import { NextResponse } from "next/server";
// Runs in the Node.js runtime, not Edge — @elio/auth transitively imports
// @elio/db's generated Prisma client, which doesn't load under Next's Edge
// Runtime. Set from the start here per the lesson from Step 1.6/1.7 (every
// route 307'd to /login despite a valid session cookie when this was missed).
export const runtime = "nodejs";
import { auth, isModuleLicensed } from "@elio/auth";

// Auth gate for the multi-zone /flow app. Deliberately NOT using
// next/navigation's redirect() from a layout — Next.js auto-prefixes a
// relative redirect with this app's own basePath ("/flow"), producing
// "/flow/login", a route that doesn't exist here. Middleware gives us the
// real incoming request origin (the shell's origin, since this app is only
// ever reached through the shell's rewrite) so the redirect lands on the
// shell's actual /login page.
//
// ElioFlow has no public/unauthenticated routes (unlike apps/plans' patient
// signup flow) — every screen here is staff-facing pipeline management, so
// unlike apps/plans/middleware.ts there is no PUBLIC_PATHS exemption needed.
// Step 2.2 (FR-3) — server-side licence gate, checked fresh on every request
// (see apps/pay/middleware.ts's comment for the full rationale).
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  if (
    pathname === "/sw.js" ||
    pathname.endsWith("/sw.js") ||
    pathname.startsWith("/icons/") ||
    pathname.includes("/icons/") ||
    pathname === "/offline.html" ||
    pathname.endsWith("/offline.html") ||
    pathname === "/manifest.webmanifest" ||
    pathname.endsWith("/manifest.webmanifest")
  ) {
    return NextResponse.next();
  }
  if (!req.auth?.userId) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  const practiceId = (req.auth as any).practiceId as string | undefined;
  if (!practiceId || !(await isModuleLicensed(practiceId, "FLOW"))) {
    return NextResponse.redirect(new URL("/launcher?unlicensed=flow", req.nextUrl.origin));
  }
  return NextResponse.next();
});

// /api is excluded: any future cron/webhook route (if ElioFlow ever needs
// one) would hit this app's /flow/api/* routes directly, not through a
// browser session cookie, and must not be redirected to /login — same
// rationale as apps/plans/middleware.ts.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw\\.js|icons/|manifest\\.webmanifest|offline).*)"],
};

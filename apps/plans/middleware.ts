import { NextResponse } from "next/server";
// Runs in the Node.js runtime, not Edge — same fix as apps/pay/middleware.ts
// (Step 1.6): @elio/auth transitively imports @elio/db's generated Prisma
// client, which doesn't load under Next's Edge Runtime. Set from the start
// here per MASTER_BUILD_GUIDE.md §1.7's explicit note not to repeat apps/pay's
// bug (every route 307'd to /login despite a valid session cookie).
export const runtime = "nodejs";
import { auth, isModuleLicensed } from "@elio/auth";

// This app's own public Vercel domain (plans.elioportal.co.uk) is directly
// reachable — not only through the shell's rewrite. Using req.nextUrl.origin
// there (as this file used to) redirects to THIS app's own host, which has
// no /login route, 404ing — the exact bug found and fixed live in
// apps/pay/middleware.ts, 2026-09-12. Same env-var-with-hardcoded-fallback
// convention apps/shell/middleware.ts already uses for ADMIN_APP_ORIGIN.
const SHELL_APP_ORIGIN = process.env.SHELL_APP_ORIGIN ?? "https://app.elioportal.co.uk";

// Auth gate for the multi-zone /plans app. Deliberately NOT using next/navigation's
// redirect() from a layout — Next.js auto-prefixes a relative redirect with this
// app's own basePath ("/plans"), producing "/plans/login", a route that doesn't
// exist here. Redirects target SHELL_APP_ORIGIN explicitly (not req.nextUrl.origin)
// so the redirect lands on the shell's actual /login page regardless of which
// domain this request actually arrived on.
// PUBLIC, patient-facing route (MASTER_BUILD_GUIDE.md §1.7) — the multi-step
// signup flow authenticates via its own PlanSigningRequest.token in the URL,
// not a staff NextAuth session. A patient following an emailed invite link
// has no shell/plans session cookie at all, so this must never redirect to
// /login (shell's /plans/api/* pattern below already exempts /api the same
// way, for the same "no browser session available" reason).
const PUBLIC_PATHS = ["/signup"];

function isPublicPath(pathname: string): boolean {
  // Defensive: strip this app's own basePath ("/plans") if present. Next.js
  // normally strips basePath from req.nextUrl.pathname automatically inside
  // middleware, but this guards against the multi-zone rewrite path (the
  // shell proxies /plans/* here) surfacing it un-stripped in some configs —
  // verified live (curl) that without this, /plans/signup/[token] 307'd to
  // /login exactly like an authenticated-only route would.
  const normalized = pathname.startsWith("/plans/") ? pathname.slice("/plans".length) : pathname;
  return PUBLIC_PATHS.some((p) => normalized === p || normalized.startsWith(`${p}/`));
}

// Step 2.2 (FR-3) — server-side licence gate, checked fresh on every request
// (see apps/pay/middleware.ts's comment for the full rationale). Not applied
// to public paths above — a patient following a signup link has no
// practiceId on their session at all (no session), and the licence that
// matters there is the PRACTICE's, already implicitly required for the
// signing staff member to have reached the point of sending that link.
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  if (
    pathname === "/sw.js" ||
    pathname.endsWith("/sw.js") ||
    pathname.startsWith("/icons/") ||
    pathname.includes("/icons/") ||
    pathname.startsWith("/brand/") ||
    pathname.includes("/brand/") ||
    pathname === "/offline.html" ||
    pathname.endsWith("/offline.html") ||
    pathname === "/manifest.webmanifest" ||
    pathname.endsWith("/manifest.webmanifest")
  ) {
    return NextResponse.next();
  }
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  if (!req.auth?.userId) {
    return NextResponse.redirect(new URL("/login", SHELL_APP_ORIGIN));
  }
  const practiceId = (req.auth as any).practiceId as string | undefined;
  if (!practiceId || !(await isModuleLicensed(practiceId, "PLANS"))) {
    return NextResponse.redirect(new URL("/launcher?unlicensed=plans", SHELL_APP_ORIGIN));
  }
  return NextResponse.next();
});

// /api is excluded: the GoCardless webhook, the Vercel Cron reconciliation
// job, and the public signup flow's /api/public/signup/* routes hit this
// app's /plans/api/* routes directly (not through the shell, and not with a
// browser session cookie) and must not be redirected to /login — they carry
// their own auth (HMAC signature / CRON_SECRET / invite token, see those
// routes). /signup is excluded here too so the page route itself never even
// reaches the auth() wrapper's redirect branch above.
// Two entries, not one: Next.js's compiled matcher regex for the catch-all
// pattern below requires a trailing "/<segment>" group, so with this app's
// basePath it never matches the bare basePath root (no trailing slash or
// segment) — only "/plans/..." — silently skipping this middleware there.
// Found and fixed alongside the identical bug in apps/pay/middleware.ts,
// 2026-09-12 (a live production 404 on that app's own bare basePath root).
export const config = {
  matcher: [
    "/",
    "/((?!api|_next/static|_next/image|favicon.ico|sw\\.js|icons/|manifest\\.webmanifest|offline).*)",
  ],
};

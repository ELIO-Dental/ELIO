import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
// Runs in the Node.js runtime, not Edge — sidesteps the whole class of
// Edge-Runtime incompatibilities in this dependency chain (password-reset.ts
// uses Node's `crypto`; Prisma's generated client also failed to load under
// Edge's wasm engine). Middleware here only needs a JWT session check, so the
// Node.js runtime's slightly higher cold-start cost is a non-issue.
export const runtime = "nodejs";
import { auth } from "@elio/auth";

// "/signup" and "/api/public/signup" — Step 2.1's self-serve practice signup,
// the platform's other unauthenticated, account-CREATING route (alongside
// /plans/signup below, which creates a PATIENT under an existing practice;
// this one creates the Practice itself). No session exists yet by definition.
// "/api/impersonate/start" — Step 2.3's impersonation handoff (APPLICATION_
// FLOW.md §11a). Reached via apps/admin's 303 redirect with a Super Admin's
// OWN admin-app session (a cookie this app never sees, by design — cross-app
// isolation, PERFORMANCE_SCALABILITY.md §7) — so from THIS app's perspective
// the request arrives with no valid shell session yet, and this route's own
// token-based check (redeemImpersonationHandoff) is what actually gates it,
// not a staff session.
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/signup", "/api/public/signup", "/api/impersonate/start"];
// The apps/plans patient signup flow (MASTER_BUILD_GUIDE.md §1.7) is reached
// through this shell's /plans/* rewrite. It authenticates via its own
// PlanSigningRequest token in the URL, not a staff session, so this gate
// must not redirect it to /login before the rewrite ever reaches
// apps/plans/middleware.ts's own (separate) public-path exception for it —
// confirmed live: without this, /plans/signup/[token] 307'd to /login even
// though apps/plans itself correctly allowed it when hit directly.
// "/plans/_next" is also required here: a signed-in user's static assets
// load fine (no redirect happens once req.auth exists), but an
// UNAUTHENTICATED patient hitting the public signup page has no session —
// without this, every CSS/JS chunk under /plans/_next/* 307'd to /login too,
// so the page rendered as bare unstyled HTML with its client bundle (and
// therefore every fetch() in page.tsx) never loading. Confirmed live via a
// Playwright e2e run: the signup page's Stepper rendered (server HTML) but
// the T&Cs/mandate steps never appeared because the client JS never ran.
// "/plans/api/webhooks" is the highest-risk exception here: GoCardless calls
// this route directly (no browser, no session cookie, no cookie jar at all)
// to notify BUG-1's idempotent payment/mandate handling of real-money events.
// Without this, every real production webhook reaching this route through
// the shell's rewrite (the only path GoCardless's public callback URL can
// actually use) would 307 to /login — GoCardless doesn't follow that
// redirect, so the webhook would silently fail to ever reach
// processWebhookEvent(). The route authenticates via its own HMAC-SHA256
// `Webhook-Signature` header (verifyWebhookSignature), not a session.
// Confirmed live: this exact 307 reproduced while re-verifying the signup
// e2e suite's mandate-active webhook step through localhost:3040 (shell) —
// the earlier "webhook replay" proof this session was run directly against
// apps/plans's own port, never through the shell, so this gate was never
// exercised until now.
// "/plans/api/cron" is the same class of bug as the webhooks exception
// above: Vercel Cron calls it with a CRON_SECRET bearer token, not a session
// cookie (apps/plans/app/api/cron/reconcile-payments/route.ts checks
// Authorization: Bearer <CRON_SECRET> as an alternative to a staff session)
// — if this route is ever invoked through the shell's public domain (the
// same path every other /plans/* route uses), the shell's session gate would
// 307 it to /login before the route's own CRON_SECRET check ever runs.
const PUBLIC_PATH_PREFIXES = [
  "/plans/signup",
  "/plans/api/public",
  "/plans/_next",
  "/plans/api/webhooks",
  "/plans/api/cron",
];

function isPwaAsset(pathname: string): boolean {
  return (
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.png" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/offline.html" ||
    pathname.endsWith("/offline.html")
  );
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Step 1.9 (MASTER_BUILD_GUIDE.md §1.9, FR-11): the pre-ELIO Aura-branded
// domains stay live and pointed at their old apps until the DNS cutover
// actually happens (see project-docs/PROJECT_STATE.md's 1.9 entry for the
// manual DNS/registrar/GoCardless-webhook steps this code does NOT do —
// those need Hisham directly, not this middleware). Once a domain's DNS is
// repointed at this shell (Step 1.9's manual task), any request that still
// arrives with the OLD Host header 301-redirects, preserving the path and
// query string, to the equivalent app.elioportal.co.uk URL — so a bookmark,
// search-engine link, or an old QR code/business card still lands on the
// right page instead of a dead domain. `www.` variants included since
// registrars/browsers don't always normalize that away before the request
// reaches here.
const OLD_DOMAIN_HOSTS = new Set([
  "aurapayments.co.uk",
  "www.aurapayments.co.uk",
  "auraplans.co.uk",
  "www.auraplans.co.uk",
  "elioflow.co.uk",
  "www.elioflow.co.uk",
]);
const NEW_APP_HOST = "app.elioportal.co.uk";
const ADMIN_APP_ORIGIN = process.env.ADMIN_APP_ORIGIN ?? "https://admin.elioportal.co.uk";

/** apps/admin is a separate Vercel project on admin.elioportal.co.uk — not a shell zone. */
function adminAppRedirect(pathname: string, search: string): NextResponse | null {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return null;
  const subpath = pathname === "/admin" ? "/" : pathname.slice("/admin".length) || "/";
  return NextResponse.redirect(new URL(`${subpath}${search}`, ADMIN_APP_ORIGIN), 307);
}

function oldDomainRedirect(req: NextRequest): NextResponse | null {
  const host = req.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (!host || !OLD_DOMAIN_HOSTS.has(host)) return null;
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${NEW_APP_HOST}`);
  return NextResponse.redirect(url, 301);
}

export default auth((req: NextRequest & { auth?: unknown }) => {
  const { pathname, search } = req.nextUrl;

  if (isPwaAsset(pathname)) {
    return NextResponse.next();
  }

  const adminRedirect = adminAppRedirect(pathname, search);
  if (adminRedirect) return adminRedirect;

  const domainRedirect = oldDomainRedirect(req);
  if (domainRedirect) return domainRedirect;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Protect everything except static assets, Next internals, and API auth routes.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|brand/|sw\\.js|icons/|offline\\.html|api/auth|api/forgot-password|api/reset-password|api/inngest|api/cron).*)",
  ],
};

import { NextResponse } from "next/server";
// Runs in the Node.js runtime, not Edge — same fix as apps/shell/middleware.ts:
// @elio/auth transitively imports @elio/db's generated Prisma client (and
// packages/auth/lib/password-reset.ts + invite.ts use Node's `crypto`), neither
// of which load under Next's Edge Runtime. Without this, every request through
// this middleware throws a JWTSessionError (PrismaClientValidationError: "In
// order to run Prisma Client on edge runtime...") and every route silently
// redirects to /login even with a valid session cookie — found and fixed
// during Step 1.6 verification (only "/" appeared to work, by a compile-order
// fluke; every other route 307'd).
export const runtime = "nodejs";
import { auth, isModuleLicensed } from "@elio/auth";

// Auth gate for the multi-zone /pay app. Deliberately NOT using next/navigation's
// redirect() from a layout for this — Next.js auto-prefixes a relative redirect
// with this app's own `basePath` ("/pay"), which would produce "/pay/login", a
// route that doesn't exist here (it's the shell's route, at the shared origin's
// root). Middleware gives us the real incoming request origin (the shell's
// origin — this app is only ever reached through the shell's rewrite in the
// shared-shell flow) so the redirect lands on the shell's actual /login page,
// preserving "no separate login" (MASTER_BUILD_GUIDE.md Step 1.6).
//
// Step 2.2 (FR-3) — server-side licence gate, defense-in-depth layer. A real
// investigation this session found that THIS middleware's custom callback
// does not reliably execute under this exact Next.js 16.3.1 dev setup (every
// diagnostic — debug headers, file writes, even a deliberate syntax error's
// error path — showed the compiled output lives under `.next/.../server/edge/
// chunks`, and no custom logic here, sync or async, ever visibly ran, even
// though authentication still appeared to work). The REAL, verified-working
// auth/licence gate for this app lives in app/layout.tsx (server component,
// using next/navigation's redirect() — the same mechanism every page.tsx's
// own `if (!session) redirect("/login")` already relied on, proven to work
// live via curl throughout this whole project). This file is kept as a
// second layer in case a real deployment's edge/runtime behaves differently
// than this local dev environment — never treat this file alone as proof the
// gate works; the real enforcement is in the layout.
export default auth(async (req) => {
  if (!req.auth?.userId) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  const practiceId = (req.auth as any).practiceId as string | undefined;
  if (!practiceId || !(await isModuleLicensed(practiceId, "PAY"))) {
    return NextResponse.redirect(new URL("/launcher?unlicensed=pay", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse } from "next/server";
// Runs in the Node.js runtime, not Edge — @elio/auth transitively imports
// @elio/db's generated Prisma client, incompatible with Edge. See
// apps/pay/middleware.ts's comment: this session found that a custom
// middleware callback does NOT reliably execute under this exact Next.js
// 16.3.1 + Turbopack dev setup regardless of this declaration — the REAL
// enforcement for this app lives in app/layout.tsx (next/navigation's
// redirect(), proven to work), this file is kept only as defense-in-depth
// for a real deployment, where behavior may differ.
export const runtime = "nodejs";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default auth((req) => {
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const role = (req.auth as any)?.role as string | undefined;
  if (role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};

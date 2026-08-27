import type { Metadata } from "next";
import { redirect } from "next/navigation";
import "./globals.css";
import { Toaster, PageTransition } from "@elio/ui";
import { isModuleLicensed } from "@elio/auth";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "ELIO",
  description: "ELIO — one platform for a dental practice.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Step 2.2 (FR-3) — licence gate, added once here rather than per-page
  // (every page under this app already does its own `if (!session)
  // redirect("/login")` via requireSession() — this covers the SAME
  // single-point placement pattern used in apps/pay/app/layout.tsx, for the
  // identical reason: middleware.ts's own copy of this check is kept as
  // defense-in-depth but isn't reliably proven to execute in this dev setup,
  // see apps/pay/middleware.ts's comment for the full investigation).
  const session = await requireSession();
  if (session && !(await isModuleLicensed(session.practiceId, "FLOW"))) {
    redirect("/launcher?unlicensed=flow");
  }

  return (
    <html lang="en">
      <body>
        <PageTransition>{children}</PageTransition>
        <Toaster />
      </body>
    </html>
  );
}

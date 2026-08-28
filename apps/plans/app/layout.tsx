import type { Metadata } from "next";
import { PageTransition, Toaster } from "@elio/ui";
import { auth } from "@elio/auth";
import { prisma } from "@elio/db";
import { ShellLayout } from "@/components/shell-layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "ELIO",
  description: "ELIO — one platform for a dental practice.",
};

// Found live (2026-08-28, independent Phase 1 audit): apps/pay renders the
// shared cross-module ShellLayout (sidebar/header/module-switcher) but
// apps/plans never did — this app relied entirely on middleware.ts's
// redirect for auth and had NO shell chrome at all, unlike every other
// module. Mirrors apps/pay/app/layout.tsx's exact pattern: this layout
// doesn't itself gate access (middleware.ts + each page's own session check
// already do, per this app's existing established pattern) — it just
// renders the chrome around whatever the page decides to show, same as
// before this fix for any already-redirected/unauthenticated case.
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.practiceId) {
    return (
      <html lang="en">
        <body>
          <PageTransition>{children}</PageTransition>
        </body>
      </html>
    );
  }

  const practice = await prisma.practice.findUnique({
    where: { id: session.practiceId },
    select: { name: true },
  });

  return (
    <html lang="en">
      <body>
        <ShellLayout practiceName={practice?.name} userEmail={session?.user?.email ?? undefined} isOwner={session?.role === "OWNER"}>
          <PageTransition>{children}</PageTransition>
        </ShellLayout>
        <Toaster />
      </body>
    </html>
  );
}

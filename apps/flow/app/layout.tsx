import type { Metadata } from "next";
import "./globals.css";
import { Toaster, PageTransition, NavigationProgress, ThemeProvider, ThemeScript } from "@elio/ui";
import { PwaProvider, getPwaConfig } from "@elio/pwa";
import { isModuleLicensed } from "@elio/auth";
import { requireSession, redirectToLauncher } from "@/lib/session";
import { ShellLayout } from "@/components/shell-layout";

const pwa = getPwaConfig("flow");

export const metadata: Metadata = {
  title: "ElioFlow",
  description: pwa.description,
  applicationName: pwa.shortName,
  appleWebApp: { capable: true, title: pwa.shortName },
};

// Found live (2026-08-28, independent Phase 1 audit): apps/pay renders the
// shared cross-module ShellLayout (sidebar/header/module-switcher) but
// apps/flow never did — missing the shell chrome entirely, unlike apps/pay.
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
    await redirectToLauncher("unlicensed=flow");
  }

  if (!session) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body>
          <ThemeScript />
          <ThemeProvider>
            <PwaProvider config={pwa}>
            <NavigationProgress />
            <PageTransition>{children}</PageTransition>
            <Toaster />
            </PwaProvider>
          </ThemeProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeScript />
        <ThemeProvider>
          <PwaProvider config={pwa}>
          <NavigationProgress />
          <ShellLayout userEmail={session.user?.email ?? undefined}>
            <PageTransition>{children}</PageTransition>
          </ShellLayout>
          <Toaster />
          </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

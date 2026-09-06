import type { Metadata } from "next";
import { PageTransition, Toaster, NavigationProgress, ThemeProvider, ThemeScript } from "@elio/ui";
import { PwaProvider, getPwaConfig } from "@elio/pwa";
import { auth, can } from "@elio/auth";
import type { Role } from "@elio/db";
import { ShellLayout } from "@/components/shell-layout";
import { getBrandingSettings } from "@/lib/plans-settings";
import "./globals.css";

const pwa = getPwaConfig("plans");

export const metadata: Metadata = {
  title: "ElioPlans",
  description: pwa.description,
  applicationName: pwa.shortName,
  icons: {
    icon: [
      { url: "/plans/favicon.png", type: "image/png" },
      { url: "/plans/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/plans/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: pwa.shortName, statusBarStyle: "black-translucent" },
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
      <html lang="en" suppressHydrationWarning>
        <body>
          <ThemeScript />
          <ThemeProvider>
            <PwaProvider config={pwa}>
            <NavigationProgress />
            <PageTransition>{children}</PageTransition>
            </PwaProvider>
          </ThemeProvider>
        </body>
      </html>
    );
  }

  const branding = await getBrandingSettings(session.practiceId);
  const subject = { role: session.role as Role };
  const canViewPayments =
    can(subject, "plans:view-payments") || can(subject, "plans:view-payments:readonly");
  const canEditSettings = can(subject, "plans:edit-settings");
  const canViewActionRequired =
    can(subject, "plans:invite-patients") ||
    can(subject, "plans:view-payments") ||
    can(subject, "plans:view-payments:readonly") ||
    can(subject, "plans:resolve-mismatch");
  const canViewAuditLog =
    can(subject, "auditlog:view:all") || can(subject, "auditlog:view:own");
  const canManageTeam = can(subject, "team:manage");

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeScript />
        <ThemeProvider>
        <PwaProvider config={pwa}>
        <NavigationProgress />
        <ShellLayout
          userEmail={session?.user?.email ?? undefined}
          canViewPayments={canViewPayments}
          canEditSettings={canEditSettings}
          canViewActionRequired={canViewActionRequired}
          canViewAuditLog={canViewAuditLog}
          canManageTeam={canManageTeam}
          brandTitle={branding.brandName?.trim() || "ELIO PLANS"}
          brandLogoUrl={branding.logoUrl?.trim() || undefined}
          faviconUrl={branding.faviconUrl || undefined}
        >
          <PageTransition>{children}</PageTransition>
        </ShellLayout>
        <Toaster />
        </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

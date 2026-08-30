import type { Metadata } from "next";
import { redirectToLogin, redirectToLauncher } from "@/lib/session";
import { geistSans, geistMono, Toaster, PageTransition, NavigationProgress, ThemeProvider, ThemeScript } from "@elio/ui";
import { auth, isModuleLicensed } from "@elio/auth";
import { ShellLayout } from "@/components/shell-layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "ElioPay",
  description: "Payroll, Compass statements, and dentist pay for a dental practice.",
};

// IMPORTANT (corrects an earlier assumption left in this file): Next.js
// multi-zone rewrites (apps/pay/next.config.ts + apps/shell/next.config.ts)
// proxy the HTTP request, but each zone still renders its OWN complete
// <html> document — there is no shared React tree across zones, so the
// shell's root layout does NOT wrap this app's pages. The sidebar/header
// chrome has to be rendered HERE, from this app's own ShellLayout (a local
// copy of apps/shell/components/shell-layout.tsx built on the same shared
// @elio/ui primitives) for the module to actually render "inside the shared
// shell" per MASTER_BUILD_GUIDE.md Step 1.6 — same origin, same NextAuth
// session cookie, no separate login, but its own chrome render.
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Step 2.2 (FR-3) — the REAL, verified auth + licence gate for this app.
  // middleware.ts also has this check as defense-in-depth, but an
  // investigation this session found its custom callback does not reliably
  // execute under this exact Next.js dev setup (see middleware.ts's comment
  // for the full evidence) — every page.tsx's own `if (!session)
  // redirect("/login")` was the thing actually proven, via live curl testing
  // all session, to gate unauthenticated access. Doing the SAME check here
  // once, at the layout level, covers every page under this app without
  // repeating it per-page, and is the layer this build actually relies on.
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  if (!(await isModuleLicensed(session.practiceId, "PAY"))) {
    await redirectToLauncher("unlicensed=pay");
  }

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeScript />
        <ThemeProvider>
        <NavigationProgress />
        <ShellLayout userEmail={session?.user?.email ?? undefined} isOwner={session?.role === "OWNER"}>
          <PageTransition>{children}</PageTransition>
        </ShellLayout>
        <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

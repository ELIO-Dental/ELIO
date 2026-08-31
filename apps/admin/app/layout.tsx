import type { Metadata } from "next";
import { geistSans, geistMono, Toaster, ThemeProvider, ThemeScript, NavigationProgress } from "@elio/ui";
import { PwaProvider, getPwaConfig } from "@elio/pwa";
import "./globals.css";

const pwa = getPwaConfig("admin");

export const metadata: Metadata = {
  title: "ELIO Super Admin",
  description: pwa.description,
  applicationName: pwa.shortName,
  appleWebApp: { capable: true, title: pwa.shortName },
};

// No auth check here — this wraps EVERY route including /login itself, so
// the real gate lives one level down in app/(protected)/layout.tsx instead
// (a route group /login sits outside of), avoiding a redirect-to-/login loop
// on /login itself.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeScript />
        <ThemeProvider>
          <PwaProvider config={pwa}>
            <NavigationProgress />
            {children}
            <Toaster />
          </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

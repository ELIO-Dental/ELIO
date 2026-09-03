import type { Metadata } from "next";
import { geistSans, geistMono, Toaster, ThemeProvider, ThemeScript, NavigationProgress } from "@elio/ui";
import { PwaProvider, getPwaConfig } from "@elio/pwa";
import "./globals.css";

const pwa = getPwaConfig("admin");

export const metadata: Metadata = {
  title: "ELIO Super Admin",
  description: pwa.description,
  applicationName: pwa.shortName,
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: pwa.shortName, statusBarStyle: "black-translucent" },
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

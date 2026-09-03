import type { Metadata } from "next";
import { geistSans, geistMono, Toaster, PageTransition, NavigationProgress, ThemeProvider, ThemeScript, FlashQueuedToasts } from "@elio/ui";
import { PwaProvider, getPwaConfig } from "@elio/pwa";
import { auth } from "@/lib/auth";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import "./globals.css";

const pwa = getPwaConfig("portal");

export const metadata: Metadata = {
  title: "ELIO Portal",
  description: pwa.description,
  applicationName: pwa.shortName,
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.png"],
  },
  appleWebApp: {
    capable: true,
    title: pwa.shortName,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeScript />
        <ThemeProvider>
        <PwaProvider config={pwa}>
        <NavigationProgress />
        {session?.impersonating && session.impersonatedUserEmail && (
          <ImpersonationBanner impersonatedUserEmail={session.impersonatedUserEmail} />
        )}
        <PageTransition>{children}</PageTransition>
        <Toaster />
        <FlashQueuedToasts />
        </PwaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

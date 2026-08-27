import type { Metadata } from "next";
import { geistSans, geistMono, Toaster, PageTransition } from "@elio/ui";
import { auth } from "@/lib/auth";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "ELIO",
  description: "ELIO — one platform for a dental practice.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {session?.impersonating && session.impersonatedUserEmail && (
          <ImpersonationBanner impersonatedUserEmail={session.impersonatedUserEmail} />
        )}
        <PageTransition>{children}</PageTransition>
        <Toaster />
      </body>
    </html>
  );
}

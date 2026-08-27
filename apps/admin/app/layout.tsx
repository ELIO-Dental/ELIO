import type { Metadata } from "next";
import { geistSans, geistMono, Toaster } from "@elio/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "ELIO Super Admin",
  description: "ELIO platform control centre — internal, ELIO staff only.",
};

// No auth check here — this wraps EVERY route including /login itself, so
// the real gate lives one level down in app/(protected)/layout.tsx instead
// (a route group /login sits outside of), avoiding a redirect-to-/login loop
// on /login itself.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}

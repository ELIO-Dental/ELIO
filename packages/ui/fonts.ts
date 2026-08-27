/**
 * Shared font setup — THEME_GUIDELINE.md §3.1.
 * Geist Sans (UI) + Geist Mono (money figures, IDs, code) via next/font/google.
 * Imported ONCE in apps/shell/app/layout.tsx and applied to <html>/<body>; every
 * other app in the monorepo inherits it through the shared shell chrome — no
 * per-app font loading, no <link> tags.
 */
import { Geist, Geist_Mono } from "next/font/google";

export const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

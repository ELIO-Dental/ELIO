"use client";

import * as React from "react";

/** Applies Flow branding to document title, favicon, and optional brand color (legacy _app.tsx parity). */
export function FlowBrandingHead({
  brandName,
  logoUrl,
  companyName,
  primaryColor,
}: {
  brandName?: string;
  logoUrl?: string;
  companyName?: string;
  primaryColor?: string;
}) {
  React.useEffect(() => {
    if (!brandName) return;
    const suffix = document.title.includes(" - ") ? document.title.split(" - ").slice(1).join(" - ") : "ElioFlow";
    document.title = `${brandName} - ${suffix}`;
  }, [brandName]);

  React.useEffect(() => {
    if (!logoUrl) return;
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = logoUrl;
  }, [logoUrl]);

  React.useEffect(() => {
    if (!primaryColor) return;
    const root = document.documentElement;
    root.style.setProperty("--color-brand", primaryColor);
    return () => {
      root.style.removeProperty("--color-brand");
    };
  }, [primaryColor]);

  React.useEffect(() => {
    if (!companyName) return;
    let meta = document.querySelector("meta[name='application-company']") as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "application-company";
      document.head.appendChild(meta);
    }
    meta.content = companyName;
  }, [companyName]);

  return null;
}

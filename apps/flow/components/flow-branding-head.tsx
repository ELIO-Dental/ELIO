"use client";

import * as React from "react";

/** Applies Flow branding to document title and favicon (legacy _app.tsx parity). */
export function FlowBrandingHead({ brandName, logoUrl }: { brandName?: string; logoUrl?: string }) {
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

  return null;
}

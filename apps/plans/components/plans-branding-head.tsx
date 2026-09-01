"use client";

import * as React from "react";

/** Applies practice favicon + document title from branding settings (legacy DynamicFavicon, P4.7). */
export function PlansBrandingHead({ brandName, faviconUrl }: { brandName?: string; faviconUrl?: string }) {
  React.useEffect(() => {
    if (!brandName) return;
    const suffix = document.title.includes(" - ") ? document.title.split(" - ").slice(1).join(" - ") : "";
    document.title = suffix ? `${brandName} - ${suffix}` : brandName;
  }, [brandName]);

  React.useEffect(() => {
    if (!faviconUrl) return;
    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [faviconUrl]);

  return null;
}

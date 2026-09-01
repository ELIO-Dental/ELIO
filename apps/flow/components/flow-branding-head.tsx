"use client";

import * as React from "react";

/** Applies Flow app display name to document title (F3.3, mirrors PlansBrandingHead). */
export function FlowBrandingHead({ brandName }: { brandName?: string }) {
  React.useEffect(() => {
    if (!brandName) return;
    const suffix = document.title.includes(" - ") ? document.title.split(" - ").slice(1).join(" - ") : "ElioFlow";
    document.title = `${brandName} - ${suffix}`;
  }, [brandName]);

  return null;
}

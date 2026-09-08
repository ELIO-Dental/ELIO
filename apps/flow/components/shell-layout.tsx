"use client";

import type { CSSProperties, ReactNode } from "react";
import { ModuleAppLayout, FLOW_MODULE_NAV, isDefaultModuleBrandLogo, resolveModuleBrandLogos } from "@elio/ui";
import { FlowBrandingHead } from "./flow-branding-head";

export interface ShellLayoutProps {
  userEmail?: string;
  brandTitle?: string;
  /** Practice logo when uploaded; otherwise ELIO Flow default wordmark. */
  brandLogoUrl?: string;
  companyName?: string;
  primaryColor?: string;
  children: ReactNode;
}

/** ElioFlow app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({
  userEmail,
  brandTitle = "ELIO FLOW",
  brandLogoUrl,
  companyName,
  primaryColor,
  children,
}: ShellLayoutProps) {
  const brand = resolveModuleBrandLogos("flow", brandLogoUrl);
  const faviconLogo = brand.usingCustom && !isDefaultModuleBrandLogo(brand.logoUrl) ? brand.logoUrl : undefined;

  return (
    <div
      className="contents"
      style={primaryColor ? ({ ["--color-brand"]: primaryColor } as CSSProperties) : undefined}
      title={companyName || undefined}
    >
      <ModuleAppLayout
        brandTitle={brandTitle}
        brandLogoUrl={brandLogoUrl}
        moduleId="flow"
        navItems={FLOW_MODULE_NAV}
        userEmail={userEmail}
        resolveActiveId={(pathname, defaultId) =>
          pathname.startsWith("/consults") || pathname.startsWith("/dashboard")
            ? "dashboard"
            : defaultId
        }
        pwaAppId="flow"
      >
        <FlowBrandingHead
          brandName={brandTitle}
          logoUrl={faviconLogo}
          companyName={companyName}
          primaryColor={primaryColor}
        />
        {children}
      </ModuleAppLayout>
    </div>
  );
}

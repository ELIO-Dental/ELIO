"use client";

import { ModuleAppLayout, FLOW_MODULE_NAV } from "@elio/ui";
import { FlowBrandingHead } from "./flow-branding-head";

export interface ShellLayoutProps {
  userEmail?: string;
  brandTitle?: string;
  brandLogoUrl?: string;
  companyName?: string;
  primaryColor?: string;
  children: React.ReactNode;
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
  return (
    <div
      className="contents"
      style={primaryColor ? ({ ["--color-brand"]: primaryColor } as React.CSSProperties) : undefined}
      title={companyName || undefined}
    >
      <ModuleAppLayout
        brandTitle={brandTitle}
        brandLogoUrl={brandLogoUrl}
        moduleId="flow"
        navItems={FLOW_MODULE_NAV}
        userEmail={userEmail}
        resolveActiveId={(pathname, defaultId) =>
          pathname.startsWith("/consults") ? "pipeline" : pathname.startsWith("/dashboard") ? "dashboard" : defaultId
        }
        pwaAppId="flow"
      >
        <FlowBrandingHead
          brandName={brandTitle}
          logoUrl={brandLogoUrl}
          companyName={companyName}
          primaryColor={primaryColor}
        />
        {children}
      </ModuleAppLayout>
    </div>
  );
}

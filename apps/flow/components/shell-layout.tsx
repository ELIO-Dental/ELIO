"use client";

import { ModuleAppLayout, FLOW_MODULE_NAV } from "@elio/ui";
import { FlowBrandingHead } from "./flow-branding-head";

export interface ShellLayoutProps {
  userEmail?: string;
  brandTitle?: string;
  brandLogoUrl?: string;
  children: React.ReactNode;
}

/** ElioFlow app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({
  userEmail,
  brandTitle = "ELIO FLOW",
  brandLogoUrl,
  children,
}: ShellLayoutProps) {
  return (
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
      <FlowBrandingHead brandName={brandTitle} logoUrl={brandLogoUrl} />
      {children}
    </ModuleAppLayout>
  );
}

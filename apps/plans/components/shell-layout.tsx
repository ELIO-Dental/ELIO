"use client";

import { ModuleAppLayout, PLANS_MODULE_NAV } from "@elio/ui";
import { PlansBrandingHead } from "./plans-branding-head";

export interface ShellLayoutProps {
  userEmail?: string;
  canEditSettings?: boolean;
  brandTitle?: string;
  /** Practice logo when uploaded in Plans settings; otherwise sidebar shows text title only. */
  brandLogoUrl?: string;
  faviconUrl?: string;
  children: React.ReactNode;
}

/** ElioPlans app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({
  userEmail,
  canEditSettings,
  brandTitle = "ELIO PLANS",
  brandLogoUrl,
  faviconUrl,
  children,
}: ShellLayoutProps) {
  const navItems = canEditSettings
    ? PLANS_MODULE_NAV
    : PLANS_MODULE_NAV.filter((item) => item.id !== "dentally");

  return (
    <ModuleAppLayout
      brandTitle={brandTitle}
      brandLogoUrl={brandLogoUrl}
      moduleId="plans"
      navItems={navItems}
      userEmail={userEmail}
      pwaAppId="plans"
    >
      <PlansBrandingHead brandName={brandTitle} faviconUrl={faviconUrl} />
      {children}
    </ModuleAppLayout>
  );
}

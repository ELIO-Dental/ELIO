"use client";

import { ModuleAppLayout, PAY_MODULE_NAV } from "@elio/ui";

export interface ShellLayoutProps {
  userEmail?: string;
  isOwner?: boolean;
  /** Practice logo when uploaded in Pay settings; otherwise sidebar shows text "ELIO PAY". */
  brandLogoUrl?: string;
  children: React.ReactNode;
}

/** ElioPay app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({ userEmail, isOwner, brandLogoUrl, children }: ShellLayoutProps) {
  const navItems = isOwner ? PAY_MODULE_NAV : PAY_MODULE_NAV.filter((item) => item.id !== "settings");

  return (
    <ModuleAppLayout
      brandTitle="ELIO PAY"
      brandLogoUrl={brandLogoUrl}
      moduleId="pay"
      navItems={navItems}
      userEmail={userEmail}
      pwaAppId="pay"
    >
      {children}
    </ModuleAppLayout>
  );
}

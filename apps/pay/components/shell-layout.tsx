"use client";

import { ModuleAppLayout, PAY_MODULE_NAV } from "@elio/ui";

const CLINICIAN_NAV_IDS = new Set(["dashboard", "pay-periods"]);

export interface ShellLayoutProps {
  userEmail?: string;
  isOwner?: boolean;
  /** Step 30 — false for linked clinicians (own payslips only); hides ops nav. */
  viewAll?: boolean;
  /** Practice logo when uploaded in Pay settings; otherwise sidebar shows text "ELIO PAY". */
  brandLogoUrl?: string;
  children: React.ReactNode;
}

/** ElioPay app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({
  userEmail,
  isOwner,
  viewAll = true,
  brandLogoUrl,
  children,
}: ShellLayoutProps) {
  const navItems = !viewAll
    ? PAY_MODULE_NAV.filter((item) => CLINICIAN_NAV_IDS.has(item.id))
    : isOwner
      ? PAY_MODULE_NAV
      : PAY_MODULE_NAV.filter((item) => item.id !== "settings");

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

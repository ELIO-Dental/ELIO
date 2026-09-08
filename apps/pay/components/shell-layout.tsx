"use client";

import { ModuleAppLayout, PAY_MODULE_NAV } from "@elio/ui";

const CLINICIAN_NAV_IDS = new Set(["dashboard", "pay-periods"]);

export interface ShellLayoutProps {
  userEmail?: string;
  isOwner?: boolean;
  /** Step 30 — false for linked clinicians (own payslips only); hides ops nav. */
  viewAll?: boolean;
  /** Practice logo when uploaded in Pay settings; otherwise ELIO Pay default wordmark. */
  brandLogoUrl?: string;
  /** Clinic name under ELIO PAY (AuraPay parity). */
  brandSubtitle?: string;
  children: React.ReactNode;
}

/** ElioPay app chrome — page tabs in sidebar, ELIO Portal back link only.
 * Sidebar brand: practice `clinic_logo_url` if uploaded, else ELIO Pay wordmark. */
export function ShellLayout({
  userEmail,
  isOwner,
  viewAll = true,
  brandLogoUrl,
  brandSubtitle,
  children,
}: ShellLayoutProps) {
  const navItems = !viewAll
    ? PAY_MODULE_NAV.filter((item) => CLINICIAN_NAV_IDS.has(item.id))
    : isOwner
      ? PAY_MODULE_NAV
      : PAY_MODULE_NAV.filter((item) => item.id !== "settings" && item.id !== "setup");

  return (
    <ModuleAppLayout
      brandTitle="ELIO PAY"
      brandLogoUrl={brandLogoUrl}
      brandSubtitle={brandSubtitle}
      moduleId="pay"
      navItems={navItems}
      userEmail={userEmail}
      pwaAppId="pay"
    >
      {children}
    </ModuleAppLayout>
  );
}

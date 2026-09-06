"use client";

import { ModuleAppLayout, PLANS_MODULE_NAV } from "@elio/ui";
import { PlansBrandingHead } from "./plans-branding-head";
import { filterPlansNavItems } from "@/lib/plans-nav-filter";

export interface ShellLayoutProps {
  userEmail?: string;
  /** plans:view-payments or plans:view-payments:readonly */
  canViewPayments?: boolean;
  /** plans:edit-settings — documents, settings, dentally */
  canEditSettings?: boolean;
  /** invite / payments / resolve-mismatch */
  canViewActionRequired?: boolean;
  /** auditlog:view:all or auditlog:view:own */
  canViewAuditLog?: boolean;
  /** team:manage */
  canManageTeam?: boolean;
  brandTitle?: string;
  /** Practice logo when uploaded in Plans settings; otherwise sidebar shows text title only. */
  brandLogoUrl?: string;
  faviconUrl?: string;
  children: React.ReactNode;
}

/** ElioPlans app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({
  userEmail,
  canViewPayments = false,
  canEditSettings = false,
  canViewActionRequired = false,
  canViewAuditLog = false,
  canManageTeam = false,
  brandTitle = "ELIO PLANS",
  brandLogoUrl,
  faviconUrl,
  children,
}: ShellLayoutProps) {
  const navItems = filterPlansNavItems(PLANS_MODULE_NAV, {
    canViewPayments,
    canEditSettings,
    canViewActionRequired,
    canViewAuditLog,
    canManageTeam,
  });

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

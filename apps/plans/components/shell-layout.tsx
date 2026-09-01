"use client";

import { ModuleAppLayout, PLANS_MODULE_NAV } from "@elio/ui";

export interface ShellLayoutProps {
  userEmail?: string;
  canEditSettings?: boolean;
  children: React.ReactNode;
}

/** ElioPlans app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({ userEmail, canEditSettings, children }: ShellLayoutProps) {
  const navItems = canEditSettings
    ? PLANS_MODULE_NAV
    : PLANS_MODULE_NAV.filter((item) => item.id !== "dentally");

  return (
    <ModuleAppLayout brandTitle="ELIO PLANS" moduleId="plans" navItems={navItems} userEmail={userEmail} pwaAppId="plans">
      {children}
    </ModuleAppLayout>
  );
}
